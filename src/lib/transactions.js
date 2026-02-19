import { beginCell, toNano, internal } from '@ton/core';
import { sign, keyPairFromSeed, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import { withRetry } from './ton.js';

export const SC_RESERVE = toNano('0.05');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Format a non-bigint nano value (number from HTTP stats) to TON string.
 */
export function formatTon(nanoNumber) {
  return (nanoNumber / 1_000_000_000).toFixed(4);
}

/**
 * Build and send an external message to CocoonWallet to transfer funds.
 * Mirrors CocoonWallet::send_pending_transactions() from the C++ source.
 * Returns { seqno }.
 */
export async function sendFromCocoonWallet(client, cocoonAddr, nodeSecretKey, destination, amount) {
  const keyPair = keyPairFromSeed(nodeSecretKey);

  const seqnoRes = await withRetry(() => client.runMethod(cocoonAddr, 'seqno'));
  const seqno = seqnoRes.stack.readNumber();

  const validUntil = Math.floor(Date.now() / 1000) + 3600;

  const internalMsg = beginCell()
    .storeUint(0x10, 6)
    .storeAddress(destination)
    .storeCoins(amount)
    .storeUint(0, 1 + 4 + 4 + 64 + 32)
    .storeBit(false)
    .storeBit(false)
    .endCell();

  const body = beginCell()
    .storeUint(0, 32)
    .storeUint(validUntil, 32)
    .storeUint(seqno, 32)
    .storeUint(0, 8)
    .storeRef(internalMsg)
    .endCell();

  const signature = sign(body.hash(), keyPair.secretKey);

  const signedMsg = beginCell()
    .storeBuffer(signature)
    .storeSlice(body.beginParse())
    .endCell();

  await withRetry(() => client.sendExternalMessage(
    { address: cocoonAddr },
    signedMsg,
  ));

  return { seqno };
}

/**
 * Open an owner wallet (WalletContractV4) from mnemonic, send a transfer, and
 * return { seqno, contract, client } so the caller can wait or inspect.
 */
export async function sendFromOwnerWallet(client, mnemonic, destination, amount) {
  const keys = await mnemonicToPrivateKey(mnemonic);
  const ownerWallet = WalletContractV4.create({ workchain: 0, publicKey: keys.publicKey });
  const contract = client.open(ownerWallet);

  const seqno = await withRetry(() => contract.getSeqno());
  await withRetry(() => contract.sendTransfer({
    seqno,
    secretKey: keys.secretKey,
    messages: [internal({ to: destination, value: amount, bounce: false })],
  }));

  return { seqno, contract, ownerWallet };
}

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
