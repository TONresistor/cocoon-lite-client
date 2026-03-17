import { internal } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import { withRetry } from '../lib/ton.js';

/**
 * Open an owner wallet (WalletContractV4) from mnemonic, send a transfer.
 *
 * @param {TonClient} client
 * @param {string[]} mnemonic - 24-word array
 * @param {Address} destination
 * @param {bigint} amount - nanoTON
 * @param {Cell} [body] - optional message body (for contract opcodes)
 * @returns {Promise<{ seqno: number, contract, ownerWallet }>}
 */
export async function sendFromOwnerWallet(client, mnemonic, destination, amount, body) {
  const keys = await mnemonicToPrivateKey(mnemonic);
  const ownerWallet = WalletContractV4.create({ workchain: 0, publicKey: keys.publicKey });
  const contract = client.open(ownerWallet);

  const seqno = await withRetry(() => contract.getSeqno());
  await withRetry(() => contract.sendTransfer({
    seqno,
    secretKey: keys.secretKey,
    messages: [internal({
      to: destination,
      value: amount,
      bounce: !!body,
      ...(body ? { body } : {}),
    })],
  }));

  return { seqno, contract, ownerWallet };
}
