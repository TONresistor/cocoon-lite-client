import { readClientConf, getHttpPort } from '../../lib/config.js';
import { launchClient } from '../../lib/client.js';
import { sendJSON, sendSSE } from '../server.js';
import {
  getClientPort, isClientRunning, getClientStartedAt,
  setClientState, clearClientState,
} from '../../services/client-state.js';
import { clearProxyCache } from './proxy.js';

// Module state for tracking the running client process handles and events.
// The shared running/httpPort/startedAt live in services/client-state.js.
const state = {
  cleanup: null,
  kill: null,
  eventBuffer: [],
  sseClients: new Set(),
};

/**
 * Kill all child processes and clean up temp directory.
 * Called on crash exit AND on manual stop — safe to call multiple times.
 */
function teardown() {
  if (state.kill) {
    try { state.kill(); } catch {}
    state.kill = null;
  }
  if (state.cleanup) {
    try { state.cleanup(); } catch {}
    state.cleanup = null;
  }
  clearClientState();
  clearProxyCache();
}

const MAX_EVENT_BUFFER = 200;

function pushEvent(event) {
  state.eventBuffer.push(event);
  if (state.eventBuffer.length > MAX_EVENT_BUFFER) {
    state.eventBuffer.shift();
  }
  // Broadcast to all SSE clients
  for (const client of state.sseClients) {
    try {
      sendSSE(client, event);
    } catch {
      state.sseClients.delete(client);
    }
  }
}

export function register(router) {
  /**
   * GET /api/client/status
   */
  router.get('/api/client/status', async ({ res }) => {
    const recentEvents = state.eventBuffer.slice(-50);
    const startedAt = getClientStartedAt();
    sendJSON(res, 200, {
      running: isClientRunning(),
      httpPort: getClientPort(),
      startedAt,
      uptime: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null,
      recentEvents,
    });
  });

  /**
   * POST /api/client/start
   * Start the COCOON client (router + client-runner).
   */
  router.post('/api/client/start', async ({ res, body }) => {
    if (isClientRunning()) {
      sendJSON(res, 409, { error: 'Client is already running' });
      return;
    }

    const config = readClientConf();
    if (!config) {
      sendJSON(res, 400, { error: 'No client.conf found. Complete setup first.' });
      return;
    }

    try {
      const routerPolicy = body.routerPolicy || 'any';
      const verbosity = body.verbosity || '1';

      state.eventBuffer = [];

      const { cleanup, kill, httpPort } = launchClient(config, {
        routerPolicy,
        verbosity,
        quiet: true,
        onEvent: (event, data) => {
          if (event === 'exit') {
            const proc = data?.prefix || 'UNKNOWN';
            const code = data?.code ?? 'null';
            const last = (data?.lastLines || []).slice(-5).join(' | ');
            const msg = `${proc} exited (code ${code})${last ? ': ' + last : ''}`;
            pushEvent({ type: 'exit', message: msg, timestamp: Date.now() });

            // When CLIENT exits or ROUTER crashes: kill everything and clean up
            if (proc === 'CLIENT' || (proc === 'ROUTER' && data?.code != null && data.code !== 0)) {
              teardown();
              pushEvent({ type: 'stopped', message: msg, timestamp: Date.now() });
            }
            return;
          }

          if (event === 'fatal') {
            teardown();
            pushEvent({ type: 'fatal', message: Array.isArray(data) ? data[0] : 'Client crashed', timestamp: Date.now() });
            pushEvent({ type: 'stopped', message: 'Client crashed', timestamp: Date.now() });
            return;
          }

          const eventObj = {
            type: event,
            message: Array.isArray(data) ? data[0] : (data?.message || event),
            timestamp: Date.now(),
          };
          pushEvent(eventObj);
        },
      });

      state.cleanup = cleanup;
      state.kill = kill;
      setClientState(httpPort);

      pushEvent({ type: 'starting', message: 'Client starting...', timestamp: Date.now() });

      sendJSON(res, 200, { status: 'starting', httpPort });
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to start client: ${err.message}` });
    }
  });

  /**
   * POST /api/client/stop
   * Stop the running client.
   */
  router.post('/api/client/stop', async ({ res }) => {
    if (!isClientRunning()) {
      sendJSON(res, 409, { error: 'Client is not running' });
      return;
    }

    pushEvent({ type: 'stopping', message: 'Stopping client...', timestamp: Date.now() });
    teardown();
    pushEvent({ type: 'stopped', message: 'Client stopped', timestamp: Date.now() });

    sendJSON(res, 200, { status: 'stopping' });
  });

  /**
   * GET /api/client/events
   * SSE stream for lifecycle events.
   */
  router.get('/api/client/events', async ({ req, res }) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Replay last 50 events
    const replay = state.eventBuffer.slice(-50);
    for (const event of replay) {
      sendSSE(res, event);
    }

    state.sseClients.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(':keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      state.sseClients.delete(res);
    });
  });
}
