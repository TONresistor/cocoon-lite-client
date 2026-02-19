#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { modelsCommand } from './commands/models.js';
import { withdrawCommand } from './commands/withdraw.js';
import { unstakeCommand } from './commands/unstake.js';
import { cashoutCommand } from './commands/cashout.js';

const program = new Command();

program
  .name('cocoon')
  .description('COCOON Lite Client — Decentralized AI inference on TON')
  .version('0.1.0');

program
  .command('setup')
  .description('Interactive setup wizard — configure wallet and client')
  .action(setupCommand);

program
  .command('start')
  .description('Start the COCOON client (router + client-runner)')
  .option('--verbosity <level>', 'Client verbosity level (0-5)', '1')
  .option('--router-policy <policy>', 'Router TEE policy (tdx, any)', 'any')
  .action(startCommand);

program
  .command('status')
  .description('Show client status, balance, and stats')
  .option('-p, --port <port>', 'Client HTTP port (auto-detected from client.conf)')
  .action(statusCommand);

program
  .command('models')
  .description('List available AI models')
  .option('-p, --port <port>', 'Client HTTP port (auto-detected from client.conf)')
  .action(modelsCommand);

program
  .command('withdraw')
  .description('Withdraw TON from cocoon wallet to owner wallet')
  .argument('[amount]', 'Amount in TON or "max" (default: max)')
  .action(withdrawCommand);

program
  .command('unstake')
  .description('Unstake TON — close proxy contract and withdraw funds')
  .option('-p, --port <port>', 'Client HTTP port (auto-detected from client.conf)')
  .action(unstakeCommand);

program
  .command('cashout')
  .description('Send TON from owner wallet to an external address')
  .argument('<amount>', 'Amount in TON or "max" to send all')
  .argument('<address>', 'Destination wallet address')
  .action(cashoutCommand);

program.parse();
