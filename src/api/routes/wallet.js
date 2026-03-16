import { readWalletJson } from '../../lib/config.js';
import { getBalance } from '../../lib/ton.js';
import { sendFromCocoonWallet, SC_RESERVE } from '../../lib/transactions.js';
import { getCachedTonClient } from '../ton-cache.js';
import { getClientPort, isClientRunning } from '../../services/client-state.js';
import { withdrawFunds, cashoutFunds } from '../../services/wallet.js';
import { sendJSON } from '../server.js';
import { Address } from '@ton/core';
import { request as httpRequest } from 'http';

/**
 * Make an HTTP GET request and return the response body as text.
 */
function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', reject);
    req.end();
  });
}

const unstakeState = { active: false, step: null, error: null, completedAt: null };

export function register(router) {
  /**
   * GET /api/wallet/info
   * Returns wallet addresses and balances. NEVER returns keys.
   */
  router.get('/api/wallet/info', async ({ res }) => {
    try {
      const wallet = readWalletJson();
      if (!wallet) {
        sendJSON(res, 400, { error: 'No wallet found. Complete setup first.' });
        return;
      }

      const ownerAddr = wallet.owner_wallet.address;
      const cocoonAddr = wallet.node_wallet.address;

      const result = {
        owner: { address: ownerAddr, balance: null },
        cocoon: { address: cocoonAddr || null, balance: null },
      };

      const [ownerResult, cocoonResult] = await Promise.allSettled([
        getBalance(ownerAddr),
        cocoonAddr ? getBalance(cocoonAddr) : Promise.reject(),
      ]);

      if (ownerResult.status === 'fulfilled') {
        result.owner.balance = { nano: ownerResult.value.nano.toString(), ton: ownerResult.value.ton };
      }
      if (cocoonResult.status === 'fulfilled') {
        result.cocoon.balance = { nano: cocoonResult.value.nano.toString(), ton: cocoonResult.value.ton };
      }

      sendJSON(res, 200, result);
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to get wallet info: ${err.message}` });
    }
  });

  /**
   * POST /api/wallet/withdraw
   * Withdraw from cocoon wallet to owner wallet.
   */
  router.post('/api/wallet/withdraw', async ({ res, body }) => {
    try {
      const { seqno } = await withdrawFunds({ amount: body.amount });
      sendJSON(res, 200, { status: 'sent', seqno });
    } catch (err) {
      const status = err.message.includes('No wallet') || err.message.includes('not available') || err.message.includes('Insufficient') ? 400 : 500;
      sendJSON(res, status, { error: `Withdraw failed: ${err.message}` });
    }
  });

  /**
   * GET /api/wallet/unstake/status
   * Returns current unstake operation state.
   */
  router.get('/api/wallet/unstake/status', async ({ res }) => {
    sendJSON(res, 200, unstakeState);
  });

  /**
   * POST /api/wallet/unstake
   * 3-step unstake: close proxy -> withdraw from proxy -> transfer cocoon -> owner.
   */
  router.post('/api/wallet/unstake', async ({ res }) => {
    const port = getClientPort();
    if (!port || !isClientRunning()) {
      sendJSON(res, 400, { error: 'Client must be running to unstake' });
      return;
    }

    const wallet = readWalletJson();
    if (!wallet) {
      sendJSON(res, 400, { error: 'No wallet found' });
      return;
    }

    // Reset and activate state for new unstake
    unstakeState.active = true;
    unstakeState.step = null;
    unstakeState.error = null;
    unstakeState.completedAt = null;

    // Respond immediately - this is a long-running operation
    sendJSON(res, 200, { status: 'closing', step: 1, message: 'Starting unstake process...' });

    // Run the 3-step process asynchronously
    (async () => {
      try {
        // Step 1: Get proxy address from jsonstats and close it
        unstakeState.step = 'closing';
        const statsRaw = await httpGet(port, '/jsonstats');
        const stats = JSON.parse(statsRaw);
        const proxy = stats.proxies?.[0];
        if (!proxy) {
          unstakeState.active = false;
          return;
        }

        const proxyAddr = proxy.proxy_sc_address;
        if (proxyAddr) {
          const closeResult = await httpGet(port, `/request/close?proxy=${proxyAddr}`);
          const closeClean = closeResult.replace(/<[^>]*>/g, '').toLowerCase();
          if (!closeClean.includes('request sent')) {
            console.error('Unstake step 1 failed: close proxy request not acknowledged');
          }
        }

        // Step 2: Withdraw from proxy
        unstakeState.step = 'withdrawing';
        if (proxyAddr) {
          // Wait a bit for close to process
          await new Promise(r => setTimeout(r, 5000));
          const withdrawResult = await httpGet(port, `/request/withdraw?proxy=${proxyAddr}`);
          const withdrawClean = withdrawResult.replace(/<[^>]*>/g, '').toLowerCase();
          if (!withdrawClean.includes('request sent')) {
            console.error('Unstake step 2 failed: withdraw request not acknowledged');
          }
        }

        // Step 3: Transfer from cocoon wallet to owner wallet
        unstakeState.step = 'transferring';
        await new Promise(r => setTimeout(r, 10000));
        const cocoonAddr = wallet.node_wallet.address;
        if (cocoonAddr) {
          const client = getCachedTonClient();
          const cocoonAddress = Address.parse(cocoonAddr);
          const ownerAddress = Address.parse(wallet.owner_wallet.address);
          const nodeSecretKey = Buffer.from(wallet.node_wallet.private_key_base64, 'base64');

          const bal = await getBalance(cocoonAddr);
          if (bal.nano > SC_RESERVE) {
            await sendFromCocoonWallet(client, cocoonAddress, nodeSecretKey, ownerAddress, bal.nano - SC_RESERVE);
          }
        }

        unstakeState.step = 'done';
        unstakeState.active = false;
        unstakeState.completedAt = Date.now();
      } catch (err) {
        console.error(`Unstake error: ${err.message}`);
        unstakeState.error = err.message;
        unstakeState.active = false;
      }
    })();
  });

  /**
   * POST /api/wallet/cashout
   * Send TON from owner wallet to an external address.
   */
  router.post('/api/wallet/cashout', async ({ res, body }) => {
    try {
      const { seqno } = await cashoutFunds({ amount: body.amount, destination: body.destination });
      sendJSON(res, 200, { status: 'sent', seqno });
    } catch (err) {
      const status = err.message.includes('No wallet') || err.message.includes('Missing') || err.message.includes('Insufficient') ? 400 : 500;
      sendJSON(res, status, { error: `Cashout failed: ${err.message}` });
    }
  });
}
