/**
 * Solana Service - On-chain interactions for X402.Fun
 * 
 * Handles real Solana program calls for token launches,
 * buying, selling, and liquidity contributions.
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

// Config
const PROGRAM_ID = process.env.PROGRAM_ID || '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHPAVDE7XJF';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CLUSTER = process.env.CLUSTER || 'devnet';

// Initialize connection
const connection = new Connection(RPC_URL, 'confirmed');

console.log(`🔗 Connected to ${CLUSTER} via ${RPC_URL}`);
console.log(`📜 Program ID: ${PROGRAM_ID}`);

/**
 * Get or create a keypair from base58 private key
 */
export function getKeypairFromEnv(keyName: string): Keypair | null {
  const privateKeyBase58 = process.env[keyName];
  if (!privateKeyBase58) {
    console.log(`⚠️  ${keyName} not set in environment`);
    return null;
  }
  try {
    const bytes = bs58.decode(privateKeyBase58);
    return Keypair.fromSecretKey(bytes);
  } catch (e) {
    console.error(`Failed to decode ${keyName}:`, e);
    return null;
  }
}

/**
 * Get the platform wallet (for receiving fees)
 */
export function getPlatformWallet(): PublicKey | null {
  const walletBase58 = process.env.PLATFORM_WALLET;
  if (!walletBase58) return null;
  try {
    return new PublicKey(walletBase58);
  } catch {
    return null;
  }
}

/**
 * Create a new mint keypair for a token
 */
export function createMintKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Get the mint address from a token launch transaction
 */
export async function getMintFromTransaction(signature: string): Promise<string | null> {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) return null;
    
    // Find the mint in the transaction logs or token info
    // This is simplified - in production you'd parse more carefully
    for (const log of tx.meta?.logMessages || []) {
      if (log.includes('InitializeMint')) {
        // Extract mint address from logs
        const match = log.match(/InitializeMint\s+(\w+)/);
        if (match) return match[1];
      }
    }
    
    return null;
  } catch (e) {
    console.error('Error getting mint from tx:', e);
    return null;
  }
}

/**
 * Get account info for debugging
 */
export async function getAccountInfo(address: string) {
  try {
    const pubkey = new PublicKey(address);
    const info = await connection.getParsedAccountInfo(pubkey);
    return info.value;
  } catch (e) {
    return null;
  }
}

/**
 * Get program accounts
 */
export async function getProgramAccounts() {
  try {
    const programPubkey = new PublicKey(PROGRAM_ID);
    const accounts = await connection.getParsedProgramAccounts(programPubkey);
    return accounts;
  } catch (e) {
    console.error('Error getting program accounts:', e);
    return [];
  }
}

/**
 * Get token balance for an address
 */
export async function getTokenBalance(mintAddress: string, walletAddress: string): Promise<number> {
  try {
    const mint = new PublicKey(mintAddress);
    const wallet = new PublicKey(walletAddress);
    
    const tokenAccount = await connection.getParsedTokenAccountsByOwner(wallet, {
      mint: mint
    });
    
    if (tokenAccount.value.length === 0) return 0;
    
    const balance = tokenAccount.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return balance;
  } catch (e) {
    console.error('Error getting token balance:', e);
    return 0;
  }
}

/**
 * Get SOL balance
 */
export async function getSolBalance(address: string): Promise<number> {
  try {
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    return balance / 1e9; // Convert lamports to SOL
  } catch (e) {
    console.error('Error getting SOL balance:', e);
    return 0;
  }
}

/**
 * Get current network cluster info
 */
export function getNetworkInfo() {
  return {
    cluster: CLUSTER,
    rpc: RPC_URL,
    programId: PROGRAM_ID
  };
}

export default {
  connection,
  PROGRAM_ID,
  getKeypairFromEnv,
  getPlatformWallet,
  createMintKeypair,
  getMintFromTransaction,
  getAccountInfo,
  getProgramAccounts,
  getTokenBalance,
  getSolBalance,
  getNetworkInfo
};
