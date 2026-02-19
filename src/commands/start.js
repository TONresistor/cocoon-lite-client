import { readClientConf, getHttpPort } from '../lib/config.js';
import { launchClient, waitForReady, isFullyReady } from '../lib/client.js';
import {
  printBanner, row, section, success, error,
  updateLine, finishLine,
  BRAND, CYAN, DIM, GREEN, YELLOW,
} from '../lib/ui.js';

export async function startCommand(opts) {
  const config = readClientConf();
  if (!config) {
    error('No client.conf found.');
    console.error(YELLOW(`  Run ${CYAN('npx cocoon setup')} first.`));
    process.exit(1);
  }

  printBanner();

  const httpPort = getHttpPort();

  section('Client');
  row('Instance',  BRAND(config.instance || '0'));
  row('HTTP port', BRAND(httpPort));
  row('Owner',     BRAND(config.owner_address));
  console.log();

  launchClient(config, {
    routerPolicy: opts.routerPolicy || 'any',
    verbosity: opts.verbosity || '1',
  });

  success(`Client running. API: ${BRAND.bold(`http://localhost:${httpPort}`)}`);
  console.log(DIM('  Connecting to proxy...\n'));

  // Background poll for proxy readiness
  const ready = await waitForReady(httpPort, {
    isReady: isFullyReady,
    timeoutMs: 300_000,
    intervalMs: 3_000,
    onUpdate: (data) => {
      if (!data) {
        updateLine(`${YELLOW('⟳')} starting...`);
        return;
      }
      const synced = data.status?.ton_last_synced_at != null ? GREEN('✔') : YELLOW('⟳');
      const staked = data.proxies?.[0]?.tokens_payed > 0;
      const stake = staked ? GREEN('✔') : YELLOW('⟳');
      const pc = data.proxy_connections?.[0];
      const proxy = pc?.is_ready ? GREEN('✔') : YELLOW('⟳');

      if (pc?.is_ready && staked) {
        updateLine(`${GREEN('✔')} sync  ${GREEN('✔')} staked  ${GREEN('✔')} proxy — connected!`);
      } else {
        updateLine(`${synced} sync  ${stake} staked  ${proxy} proxy`);
      }
    },
  });
  finishLine();
  console.log();

  if (ready) {
    success('Proxy connected and ready.');
  } else {
    console.log(YELLOW('  Proxy not ready yet. Client is still running.'));
  }
  console.log(DIM('  Press Ctrl+C to stop.\n'));

  await new Promise(() => {});
}
