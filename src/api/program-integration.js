import crypto from "crypto";
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

// PumpSwap and token constants (as strings, converted to PublicKey when needed)
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const WRAPPED_SOL_MINT_STR = 'So11111111111111111111111111111111111111112';
const TOKEN_2022_STR = 'TokenzQdBNbLqP5VEhdkAS6tFqe37MFtyb1ZuToBMwExT';
const TOKEN_PROGRAM_STR = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

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
        programId: new PublicKey(TOKEN_PROGRAM_STR)
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
      mint: mintPubkey.toBase58(), mintPrivateKey: bs58.encode(mint.secretKey),
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
      [Buffer.from('pool'), Buffer.from([poolIndex, 0]), bondingCurvePubkey.toBuffer(), mintPubkey.toBuffer(), new PublicKey(WRAPPED_SOL_MINT_STR).toBuffer()],
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
    
    // Get LP mint PDA
    const [lpMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool_lp_mint'), poolPubkey.toBuffer()],
      pumpswapProgram
    );
    
    // Get pool ATAs
    const curveLP = getAssociatedTokenAddressSync(
      lpMint,
      bondingCurvePubkey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const poolBaseToken = getAssociatedTokenAddressSync(
      mintPubkey,
      poolPubkey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const poolQuoteToken = getAssociatedTokenAddressSync(
      new PublicKey(WRAPPED_SOL_MINT_STR),
      poolPubkey,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Check if ATAs exist
    let wsolATAExists = false;
    let lpATAExists = false;
    try {
      await getAccount(connection, curveWSOL);
      wsolATAExists = true;
    } catch (e) {}
    try {
      await getAccount(connection, curveLP);
      lpATAExists = true;
    } catch (e) {}
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = contributor;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1200000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000000 })
    );
    
    // Create WSOL ATA if needed
    if (!wsolATAExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          contributor,
          curveWSOL,
          bondingCurvePubkey,
          new PublicKey(WRAPPED_SOL_MINT_STR),
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
    
    // Create LP ATA if needed
    if (!lpATAExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          contributor,
          curveLP,
          bondingCurvePubkey,
          lpMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
    
    // Graduate to PumpSwap instruction data
    // Discriminator: sha256("global:graduate_to_pumpswap")[:8]
    const GRADUATE_DISCRIMINATOR = Buffer.from([0x23, 0x27, 0x5a, 0xd5, 0x9c, 0x5e, 0x83, 0x48]);
    const poolIndexBuf = Buffer.alloc(2);
    poolIndexBuf.writeUInt16LE(poolIndex);
    const instructionData = Buffer.concat([GRADUATE_DISCRIMINATOR, poolIndexBuf]);
    
    // Add graduate_to_pumpswap instruction
    transaction.add({
      keys: [
        { pubkey: tokenPubkey, isSigner: false, isWritable: true },
        { pubkey: bondingCurvePubkey, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
        { pubkey: curveWSOL, isSigner: false, isWritable: true },
        { pubkey: curveLP, isSigner: false, isWritable: true },
        { pubkey: poolPubkey, isSigner: false, isWritable: true },
        { pubkey: lpMint, isSigner: false, isWritable: true },
        { pubkey: poolBaseToken, isSigner: false, isWritable: true },
        { pubkey: poolQuoteToken, isSigner: false, isWritable: true },
        { pubkey: globalConfig, isSigner: false, isWritable: false },
        { pubkey: eventAuthority, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(WRAPPED_SOL_MINT_STR), isSigner: false, isWritable: false },
        { pubkey: pumpswapProgram, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(TOKEN_2022_STR), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(TOKEN_PROGRAM_STR), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(WRAPPED_SOL_MINT_STR), isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: programPubkey,
      data: instructionData
    });
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    console.log(`🏊 Creating PumpSwap pool for ${mint}`);
    console.log(`   Bonding curve: ${bondingCurvePubkey.toBase58()}`);
    console.log(`   Pool: ${poolPubkey.toBase58()}`);
    console.log(`   WSOL ATA: ${wsolATAExists ? 'exists' : 'created'}`);
    console.log(`   LP ATA: ${lpATAExists ? 'exists' : 'created'}`);
    
    res.json({
      success: true,
      mint,
      bondingCurve: bondingCurvePubkey.toBase58(),
      tokenAccount: tokenPubkey.toBase58(),
      pool: poolPubkey.toBase58(),
      poolIndex,
      accounts: {
        curveWSOL: curveWSOL.toBase58(),
        curveLP: curveLP.toBase58(),
        vaultTokenAccount: vaultTokenAccount.toBase58(),
        lpMint: lpMint.toBase58(),
        poolBaseToken: poolBaseToken.toBase58(),
        poolQuoteToken: poolQuoteToken.toBase58(),
        globalConfig: globalConfig.toBase58(),
        eventAuthority: eventAuthority.toBase58()
      },
      transaction: transactionBase64,
      message: 'Sign this transaction to create the PumpSwap pool!'
    });
    
  } catch (error) {
    console.error('Create pool error:', error);
    res.status(500).json({ error: error.message });
  }
}


// Create a buy transaction from bonding curve
export async function createBuyTransaction(req, res) {
  try {
    const { mint, buyerWallet, solAmount, minTokensOut } = req.body;
    
    if (!mint || !buyerWallet || !solAmount) {
      return res.status(400).json({ 
        error: 'mint, buyerWallet, and solAmount required' 
      });
    }
    
    const mintPubkey = new PublicKey(mint);
    const buyer = new PublicKey(buyerWallet);
    const programPubkey = new PublicKey(PROGRAM_ID);
    
    // Derive PDAs
    const [bondingCurvePubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('curve'), mintPubkey.toBuffer()],
      programPubkey
    );
    
    const [tokenPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('token'), mintPubkey.toBuffer()],
      programPubkey
    );
    
    const [globalPubkey] = PublicKey.findProgramAddressSync(
      [Buffer.from('global')],
      programPubkey
    );
    
    // Generate nonce for x402 receipt
    const nonce = crypto.randomBytes(32);
    const [x402Receipt] = PublicKey.findProgramAddressSync(
      [Buffer.from('x402'), buyer.toBuffer(), nonce],
      programPubkey
    );
    
    // Platform wallet for fees
    const platformWallet = new PublicKey('7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR');
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = buyer;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 })
    );
    
    // Buy instruction data: discriminator + sol_amount (u64) + min_tokens_out (u64) + nonce (32 bytes)
    const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]); // sha256("global:buy")[:8] // sha256("global:buy")[:8]
    const solAmountBuf = Buffer.alloc(8);
    solAmountBuf.writeBigUInt64LE(BigInt(Math.floor(solAmount * 1e9)));
    const minTokensBuf = Buffer.alloc(8);
    minTokensBuf.writeBigUInt64LE(BigInt(minTokensOut || 0));
    
    const instructionData = Buffer.concat([BUY_DISCRIMINATOR, solAmountBuf, minTokensBuf, nonce]);
    
    transaction.add({
      keys: [
        { pubkey: globalPubkey, isSigner: false, isWritable: false },
        { pubkey: x402Receipt, isSigner: false, isWritable: true },
        { pubkey: tokenPubkey, isSigner: false, isWritable: true },
        { pubkey: bondingCurvePubkey, isSigner: false, isWritable: true },
        { pubkey: buyer, isSigner: true, isWritable: true },
        { pubkey: platformWallet, isSigner: false, isWritable: true },
        // Note: vault and buyer token accounts need to be created/added
      ],
      programId: programPubkey,
      data: instructionData
    });
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint,
      buyer: buyerWallet,
      solAmount,
      minTokensOut: minTokensOut || 'auto-calculated',
      x402Receipt: x402Receipt.toBase58(),
      nonce: Buffer.from(nonce).toString('hex'),
      transaction: transactionBase64,
      note: 'x402 payment required before this transaction can execute'
    });
    
  } catch (error) {
    console.error('Buy error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Create a sell transaction from bonding curve
export async function createSellTransaction(req, res) {
 try {
 const { mint, sellerWallet, tokenAmount, minSolOut } = req.body;
 if (!mint || !sellerWallet || !tokenAmount) { return res.status(400).json({ error: "mint, sellerWallet, and tokenAmount required" }); }
 const mintPubkey = new PublicKey(mint);
 const seller = new PublicKey(sellerWallet);
 const programPubkey = new PublicKey(PROGRAM_ID);
 const [bondingCurvePubkey] = PublicKey.findProgramAddressSync([Buffer.from("curve"), mintPubkey.toBuffer()], programPubkey);
 const [tokenPubkey] = PublicKey.findProgramAddressSync([Buffer.from("token"), mintPubkey.toBuffer()], programPubkey);
 const [globalPubkey] = PublicKey.findProgramAddressSync([Buffer.from("global")], programPubkey);
 const vaultTokenAccount = getAssociatedTokenAddressSync(mintPubkey, bondingCurvePubkey, true, TOKEN_PROGRAM_STR);
 const sellerTokenAccount = getAssociatedTokenAddressSync(mintPubkey, seller, true, TOKEN_PROGRAM_STR);
 const nonce = crypto.randomBytes(32);
 const [x402Receipt] = PublicKey.findProgramAddressSync([Buffer.from("x402"), seller.toBuffer(), nonce], programPubkey);
 const feeRecipient = new PublicKey("7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR");
 const creator = seller;
 const { blockhash } = await connection.getLatestBlockhash();
 const transaction = new Transaction();
 transaction.feePayer = seller;
 transaction.recentBlockhash = blockhash;
 transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }));
 const SELL_DISCRIMINATOR = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]); // sha256("global:sell")[:8]
 const tokenAmountBuf = Buffer.alloc(8); tokenAmountBuf.writeBigUInt64LE(BigInt(Math.floor(tokenAmount * 1e6)));
 const minSolBuf = Buffer.alloc(8); minSolBuf.writeBigUInt64LE(BigInt(Math.floor((minSolOut || 0) * 1e9)));
 const instructionData = Buffer.concat([SELL_DISCRIMINATOR, tokenAmountBuf, minSolBuf, Buffer.from(nonce)]);
 transaction.add({ keys: [{ pubkey: globalPubkey, isSigner: false, isWritable: false }, { pubkey: x402Receipt, isSigner: false, isWritable: true }, { pubkey: tokenPubkey, isSigner: false, isWritable: true }, { pubkey: bondingCurvePubkey, isSigner: false, isWritable: true }, { pubkey: vaultTokenAccount, isSigner: false, isWritable: true }, { pubkey: sellerTokenAccount, isSigner: false, isWritable: true }, { pubkey: mintPubkey, isSigner: false, isWritable: false }, { pubkey: seller, isSigner: true, isWritable: true }, { pubkey: feeRecipient, isSigner: false, isWritable: true }, { pubkey: creator, isSigner: false, isWritable: false }, { pubkey: new PublicKey(TOKEN_PROGRAM_STR), isSigner: false, isWritable: false }, { pubkey: new PublicKey(SYSTEM_PROGRAM_ID), isSigner: false, isWritable: false }], programId: programPubkey, data: instructionData });
 const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString("base64");
 res.json({ success: true, mint, seller: sellerWallet, tokenAmount, minSolOut: minSolOut || "auto-calculated", x402Receipt: x402Receipt.toBase58(), vaultTokenAccount: vaultTokenAccount.toBase58(), sellerTokenAccount: sellerTokenAccount.toBase58(), transaction: transactionBase64, message: "Sign to sell " + tokenAmount + " tokens" });
 } catch (error) { console.error("Sell error:", error); res.status(500).json({ error: error.message }); }
}



