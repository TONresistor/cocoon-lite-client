import { createServer as httpCreateServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { resolve, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import { apiLogger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBUI_DIST = resolve(__dirname, '../../webui/dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const MAX_BODY_SIZE = 1048576; // 1 MB

/**
 * Parse JSON body from request.
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        const err = new Error('Request body too large');
        err.statusCode = 413;
        return reject(err);
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response.
 */
export function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * Send SSE event.
 */
export function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Create a simple router with method+path matching supporting :params.
 */
export function createRouter() {
  const routes = [];

  function addRoute(method, path, handler) {
    // Convert path pattern to regex
    const paramNames = [];
    const pattern = path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${pattern}$`);
    routes.push({ method, regex, paramNames, handler });
  }

  function match(method, pathname) {
    for (const route of routes) {
      if (route.method !== method) continue;
      const m = pathname.match(route.regex);
      if (m) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(m[i + 1]);
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }

  return {
    get(path, handler) { addRoute('GET', path, handler); },
    post(path, handler) { addRoute('POST', path, handler); },
    put(path, handler) { addRoute('PUT', path, handler); },
    delete(path, handler) { addRoute('DELETE', path, handler); },
    match,
  };
}

/**
 * Serve static files from webui/dist with SPA fallback.
 */
function serveStatic(req, res) {
  let filePath = join(WEBUI_DIST, req.url === '/' ? '/index.html' : req.url);

  // Remove query string
  filePath = filePath.split('?')[0];

  // Resolve to absolute and check for path traversal
  filePath = resolve(filePath);
  if (!filePath.startsWith(WEBUI_DIST)) {
    sendJSON(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    // SPA fallback: serve index.html for unknown paths
    filePath = resolve(join(WEBUI_DIST, 'index.html'));
    if (!filePath.startsWith(WEBUI_DIST)) {
      sendJSON(res, 403, { error: 'Forbidden' });
      return;
    }
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    // Hashed filenames (assets/) get long cache, HTML gets no-cache
    const cacheHeader = filePath.includes('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheHeader });
    res.end(content);
  } catch {
    sendJSON(res, 404, { error: 'WebUI not built. Run: cd webui && npm run build' });
  }
}

/**
 * Add CORS headers — only allow localhost/127.0.0.1 origins.
 */
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Create the HTTP server with router and static file serving.
 * @param {number} port
 * @returns {{ server: import('http').Server, router: ReturnType<typeof createRouter>, token: string }}
 */
export function createServer(port) {
  const router = createRouter();
  const token = randomUUID();

  const server = httpCreateServer(async (req, res) => {
    setCorsHeaders(req, res);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      // Require auth token for state-changing methods
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${token}`) {
          sendJSON(res, 401, { error: 'Unauthorized' });
          return;
        }
      }

      const matched = router.match(req.method, pathname);
      if (matched) {
        try {
          const body = req.method === 'POST' || req.method === 'PUT'
            ? await parseJsonBody(req)
            : {};
          await matched.handler({ req, res, params: matched.params, body, query: Object.fromEntries(url.searchParams) });
        } catch (err) {
          if (!res.headersSent) {
            const status = err.statusCode || 500;
            sendJSON(res, status, { error: err.message || 'Internal server error' });
          }
        }
        // Log POST/PUT/DELETE requests (not GETs to avoid noise from polling)
        if (req.method !== 'GET') {
          apiLogger.info({ method: req.method, path: pathname, status: res.statusCode }, 'API request');
        }
        return;
      }

      // No matching API route
      sendJSON(res, 404, { error: 'Not found' });
      return;
    }

    // Static files
    serveStatic(req, res);
  });

  server.listen(port, '127.0.0.1', () => {
    apiLogger.info(`COCOON WebUI running at http://127.0.0.1:${port}`);
    apiLogger.info({ token }, 'Auth token');
  });

  return { server, router, token };
}

/**
 * Register graceful shutdown handlers for SIGTERM/SIGINT.
 * Stops accepting new connections, waits for in-flight requests,
 * then exits. Calls optional teardown() before exiting.
 *
 * @param {import('http').Server} server
 * @param {{ teardown?: () => void }} [options]
 */
export function registerShutdownHandlers(server, { teardown } = {}) {
  let stopping = false;

  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;

    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    server.close((err) => {
      if (err) console.error('Error closing server:', err.message);
      if (teardown) {
        try { teardown(); } catch {}
      }
      process.exit(err ? 1 : 0);
    });

    // Force-exit after 10 s if connections are still open
    setTimeout(() => {
      console.error('Shutdown timeout — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}
