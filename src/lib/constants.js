import { toNano } from '@ton/core';

export const SC_RESERVE = toNano('0.05');
export const OWNER_GAS_RESERVE = toNano('0.5');
export const MIN_STAKE = toNano('16');

/**
 * Format a non-bigint nano value (number from HTTP stats) to TON string.
 */
export function formatTon(nanoNumber) {
  return (nanoNumber / 1_000_000_000).toFixed(4);
}
