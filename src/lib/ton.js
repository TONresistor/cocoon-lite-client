import { TonClient } from '@ton/ton';
import { Address, fromNano } from '@ton/core';
import { readClientConf } from './config.js';

const TONCENTER_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';

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

/**
 * Create a TonClient with API key from config or env.
 */
export function createTonClient() {
  const apiKey = getApiKey();
  return new TonClient({
    endpoint: TONCENTER_ENDPOINT,
    ...(apiKey ? { apiKey } : {}),
  });
}

/**
 * Retry a function with exponential backoff on 429 errors.
 */
export async function withRetry(fn, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err?.response?.status === 429 || err?.message?.includes('429');
      if (!is429 || i === maxRetries - 1) throw err;
      const delay = (i + 1) * 2000; // 2s, 4s, 6s, 8s, 10s
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Get balance for a TON address.
 * @param {string} address - raw or friendly TON address
 * @returns {Promise<{ nano: bigint, ton: string }>}
 */
export async function getBalance(address) {
  const client = createTonClient();
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
