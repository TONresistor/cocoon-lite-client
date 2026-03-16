import { createTonClient } from '../lib/ton.js';

let cached = null;

export function getCachedTonClient() {
  if (!cached) cached = createTonClient();
  return cached;
}

export function clearTonClientCache() {
  cached = null;
}
