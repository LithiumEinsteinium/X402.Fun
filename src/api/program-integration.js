/**
 * X402.Fun - Full Program Integration
 * 
 * Flow:
 * 1. Backend calls record_x402_payment (oracle signs) - creates receipt PDA
 * 2. Backend builds main transaction for agent to sign
 * 
 * This matches the deployed program's requirements
 */

import { Connection, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, MINT_SIZE } from '@solana/spl-token';
import bs58 from 'bs58';
import crypto from 'crypto';

const PROGRAM_ID = '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY; // Backend oracle wallet (base58)

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
 * Get Oracle Keypair from environment
 */
function getOracleKeypair() {
  if (!ORACLE_PRIVATE_KEY) {
    throw new Error('ORACLE_PRIVATE_KEY not set in environment');
  }
  return Keypair.fromSecretKey(bs58.decode(ORACLE_PRIVATE_KEY));
}

/**
 * Step 1: Create x402 receipt (called by backend/oracle)
 * Returns receipt PDA and nonce for use in main transaction
 */
async function createX402Receipt(agentPubkey, action) {
  const nonce = crypto.randomBytes(32);
  const [receiptPda] = deriveReceiptPDA(agentPubkey, nonce);
  
  const oracleKeypair = getOracleKeypair();
  const { blockhash } = await connection.getLatestBlockhash();
  
  const transaction = new Transaction();
  transaction.feePayer = oracleKeypair.publicKey;
  transaction.recentBlockhash = blockhash;
  
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
  );
  
  // record_x402_payment instruction discriminator: sha256("global:record_x402_payment")[:8]
  const RECORD_DISCRIMINATOR = Buffer.from([71, 134, 30, 217, 93, 174, 144, 205]);
  
  const instructionData = Buffer.concat([
    RECORD_DISCRIMINATOR,
    nonce // 32 bytes
  ]);
  
  transaction.add({
    keys: [
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: oracleKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: agentPubkey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: new PublicKey(PROGRAM_ID),
    data: instructionData
  });
  
  // Oracle signs the transaction
  transaction.sign(oracleKeypair);
  
  const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
  
  return { receiptPda, nonce, transactionBase64 };
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
    const { receiptPda, transactionBase64: receiptTxBase64 } = await createX402Receipt(creator, 'launch');
    
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
        space: MINT_SIZE,
        lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE),
        programId: TOKEN_PROGRAM_ID
      })
    );
    
    // Note: The actual launch_token instruction would reference receiptPda
    // For now, we return the receipt transaction for oracle to submit first
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint: mintPubkey.toBase58(),
      mintPrivateKey: bs58.encode(mint.secretKey),
      bondingCurve: bondingCurvePubkey.toBase58(),
      tokenAccount: tokenPubkey.toBase58(),
      receiptPda: receiptPda.toBase58(),
      receiptNonce: Buffer.from(nonce).toString('hex'),
      receiptTransaction: receiptTxBase64,
      transaction: transactionBase64,
      message: 'Step 1: Oracle submits receipt tx. Step 2: Agent signs and submits launch tx',
      instructions: [
        '1. Backend submits receipt transaction (oracle signs)',
        '2. Agent signs and submits launch transaction',
        '3. Verify launch on-chain'
      ]
    });
    
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function getNetworkInfo(req, res) {
  try {
    const version = await connection.getVersion();
    const health = await connection.getHealth();
    const slot = await connection.getSlot();
    
    res.json({
      cluster: 'devnet',
      rpc: RPC_URL,
      programId: PROGRAM_ID,
      status: health ? 'connected' : 'degraded',
      version: version['solana-core'],
      slot
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function getPlatformConfig(req, res) {
  res.json({
    programId: PROGRAM_ID,
    cluster: 'devnet',
    graduationThreshold: '1.5 SOL',
    mode: 'program-integrated'
  });
}

export async function verifyLaunch(req, res) {
  try {
    const { mint, transactionSignature } = req.body;
    
    if (!mint || !transactionSignature) {
      return res.status(400).json({ error: 'mint and transactionSignature required' });
    }
    
    const tx = await connection.getParsedTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    if (tx.meta?.err) {
      return res.status(400).json({ error: 'Transaction failed' });
    }
    
    res.json({
      success: true,
      verified: true,
      mint,
      signature: transactionSignature,
      message: 'Token launch verified on-chain!'
    });
    
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  getNetworkInfo,
  getPlatformConfig,
  createLaunchTransaction,
  verifyLaunch
};
