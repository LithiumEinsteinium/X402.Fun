/**
 * X402.Fun CLI - Launch Token On-Chain
 * 
 * Usage:
 *   npx ts-node scripts/launch-token.ts <NAME> <SYMBOL> [URI]
 * 
 * Example:
 *   npx ts-node scripts/launch-token.ts "AI Meme" AIMT "https://..."
 */

import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, web3 } from '@project-serum/anchor';
import fs from 'fs';

// Config
const PROGRAM_ID = '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = 'https://api.devnet.solana.com';

// Load wallet (update path if needed)
const WALLET_PATH = process.env.WALLET || '/root/.config/solana/id.json';

async function main() {
  const name = process.argv[2] || 'Test Token';
  const symbol = process.argv[3] || 'TEST';
  const uri = process.argv[4] || '';

  console.log(`🚀 Launching token: ${name} (${symbol})`);
  
  // Connect to devnet
  const connection = new Connection(RPC_URL, 'confirmed');
  
  // Load wallet keypair
  let wallet: Keypair;
  try {
    const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
    wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
    console.log(`� wallet: ${wallet.publicKey.toBase58()}`);
  } catch (e) {
    console.error('Failed to load wallet. Make sure your keypair file exists.');
    console.error('You can create one with: solana-keygen new');
    process.exit(1);
  }
  
  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰 Balance: ${balance / 1e9} SOL`);
  
  if (balance < 0.01 * 1e9) {
    console.error('Insufficient SOL. Get some from: https://faucet.solana.com/');
    process.exit(1);
  }
  
  // Generate mint and nonce
  const mint = Keypair.generate();
  const nonce = web3.NonceStorage.systemProgram().map(() => Array(32).fill(0)).unwrap();
  
  console.log(`🪙 Mint: ${mint.publicKey.toBase58()}`);
  
  // For a real launch, we'd need to:
  // 1. Create the mint account
  // 2. Initialize token metadata
  // 3. Call the program to create bonding curve
  // 4. Bundle into a transaction
  
  console.log('\n⚠️  Full on-chain launch requires:');
  console.log('   1. Create mint account');
  console.log('   2. Create token metadata (Metaplex)');
  console.log('   3. Call program launch instruction');
  console.log('   4. Bundle into transaction');
  console.log('\n   Use the backend API for full launch flow.');
}

main().catch(console.error);
