import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTon } from '../lib/transactions.js';

describe('formatTon', () => {
  it('formats 1 TON (1e9 nano) correctly', () => {
    assert.equal(formatTon(1_000_000_000), '1.0000');
  });

  it('formats 0.05 TON (50e6 nano) correctly', () => {
    assert.equal(formatTon(50_000_000), '0.0500');
  });

  it('formats 0 nano correctly', () => {
    assert.equal(formatTon(0), '0.0000');
  });

  it('formats 10 TON correctly', () => {
    assert.equal(formatTon(10_000_000_000), '10.0000');
  });

  it('formats fractional nano amounts', () => {
    // 1.5 TON = 1_500_000_000 nano
    assert.equal(formatTon(1_500_000_000), '1.5000');
  });

  // Known bug: floating-point precision loss with JS number division.
  // formatTon uses (nanoNumber / 1_000_000_000).toFixed(4) which can lose
  // precision for large values since JS numbers have 53-bit mantissa
  // (max safe integer = 2^53 - 1 = 9_007_199_254_740_991).
  it('exposes floating-point precision issue with large nano values', () => {
    // 9999.9999 TON = 9_999_999_900_000 nano
    // This is within safe integer range, so should still be accurate
    const result = formatTon(9_999_999_900_000);
    assert.equal(result, '9999.9999');
  });

  it('may lose precision beyond Number.MAX_SAFE_INTEGER', () => {
    // Values above 2^53 - 1 (9_007_199_254_740_991) cannot be represented
    // exactly as JS numbers. This test documents the limitation.
    // 9_007_199_254 TON in nano = 9_007_199_254_000_000_000
    // This exceeds MAX_SAFE_INTEGER, so the input itself is already imprecise.
    const hugeNano = 9_007_199_255_000_000_000; // > MAX_SAFE_INTEGER
    assert.ok(
      !Number.isSafeInteger(hugeNano),
      'value exceeds safe integer range — formatTon will silently lose precision'
    );
  });
});
