/**
 * Wallet service — pure business logic for withdraw / cashout operations.
 * No HTTP request/response handling; that stays in the route layer.
 */

import { readWalletJson } from '../lib/config.js';
import { getBalance } from '../lib/ton.js';
import { sendFromCocoonWallet, sendFromOwnerWallet, SC_RESERVE } from '../lib/transactions.js';
import { getCachedTonClient } from '../api/ton-cache.js';
import { Address, toNano } from '@ton/core';

/**
 * Compute the available (withdrawable) balance for a wallet address.
 * Returns the nano amount after reserving SC_RESERVE, or 0n if the
 * balance is too low.
 *
 * @param {string} address — base64/raw TON address
 * @returns {Promise<bigint>}
 */
export async function getAvailableBalance(address) {
  const bal = await getBalance(address);
  return bal.nano > SC_RESERVE ? bal.nano - SC_RESERVE : 0n;
}

/**
 * Withdraw funds from the cocoon (node) wallet to the owner wallet.
 *
 * @param {object} opts
 * @param {string} [opts.amount] — TON amount string, or 'max' / undefined for maximum
 * @returns {Promise<{ seqno: number }>}
 * @throws {Error} with a user-facing message on validation failure
 */
export async function withdrawFunds({ amount } = {}) {
  const wallet = readWalletJson();
  if (!wallet) throw new Error('No wallet found');

  const cocoonAddr = wallet.node_wallet.address;
  if (!cocoonAddr) throw new Error('Cocoon wallet address not available');

  const client = getCachedTonClient();
  const cocoonAddress = Address.parse(cocoonAddr);
  const ownerAddress = Address.parse(wallet.owner_wallet.address);
  const nodeSecretKey = Buffer.from(wallet.node_wallet.private_key_base64, 'base64');

  let nanoAmount;
  if (amount === 'max' || !amount) {
    nanoAmount = await getAvailableBalance(cocoonAddr);
    if (nanoAmount <= 0n) {
      throw new Error('Insufficient balance (must keep reserve for fees)');
    }
  } else {
    nanoAmount = toNano(amount);
  }

  return sendFromCocoonWallet(client, cocoonAddress, nodeSecretKey, ownerAddress, nanoAmount);
}

/**
 * Cash out: send TON from the owner wallet to an external destination.
 *
 * @param {object} opts
 * @param {string} opts.amount — TON amount string or 'max'
 * @param {string} opts.destination — destination TON address
 * @returns {Promise<{ seqno: number }>}
 * @throws {Error} with a user-facing message on validation failure
 */
export async function cashoutFunds({ amount, destination }) {
  if (!amount || !destination) {
    throw new Error('Missing "amount" or "destination" in request body');
  }

  const wallet = readWalletJson();
  if (!wallet) throw new Error('No wallet found');

  const client = getCachedTonClient();
  const mnemonic = wallet.owner_wallet.seed_phrase.split(' ');
  const destAddress = Address.parse(destination);

  let nanoAmount;
  if (amount === 'max') {
    nanoAmount = await getAvailableBalance(wallet.owner_wallet.address);
    if (nanoAmount <= 0n) {
      throw new Error('Insufficient balance');
    }
  } else {
    nanoAmount = toNano(amount);
  }

  return sendFromOwnerWallet(client, mnemonic, destAddress, nanoAmount);
}
