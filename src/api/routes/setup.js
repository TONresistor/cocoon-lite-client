import { readWalletJson, writeWalletJson, readClientConf, writeClientConf, getHttpPort, DEFAULT_ROOT_CONTRACT } from '../../lib/config.js';
import { generateWallet } from '../../lib/wallet.js';
import { getBalance } from '../../lib/ton.js';
import { transferFunds } from '../../services/wallet.js';
import { sendJSON } from '../server.js';

export function register(router) {
  /**
   * GET /api/setup/status
   * Returns whether wallet and config exist, plus addresses if available.
   */
  router.get('/api/setup/status', async ({ res }) => {
    const wallet = readWalletJson();
    const config = readClientConf();
    sendJSON(res, 200, {
      hasWallet: !!wallet,
      hasConfig: !!config,
      ownerAddress: wallet?.owner_wallet?.address || null,
      nodeAddress: wallet?.node_wallet?.address || null,
    });
  });

  /**
   * POST /api/setup/generate-wallet
   * Generate a new wallet. Returns mnemonic ONE TIME.
   */
  router.post('/api/setup/generate-wallet', async ({ res }) => {
    try {
      const { mnemonic, walletData } = await generateWallet();
      writeWalletJson(walletData);
      sendJSON(res, 200, {
        mnemonic,
        ownerAddress: walletData.owner_wallet.address,
        nodeAddress: walletData.node_wallet.address,
      });
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to generate wallet: ${err.message}` });
    }
  });

  /**
   * POST /api/setup/import-wallet
   * Import an existing wallet JSON.
   */
  router.post('/api/setup/import-wallet', async ({ res, body }) => {
    try {
      const walletData = body.walletJson;
      if (!walletData) {
        sendJSON(res, 400, { error: 'Missing walletJson in request body' });
        return;
      }
      if (!walletData.owner_wallet?.address) {
        sendJSON(res, 400, { error: 'Invalid wallet: missing owner_wallet.address' });
        return;
      }
      if (!walletData.node_wallet?.private_key_base64) {
        sendJSON(res, 400, { error: 'Invalid wallet: missing node_wallet.private_key_base64' });
        return;
      }
      writeWalletJson(walletData);
      sendJSON(res, 200, {
        ownerAddress: walletData.owner_wallet.address,
        nodeAddress: walletData.node_wallet.address || '',
      });
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to import wallet: ${err.message}` });
    }
  });

  /**
   * POST /api/setup/write-config
   * Write client.conf from provided fields.
   */
  router.post('/api/setup/write-config', async ({ res, body }) => {
    try {
      const wallet = readWalletJson();
      if (!wallet) {
        sendJSON(res, 400, { error: 'Wallet not set up yet. Generate or import a wallet first.' });
        return;
      }

      const instance = body.instance != null ? String(body.instance) : '0';
      const config = {
        instance,
        owner_address: wallet.owner_wallet.address,
        node_wallet_key: wallet.node_wallet.private_key_base64,
        root_contract_address: body.root_contract_address || DEFAULT_ROOT_CONTRACT,
        ton_config: body.ton_config || 'spec/mainnet-full-ton-config.json',
      };
      if (body.apiKey) {
        config.toncenter_api_key = body.apiKey;
      }

      writeClientConf(config);

      const httpPort = getHttpPort();
      sendJSON(res, 200, { ok: true, httpPort });
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to write config: ${err.message}` });
    }
  });

  /**
   * GET /api/setup/balance/:address
   * Get balance for a TON address.
   */
  router.get('/api/setup/balance/:address', async ({ res, params }) => {
    try {
      const bal = await getBalance(params.address);
      sendJSON(res, 200, {
        nano: bal.nano.toString(),
        ton: bal.ton,
      });
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to get balance: ${err.message}` });
    }
  });

  /**
   * POST /api/setup/transfer
   * Transfer TON from owner wallet to cocoon wallet.
   */
  router.post('/api/setup/transfer', async ({ res, body }) => {
    try {
      const { to, amount } = body;
      if (!to || !amount) {
        sendJSON(res, 400, { error: 'Missing "to" or "amount" in request body' });
        return;
      }
      const { seqno } = await transferFunds({ to, amount });
      sendJSON(res, 200, { seqno, status: 'sent' });
    } catch (err) {
      sendJSON(res, 500, { error: `Transfer failed: ${err.message}` });
    }
  });
}
