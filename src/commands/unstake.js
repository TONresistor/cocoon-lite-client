import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { Address, fromNano } from '@ton/core';
import { getHttpPort, readWalletJson } from '../lib/config.js';
import { createTonClient, withRetry } from '../lib/ton.js';
import {
  printBanner, row, success, error, separator, handleClientError,
  BRAND, DIM, CYAN, GREEN, RED, YELLOW,
} from '../lib/ui.js';
import { sendFromCocoonWallet, waitForSeqnoChange, SC_RESERVE, formatTon } from '../lib/transactions.js';

// Smart contract states from ClientProxyInfo
const SC_STATE = { ACTIVE: 0, CLOSING: 1, CLOSED: 2 };

async function fetchStats(base) {
  const res = await fetch(`${base}/jsonstats`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function sendRequest(base, action, proxyScAddress) {
  const res = await fetch(`${base}/request/${action}?proxy=${encodeURIComponent(proxyScAddress)}`);
  const body = await res.text();
  const clean = body.replace(/<[^>]*>/g, '').trim();
  const ok = clean.toLowerCase().includes('request sent');
  return { ok, message: clean };
}

async function pollState(base, proxyScAddress, targetState, { timeoutMs = 120_000, intervalMs = 3_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stats = await fetchStats(base);
      const proxy = stats.proxies?.find(p => p.proxy_sc_address === proxyScAddress);
      if (!proxy) return { proxy_sc_address: proxyScAddress, state: SC_STATE.CLOSED, removed: true };
      if (proxy.state >= targetState) return proxy;
    } catch {
      // transient error
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

/** Transfer cocoon wallet → owner wallet. Returns true on success. */
async function transferCocoonToOwner() {
  const wallet = readWalletJson();
  if (!wallet) {
    error('No .wallet.json found.');
    return false;
  }

  const cocoonAddrStr = wallet.node_wallet?.address;
  const ownerAddrStr = wallet.owner_wallet?.address;
  const nodeKeyBase64 = wallet.node_wallet?.private_key_base64;

  if (!cocoonAddrStr || !ownerAddrStr || !nodeKeyBase64) {
    error('Incomplete wallet config.');
    return false;
  }

  const nodeSecret = Buffer.from(nodeKeyBase64, 'base64');
  if (nodeSecret.length !== 32) {
    error(`Invalid node key: expected 32 bytes, got ${nodeSecret.length}`);
    return false;
  }

  const client = createTonClient();
  const cocoonAddr = Address.parse(cocoonAddrStr);
  const ownerAddr = Address.parse(ownerAddrStr);

  let cocoonBalance;
  try {
    cocoonBalance = await withRetry(() => client.getBalance(cocoonAddr));
  } catch (err) {
    error(`Failed to fetch cocoon balance: ${err.message}`);
    return false;
  }

  const sendAmount = cocoonBalance - SC_RESERVE;
  if (sendAmount <= 0n) {
    console.log(YELLOW('  Cocoon wallet balance too low to transfer.'));
    return false;
  }

  console.log(DIM(`  Cocoon balance: ${fromNano(cocoonBalance)} TON`));
  console.log(DIM(`  Sending ${fromNano(sendAmount)} TON → owner wallet\n`));

  try {
    const { seqno } = await sendFromCocoonWallet(client, cocoonAddr, nodeSecret, ownerAddr, sendAmount);
    success(`Sent ${fromNano(sendAmount)} TON → owner wallet`);

    const confirmed = await waitForSeqnoChange(
      () => withRetry(() => client.runMethod(cocoonAddr, 'seqno')).then(r => r.stack.readNumber()),
      seqno,
    );
    if (confirmed) {
      const ownerBal = await withRetry(() => client.getBalance(ownerAddr));
      success(`Confirmed! Owner wallet balance: ${fromNano(ownerBal)} TON`);
      return true;
    }
    console.log(YELLOW('  Timeout waiting for confirmation. Check tonviewer.com'));
    return true; // TX was sent, just unconfirmed
  } catch (err) {
    error(`Transfer failed: ${err.message}`);
    return false;
  }
}

export async function unstakeCommand(opts) {
  const port = opts.port || String(getHttpPort());
  const base = `http://localhost:${port}`;

  printBanner();
  console.log();

  // 1. Fetch current state
  let stats;
  try {
    stats = await fetchStats(base);
  } catch (err) {
    handleClientError(err, port);
  }

  // 2. Find proxy
  const proxy = stats.proxies?.[0];
  const proxyScAddress = proxy?.proxy_sc_address;

  if (!proxyScAddress) {
    error('No proxy found. The client may not be staked yet.');
    console.log(DIM('  Run npx cocoon status to check.\n'));
    process.exit(1);
  }

  const state = proxy.state ?? 0;
  const escrow = proxy.tokens_payed || 0;

  const cocoonBal = stats.wallet?.balance || 0;
  row('Proxy',          CYAN(proxyScAddress));
  row('Escrow',         `${chalk.bold(formatTon(escrow))} TON ${DIM('(active top-up on proxy)')}`);
  row('Cocoon wallet',  `${chalk.bold(formatTon(cocoonBal))} TON ${DIM('(reserve)')}`);
  row('State',          state === SC_STATE.ACTIVE ? GREEN('active')
                      : state === SC_STATE.CLOSING ? YELLOW('closing')
                      : RED('closed'));
  console.log();

  if (escrow <= 0 && state === SC_STATE.ACTIVE) {
    console.log(YELLOW('  No active deposit to unstake.\n'));
    return;
  }

  // 3. Handle based on current state
  if (state === SC_STATE.ACTIVE) {
    const proceed = await confirm({
      message: `Unstake from proxy ${proxyScAddress.slice(0, 8)}…? This will close, withdraw, and send to owner wallet.`,
      default: false,
    });
    if (!proceed) {
      console.log(DIM('\n  Unstake cancelled.\n'));
      return;
    }

    // Step 1/3: Close
    console.log();
    console.log(DIM('  Step 1/3 — Requesting refund (close)...\n'));

    const closeResult = await sendRequest(base, 'close', proxyScAddress);
    if (!closeResult.ok) {
      error(`Close failed: ${closeResult.message}`);
      return;
    }
    success('Refund request sent.');

    console.log(DIM('  Waiting for contract to close (up to 2 min)...\n'));
    const closed = await pollState(base, proxyScAddress, SC_STATE.CLOSED, {
      timeoutMs: 120_000,
      intervalMs: 3_000,
    });

    if (!closed) {
      console.log(YELLOW('  Contract not yet closed. Run npx cocoon unstake again later.\n'));
      return;
    }
    success('Contract closed.');
    console.log();

    // Step 2/3: Withdraw proxy → cocoon (skip if proxy already removed — refund was automatic)
    if (closed.removed) {
      success('Refund settled automatically (proxy removed).');
    } else {
      console.log(DIM('  Step 2/3 — Withdrawing from proxy to cocoon wallet...\n'));
      const withdrawResult = await sendRequest(base, 'withdraw', proxyScAddress);
      if (!withdrawResult.ok) {
        // If proxy not found, refund already happened
        if (withdrawResult.message.includes('proxy not found')) {
          success('Refund already settled.');
        } else {
          error(`Withdraw failed: ${withdrawResult.message}`);
          return;
        }
      } else {
        success('Proxy withdraw sent.');
      }
    }

  } else if (state === SC_STATE.CLOSING) {
    console.log(YELLOW('  Contract is already closing. Waiting for it to complete...\n'));

    const closed = await pollState(base, proxyScAddress, SC_STATE.CLOSED, {
      timeoutMs: 120_000,
      intervalMs: 3_000,
    });

    if (!closed) {
      console.log(YELLOW('  Still not closed. Try again later: npx cocoon unstake\n'));
      return;
    }
    success('Contract closed.');
    console.log();

    if (closed.removed) {
      success('Refund settled automatically.');
    } else {
      console.log(DIM('  Step 2/3 — Withdrawing from proxy to cocoon wallet...\n'));
      const withdrawResult = await sendRequest(base, 'withdraw', proxyScAddress);
      if (!withdrawResult.ok && !withdrawResult.message.includes('proxy not found')) {
        error(`Withdraw failed: ${withdrawResult.message}`);
        return;
      }
      success(withdrawResult.ok ? 'Proxy withdraw sent.' : 'Refund already settled.');
    }

  } else if (state === SC_STATE.CLOSED) {
    const proceed = await confirm({
      message: 'Contract already closed. Withdraw remaining funds?',
      default: true,
    });
    if (!proceed) {
      console.log(DIM('\n  Cancelled.\n'));
      return;
    }

    console.log(DIM('\n  Step 2/3 — Withdrawing from proxy to cocoon wallet...\n'));
    const withdrawResult = await sendRequest(base, 'withdraw', proxyScAddress);
    if (!withdrawResult.ok && !withdrawResult.message.includes('proxy not found')) {
      error(`Withdraw failed: ${withdrawResult.message}`);
      return;
    }
    success(withdrawResult.ok ? 'Proxy withdraw sent.' : 'Refund already settled.');
  }

  // Step 3/3: Transfer cocoon wallet → owner wallet
  console.log();
  console.log(DIM('  Step 3/3 — Transferring cocoon wallet → owner wallet...\n'));

  await new Promise(r => setTimeout(r, 5000));

  const transferred = await transferCocoonToOwner();

  console.log();
  separator();
  if (transferred) {
    console.log(DIM('  Unstake complete. Run npx cocoon status to verify.\n'));
  } else {
    console.log(YELLOW('  Proxy withdraw done but cocoon→owner transfer failed.'));
    console.log(DIM('  Run: npx cocoon withdraw\n'));
  }
}
