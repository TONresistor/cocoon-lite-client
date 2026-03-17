import { beginCell } from '@ton/core';

// ── Client → Contract Messages ──────────────────────────────

export const OP_CLIENT_REGISTER           = 0xC45F9F3B;
export const OP_CLIENT_TOP_UP             = 0xF172E6C2;
export const OP_CLIENT_INCREASE_STAKE     = 0x6A1F6A60;
export const OP_CLIENT_WITHDRAW           = 0xDA068E78;
export const OP_CLIENT_REQUEST_REFUND     = 0xFAFA6CC1;
export const OP_CLIENT_CHANGE_SECRET_HASH = 0xA9357034;
export const OP_CLIENT_CHANGE_SECRET_AND_TOP_UP = 0x8473B408;

// ── Proxy Messages ──────────────────────────────────────────

export const OP_REGISTER_PROXY            = 0x927C7CB5;
export const OP_UNREGISTER_PROXY          = 0x6D49EAF2;
export const OP_PROXY_INCREASE_STAKE      = 0x9713F187;
export const OP_PROXY_CLOSE               = 0xB51D5A01;

// ── Payout / Charge Messages ────────────────────────────────

export const OP_CHARGE_PAYLOAD            = 0xBB63FF93;
export const OP_PAYOUT_PAYLOAD            = 0xA040AD28;
export const OP_LAST_PAYOUT_PAYLOAD       = 0xF5F26A36;
export const OP_GRANT_REFUND_PAYLOAD      = 0xEFD711E1;

// ── Return ──────────────────────────────────────────────────

export const OP_RETURN_EXCESSES           = 0x2565934C;
export const OP_PAYOUT                    = 0xC59A7CD3;

// ── Body Builders ───────────────────────────────────────────

function nextQueryId() {
  return BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
}

/**
 * Register a client on the root contract.
 * @param {bigint} nonce
 * @param {Address} sendExcessesTo
 */
export function buildClientRegister(nonce, sendExcessesTo) {
  return beginCell()
    .storeUint(OP_CLIENT_REGISTER, 32)
    .storeUint(nextQueryId(), 64)
    .storeUint(nonce, 64)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Top up a client contract.
 * @param {bigint} topUpAmount - in nanoTON
 * @param {Address} sendExcessesTo
 */
export function buildClientTopUp(topUpAmount, sendExcessesTo) {
  return beginCell()
    .storeUint(OP_CLIENT_TOP_UP, 32)
    .storeUint(nextQueryId(), 64)
    .storeCoins(topUpAmount)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Increase client stake.
 * @param {bigint} newStake - in nanoTON
 * @param {Address} sendExcessesTo
 */
export function buildClientIncreaseStake(newStake, sendExcessesTo) {
  return beginCell()
    .storeUint(OP_CLIENT_INCREASE_STAKE, 32)
    .storeUint(nextQueryId(), 64)
    .storeCoins(newStake)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Withdraw from client contract.
 * @param {Address} sendExcessesTo
 */
export function buildClientWithdraw(sendExcessesTo) {
  return beginCell()
    .storeUint(OP_CLIENT_WITHDRAW, 32)
    .storeUint(nextQueryId(), 64)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Request refund from client contract.
 * @param {Address} sendExcessesTo
 */
export function buildClientRequestRefund(sendExcessesTo) {
  return beginCell()
    .storeUint(OP_CLIENT_REQUEST_REFUND, 32)
    .storeUint(nextQueryId(), 64)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Change the client's secret hash.
 * @param {bigint} newSecretHash - uint256
 * @param {Address} sendExcessesTo
 */
export function buildClientChangeSecretHash(newSecretHash, sendExcessesTo) {
  return beginCell()
    .storeUint(OP_CLIENT_CHANGE_SECRET_HASH, 32)
    .storeUint(nextQueryId(), 64)
    .storeUint(newSecretHash, 256)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Change secret hash AND top up in one message.
 * @param {bigint} topUpAmount
 * @param {bigint} newSecretHash - uint256
 * @param {Address} sendExcessesTo
 */
export function buildClientChangeSecretAndTopUp(topUpAmount, newSecretHash, sendExcessesTo) {
  return beginCell()
    .storeUint(OP_CLIENT_CHANGE_SECRET_AND_TOP_UP, 32)
    .storeUint(nextQueryId(), 64)
    .storeCoins(topUpAmount)
    .storeUint(newSecretHash, 256)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Register a proxy on the root contract.
 * @param {Cell} proxyInfo - remaining bits and refs with proxy IP/port info
 */
export function buildRegisterProxy(proxyInfo) {
  return beginCell()
    .storeUint(OP_REGISTER_PROXY, 32)
    .storeUint(nextQueryId(), 64)
    .storeSlice(proxyInfo.beginParse())
    .endCell();
}

/**
 * Unregister a proxy.
 * @param {number} seqno
 */
export function buildUnregisterProxy(seqno) {
  return beginCell()
    .storeUint(OP_UNREGISTER_PROXY, 32)
    .storeUint(nextQueryId(), 64)
    .storeUint(seqno, 32)
    .endCell();
}

/**
 * Increase proxy stake.
 * @param {bigint} grams
 * @param {Address} sendExcessesTo
 */
export function buildProxyIncreaseStake(grams, sendExcessesTo) {
  return beginCell()
    .storeUint(OP_PROXY_INCREASE_STAKE, 32)
    .storeUint(nextQueryId(), 64)
    .storeCoins(grams)
    .storeAddress(sendExcessesTo)
    .endCell();
}

/**
 * Close a proxy contract.
 * @param {Address} sendExcessesTo
 */
export function buildProxyClose(sendExcessesTo) {
  return beginCell()
    .storeUint(OP_PROXY_CLOSE, 32)
    .storeUint(nextQueryId(), 64)
    .storeAddress(sendExcessesTo)
    .endCell();
}
