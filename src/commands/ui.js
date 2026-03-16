import { createServer } from '../api/server.js';
import { register as registerSetup } from '../api/routes/setup.js';
import { register as registerClient } from '../api/routes/client.js';
import { register as registerProxy } from '../api/routes/proxy.js';
import { register as registerWallet } from '../api/routes/wallet.js';

export async function uiCommand(options) {
  const port = parseInt(options.port, 10) || 3000;

  const { server, router, token } = createServer(port);

  // Register all API routes
  registerSetup(router);
  registerClient(router);
  registerProxy(router);
  registerWallet(router);

  // Open browser (best-effort, platform-specific)
  const url = `http://127.0.0.1:${port}?token=${token}`;
  console.log('API auth token:', token);
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  import('child_process').then(cp => cp.exec(`${cmd} ${url}`)).catch(() => {});

  // Graceful shutdown
  const shutdown = () => {
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
