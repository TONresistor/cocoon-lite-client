import { beginCell } from '@ton/core';
import { sign, keyPairFromSeed } from '@ton/crypto';
import { withRetry } from '../lib/ton.js';

/**
 * Build and send an external message to CocoonWallet to transfer funds.
 * Mirrors CocoonWallet::send_pending_transactions() from the C++ source.
 *
 * @param {TonClient} client
 * @param {Address} cocoonAddr - parsed Address of cocoon wallet
 * @param {Buffer} nodeSecretKey - 32-byte Ed25519 secret key
 * @param {Address} destination
 * @param {bigint} amount - nanoTON
 * @param {Cell} [body] - optional message body (for contract opcodes)
 * @returns {Promise<{ seqno: number }>}
 */
export async function sendFromCocoonWallet(client, cocoonAddr, nodeSecretKey, destination, amount, body) {
  const keyPair = keyPairFromSeed(nodeSecretKey);

  const seqnoRes = await withRetry(() => client.runMethod(cocoonAddr, 'seqno'));
  const seqno = seqnoRes.stack.readNumber();

  const validUntil = Math.floor(Date.now() / 1000) + 3600;

  const internalMsg = beginCell()
    .storeUint(0x10, 6)
    .storeAddress(destination)
    .storeCoins(amount)
    .storeUint(0, 1 + 4 + 4 + 64 + 32)
    .storeBit(!!body)   // body flag
    .storeBit(false);

  if (body) internalMsg.storeRef(body);

  const internalCell = internalMsg.endCell();

  const msgBody = beginCell()
    .storeUint(0, 32)
    .storeUint(validUntil, 32)
    .storeUint(seqno, 32)
    .storeUint(0, 8)
    .storeRef(internalCell)
    .endCell();

  const signature = sign(msgBody.hash(), keyPair.secretKey);

  const signedMsg = beginCell()
    .storeBuffer(signature)
    .storeSlice(msgBody.beginParse())
    .endCell();

  await withRetry(() => client.sendExternalMessage(
    { address: cocoonAddr },
    signedMsg,
  ));

  return { seqno };
}
