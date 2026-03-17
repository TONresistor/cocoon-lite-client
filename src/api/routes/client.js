import { readClientConf, getHttpPort } from '../../lib/config.js';
import { launchClient } from '../../lib/client.js';
import { sendJSON, sendSSE } from '../server.js';
import {
  getClientPort, isClientRunning, isProxyReady, getClientStartedAt,
  setClientState, clearClientState, getDefaultVerbosity,
  setProxyReady,
} from '../../services/client-state.js';
import { clearProxyCache } from './proxy.js';
import { request as httpRequest } from 'http';
import { classifyEvent, createMilestone, resetClassifier } from '../../lib/event-classifier.js';
import { clientLogger } from '../../lib/logger.js';

// Module state for tracking the running client process handles and events.
// The shared running/httpPort/startedAt live in services/client-state.js.
const state = {
  cleanup: null,
  kill: null,
  eventBuffer: [],
  sseClients: new Set(),
  proxyPollTimer: null,
};

// State tracker for detecting milestone transitions from jsonstats
const lastState = {
  seqno: 0,
  tokensPayed: 0,
  isReady: false,
  balance: 0,
  seenFirstSeqno: false,
  seenFirstStake: false,
};

function resetStateTracker() {
  lastState.seqno = 0;
  lastState.tokensPayed = 0;
  lastState.isReady = false;
  lastState.balance = 0;
  lastState.seenFirstSeqno = false;
  lastState.seenFirstStake = false;
}

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
  if (state.proxyPollTimer) {
    clearInterval(state.proxyPollTimer);
    state.proxyPollTimer = null;
  }
  clearClientState();
  clearProxyCache();
  resetClassifier();
  resetStateTracker();
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
      const verbosity = body.verbosity || getDefaultVerbosity();

      state.eventBuffer = [];
      resetStateTracker();
      resetClassifier();

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
            const classified = classifyEvent('exit', { message: msg });
            clientLogger.info({ proc, code }, classified.message);
            pushEvent(classified);

            // When CLIENT exits or ROUTER crashes (code !== 0 or signal-killed = null): tear down
            if (proc === 'CLIENT' || (proc === 'ROUTER' && data?.code !== 0)) {
              teardown();
              // Detect proxy rejection (stake not visible on-chain yet)
              if (last.includes('cancelled') || last.includes('Error : 653')) {
                const warnEvent = classifyEvent('error', { message: 'Proxy rejected connection — stake may not be confirmed on-chain yet. Wait ~60s and try again.' });
                clientLogger.warn(warnEvent.message);
                pushEvent(warnEvent);
              }
              pushEvent(classifyEvent('stopped', { message: msg }));
            }
            return;
          }

          if (event === 'fatal') {
            teardown();
            const fatalEvent = classifyEvent('fatal', data);
            clientLogger.fatal(fatalEvent.message);
            pushEvent(fatalEvent);
            pushEvent(classifyEvent('stopped', { message: 'Client crashed' }));
            return;
          }

          // After TCP connection is up, wait for handshake+auth to finish
          // before allowing /jsonstats (binary crashes if polled mid-handshake).
          if (event === 'connection_ready') {
            setTimeout(() => setProxyReady(), 10_000);
          }

          // Fallback: if connection_ready never fires (e.g. Error 653 during
          // initial connections), poll the binary directly once listening is up.
          if (event === 'listening' && !state.proxyPollTimer) {
            state.proxyPollTimer = setInterval(() => {
              if (!isClientRunning()) {
                clearInterval(state.proxyPollTimer);
                state.proxyPollTimer = null;
                return;
              }

              const req = httpRequest(
                { hostname: '127.0.0.1', port: httpPort, path: '/jsonstats', method: 'GET', timeout: 2000 },
                (pollRes) => {
                  const chunks = [];
                  pollRes.on('data', c => chunks.push(c));
                  pollRes.on('end', () => {
                    try {
                      const stats = JSON.parse(Buffer.concat(chunks).toString());
                      const conn = stats.proxy_connections?.[0];

                      // State tracker: detect milestone transitions
                      if (conn) {
                        const seqno = conn.seqno ?? 0;
                        const tokensPayed = parseFloat(conn.tokens_payed ?? 0);

                        // seqno 0 -> 1: registering on-chain
                        if (seqno > 0 && lastState.seqno === 0 && !lastState.seenFirstSeqno) {
                          lastState.seenFirstSeqno = true;
                          const milestone = createMilestone('Registering on-chain...');
                          clientLogger.info(milestone.message);
                          pushEvent(milestone);
                        }
                        lastState.seqno = seqno;

                        // tokensPayed went from 0 to >0: stake deposited
                        if (tokensPayed > 0 && lastState.tokensPayed === 0 && !lastState.seenFirstStake) {
                          lastState.seenFirstStake = true;
                          const amount = tokensPayed.toFixed(2);
                          const milestone = createMilestone(`Stake deposited: ${amount} TON`);
                          clientLogger.info(milestone.message);
                          pushEvent(milestone);
                        }
                        lastState.tokensPayed = tokensPayed;
                      }

                      // Existing proxy readiness check
                      if (!isProxyReady() && conn?.is_ready) {
                        setProxyReady();
                        if (!state.proxyPollTimer) return;
                        const readyEvent = classifyEvent('connection_ready', null);
                        clientLogger.info(readyEvent.message);
                        pushEvent(readyEvent);
                      }

                      // Stop polling once proxy is ready
                      if (isProxyReady()) {
                        clearInterval(state.proxyPollTimer);
                        state.proxyPollTimer = null;
                      }
                    } catch {}
                  });
                },
              );
              req.on('error', () => {});
              req.end();
            }, 5_000);
          }

          // Classify all other events
          const classified = classifyEvent(event, data);
          if (classified.level === 'error') {
            clientLogger.error(classified.message);
          } else if (classified.level === 'warn') {
            clientLogger.warn(classified.message);
          } else if (classified.level !== 'debug') {
            clientLogger.info(classified.message);
          } else {
            clientLogger.debug(classified.message);
          }
          pushEvent(classified);
        },
      });

      state.cleanup = cleanup;
      state.kill = kill;
      setClientState(httpPort);

      const startEvent = classifyEvent('starting', { message: 'Client starting...' });
      clientLogger.info({ httpPort }, startEvent.message);
      pushEvent(startEvent);

      sendJSON(res, 200, { status: 'starting', httpPort });
    } catch (err) {
      clientLogger.error({ err: err.message }, 'Failed to start client');
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

    const stoppingEvent = classifyEvent('stopping', { message: 'Stopping client...' });
    clientLogger.info(stoppingEvent.message);
    pushEvent(stoppingEvent);
    teardown();
    const stoppedEvent = classifyEvent('stopped', { message: 'Client stopped' });
    clientLogger.info(stoppedEvent.message);
    pushEvent(stoppedEvent);

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
