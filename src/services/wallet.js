/**
 * Wallet service — pure business logic for withdraw / stake / cashout / transfer.
 * No HTTP request/response handling; that stays in the route layer.
 */

import { readWalletJson } from '../lib/config.js';
import { getCachedTonClient, getBalance } from '../lib/ton.js';
import { sendFromCocoonWallet, sendFromOwnerWallet } from '../contracts/index.js';
import { SC_RESERVE, OWNER_GAS_RESERVE, MIN_STAKE } from '../lib/constants.js';
import { Address, toNano, fromNano } from '@ton/core';
import { walletLogger } from '../lib/logger.js';

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

  walletLogger.info({ op: 'withdraw', amount: fromNano(nanoAmount) }, 'Withdrawing from node wallet');
  return sendFromCocoonWallet(client, cocoonAddress, nodeSecretKey, ownerAddress, nanoAmount);
}

/**
 * Stake: send TON from the owner wallet to the cocoon (node) wallet.
 *
 * @param {object} opts
 * @param {string} [opts.amount] — TON amount string, or 'max' for maximum
 * @returns {Promise<{ seqno: number }>}
 * @throws {Error} with a user-facing message on validation failure
 */
export async function stakeFunds({ amount } = {}) {
  const wallet = readWalletJson();
  if (!wallet) throw new Error('No wallet found');

  const cocoonAddr = wallet.node_wallet.address;
  if (!cocoonAddr) throw new Error('Cocoon wallet address not available');

  const ownerAddr = wallet.owner_wallet.address;
  const mnemonic = wallet.owner_wallet.seed_phrase;
  if (!mnemonic) throw new Error('Owner wallet seed phrase not available');

  const client = getCachedTonClient();
  const destAddress = Address.parse(cocoonAddr);

  const ownerBal = await getBalance(ownerAddr);
  let nanoAmount;
  if (amount === 'max') {
    nanoAmount = ownerBal.nano > OWNER_GAS_RESERVE ? ownerBal.nano - OWNER_GAS_RESERVE : 0n;
    if (nanoAmount <= 0n) {
      throw new Error('Insufficient balance');
    }
  } else if (!amount) {
    throw new Error('Amount is required');
  } else {
    nanoAmount = toNano(amount);
    if (nanoAmount < MIN_STAKE) {
      throw new Error(`Minimum stake is 16 TON (got ${fromNano(nanoAmount)})`);
    }
  }

  if (nanoAmount + OWNER_GAS_RESERVE > ownerBal.nano) {
    throw new Error(`Insufficient balance. Need ${fromNano(nanoAmount + OWNER_GAS_RESERVE)} TON (incl. 0.5 gas reserve), have ${fromNano(ownerBal.nano)} TON`);
  }

  walletLogger.info({ op: 'stake', amount: fromNano(nanoAmount) }, 'Staking to node wallet');
  return sendFromOwnerWallet(client, mnemonic.split(' '), destAddress, nanoAmount);
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

  walletLogger.info({ op: 'cashout', amount: fromNano(nanoAmount), destination }, 'Cashing out');
  return sendFromOwnerWallet(client, mnemonic, destAddress, nanoAmount);
}

/**
 * Transfer all available funds from cocoon wallet to owner wallet.
 * Consolidates the "unstake step 3" pattern used in routes and commands.
 * @returns {Promise<{ seqno: number } | null>} null if balance too low
 */
export async function transferToOwner() {
  const wallet = readWalletJson();
  if (!wallet) throw new Error('No wallet found');

  const cocoonAddr = wallet.node_wallet.address;
  if (!cocoonAddr) throw new Error('Cocoon wallet address not available');

  const client = getCachedTonClient();
  const cocoonAddress = Address.parse(cocoonAddr);
  const ownerAddress = Address.parse(wallet.owner_wallet.address);
  const nodeSecretKey = Buffer.from(wallet.node_wallet.private_key_base64, 'base64');

  const nanoAmount = await getAvailableBalance(cocoonAddr);
  if (nanoAmount <= 0n) return null;

  walletLogger.info({ op: 'transferToOwner' }, 'Transferring node → owner');
  return sendFromCocoonWallet(client, cocoonAddress, nodeSecretKey, ownerAddress, nanoAmount);
}

/**
 * Transfer TON from owner wallet to any destination.
 * Used by setup flow and generic transfers.
 * @param {object} opts
 * @param {string} opts.to - destination address
 * @param {string} opts.amount - TON amount string
 * @returns {Promise<{ seqno: number }>}
 */
export async function transferFunds({ to, amount }) {
  if (!to || !amount) throw new Error('Missing "to" or "amount"');

  const wallet = readWalletJson();
  if (!wallet) throw new Error('No wallet found');

  const mnemonic = wallet.owner_wallet.seed_phrase;
  if (!mnemonic) throw new Error('Owner wallet seed phrase not available');

  const client = getCachedTonClient();
  const destination = Address.parse(to);

  let nanoAmount;
  if (amount === 'max') {
    const ownerBal = await getBalance(wallet.owner_wallet.address);
    nanoAmount = ownerBal.nano > OWNER_GAS_RESERVE ? ownerBal.nano - OWNER_GAS_RESERVE : 0n;
    if (nanoAmount <= 0n) throw new Error('Insufficient balance');
  } else {
    nanoAmount = toNano(amount);
  }

  walletLogger.info({ op: 'transfer', to, amount }, 'Transferring funds');
  return sendFromOwnerWallet(client, mnemonic.split(' '), destination, nanoAmount);
}
