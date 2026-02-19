import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { Address, toNano, fromNano } from '@ton/core';
import { WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { readWalletJson } from '../lib/config.js';
import { createTonClient, withRetry } from '../lib/ton.js';
import {
  printBanner, row, success, error, separator,
  DIM, CYAN, GREEN, YELLOW,
} from '../lib/ui.js';
import { sendFromOwnerWallet, waitForSeqnoChange, SC_RESERVE } from '../lib/transactions.js';

export async function cashoutCommand(amountArg, destination) {
  printBanner();
  console.log();

  const isMax = amountArg.toLowerCase() === 'max';
  if (!isMax && isNaN(parseFloat(amountArg))) {
    error(`Invalid amount: ${amountArg}. Use a number or "max".`);
    process.exit(1);
  }

  // 1. Validate destination
  let destAddr;
  try {
    destAddr = Address.parse(destination);
  } catch {
    error(`Invalid address: ${destination}`);
    process.exit(1);
  }

  // 2. Read wallet config
  const wallet = readWalletJson();
  if (!wallet) {
    error('No .wallet.json found. Run npx cocoon setup first.');
    process.exit(1);
  }

  const seedPhrase = wallet.owner_wallet?.seed_phrase;
  if (!seedPhrase) {
    error('No seed phrase in .wallet.json. Cannot sign transactions.');
    process.exit(1);
  }

  // 3. Open owner wallet (for balance check)
  const client = createTonClient();
  const mnemonic = seedPhrase.split(' ');
  const keys = await mnemonicToPrivateKey(mnemonic);
  const ownerWallet = WalletContractV4.create({ workchain: 0, publicKey: keys.publicKey });
  const contract = client.open(ownerWallet);

  const ownerAddr = ownerWallet.address.toString({ bounceable: false });
  let balance;
  try {
    balance = await withRetry(() => client.getBalance(ownerWallet.address));
  } catch (err) {
    error(`Failed to fetch balance: ${err.message}`);
    process.exit(1);
  }

  row('Owner wallet', CYAN(ownerAddr));
  row('Balance',      `${chalk.bold(fromNano(balance))} TON`);
  row('Destination',  CYAN(destAddr.toString({ bounceable: false })));
  console.log();

  // 4. Calculate amount
  let sendAmount;
  if (isMax) {
    sendAmount = balance - SC_RESERVE;
  } else {
    sendAmount = toNano(amountArg);
    if (sendAmount + SC_RESERVE > balance) {
      error(`Insufficient balance. Have ${fromNano(balance)} TON, need ${fromNano(sendAmount + SC_RESERVE)} TON (incl. gas).`);
      process.exit(1);
    }
  }

  if (sendAmount <= 0n) {
    console.log(YELLOW('  Owner wallet balance too low to send.\n'));
    return;
  }

  console.log(`  Will send ${GREEN.bold(fromNano(sendAmount))} TON`);
  console.log(DIM(`  Gas reserve: ${fromNano(SC_RESERVE)} TON\n`));

  // 5. Confirm
  const proceed = await confirm({
    message: `Send ${fromNano(sendAmount)} TON to ${destination}?`,
    default: false,
  });
  if (!proceed) {
    console.log(DIM('\n  Cashout cancelled.\n'));
    return;
  }

  // 6. Send
  console.log();
  try {
    const { seqno } = await sendFromOwnerWallet(client, mnemonic, destAddr, sendAmount);
    success('Transaction sent.');
    console.log(DIM('  Waiting for confirmation...\n'));

    const confirmed = await waitForSeqnoChange(
      () => withRetry(() => contract.getSeqno()),
      seqno,
    );
    if (confirmed) {
      const newBal = await withRetry(() => client.getBalance(ownerWallet.address));
      success(`Confirmed! Owner wallet balance: ${fromNano(newBal)} TON`);
      console.log();
      separator();
      console.log(DIM(`  ${fromNano(sendAmount)} TON sent to ${destination}\n`));
      return;
    }
    console.log(YELLOW('  Timeout waiting for confirmation. Check on tonviewer.com\n'));

  } catch (err) {
    error(`Failed to send: ${err.message}`);
    console.log();
    process.exit(1);
  }
}
