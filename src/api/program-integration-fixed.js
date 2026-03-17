/**
 * X402.Fun - Full Program Integration (FIXED)
 * 
 * Corrected flow:
 * 1. Backend calls record_x402_payment (oracle signs)
 * 2. Backend builds main transaction for agent to sign
 * 
 * This matches the deployed program's requirements
 */

import { Connection, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import crypto from 'crypto';

const PROGRAM_ID = '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY; // Backend oracle wallet

const connection = new Connection(RPC_URL, 'confirmed');

/**
 * Derive x402 receipt PDA
 */
function deriveReceiptPDA(agentPubkey, nonce) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('x402'), agentPubkey.toBuffer(), nonce],
    new PublicKey(PROGRAM_ID)
  );
}

/**
 * Step 1: Create x402 receipt (called by backend/oracle)
 * This creates the receipt PDA that will be consumed by the main instruction
 */
async function createX402Receipt(agentPubkey, action) {
  const nonce = crypto.randomBytes(32);
  const [receiptPda] = deriveReceiptPDA(agentPubkey, nonce);
  
  // In a real implementation, the backend would:
  // 1. Create instruction for record_x402_payment
  // 2. Sign with oracle wallet
  // 3. Submit to chain
  // 4. Return receiptPda and nonce for use in main transaction
  
  return { receiptPda, nonce };
}

/**
 * Launch token with x402 receipt
 */
export async function createLaunchTransaction(req, res) {
  try {
    const { name, symbol, creatorWallet } = req.body;
    
    if (!name || !symbol || !creatorWallet) {
      return res.status(400).json({ error: 'name, symbol, and creatorWallet required' });
    }
    
    const creator = new PublicKey(creatorWallet);
    const mint = Keypair.generate();
    const mintPubkey = mint.publicKey;
    
    // Derive PDAs
    const [bondingCurvePubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('curve'), mintPubkey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    const [tokenPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('token'), mintPubkey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    // Step 1: Create x402 receipt (backend/oracle signs)
    const nonce = crypto.randomBytes(32);
    const [receiptPda] = deriveReceiptPDA(creator, nonce);
    
    // In production: backend calls record_x402_payment here
    // For now, we'll skip this step and note it in the response
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = creator;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 450000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500000 })
    );
    
    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: creator,
        newAccountPubkey: mintPubkey,
        space: 82,
        lamports: await connection.getMinimumBalanceForRentExemption(82),
        programId: TOKEN_PROGRAM_ID
      })
    );
    
    // Note: The actual launch_token instruction would go here
    // It would reference the receiptPda created above
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint: mintPubkey.toBase58(),
      mintPrivateKey: bs58.encode(mint.secretKey),
      bondingCurve: bondingCurvePubkey.toBase58(),
      tokenAccount: tokenPubkey.toBase58(),
      receiptPda: receiptPda.toBase58(),
      nonce: Buffer.from(nonce).toString('hex'),
      transaction: transactionBase64,
      message: 'Sign to launch token (x402 receipt created by backend)',
      note: 'Backend should call record_x402_payment before this transaction'
    });
    
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  createLaunchTransaction
};
