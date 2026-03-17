import { TonClient } from '@ton/ton';
import { Address, fromNano } from '@ton/core';
import { readClientConf } from './config.js';

const DEFAULT_TONCENTER_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Private helpers ─────────────────────────────────────────

/**
 * Get the Toncenter endpoint from client.conf or fall back to mainnet default.
 */
function getEndpoint() {
  try {
    const conf = readClientConf();
    if (conf?.toncenter_endpoint) return conf.toncenter_endpoint;
  } catch {}
  return DEFAULT_TONCENTER_ENDPOINT;
}

/**
 * Get API key from: env var > client.conf > null
 */
function getApiKey() {
  if (process.env.TONCENTER_API_KEY) return process.env.TONCENTER_API_KEY;
  try {
    const conf = readClientConf();
    if (conf?.toncenter_api_key) return conf.toncenter_api_key;
  } catch {}
  return null;
}

// ── TonClient ───────────────────────────────────────────────

let _cachedClient = null;

/**
 * Create a TonClient with API key from config or env.
 */
export function createTonClient() {
  const apiKey = getApiKey();
  return new TonClient({
    endpoint: getEndpoint(),
    ...(apiKey ? { apiKey } : {}),
  });
}

export function getCachedTonClient() {
  if (!_cachedClient) _cachedClient = createTonClient();
  return _cachedClient;
}

export function clearTonClientCache() {
  _cachedClient = null;
}

// ── Retry ───────────────────────────────────────────────────

/**
 * Retry a function with exponential backoff on 429 errors.
 */
export async function withRetry(fn, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.response?.status === 429 || err?.status === 429 || err?.message?.includes('429');
      if (!is429 || i === maxRetries - 1) throw err;
      const delay = (i + 1) * 2000; // 2s, 4s, 6s, 8s, 10s
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Balance ─────────────────────────────────────────────────

/**
 * Get balance for a TON address.
 * @param {string} address - raw or friendly TON address
 * @param {TonClient} [client] - optional TonClient instance; uses cached singleton if omitted
 * @returns {Promise<{ nano: bigint, ton: string }>}
 */
export async function getBalance(address, client) {
  if (!client) client = getCachedTonClient();
  const addr = Address.parse(address);
  const nano = await withRetry(() => client.getBalance(addr));
  return { nano, ton: fromNano(nano) };
}

/**
 * Poll until balance reaches a minimum threshold.
 * @param {string} address
 * @param {bigint} minNano - minimum balance in nanoTON
 * @param {object} opts
 * @param {(bal: {nano: bigint, ton: string}) => void} [opts.onUpdate]
 * @param {number} [opts.timeoutMs=600000] - 10 min default
 * @param {number} [opts.intervalMs=5000]
 * @returns {Promise<{ nano: bigint, ton: string } | null>} null on timeout
 */
export async function waitForBalance(address, minNano, opts = {}) {
  const { onUpdate, timeoutMs = 600_000, intervalMs = 5_000 } = opts;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const bal = await getBalance(address);
      if (onUpdate) onUpdate(bal);
      if (bal.nano >= minNano) return bal;
    } catch {
      // Network errors are transient — just retry
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

// ── Seqno ───────────────────────────────────────────────────

/**
 * Poll for a seqno change on a contract. Works for both cocoon wallet
 * (client.runMethod) and owner wallet (contract.getSeqno) via getSeqnoFn.
 *
 * @param {Function} getSeqnoFn - async function returning the current seqno number
 * @param {number} oldSeqno - the seqno before the transaction was sent
 * @param {object} [opts] - { iterations: 20, intervalMs: 3000 }
 * @returns {Promise<boolean>} true if seqno changed, false on timeout
 */
export async function waitForSeqnoChange(getSeqnoFn, oldSeqno, opts = {}) {
  const { iterations = 20, intervalMs = 3000 } = opts;
  for (let i = 0; i < iterations; i++) {
    await sleep(intervalMs);
    try {
      const current = await getSeqnoFn();
      if (current > oldSeqno) return true;
    } catch {
      // transient error, retry
    }
  }
  return false;
}
