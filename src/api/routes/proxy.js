import { request as httpRequest, Agent } from 'http';
import { getClientPort, isClientRunning } from '../../services/client-state.js';
import { sendJSON } from '../server.js';

const PROXY_TIMEOUT_MS = 5000;

// Disable keep-alive: each request opens and closes its own socket.
// The C++ binary's HTTP server crashes on concurrent persistent connections
// during proxy-connection establishment (~20s after start).
const noKeepAliveAgent = new Agent({ keepAlive: false });

// --- Response cache ---
// Prevents multiple browser polls from hammering the binary concurrently.
// Only one in-flight request per path; subsequent requests get the cached response.
const cache = new Map();  // path → { data, status, contentType, ts }
const CACHE_TTL_MS = 2000;

function getCached(path) {
  const entry = cache.get(path);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry;
  return null;
}

function setCache(path, status, contentType, data) {
  cache.set(path, { data, status, contentType, ts: Date.now() });
}

/**
 * Clear cache (called on client stop/restart).
 */
export function clearProxyCache() {
  cache.clear();
}

/**
 * Proxy a request to the client-runner HTTP API.
 */
function proxyRequest(targetPort, targetPath, method, reqHeaders, reqBody, res, stream = false) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: targetPort,
      path: targetPath,
      method,
      headers: { Connection: 'close' },
      timeout: stream ? 0 : PROXY_TIMEOUT_MS,
      agent: noKeepAliveAgent,
    };

    // Forward content-type for POST requests
    if (reqHeaders['content-type']) {
      options.headers['Content-Type'] = reqHeaders['content-type'];
    }

    const proxyReq = httpRequest(options, (proxyRes) => {
      if (stream) {
        // For streaming responses, pipe directly (CORS handled by main server)
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        proxyRes.pipe(res);
        proxyRes.on('end', resolve);
      } else {
        // Buffer the response
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const body = Buffer.concat(chunks).toString();
          const ct = proxyRes.headers['content-type'] || 'application/json';

          // Cache successful GET responses
          if (method === 'GET' && proxyRes.statusCode < 400) {
            setCache(targetPath, proxyRes.statusCode, ct, body);
          }

          res.writeHead(proxyRes.statusCode, {
            'Content-Type': ct,
            'Cache-Control': 'no-store',
          });
          res.end(body);
          resolve();
        });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        sendJSON(res, 504, { error: 'Client not ready (timeout)' });
      }
      reject(new Error('proxy timeout'));
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        sendJSON(res, 502, { error: `Client unreachable: ${err.message}` });
      }
      reject(err);
    });

    if (reqBody && method === 'POST') {
      const bodyStr = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
      proxyReq.write(bodyStr);
    }

    proxyReq.end();
  });
}

/**
 * Serve from cache or proxy to binary (one request at a time per path).
 */
function cachedProxy(port, path, reqHeaders, res) {
  const cached = getCached(path);
  if (cached) {
    res.writeHead(cached.status, {
      'Content-Type': cached.contentType,
      'Cache-Control': 'no-store',
    });
    res.end(cached.data);
    return Promise.resolve();
  }
  return proxyRequest(port, path, 'GET', reqHeaders, null, res);
}

export function register(router) {
  /**
   * GET /api/jsonstats
   * Proxy to client-runner /jsonstats (cached 2s).
   */
  router.get('/api/jsonstats', async ({ req, res }) => {
    const port = getClientPort();
    if (!port || !isClientRunning()) {
      sendJSON(res, 503, { error: 'Client is not running' });
      return;
    }
    try {
      await cachedProxy(port, '/jsonstats', req.headers, res);
    } catch {
      // Error already sent in proxyRequest
    }
  });

  /**
   * GET /api/v1/models
   * Proxy to client-runner /v1/models (cached 2s).
   */
  router.get('/api/v1/models', async ({ req, res }) => {
    const port = getClientPort();
    if (!port || !isClientRunning()) {
      sendJSON(res, 503, { error: 'Client is not running' });
      return;
    }
    try {
      await cachedProxy(port, '/v1/models', req.headers, res);
    } catch {
      // Error already sent in proxyRequest
    }
  });

  /**
   * POST /api/v1/chat/completions
   * Streaming proxy to client-runner /v1/chat/completions.
   */
  router.post('/api/v1/chat/completions', async ({ req, res, body }) => {
    const port = getClientPort();
    if (!port || !isClientRunning()) {
      sendJSON(res, 503, { error: 'Client is not running' });
      return;
    }
    try {
      await proxyRequest(port, '/v1/chat/completions', 'POST', req.headers, body, res, true);
    } catch {
      // Error already sent in proxyRequest
    }
  });
}
