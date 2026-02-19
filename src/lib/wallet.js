import { mnemonicNew, mnemonicToPrivateKey, keyPairFromSeed } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { PATHS } from './config.js';

/**
 * Generate a full COCOON wallet:
 * 1. Generate 24-word mnemonic → owner wallet (WalletV4R2)
 * 2. Generate Ed25519 keypair → node wallet (CocoonWallet)
 * 3. Derive CocoonWallet address via binary (if available)
 *
 * Uses official @ton/crypto + @ton/ton SDK.
 * See: https://docs.ton.org/standard/wallets/mnemonics
 */
export async function generateWallet() {
  // 1. Owner wallet — mnemonic + WalletV4R2
  const mnemonic = await mnemonicNew(24);
  const ownerKeys = await mnemonicToPrivateKey(mnemonic);

  const ownerWallet = WalletContractV4.create({
    workchain: 0,
    publicKey: ownerKeys.publicKey,
  });
  const ownerAddress = ownerWallet.address.toString({ bounceable: true });

  // 2. Node wallet — separate Ed25519 keypair (random seed)
  const { randomBytes } = await import('crypto');
  const nodeSeed = randomBytes(32);
  const nodeKeys = keyPairFromSeed(nodeSeed);
  const nodePrivateKeyBase64 = Buffer.from(nodeKeys.secretKey.slice(0, 32)).toString('base64');
  const nodePublicKeyHex = Buffer.from(nodeKeys.publicKey).toString('hex');

  // 3. CocoonWallet address via binary (if available)
  let nodeAddress = '';
  if (existsSync(PATHS.generateWallet)) {
    try {
      const output = execFileSync(PATHS.generateWallet, [
        '-o', ownerAddress,
        '-p', nodePublicKeyHex,
      ], { encoding: 'utf-8' });
      const match = output.match(/cocoon wallet address is (\S+)/);
      if (match) nodeAddress = match[1];
    } catch {
      // Binary unavailable or failed — address will be derived on first run
    }
  }

  return {
    mnemonic,
    walletData: {
      owner_wallet: {
        address: ownerAddress,
        seed_phrase: mnemonic.join(' '),
        type: 'WalletV4R2',
      },
      node_wallet: {
        address: nodeAddress,
        private_key_base64: nodePrivateKeyBase64,
        type: 'CocoonWallet',
      },
    },
  };
}
