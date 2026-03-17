import { sendJSON } from '../server.js';
import { readWalletJson } from '../../lib/config.js';
import { getTransactionHistory, getEarnings, checkRecentAction } from '../../services/toncenter.js';

export function register(router) {
  /**
   * GET /api/toncenter/history
   * Returns recent cocoon on-chain actions for the node.
   */
  router.get('/api/toncenter/history', async ({ res, query }) => {
    try {
      const wallet = readWalletJson();
      if (!wallet) {
        sendJSON(res, 400, { error: 'No wallet found' });
        return;
      }
      const account = query?.account || wallet.node_wallet?.address;
      if (!account) {
        sendJSON(res, 400, { error: 'No account address available' });
        return;
      }
      const limit = parseInt(query?.limit || '20', 10);
      const history = await getTransactionHistory(account, limit);
      sendJSON(res, 200, { actions: history });
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to fetch history: ${err.message}` });
    }
  });

  /**
   * GET /api/toncenter/earnings
   * Returns payout history and total earnings for the node.
   */
  router.get('/api/toncenter/earnings', async ({ res }) => {
    try {
      const wallet = readWalletJson();
      if (!wallet) {
        sendJSON(res, 400, { error: 'No wallet found' });
        return;
      }
      const account = wallet.node_wallet?.address;
      if (!account) {
        sendJSON(res, 400, { error: 'No node wallet address' });
        return;
      }
      const earnings = await getEarnings(account);
      sendJSON(res, 200, earnings);
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to fetch earnings: ${err.message}` });
    }
  });

  /**
   * GET /api/toncenter/confirm?type=cocoon_client_top_up&after=1234567890
   * Check if a specific action was confirmed on-chain after a timestamp.
   */
  router.get('/api/toncenter/confirm', async ({ res, query }) => {
    try {
      const wallet = readWalletJson();
      if (!wallet) {
        sendJSON(res, 400, { error: 'No wallet found' });
        return;
      }
      const account = wallet.node_wallet?.address;
      const actionType = query?.type;
      const after = parseInt(query?.after || '0', 10);

      if (!account || !actionType) {
        sendJSON(res, 400, { error: 'Missing account or action type' });
        return;
      }

      const action = await checkRecentAction(account, actionType, after);
      sendJSON(res, 200, { confirmed: !!action, action });
    } catch (err) {
      sendJSON(res, 500, { error: `Failed to check confirmation: ${err.message}` });
    }
  });
}
