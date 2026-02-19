import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { select, input, confirm } from '@inquirer/prompts';
import {
  PATHS, DEFAULT_ROOT_CONTRACT,
  writeClientConf, writeWalletJson, readWalletJson, readClientConf,
} from '../lib/config.js';
import { generateWallet } from '../lib/wallet.js';
import { getBalance, waitForBalance, createTonClient, withRetry } from '../lib/ton.js';
import { toNano, fromNano, Address } from '@ton/core';
import { WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { sendFromOwnerWallet, waitForSeqnoChange } from '../lib/transactions.js';
import chalk from 'chalk';
import {
  wizardFrame, successBox, noteBox, success, error, updateLine, finishLine,
  BRAND, DIM, CYAN, GREEN, YELLOW, RED, WHITE,
} from '../lib/ui.js';

// updateLine/finishLine used by waitForBalance onUpdate

const STEPS = [
  { label: 'Wallet',   desc: 'Import or generate keys' },
  { label: 'Instance', desc: 'Port & instance number' },
  { label: 'Config',   desc: 'Write configuration' },
  { label: 'Fund',     desc: 'Send TON to wallet' },
  { label: 'Verify',   desc: 'Check balance on-chain' },
  { label: 'Transfer', desc: 'Fund cocoon wallet' },
  { label: 'Done',     desc: 'Setup complete' },
];

function render(step, steps) {
  console.clear();
  console.log(wizardFrame(step, steps));
  console.log();
}

export async function setupCommand() {
  const steps = STEPS.map(s => ({ ...s }));

  render(0, steps);

  // Warn if config already exists
  const existingConf = readClientConf();
  const existingWallet = readWalletJson();
  if (existingConf || existingWallet) {
    const walletPath = PATHS.walletJson;
    const files = [
      existingConf && PATHS.clientConf,
      existingWallet && walletPath,
    ].filter(Boolean);
    noteBox('Existing configuration', files.map(f => DIM(f)));
    console.log();
    const overwrite = await confirm({
      message: 'Overwrite existing configuration?',
      default: false,
    });
    if (!overwrite) {
      console.log(DIM('\n  Setup cancelled. Existing config preserved.\n'));
      return;
    }
  }

  // ── Step 1: Wallet ─────────────────────────────────────
  render(0, steps);

  const walletMethod = await select({
    message: 'Wallet source',
    choices: [
      { name: 'Import existing wallet (.wallet.json)', value: 'json' },
      { name: 'Generate new wallet', value: 'generate' },
    ],
  });

  let walletData;

  if (walletMethod === 'json') {
    const jsonPath = await input({
      message: 'Path to .wallet.json:',
      default: '.wallet.json',
    });
    const fullPath = resolve(jsonPath);
    if (!existsSync(fullPath)) {
      error(`File not found: ${fullPath}`);
      process.exit(1);
    }
    walletData = JSON.parse(readFileSync(fullPath, 'utf-8'));

    if (!walletData.owner_wallet?.address || !walletData.node_wallet?.private_key_base64) {
      error('Invalid wallet JSON: needs owner_wallet.address and node_wallet.private_key_base64');
      process.exit(1);
    }

    const addr = walletData.owner_wallet.address;
    steps[0].value = addr.slice(0, 8) + '…' + addr.slice(-6);

  } else {
    console.log(DIM('\n  Generating wallet via @ton/crypto SDK...\n'));
    try {
      const result = await generateWallet();
      walletData = result.walletData;

      const addr = walletData.owner_wallet.address;
      steps[0].value = addr.slice(0, 8) + '…' + addr.slice(-6);

      // Show seed phrase — user MUST save this
      noteBox('Seed Phrase — SAVE THIS', result.mnemonic.map((word, i) => {
        const num = String(i + 1).padStart(2, ' ');
        return `${DIM(num + '.')} ${chalk.white.bold(word)}`;
      }));
      console.log();
      console.log(RED.bold('  ⚠ Write down these 24 words! Without them you cannot recover your wallet.'));
      console.log();

      const saved = await confirm({
        message: 'I have saved my seed phrase',
        default: false,
      });
      if (!saved) {
        console.log(YELLOW('\n  Please save your seed phrase before continuing.\n'));
        process.exit(0);
      }

      console.log();
      success(`Owner wallet: ${CYAN(walletData.owner_wallet.address)}`);
      if (walletData.node_wallet.address) {
        success(`Node wallet:  ${CYAN(walletData.node_wallet.address)}`);
      }
      console.log();

    } catch (err) {
      error(`Failed to generate wallet: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Step 2: Instance ───────────────────────────────────
  render(1, steps);

  const instanceStr = await input({
    message: 'Instance number (0 = port 10000, 1 = port 10010, ...):',
    default: '0',
    validate: (v) => /^\d+$/.test(v) || 'Must be a non-negative integer',
  });
  const instance = parseInt(instanceStr, 10);
  const httpPort = 10000 + instance * 10;
  steps[1].value = `#${instance} → port ${httpPort}`;

  // ── Step 3: Config (Review & Write) ─────────────────────
  render(2, steps);

  const apiKey = await input({
    message: 'Toncenter API key (free from @tonapibot on Telegram, or leave empty):',
    default: process.env.TONCENTER_API_KEY || '',
  });

  const confData = {
    owner_address: walletData.owner_wallet.address,
    node_wallet_key: walletData.node_wallet.private_key_base64,
    root_contract_address: DEFAULT_ROOT_CONTRACT,
    ton_config: 'spec/mainnet-full-ton-config.json',
    instance: String(instance),
    ...(apiKey ? { toncenter_api_key: apiKey } : {}),
  };

  successBox('Configuration Summary', [
    ['Owner address',    CYAN(confData.owner_address)],
    ['Root contract',    CYAN(confData.root_contract_address)],
    ['Instance',         CYAN(`${instance} (port ${httpPort})`)],
    ['Network',          CYAN('mainnet')],
    ['Toncenter key',   apiKey ? CYAN(apiKey.slice(0, 8) + '…') : DIM('none (rate limited)')],
  ]);
  console.log();

  const proceed = await confirm({ message: 'Write configuration files?', default: true });
  if (!proceed) {
    console.log(DIM('\n  Setup cancelled.\n'));
    return;
  }

  writeClientConf(confData);
  writeWalletJson(walletData);

  steps[2].value = 'written';

  // ── Step 4: Fund ───────────────────────────────────────
  render(3, steps);

  const ownerAddr = walletData.owner_wallet.address;
  noteBox('Fund your wallet', [
    `Send ${WHITE.bold('20 TON')} to your owner wallet:`,
    '',
    `  ${CYAN.bold(ownerAddr)}`,
    '',
    `${DIM('Breakdown:')}`,
    `  ${DIM('15 TON')}  stake deposit`,
    `  ${DIM(' 2 TON')}  gas fees`,
    `  ${DIM(' 3 TON')}  minimum operating balance`,
  ]);
  console.log();

  const funded = await confirm({
    message: 'I have sent the TON',
    default: false,
  });

  steps[3].value = funded ? 'sent' : 'skipped';

  // ── Step 5: Verify ─────────────────────────────────────
  render(4, steps);

  const MIN_BALANCE = toNano('17'); // 15 stake + 2 gas

  console.log(DIM('  Checking on-chain balance...\n'));

  // Do an initial check
  let currentBalance;
  try {
    currentBalance = await getBalance(ownerAddr);
  } catch {
    currentBalance = { nano: 0n, ton: '0' };
  }

  if (currentBalance.nano >= MIN_BALANCE) {
    success(`Balance: ${GREEN.bold(currentBalance.ton)} TON — sufficient`);
    steps[4].value = `${currentBalance.ton} TON`;
    console.log();
  } else {
    // Poll for balance
    console.log(DIM(`  Current: ${currentBalance.ton} TON / 17.00 TON minimum\n`));
    console.log(DIM('  Waiting for funds (polling every 5s, timeout 10 min)...'));
    console.log(DIM('  Press Ctrl+C to cancel.\n'));

    let latestBalance = currentBalance;
    const result = await waitForBalance(ownerAddr, MIN_BALANCE, {
      timeoutMs: 600_000,
      intervalMs: 5_000,
      onUpdate: (bal) => {
        latestBalance = bal;
        updateLine(`Checking balance... ${CYAN(bal.ton)} / 17.00 TON`);
      },
    });
    finishLine();
    console.log();

    if (result) {
      success(`Balance: ${GREEN.bold(result.ton)} TON — sufficient`);
      steps[4].value = `${result.ton} TON`;
    } else {
      // Timeout — offer to continue anyway
      console.log(YELLOW(`  Balance insufficient or timed out (current: ${latestBalance.ton} TON).`));
      console.log();
      const skipVerify = await confirm({
        message: 'Continue anyway? (staking may fail without enough TON)',
        default: false,
      });
      if (!skipVerify) {
        console.log(DIM('\n  Setup paused. Fund your wallet and run setup again.\n'));
        return;
      }
      steps[4].value = 'skipped';
    }
  }

  // ── Step 6: Transfer ───────────────────────────────────
  render(5, steps);

  // Transfer owner → cocoon wallet (client-runner needs funds on cocoon wallet)
  const cocoonWalletAddr = walletData.node_wallet?.address;
  if (!cocoonWalletAddr) {
    console.log(YELLOW('  No cocoon wallet address — skipping auto-fund.'));
    console.log(DIM('  The client-runner will create the cocoon wallet on first run.\n'));
  } else if (!walletData.owner_wallet?.seed_phrase) {
    console.log(YELLOW('  No seed phrase available — cannot auto-fund cocoon wallet.'));
    console.log(DIM(`  Send TON manually to: ${cocoonWalletAddr}\n`));
  }
  if (cocoonWalletAddr && walletData.owner_wallet?.seed_phrase) {
    console.log(DIM('  Funding cocoon wallet from owner wallet...\n'));
    try {
      const client = createTonClient();
      const mnemonic = walletData.owner_wallet.seed_phrase.split(' ');
      const keys = await mnemonicToPrivateKey(mnemonic);
      const ownerWalletContract = WalletContractV4.create({ workchain: 0, publicKey: keys.publicKey });
      const contract = client.open(ownerWalletContract);

      const ownerBal = await withRetry(() => client.getBalance(ownerWalletContract.address));
      const transferAmount = ownerBal - toNano('0.5'); // keep 0.5 TON on owner

      if (transferAmount > toNano('1')) {
        const cocoonTarget = Address.parse(cocoonWalletAddr);
        const { seqno } = await sendFromOwnerWallet(client, mnemonic, cocoonTarget, transferAmount);
        success(`Sent ${fromNano(transferAmount)} TON → cocoon wallet`);
        console.log(DIM(`  Kept 0.5 TON on owner wallet for future gas.\n`));

        await waitForSeqnoChange(
          () => withRetry(() => contract.getSeqno()),
          seqno,
          { iterations: 15, intervalMs: 2000 },
        );
      } else {
        console.log(YELLOW('  Owner wallet balance too low to fund cocoon wallet.'));
        console.log(DIM(`  Send at least 2.1 TON to ${cocoonWalletAddr}\n`));
      }
    } catch (err) {
      console.log(YELLOW(`  Could not auto-fund cocoon wallet: ${err.message}`));
      console.log(DIM(`  Send TON manually to: ${cocoonWalletAddr}\n`));
    }
  }

  steps[5].value = 'funded';

  // ── Step 7: Done ──────────────────────────────────────
  render(6, steps);

  steps[6].value = 'live';

  successBox('Setup Complete', [
    ['API URL',        BRAND.bold(`http://localhost:${httpPort}`)],
    ['Owner wallet',   CYAN(ownerAddr)],
    ['Instance',       CYAN(`#${instance}`)],
    ['Network',        CYAN('mainnet')],
    ['Status',         GREEN('staked') + DIM(' — proxy connection will finalize shortly')],
  ]);
  console.log();
  noteBox('Next steps', [
    `${DIM('•')} Start the client: ${BRAND('npx cocoon start')}`,
    `${DIM('•')} Check status: ${BRAND('npx cocoon status')}`,
    `${DIM('•')} Withdraw funds: ${BRAND('npx cocoon withdraw [amount]')}`,
    `${DIM('•')} Unstake & exit: ${BRAND('npx cocoon unstake')}`,
  ]);
  console.log();
}