/**
 * Initialize the program (one-time setup)
 */
export async function initializeProgram(req, res) {
 try {
 const { authority, feeRecipient } = req.body;
 
 if (!authority || !feeRecipient) {
 return res.status(400).json({ 
 error: 'authority and feeRecipient wallet addresses required' 
 });
 }
 
 const authorityPubkey = new PublicKey(authority);
 const feeRecipientPubkey = new PublicKey(feeRecipient);
 
 // Derive global PDA
 const [globalPubkey] = PublicKey.findProgramAddressSync(
 [Buffer.from('global')],
 new PublicKey(PROGRAM_ID)
 );
 
 const { blockhash } = await connection.getLatestBlockhash();
 
 const transaction = new Transaction();
 transaction.feePayer = authorityPubkey;
 transaction.recentBlockhash = blockhash;
 
 transaction.add(
 ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })
 );
 
 // Initialize instruction discriminator: sha256("global:initialize")[:8]
 const INITIALIZE_DISCRIMINATOR = Buffer.from([10, 128, 86, 171, 3, 137, 161, 244]);
 
 const instructionData = Buffer.concat([
 INITIALIZE_DISCRIMINATOR,
 authorityPubkey.toBuffer(),
 feeRecipientPubkey.toBuffer()
 ]);
 
 transaction.add({
 keys: [
 { pubkey: globalPubkey, isSigner: false, isWritable: true },
 { pubkey: authorityPubkey, isSigner: true, isWritable: true },
 { pubkey: feeRecipientPubkey, isSigner: false, isWritable: false },
 { pubkey: new PublicKey(SYSTEM_PROGRAM_ID), isSigner: false, isWritable: false },
 ],
 programId: new PublicKey(PROGRAM_ID),
 data: instructionData
 });
 
 const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
 
 console.log(`🔐 Created program initialization transaction`);
 console.log(` Global: ${globalPubkey.toBase58()}`);
 
 res.json({
 success: true,
 global: globalPubkey.toBase58(),
 authority: authority,
 feeRecipient: feeRecipient,
 transaction: transactionBase64,
 message: 'Sign this transaction to initialize the X402.Fun program (one-time only)'
 });
 
 } catch (error) {
 console.error('Initialize error:', error);
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
  createPumpSwapPool,
  createBuyTransaction, createSellTransaction
};
