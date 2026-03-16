import { existsSync, readFileSync, writeFileSync, rmSync, copyFileSync, mkdtempSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import {
  PATHS, PROJECT_ROOT,
  getRuntimeVars,
} from './config.js';
import { spawnWithPrefix, setupSignalHandlers } from './process.js';
import { RED } from './ui.js';

/**
 * Render a JSON template by replacing $VAR placeholders with runtime vars
 */
function renderTemplate(templatePath, vars) {
  let content = readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`"$${key}"`, JSON.stringify(value));
    content = content.replaceAll(`$${key}`, String(value));
  }
  return content;
}

/**
 * Launch router + client-runner from config.
 * @param {object} config - parsed client.conf
 * @param {object} [opts]
 * @param {string} [opts.routerPolicy='any']
 * @param {string} [opts.verbosity='1']
 * @param {boolean} [opts.quiet=true]
 * @param {(event: string, data: any) => void} [opts.onEvent]
 * @returns {{ cleanup: () => void, runDir: string, httpPort: number }}
 */
export function launchClient(config, opts = {}) {
  const {
    routerPolicy = 'any',
    verbosity = '1',
    quiet = true,
    onEvent,
  } = opts;

  if (!existsSync(PATHS.clientRunner)) {
    throw new Error(`client-runner not found: ${PATHS.clientRunner}`);
  }
  if (!existsSync(PATHS.router)) {
    throw new Error(`router not found: ${PATHS.router}`);
  }

  // Runtime directory (restricted permissions)
  const oldUmask = process.umask(0o077);
  const runDir = mkdtempSync(resolve(tmpdir(), 'cocoon-client-'));
  process.umask(oldUmask);

  // Compute config
  const vars = getRuntimeVars(config);
  vars.TON_CONFIG_FILE = resolve(runDir, 'global.config.json');

  const renderedConfig = renderTemplate(PATHS.clientConfigTemplate, vars);
  const clientConfigPath = resolve(runDir, 'client-config.json');
  writeFileSync(clientConfigPath, renderedConfig);

  // TON config
  const tonConfigPath = resolve(PROJECT_ROOT, config.ton_config || 'spec/mainnet-full-ton-config.json');
  if (!existsSync(tonConfigPath)) {
    rmSync(runDir, { recursive: true, force: true });
    throw new Error(`TON config not found: ${tonConfigPath}`);
  }

  // Copy full TON config as-is (like the original start.sh).
  // Do NOT merge with base config — base has empty DHT nodes which causes SIGSEGV.
  copyFileSync(tonConfigPath, resolve(runDir, 'global.config.json'));

  // Cleanup handler
  const cleanup = () => {
    try { rmSync(runDir, { recursive: true, force: true }); } catch {}
  };
  setupSignalHandlers(cleanup);

  // Ports
  const instance = parseInt(config.instance || '0', 10);
  const httpPort = 10000 + instance * 10;

  // Start router
  const routerProc = spawnWithPrefix(
    PATHS.router,
    ['-S', `8116@${routerPolicy}`, '--serialize-info', `-v${verbosity}`],
    {
      prefix: 'ROUTER', color: 'cyan', quiet,
      onEvent: (event, data) => {
        if (event === 'fatal') console.error(RED('  ✗ Router crashed.'));
        if (event === 'exit' && data?.code && data.code !== 0)
          console.error(RED(`  ✗ Router exited (code ${data.code}).`));
        if (onEvent) onEvent(event, data);
      },
    }
  );

  // Start client-runner
  const clientProc = spawnWithPrefix(
    PATHS.clientRunner,
    ['--config', clientConfigPath, `-v${verbosity}`],
    {
      prefix: 'CLIENT', color: 'yellow', quiet,
      env: {
        COCOON_ROUTER_POLICY: routerPolicy,
        COCOON_SKIP_TDX_USERCLAIMS: '1',
        COCOON_SKIP_PROXY_HASH: '1',
      },
      onEvent: (event, data) => {
        if (event === 'fatal') console.error(RED('  ✗ Client crashed.'));
        if (event === 'exit' && data?.code && data.code !== 0)
          console.error(RED(`  ✗ Client exited (code ${data.code}).`));
        if (onEvent) onEvent(event, data);
      },
    }
  );

  // Kill both processes
  const kill = () => {
    for (const proc of [routerProc, clientProc]) {
      try { proc.kill('SIGTERM'); } catch {}
    }
    // Force kill after 3s
    setTimeout(() => {
      for (const proc of [routerProc, clientProc]) {
        try { proc.kill('SIGKILL'); } catch {}
      }
    }, 3000);
  };

  return { cleanup, kill, runDir, httpPort, routerProc, clientProc };
}

/**
 * Check if jsonstats data indicates fully ready (proxy connected + staked).
 */
export function isFullyReady(data) {
  const pc = data?.proxy_connections?.[0];
  const staked = data?.proxies?.[0]?.tokens_payed > 0;
  return !!(pc?.is_ready && staked);
}

/**
 * Poll /jsonstats until a condition is met.
 * @param {number} port
 * @param {object} [opts]
 * @param {(status: object) => void} [opts.onUpdate]
 * @param {(data: object) => boolean} [opts.isReady] - custom readiness check (default: isFullyReady)
 * @param {number} [opts.timeoutMs=300000]
 * @param {number} [opts.intervalMs=3000]
 * @returns {Promise<object | null>}
 */
export async function waitForReady(port, opts = {}) {
  const { onUpdate, isReady = isFullyReady, timeoutMs = 300_000, intervalMs = 3_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  const url = `http://localhost:${port}/jsonstats`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (onUpdate) onUpdate(data);
        if (isReady(data)) return data;
      }
    } catch {
      if (onUpdate) onUpdate(null);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}
