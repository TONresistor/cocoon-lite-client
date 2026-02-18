import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { Address, toNano, fromNano } from '@ton/core';
import { readWalletJson } from '../lib/config.js';
import { createTonClient, withRetry } from '../lib/ton.js';
import {
  printBanner, row, success, error, separator,
  DIM, CYAN, GREEN, YELLOW,
} from '../lib/ui.js';
import { sendFromCocoonWallet, waitForSeqnoChange, SC_RESERVE } from '../lib/transactions.js';

export async function withdrawCommand(amountArg) {
  printBanner();
  console.log();

  const isMax = !amountArg || amountArg.toLowerCase() === 'max';
  if (!isMax && isNaN(parseFloat(amountArg))) {
    error(`Invalid amount: ${amountArg}. Use a number or "max".`);
    process.exit(1);
  }

  // 1. Read wallet config
  const wallet = readWalletJson();
  if (!wallet) {
    error('No .wallet.json found. Run npx cocoon setup first.');
    process.exit(1);
  }

  const cocoonAddrStr = wallet.node_wallet?.address;
  const ownerAddrStr = wallet.owner_wallet?.address;
  const nodeKeyBase64 = wallet.node_wallet?.private_key_base64;

  if (!cocoonAddrStr || !ownerAddrStr || !nodeKeyBase64) {
    error('Incomplete wallet config. Missing node_wallet address or key.');
    process.exit(1);
  }

  const client = createTonClient();
  const cocoonAddr = Address.parse(cocoonAddrStr);
  const ownerAddr = Address.parse(ownerAddrStr);

  // 2. Check balances
  let cocoonBalance;
  try {
    cocoonBalance = await withRetry(() => client.getBalance(cocoonAddr));
  } catch (err) {
    error(`Failed to fetch cocoon wallet balance: ${err.message}`);
    process.exit(1);
  }

  row('Cocoon wallet', CYAN(cocoonAddrStr));
  row('Owner wallet',  CYAN(ownerAddrStr));
  row('Balance',       `${chalk.bold(fromNano(cocoonBalance))} TON`);
  console.log();

  let sendAmount;
  if (isMax) {
    sendAmount = cocoonBalance - SC_RESERVE;
  } else {
    sendAmount = toNano(amountArg);
    if (sendAmount + SC_RESERVE > cocoonBalance) {
      error(`Insufficient balance. Have ${fromNano(cocoonBalance)} TON, need ${fromNano(sendAmount + SC_RESERVE)} TON (incl. reserve).`);
      process.exit(1);
    }
  }

  if (sendAmount <= 0n) {
    console.log(YELLOW('  Cocoon wallet balance too low to withdraw.\n'));
    return;
  }

  console.log(`  Will send ${GREEN.bold(fromNano(sendAmount))} TON → owner wallet`);
  console.log(DIM(`  Remaining on cocoon: ~${fromNano(cocoonBalance - sendAmount)} TON\n`));

  // 3. Confirm
  const proceed = await confirm({
    message: `Withdraw ${fromNano(sendAmount)} TON to owner wallet?`,
    default: false,
  });
  if (!proceed) {
    console.log(DIM('\n  Withdraw cancelled.\n'));
    return;
  }

  // 4. Send
  console.log();
  try {
    const nodeSecret = Buffer.from(nodeKeyBase64, 'base64');
    const { seqno } = await sendFromCocoonWallet(
      client, cocoonAddr, nodeSecret, ownerAddr, sendAmount,
    );
    success(`Transaction sent (seqno: ${seqno}).`);
    console.log(DIM('  Waiting for confirmation...\n'));

    // Poll for seqno change
    const confirmed = await waitForSeqnoChange(
      () => withRetry(() => client.runMethod(cocoonAddr, 'seqno')).then(r => r.stack.readNumber()),
      seqno,
    );
    if (confirmed) {
      const newBal = await withRetry(() => client.getBalance(cocoonAddr));
      success(`Confirmed! Cocoon wallet balance: ${fromNano(newBal)} TON`);
      console.log();
      separator();
      console.log(DIM('  Funds sent to owner wallet. Check with npx cocoon status.\n'));
      return;
    }
    console.log(YELLOW('  Timeout waiting for confirmation. Check on tonviewer.com\n'));

  } catch (err) {
    error(`Failed to send: ${err.message}`);
    console.log();
    process.exit(1);
  }
}
