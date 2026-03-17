/**
 * Initialize X402.Fun Program
 * 
 * One-time setup script for program deployer
 * Creates the global account required for buy/sell operations
 * 
 * Usage:
 * 1. Set environment variables:
 *    - ADMIN_PRIVATE_KEY: Your admin wallet private key (base58)
 *    - RPC_URL: Solana RPC URL (optional, defaults to devnet)
 * 
 * 2. Run: node scripts/initialize-program.js
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const PROGRAM_ID = new PublicKey('63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF');
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function initializeProgram() {
  console.log('🚀 Initializing X402.Fun Program...');
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`RPC: ${RPC_URL}`);

  // Get admin keypair from environment
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    console.error('❌ Error: ADMIN_PRIVATE_KEY not set in .env');
    console.log('Create a .env file with:');
    console.log('ADMIN_PRIVATE_KEY=your_base58_private_key');
    process.exit(1);
  }

  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  console.log(`Admin: ${adminKeypair.publicKey.toBase58()}`);

  // Derive global PDA
  const [globalPubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PROGRAM_ID
  );
  console.log(`Global Account: ${globalPubkey.toBase58()}`);

  // Check if already initialized
  try {
    const accountInfo = await connection.getAccountInfo(globalPubkey);
    if (accountInfo) {
      console.log('✅ Global account already exists!');
      console.log('Program may already be initialized.');
      return;
    }
  } catch (e) {
    // Account doesn't exist yet - this is expected
  }

  // Create initialization transaction
  const { blockhash } = await connection.getLatestBlockhash();
  const transaction = new Transaction();
  transaction.feePayer = adminKeypair.publicKey;
  transaction.recentBlockhash = blockhash;

  // Set high compute budget for initialization
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })
  );

  // Initialize instruction discriminator: sha256("global:initialize")[:8]
  const INITIALIZE_DISCRIMINATOR = Buffer.from([10, 128, 86, 171, 3, 137, 161, 244]);
  
  const feeRecipient = adminKeypair.publicKey; // Use admin as fee recipient by default
  
  const instructionData = Buffer.concat([
    INITIALIZE_DISCRIMINATOR,
    adminKeypair.publicKey.toBuffer(),
    feeRecipient.toBuffer()
  ]);

  transaction.add({
    keys: [
      { pubkey: globalPubkey, isSigner: false, isWritable: true },
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: feeRecipient, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: instructionData
  });

  // Sign and send
  console.log('⏳ Sending initialization transaction...');
  const signature = await connection.sendTransaction(transaction, [adminKeypair]);
  console.log(`Signature: ${signature}`);

  // Wait for confirmation
  console.log('⏳ Waiting for confirmation...');
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  
  if (confirmation.value?.err) {
    console.error('❌ Transaction failed:', confirmation.value.err);
    process.exit(1);
  }

  console.log('✅ Program initialized successfully!');
  console.log(`Global Account: ${globalPubkey.toBase58()}`);
  console.log('You can now use buy/sell endpoints!');
}

initializeProgram().catch(console.error);
