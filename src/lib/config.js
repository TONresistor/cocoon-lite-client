import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '../..');

export const PATHS = {
  clientConf: resolve(PROJECT_ROOT, 'client.conf'),
  walletJson: resolve(PROJECT_ROOT, '.wallet.json'),
  tonConfig: resolve(PROJECT_ROOT, 'spec/mainnet-full-ton-config.json'),
  tonConfigBase: resolve(PROJECT_ROOT, 'spec/mainnet-base-ton-config.json'),
  clientConfigTemplate: resolve(PROJECT_ROOT, 'spec/spec-client/client-config.json'),
  clientRunner: resolve(PROJECT_ROOT, 'build/client-runner'),
  router: resolve(PROJECT_ROOT, 'build/tee/router'),
  generateWallet: resolve(PROJECT_ROOT, 'build/generate-cocoon-wallet-address'),
};

const DEFAULT_ROOT_CONTRACT = 'EQCns7bYSp0igFvS1wpb5wsZjCKCV19MD5AVzI4EyxsnU73k';

/**
 * Parse INI-style client.conf
 */
export function readClientConf(path = PATHS.clientConf) {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf-8');
  const config = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    config[key] = val;
  }
  return config;
}

/**
 * Write INI-style client.conf
 */
export function writeClientConf(config, path = PATHS.clientConf) {
  const lines = ['[node]', `type = client`];
  for (const [key, value] of Object.entries(config)) {
    if (key === 'type') continue;
    lines.push(`${key} = ${value}`);
  }
  writeFileSync(path, lines.join('\n') + '\n');
  chmodSync(path, 0o600);
}

/**
 * Read wallet JSON
 */
export function readWalletJson(path = PATHS.walletJson) {
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'));
  return null;
}

/**
 * Write wallet JSON with restricted permissions
 */
export function writeWalletJson(data, path = PATHS.walletJson) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  chmodSync(path, 0o600);
}

/**
 * Generate runtime vars from client.conf (mirrors cocoon-launch logic)
 */
export function getRuntimeVars(config) {
  const instance = parseInt(config.instance || '0', 10);
  const offset = instance * 10;
  return {
    CLIENT_HTTP_PORT: 10000 + offset,
    CLIENT_RPC_PORT: 10001 + offset,
    OWNER_ADDRESS: config.owner_address || '',
    ROOT_CONTRACT_ADDRESS: config.root_contract_address || DEFAULT_ROOT_CONTRACT,
    NODE_WALLET_KEY: config.node_wallet_key || '',
    IS_DEBUG: 0,
    TON_CONFIG_FILE: '', // set at render time
  };
}

/**
 * Get the HTTP port from client.conf (falls back to 10000)
 */
export function getHttpPort() {
  const config = readClientConf();
  if (!config) return 10000;
  const instance = parseInt(config.instance || '0', 10);
  return 10000 + instance * 10;
}

export { DEFAULT_ROOT_CONTRACT };
