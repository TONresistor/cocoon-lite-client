import chalk from 'chalk';
import { getHttpPort } from '../lib/config.js';
import { formatTon } from '../lib/transactions.js';
import {
  printBanner, row, separator, handleClientError,
  DIM, CYAN, GREEN, RED,
} from '../lib/ui.js';

const badge = (ok, y = 'yes', n = 'no') => ok ? GREEN(y) : RED(n);

export async function statusCommand(opts) {
  const port = opts.port || String(getHttpPort());

  try {
    const res = await fetch(`http://localhost:${port}/jsonstats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const { status, wallet, proxy_connections = [], proxies = [], root_contract_config: rc } = await res.json();

    printBanner();
    console.log();

    // Node + Wallet on same block
    row('TON sync',   badge(status?.ton_last_synced_at != null, 'synced', 'not synced'));
    row('Enabled',    badge(status?.enabled));
    row('Address',    CYAN(wallet?.address || '?'));
    row('Balance',    `${chalk.bold(formatTon(wallet?.balance || 0))} TON`);

    // Proxy
    if (proxy_connections.length > 0) {
      const pc = proxy_connections[0];
      const addr = pc.address?.replace(/[\[\]]/g, '') || '?';
      row('Proxy',    `${badge(pc.is_ready, 'ready', 'not ready')} ${DIM(addr)}`);
    } else {
      row('Proxy',    RED('disconnected'));
    }

    // Staking
    if (proxies.length > 0) {
      const p = proxies[0];
      row('Escrow',   `${chalk.bold(formatTon(p.tokens_payed || 0))} TON ${DIM('(active top-up)')}`);
    }

    // Network (one-line pricing)
    if (rc) {
      const prompt = ((rc.price_per_token || 20) * (rc.prompt_tokens_price_multiplier || 10000) / 10000 * 1000 / 1e9).toFixed(6);
      const completion = ((rc.price_per_token || 20) * (rc.completion_tokens_price_multiplier || 80000) / 10000 * 1000 / 1e9).toFixed(6);
      row('Network',  DIM(`v${rc.version} · ${rc.registered_proxies?.length || 0} proxies · ${rc.worker_hashes?.length || 0} workers`));
      row('Pricing',  DIM(`${prompt} / ${completion} TON per 1K (prompt/completion)`));
    }

    console.log();
    separator();
    console.log(DIM(`  localhost:${port} | ${new Date().toLocaleTimeString()}\n`));

  } catch (err) {
    handleClientError(err, port);
  }
}
