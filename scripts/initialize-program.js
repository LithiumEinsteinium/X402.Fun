/**
 * Initialize X402.Fun Program
 *
 * One-time setup script for the program deployer.
 * Creates the Global PDA required for all launch/buy/sell operations.
 *
 * Usage:
 *   1. Set environment variables in .env:
 *        ADMIN_PRIVATE_KEY=<base58 private key>   (required)
 *        FEE_RECIPIENT=<base58 pubkey>             (optional — defaults to admin wallet)
 *        RPC_URL=<rpc url>                         (optional — defaults to devnet)
 *
 *   2. node scripts/initialize-program.js
 *
 * Safe to run more than once — exits early if Global account already exists.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const PROGRAM_ID = new PublicKey('63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF');
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Correct discriminator for `initialize` from fetched_idl.json
// BUG FIX: old code used [10,128,86,171,3,137,161,244] which is the launch_token
// discriminator — this caused every initialize call to silently try to run
// launch_token instead, which then failed with InstructionFallbackNotFound.
const INITIALIZE_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

async function initializeProgram() {
  console.log('🚀 Initializing X402.Fun Program...');
  console.log(`Program : ${PROGRAM_ID.toBase58()}`);
  console.log(`RPC     : ${RPC_URL}`);

  // Admin keypair
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    console.error('❌  ADMIN_PRIVATE_KEY not set in .env');
    console.error('    Add: ADMIN_PRIVATE_KEY=<your base58 private key>');
    process.exit(1);
  }

  const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPrivateKey));
  console.log(`Admin   : ${adminKeypair.publicKey.toBase58()}`);

  // Fee recipient (optional override, defaults to admin)
  let feeRecipient;
  if (process.env.FEE_RECIPIENT) {
    try {
      feeRecipient = new PublicKey(process.env.FEE_RECIPIENT);
    } catch {
      console.error('❌  FEE_RECIPIENT is not a valid base58 public key');
      process.exit(1);
    }
  } else {
    feeRecipient = adminKeypair.publicKey;
  }
  console.log(`Fee recipient: ${feeRecipient.toBase58()}`);

  // Derive Global PDA — seeds: ["global"]
  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global')],
    PROGRAM_ID
  );
  console.log(`Global PDA: ${globalPda.toBase58()}`);

  // Check if already initialized
  const existing = await connection.getAccountInfo(globalPda);
  if (existing) {
    console.log('✅  Global account already exists — program is already initialized.');
    console.log(`    Owner : ${existing.owner.toBase58()}`);
    console.log(`    Bytes : ${existing.data.length}`);
    return;
  }

  // Build transaction
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: adminKeypair.publicKey,
    recentBlockhash: blockhash,
  });

  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  );

  // BUG FIX: initialize() takes ZERO instruction arguments in Rust — it reads
  // authority and fee_recipient from the accounts list, not from instruction data.
  // The old code appended adminKeypair.publicKey.toBuffer() + feeRecipient.toBuffer()
  // after the discriminator, which made the runtime unable to match the instruction
  // and caused InstructionFallbackNotFound on every call.
  transaction.add({
    keys: [
      { pubkey: globalPda,               isSigner: false, isWritable: true  }, // global (init PDA, payer = authority)
      { pubkey: adminKeypair.publicKey,  isSigner: true,  isWritable: true  }, // authority
      { pubkey: feeRecipient,            isSigner: false, isWritable: false }, // fee_recipient
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data: INITIALIZE_DISCRIMINATOR, // discriminator only — no args
  });

  // Sign and send
  console.log('⏳  Sending initialization transaction...');
  const signature = await connection.sendTransaction(transaction, [adminKeypair], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  console.log(`Signature: ${signature}`);
  console.log(`Explorer : https://solscan.io/tx/${signature}?cluster=devnet`);

  // Confirm
  console.log('⏳  Waiting for confirmation...');
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');

  if (confirmation.value?.err) {
    console.error('❌  Transaction failed:', confirmation.value.err);
    process.exit(1);
  }

  // Verify account was actually created
  const created = await connection.getAccountInfo(globalPda);
  if (!created) {
    console.error('❌  Transaction confirmed but Global account missing — unexpected error.');
    process.exit(1);
  }

  console.log('');
  console.log('✅  Program initialized successfully!');
  console.log(`   Global PDA   : ${globalPda.toBase58()}`);
  console.log(`   Authority    : ${adminKeypair.publicKey.toBase58()}`);
  console.log(`   Fee wallet   : ${feeRecipient.toBase58()}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set ORACLE_PRIVATE_KEY in your Render environment variables.');
  console.log('  2. Ensure the oracle wallet has at least 0.1 devnet SOL for receipt tx fees.');
  console.log('  3. Agents can now call POST /api/program/create-launch.');
}

initializeProgram().catch((err) => {
  console.error('❌  Fatal:', err.message);
  process.exit(1);
});
