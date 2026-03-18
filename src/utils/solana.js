/**
 * Solana Service - Utility helpers for X402.Fun
 *
 * Provides connection, keypair helpers, and balance queries.
 * Core transaction building lives in src/api/program-integration.js.
 */

import {
  Connection,
  PublicKey,
  Keypair,
} from '@solana/web3.js';
import bs58 from 'bs58';

// Read all config from environment — no hardcoded IDs or fallback addresses
const PROGRAM_ID = process.env.PROGRAM_ID || '';
const RPC_URL    = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CLUSTER    = process.env.CLUSTER || 'devnet';

if (!PROGRAM_ID) {
  console.warn('⚠️  solana.js: PROGRAM_ID env var not set');
}

export const connection = new Connection(RPC_URL, 'confirmed');

/**
 * Load a Keypair from a base58-encoded private key env variable.
 * Returns null if the var is missing or invalid.
 */
export function getKeypairFromEnv(keyName) {
  const privateKeyBase58 = process.env[keyName];
  if (!privateKeyBase58) {
    console.warn(`⚠️  ${keyName} not set in environment`);
    return null;
  }
  try {
    return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  } catch (e) {
    console.error(`Failed to decode ${keyName}:`, e.message);
    return null;
  }
}

/**
 * Parse a base58 public key from an env variable.
 * Returns null if missing or invalid.
 */
export function getPlatformWallet() {
  const walletBase58 = process.env.FEE_RECIPIENT || process.env.PLATFORM_WALLET;
  if (!walletBase58) return null;
  try {
    return new PublicKey(walletBase58);
  } catch {
    return null;
  }
}

/**
 * Get parsed transaction details.
 */
export async function getMintFromTransaction(signature) {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return null;
    for (const log of tx.meta?.logMessages || []) {
      if (log.includes('InitializeMint')) {
        const match = log.match(/InitializeMint\s+(\w+)/);
        if (match) return match[1];
      }
    }
    return null;
  } catch (e) {
    console.error('Error getting mint from tx:', e.message);
    return null;
  }
}

/**
 * Get parsed account info.
 */
export async function getAccountInfo(address) {
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(address));
    return info.value;
  } catch {
    return null;
  }
}

/**
 * Get token balance for a wallet.
 */
export async function getTokenBalance(mintAddress, walletAddress) {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { mint: new PublicKey(mintAddress) }
    );
    if (accounts.value.length === 0) return 0;
    return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
  } catch {
    return 0;
  }
}

/**
 * Get SOL balance in SOL (not lamports).
 */
export async function getSolBalance(address) {
  try {
    return (await connection.getBalance(new PublicKey(address))) / 1e9;
  } catch {
    return 0;
  }
}

/**
 * Return basic network info — used by the /network route.
 */
export function getNetworkInfo() {
  return {
    cluster:   CLUSTER,
    rpc:       RPC_URL,
    programId: PROGRAM_ID,
  };
}

export default {
  connection,
  PROGRAM_ID,
  getKeypairFromEnv,
  getPlatformWallet,
  getMintFromTransaction,
  getAccountInfo,
  getTokenBalance,
  getSolBalance,
  getNetworkInfo,
};
