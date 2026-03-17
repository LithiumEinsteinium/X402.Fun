/**
 * X402.Fun - Simple Program Integration (NO x402 receipts)
 * 
 * This version skips the x402 receipt requirement and directly calls
 * launch_token, buy, sell instructions.
 * 
 * Use this if the deployed program doesn't have record_x402_payment yet.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MINT_SIZE,
} from '@solana/spl-token';
import bs58 from 'bs58';
import crypto from 'crypto';

const PROGRAM_ID = new PublicKey('63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const connection = new Connection(RPC_URL, 'confirmed');

// Discriminators from the deployed program
const DISCRIMINATORS = {
  launch_token: Buffer.from([10, 128, 86, 171, 3, 137, 161, 244]),
  buy: Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]),
  sell: Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]),
  contribute_liquidity: Buffer.from([63, 184, 212, 155, 74, 150, 161, 161]),
};

/**
 * Derive mint PDA: ["mint", creator, name]
 */
function deriveMintPDA(creator, name) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mint'), creator.toBuffer(), Buffer.from(name)],
    PROGRAM_ID
  );
}

/**
 * Derive token state PDA: ["token", mint]
 */
function deriveTokenPDA(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token'), mint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive bonding curve PDA: ["curve", mint]
 */
function deriveBondingCurvePDA(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('curve'), mint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Create launch transaction (NO x402 receipt required)
 */
export async function createLaunchTransaction(req, res) {
  try {
    const { name, symbol, creatorWallet } = req.body;

    if (!name || !symbol || !creatorWallet) {
      return res.status(400).json({ error: 'name, symbol, and creatorWallet required' });
    }

    const creator = new PublicKey(creatorWallet);
    const nonce = crypto.randomBytes(32);

    // Derive mint PDA
    const [mintPubkey] = deriveMintPDA(creator, name);
    const [tokenPubkey] = deriveTokenPDA(mintPubkey);
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);

    const { blockhash } = await connection.getLatestBlockhash();

    const transaction = new Transaction();
    transaction.feePayer = creator;
    transaction.recentBlockhash = blockhash;

    // Set compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5 })
    );

    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: creator,
        newAccountPubkey: mintPubkey,
        space: MINT_SIZE,
        lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE),
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Initialize mint instruction
    // Note: This is a simplified version - the actual program may have different requirements
    const initMintInstruction = {
      keys: [
        { pubkey: mintPubkey, isSigner: false, isWritable: true },
        { pubkey: creator, isSigner: true, isWritable: true },
        { pubkey: creator, isSigner: false, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: Buffer.from([2, 0, 0, 0, 9, ...creator.toBuffer(), ...creator.toBuffer()]),
    };

    // launch_token instruction
    const launchInstruction = {
      keys: [
        { pubkey: mintPubkey, isSigner: false, isWritable: true },
        { pubkey: tokenPubkey, isSigner: false, isWritable: true },
        { pubkey: bondingCurvePubkey, isSigner: false, isWritable: true },
        { pubkey: creator, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.concat([
        DISCRIMINATORS.launch_token,
        Buffer.from(name, 'utf8'),
        Buffer.from(symbol, 'utf8'),
        Buffer.from('', 'utf8'), // uri
        nonce,
      ]),
    };

    transaction.add(launchInstruction);

    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');

    res.json({
      success: true,
      mint: mintPubkey.toBase58(),
      bondingCurve: bondingCurvePubkey.toBase58(),
      tokenAccount: tokenPubkey.toBase58(),
      transaction: transactionBase64,
      message: 'Sign and submit to launch token',
    });
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function getPlatformConfig(req, res) {
  res.json({
    programId: PROGRAM_ID.toBase58(),
    cluster: 'devnet',
    mode: 'simple',
  });
}

export async function getNetworkInfo(req, res) {
  try {
    const version = await connection.getVersion();
    res.json({
      cluster: 'devnet',
      rpc: RPC_URL,
      programId: PROGRAM_ID.toBase58(),
      version: version['solana-core'],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default {
  getPlatformConfig,
  getNetworkInfo,
  createLaunchTransaction,
};
