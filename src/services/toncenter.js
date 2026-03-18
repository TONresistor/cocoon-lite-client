import { getApiKey } from '../lib/config.js';
import { toncenterLogger } from '../lib/logger.js';

const BASE_URL = 'https://toncenter.com/api/v3';

/**
 * Query Toncenter API v3 actions endpoint.
 * @param {object} params
 * @param {string} params.account - TON address to filter by
 * @param {string[]} [params.actionTypes] - cocoon action types to filter
 * @param {number} [params.limit=20]
 * @param {string} [params.sort='desc']
 * @returns {Promise<object>} raw API response
 */
export async function queryActions({ account, actionTypes = [], limit = 20, sort = 'desc' }) {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}/actions`);
  url.searchParams.set('account', account);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', sort);
  if (apiKey) url.searchParams.set('api_key', apiKey);
  for (const t of actionTypes) {
    url.searchParams.append('action_type', t);
  }

  toncenterLogger.debug({ account, actionTypes, limit }, 'Querying Toncenter actions');
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const errMsg = `Toncenter API error: ${res.status}`;
    toncenterLogger.error({ err: errMsg, status: res.status }, 'Toncenter API error');
    throw new Error(errMsg);
  }
  return res.json();
}

// Cocoon action type groups
export const COCOON_CLIENT_ACTIONS = [
  'cocoon_client_top_up',
  'cocoon_client_increase_stake',
  'cocoon_client_withdraw',
  'cocoon_client_register',
  'cocoon_client_change_secret_hash',
  'cocoon_client_request_refund',
];

export const COCOON_PAYOUT_ACTIONS = [
  'cocoon_worker_payout',
  'cocoon_proxy_payout',
];

export const COCOON_PROXY_ACTIONS = [
  'cocoon_register_proxy',
  'cocoon_unregister_proxy',
  'cocoon_proxy_charge',
  'cocoon_grant_refund',
];

export const ALL_COCOON_ACTIONS = [
  ...COCOON_CLIENT_ACTIONS,
  ...COCOON_PAYOUT_ACTIONS,
  ...COCOON_PROXY_ACTIONS,
];

/**
 * Get recent transaction history for a cocoon node.
 * @param {string} account - node wallet or owner wallet address
 * @param {number} [limit=20]
 */
export async function getTransactionHistory(account, limit = 20) {
  const data = await queryActions({
    account,
    actionTypes: ALL_COCOON_ACTIONS,
    limit,
  });

  return (data.actions || []).map(action => ({
    type: action.type,
    success: action.success,
    timestamp: action.end_utime,
    details: action.details || {},
    traceId: action.trace_id,
  }));
}

/**
 * Get earnings (payouts received) for a node.
 * @param {string} account - node wallet address
 * @param {number} [limit=50]
 */
export async function getEarnings(account, limit = 50) {
  const data = await queryActions({
    account,
    actionTypes: COCOON_PAYOUT_ACTIONS,
    limit,
  });

  let totalNano = 0n;
  const payouts = (data.actions || []).map(action => {
    const amount = BigInt(action.details?.amount || '0');
    totalNano += amount;
    return {
      type: action.type,
      amount: amount.toString(),
      timestamp: action.end_utime,
    };
  });

  return { payouts, totalNano: totalNano.toString() };
}

/**
 * Check if a specific action type occurred recently for an account.
 * Useful for confirming on-chain stake after a transaction.
 * @param {string} account
 * @param {string} actionType
 * @param {number} afterTimestamp - unix timestamp, only return actions after this
 */
export async function checkRecentAction(account, actionType, afterTimestamp) {
  const data = await queryActions({
    account,
    actionTypes: [actionType],
    limit: 5,
    sort: 'desc',
  });

  const actions = data.actions || [];
  return actions.find(a => a.end_utime > afterTimestamp && a.success) || null;
}
