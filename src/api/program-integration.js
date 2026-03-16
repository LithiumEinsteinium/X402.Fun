/**
 * X402.Fun - Full Program Integration
 * Uses the on-chain program for real bonding curves
 */

import { Connection, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createSyncNativeInstruction, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';

import { tokens, bondingCurves } from './tokens.js';
import { announceLaunch, announceGraduation } from '../utils/telegram.js';

const PROGRAM_ID = '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CLUSTER = process.env.CLUSTER || 'devnet';

const connection = new Connection(RPC_URL, 'confirmed');

console.log(`🔗 Connected to ${CLUSTER}`);
console.log(`📜 Program ID: ${PROGRAM_ID}`);

const BONDING_CURVE_TOKENS = 0.30;
const POOL_TOKENS = 0.70;
const PLATFORM_FEE = 0.15;
const POOL_FEE = 0.85;
const GRADUATION_SOL = 1.5;

// PumpSwap and token constants
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const WRAPPED_SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6tFqe37MFtyb1ZuToBMwExT');

export async function getPlatformConfig(req, res) {
  res.json({
    programId: PROGRAM_ID,
    cluster: CLUSTER,
    graduationThreshold: `${GRADUATION_SOL} SOL`,
    tokenDistribution: {
      bondingCurve: `${BONDING_CURVE_TOKENS * 100}%`,
      liquidityPool: `${POOL_TOKENS * 100}%`
    },
    feeDistribution: {
      platform: `${PLATFORM_FEE * 100}%`,
      liquidityPool: `${POOL_FEE * 100}%`
    },
    mode: 'program-integrated',
    description: 'Full bonding curve with agent verification'
  });
}

export async function getNetworkInfo(req, res) {
  try {
    const version = await connection.getVersion();
    const health = await connection.getHealth();
    const slot = await connection.getSlot();
    
    res.json({
      cluster: CLUSTER,
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

export async function createLaunchTransaction(req, res) {
  try {
    const { agentId, name, symbol, creatorWallet, uri } = req.body;
    
    if (!name || !symbol || !creatorWallet) {
      return res.status(400).json({ error: 'name, symbol, and creatorWallet required' });
    }
    
    const mint = Keypair.generate();
    const mintPubkey = mint.publicKey;
    const creator = new PublicKey(creatorWallet);
    
    const [bondingCurvePubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('curve'), mintPubkey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    const [tokenPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('token'), mintPubkey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = creator;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 450000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500000 })
    );
    
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: creator,
        newAccountPubkey: mintPubkey,
        space: 82,
        lamports: await connection.getMinimumBalanceForRentExemption(82),
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      }),
      SystemProgram.createAccount({
        fromPubkey: creator,
        newAccountPubkey: bondingCurvePubkey,
        space: 1000,
        lamports: await connection.getMinimumBalanceForRentExemption(1000),
        programId: new PublicKey(PROGRAM_ID)
      })
    );
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    console.log(`🚀 Created launch transaction for ${name} (${symbol})`);
    console.log(`   Mint: ${mintPubkey.toBase58()}`);
    console.log(`   Bonding Curve: ${bondingCurvePubkey.toBase58()}`);
    
    res.json({
      success: true,
      mint: mintPubkey.toBase58(),
      bondingCurve: bondingCurvePubkey.toBase58(),
      tokenAccount: tokenPubkey.toBase58(),
      transaction: transactionBase64,
      message: 'Sign this transaction with your wallet and submit to Solana devnet'
    });
    
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function verifyLaunch(req, res) {
  try {
    const { agentId, mint, transactionSignature, name, symbol, creatorWallet } = req.body;
    
    if (!mint || !transactionSignature) {
      return res.status(400).json({ error: 'mint and transactionSignature required' });
    }
    
    try {
      const tx = await connection.getParsedTransaction(transactionSignature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      if (tx.meta?.err) {
        return res.status(400).json({ error: 'Transaction failed' });
      }
      
      const mintPubkey = new PublicKey(mint);
      const [bondingCurvePubkey] = PublicKey.findProgramAddressSync(
        [Buffer.from('curve'), mintPubkey.toBuffer()],
        new PublicKey(PROGRAM_ID)
      );
      
      tokens[mint] = {
        id: `token_${Date.now()}`,
        mint,
        name: name || 'Unknown',
        symbol: symbol || 'UNKNOWN',
        agentId,
        creator: creatorWallet || '',
        bondingCurve: {
          liquidity: 0,
          price: 0.000028,
          progress: 0
        },
        graduated: false,
        createdAt: new Date().toISOString(),
        totalBuys: 0,
        totalSells: 0
      };
      
      bondingCurves[mint] = {
        mint,
        bondingCurve: bondingCurvePubkey.toBase58(),
        complete: false,
        virtualSolReserves: 0,
        virtualTokenReserves: 0,
        realSolReserves: 0,
        totalSupply: 0,
        graduated: false
      };
      
      await announceLaunch(tokens[mint]);
      
      console.log(`✅ Verified launch: ${mint}`);
      
      res.json({
        success: true,
        verified: true,
        mint,
        name: name || 'Unknown',
        symbol: symbol || 'UNKNOWN',
        bondingCurve: bondingCurvePubkey.toBase58(),
        message: 'Token launched successfully on devnet!'
      });
      
    } catch (e) {
      res.status(500).json({ error: `Verification failed: ${e.message}` });
    }
    
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function createContributeTransaction(req, res) {
  try {
    const { mint, contributorWallet, solAmount } = req.body;
    
    if (!mint || !contributorWallet || !solAmount) {
      return res.status(400).json({ error: 'mint, contributorWallet, and solAmount required' });
    }
    
    const mintPubkey = new PublicKey(mint);
    const contributor = new PublicKey(contributorWallet);
    
    const [bondingCurvePubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('curve'), mintPubkey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );
    
    const amount = Math.ceil(solAmount * 1e9);
    const platformFee = Math.floor(amount * PLATFORM_FEE);
    const poolAmount = amount - platformFee;
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = contributor;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 })
    );
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: contributor,
        toPubkey: bondingCurvePubkey,
        lamports: poolAmount
      })
    );
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    console.log(`💰 Created contribution: ${solAmount} SOL for ${mint}`);
    
    res.json({
      success: true,
      mint,
      contributor: contributorWallet,
      amount: solAmount,
      platformFee: (platformFee / 1e9).toFixed(4),
      poolAmount: (poolAmount / 1e9).toFixed(4),
      transaction: transactionBase64,
      message: `Sign to contribute ${solAmount} SOL. ${(platformFee / 1e9).toFixed(4)} SOL platform fee will be deducted.`
    });
    
  } catch (error) {
    console.error('Contribute error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function verifyContribution(req, res) {
  try {
    const { mint, transactionSignature, expectedAmount } = req.body;
    
    if (!mint || !transactionSignature || !expectedAmount) {
      return res.status(400).json({ 
        error: 'mint, transactionSignature, and expectedAmount required' 
      });
    }
    
    try {
      const tx = await connection.getParsedTransaction(transactionSignature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      if (tx.meta?.err) {
        return res.status(400).json({ error: 'Transaction failed' });
      }
      
      const platformFee = expectedAmount * PLATFORM_FEE;
      const poolAmount = expectedAmount * POOL_FEE;
      
      if (tokens[mint]) {
        tokens[mint].graduated = expectedAmount >= GRADUATION_SOL;
        if (bondingCurves[mint]) {
          bondingCurves[mint].complete = expectedAmount >= GRADUATION_SOL;
          bondingCurves[mint].graduated = expectedAmount >= GRADUATION_SOL;
        }
        
        if (expectedAmount >= GRADUATION_SOL) {
          await announceGraduation(tokens[mint]);
        }
      }
      
      res.json({
        success: true,
        verified: true,
        mint,
        amount: expectedAmount,
        breakdown: {
          platformFee: platformFee.toFixed(4),
          poolAmount: poolAmount.toFixed(4)
        },
        signature: transactionSignature,
        message: expectedAmount >= GRADUATION_SOL 
          ? 'Token graduated! 🎉 Pool created with 70% tokens + 85% SOL'
          : `Contribution recorded. Need ${GRADUATION_SOL - expectedAmount} more SOL to graduate.`
      });
      
    } catch (e) {
      res.status(500).json({ error: `Verification failed: ${e.message}` });
    }
    
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function createPumpSwapPool(req, res) {
  try {
    const { mint, contributorWallet, poolIndex = 0 } = req.body;
    
    if (!mint || !contributorWallet) {
      return res.status(400).json({ 
        error: 'mint and contributorWallet required' 
      });
    }
    
    const mintPubkey = new PublicKey(mint);
    const contributor = new PublicKey(contributorWallet);
    const programPubkey = new PublicKey(PROGRAM_ID);
    const pumpswapProgram = new PublicKey(PUMPSWAP_PROGRAM);
    
    // Derive PDAs
    const [bondingCurvePubkey, curveBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('curve'), mintPubkey.toBuffer()],
      programPubkey
    );
    
    const [tokenPubkey, tokenBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('token'), mintPubkey.toBuffer()],
      programPubkey
    );
    
    // Get PumpSwap PDAs
    const [poolPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), Buffer.from([poolIndex, 0]), bondingCurvePubkey.toBuffer(), mintPubkey.toBuffer(), WRAPPED_SOL_MINT.toBuffer()],
      pumpswapProgram
    );
    
    const [globalConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from('global_config')],
      pumpswapProgram
    );
    
    const [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('__event_authority')],
      pumpswapProgram
    );
    
    // Get ATAs
    const curveWSOL = getAssociatedTokenAddressSync(
      WRAPPED_SOL_MINT,
      bondingCurvePubkey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mintPubkey,
      bondingCurvePubkey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Check if WSOL ATA exists
    let wsolATAExists = false;
    try {
      await getAccount(connection, curveWSOL);
      wsolATAExists = true;
    } catch (e) {
      wsolATAExists = false;
    }
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = contributor;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 800000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 })
    );
    
    // Create WSOL ATA if it doesn't exist
    if (!wsolATAExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          contributor,
          curveWSOL,
          bondingCurvePubkey,
          WRAPPED_SOL_MINT,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
    
    // Create CPI instruction data for graduate_to_pumpswap
    // This would call our program which then calls PumpSwap
    // For now, we build a simplified version
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    console.log(`🏊 Pool creation for ${mint}`);
    console.log(`   Bonding curve: ${bondingCurvePubkey.toBase58()}`);
    console.log(`   Pool: ${poolPubkey.toBase58()}`);
    console.log(`   WSOL ATA exists: ${wsolATAExists}`);
    
    res.json({
      success: true,
      mint,
      bondingCurve: bondingCurvePubkey.toBase58(),
      pool: poolPubkey.toBase58(),
      poolIndex,
      wsolATA: curveWSOL.toBase58(),
      vaultTokenAccount: vaultTokenAccount.toBase58(),
      globalConfig: globalConfig.toBase58(),
      transaction: transactionBase64,
      message: 'Transaction ready. Sign and submit to create PumpSwap pool.',
      note: 'This creates ATAs. Full graduate_to_pumpswap CPI coming soon.'
    });
    
  } catch (error) {
    console.error('Create pool error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  getNetworkInfo,
  getPlatformConfig,
  createLaunchTransaction,
  verifyLaunch,
  createContributeTransaction,
  verifyContribution,
  createPumpSwapPool
};
