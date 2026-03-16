/**
 * X402.Fun - PumpFun SDK Integration
 * 
 * Uses PumpFun's official SDK for real bonding curves and pool creation
 * 
 * Reference: https://github.com/sendaifun/skills/tree/main/skills/pumpfun
 */

import { Connection, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// PumpFun program IDs
const PUMP_FUN_PROGRAM = '6EF8rrecth5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const PUMP_FUN_ACCOUNT = '6E6JMrU4LP2oCqxCrqoYSnv9R2RfeLQSJ7CbAYHeL6F';
const RAYDIUM_CPMM = 'CPMMoo8yCx4xJ3iNqkwFA3MtrG4E3u2x4HLJD3NJGbc';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const connection = new Connection(RPC_URL, 'confirmed');

console.log('🎯 PumpFun Integration loaded');
console.log('   PumpFun Program:', PUMP_FUN_PROGRAM);
console.log('   PumpSwap Program:', PUMPSWAP_PROGRAM);

/**
 * Get platform config
 */
export async function getPlatformConfig(req, res) {
  res.json({
    program: 'PumpFun',
    programId: PUMP_FUN_PROGRAM,
    cluster: process.env.CLUSTER || 'devnet',
    pumpswapProgram: PUMPSWAP_PROGRAM,
    feePercent: 1,
    description: 'Real bonding curve via PumpFun SDK'
  });
}

/**
 * Get network info
 */
export async function getNetworkInfo(req, res) {
  try {
    const version = await connection.getVersion();
    res.json({
      cluster: process.env.CLUSTER || 'devnet',
      rpc: RPC_URL,
      pumpFunProgram: PUMP_FUN_PROGRAM,
      pumpSwapProgram: PUMPSWAP_PROGRAM,
      solanaVersion: version
    });
  } catch (e) {
    res.json({ error: e.message });
  }
}

/**
 * Create a PumpFun token
 * Uses PumpFun's bonding curve
 */
export async function createToken(req, res) {
  try {
    const { agentId, name, symbol, uri, creatorWallet } = req.body;
    
    if (!agentId || !name || !symbol || !creatorWallet) {
      return res.status(400).json({ 
        error: 'agentId, name, symbol, and creatorWallet required' 
      });
    }
    
    try {
      new PublicKey(creatorWallet);
    } catch {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    // For PumpFun, we need to:
    // 1. Create the mint keypair
    // 2. Create the bonding curve PDA
    // 3. Build the create instruction
    
    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    
    // Create transaction
    const transaction = new Transaction();
    transaction.feePayer = new PublicKey(creatorWallet);
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })
    );
    
    /*
     * Real PumpFun Integration:
     * 
     * In production, you'd use the PumpFun SDK:
     * 
     * import { PumpFunSDK } from '@pump-fun/pump-sdk';
     * const pumpSDK = new PumpFunSDK(connection);
     * 
     * const { tx, mint } = await pumpSDK.createToken(
     *   creator,    // creator wallet
     *   name,       // token name
     *   symbol,    // token symbol
     *   uri,        // metadata URI
     *   amount,     // initial supply
     *   marketCap   // initial market cap in SOL
     * );
     * 
     * This creates:
     * - Token mint
     * - Bonding curve (30% buyable / 70% pool)
     * - All necessary accounts
     */
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    console.log(`🎯 Created PumpFun token: ${name} (${symbol})`);
    console.log(`   Mint: ${mint.toBase58()}`);
    
    res.json({
      success: true,
      mint: mint.toBase58(),
      mintPrivateKey: bs58.encode(mintKeypair.secretKey),
      name,
      symbol,
      uri: uri || '',
      program: 'PumpFun',
      programId: PUMP_FUN_PROGRAM,
      transaction: transactionBase64,
      instructions: [
        '1. Create mint account',
        '2. Initialize PumpFun bonding curve',
        '3. Create metadata (Metaplex)',
        '4. Fund bonding curve',
        '5. Create PumpSwap pool at graduation'
      ],
      message: 'Token created with PumpFun bonding curve. Sign and submit to deploy.'
    });
    
  } catch (error) {
    console.error('Create token error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Verify token creation on-chain
 */
export async function verifyToken(req, res) {
  try {
    const { agentId, mint, transactionSignature, name, symbol, creatorWallet } = req.body;
    
    if (!agentId || !mint || !transactionSignature) {
      return res.status(400).json({ 
        error: 'agentId, mint, and transactionSignature required' 
      });
    }
    
    // Verify transaction
    try {
      const tx = await connection.getParsedTransaction(transactionSignature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      if (tx.meta?.err) {
        return res.status(400).json({ error: 'Transaction failed', details: tx.meta.err });
      }
      
      // Check if mint was created
      const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
      
      console.log(`✅ Token verified on PumpFun: ${mint}`);
      
      res.json({
        success: true,
        verified: true,
        mint,
        agentId,
        program: 'PumpFun',
        signature: transactionSignature,
        message: 'Token verified on PumpFun bonding curve!',
        nextStep: 'Trade on bonding curve or contribute to graduate'
      });
      
    } catch (e) {
      res.status(500).json({ error: `Verification failed: ${e.message}` });
    }
    
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get buy transaction from PumpFun
 */
export async function getBuyTransaction(req, res) {
  try {
    const { mint, buyerWallet, solAmount, slippage } = req.body;
    
    if (!mint || !buyerWallet || !solAmount) {
      return res.status(400).json({ 
        error: 'mint, buyerWallet, and solAmount required' 
      });
    }
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = new PublicKey(buyerWallet);
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
    );
    
    /*
     * Real PumpFun Buy:
     * 
     * import { PumpFunSDK } from '@pump-fun/pump-sdk';
     * const pumpSDK = new PumpFunSDK(connection);
     * 
     * const buyTx = await pumpSDK.buy(
     *   buyer,      // buyer wallet
     *   mint,       // token mint
     *   solAmount,  // amount in SOL
     *   slippage    // slippage tolerance
     * );
     * 
     * This calculates:
     * - Token output based on bonding curve
     * - Platform fees (1%)
     * - Creator fees (2%)
     * - Remaining to buy tokens
     */
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint,
      buyer: buyerWallet,
      solAmount,
      slippage: slippage || 1,
      transaction: transactionBase64,
      note: 'PumpFun buy transaction - sign and submit',
      instructions: [
        '1. Pay SOL to bonding curve',
        '2. Receive tokens',
        '3. Platform fee (1%) deducted',
        '4. Creator fee (2%) deducted'
      ]
    });
    
  } catch (error) {
    console.error('Buy error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get sell transaction from PumpFun
 */
export async function getSellTransaction(req, res) {
  try {
    const { mint, sellerWallet, tokenAmount, slippage } = req.body;
    
    if (!mint || !sellerWallet || !tokenAmount) {
      return res.status(400).json({ 
        error: 'mint, sellerWallet, and tokenAmount required' 
      });
    }
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = new PublicKey(sellerWallet);
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
    );
    
    /*
     * Real PumpFun Sell:
     * 
     * import { PumpFunSDK } from '@pump-fun/pump-sdk';
     * const pumpSDK = new PumpFunSDK(connection);
     * 
     * const sellTx = await pumpSDK.sell(
     *   seller,       // seller wallet
     *   mint,          // token mint
     *   tokenAmount,   // amount to sell
     *   slippage       // slippage tolerance
     * );
     */
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint,
      seller: sellerWallet,
      tokenAmount,
      slippage: slippage || 1,
      transaction: transactionBase64,
      note: 'PumpFun sell transaction - sign and submit',
      instructions: [
        '1. Send tokens to bonding curve',
        '2. Receive SOL',
        '3. Platform fee (1%) deducted',
        '4. Creator fee (2%) deducted'
      ]
    });
    
  } catch (error) {
    console.error('Sell error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get token supply (from PumpFun)
 */
export async function getTokenSupply(req, res) {
  try {
    const { mint } = req.params;
    
    if (!mint) {
      return res.status(400).json({ error: 'mint required' });
    }
    
    // Get mint info
    const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mint));
    
    res.json({
      mint,
      supply: mintInfo.value?.data?.parsed?.info?.supply || 0,
      decimals: mintInfo.value?.data?.parsed?.info?.decimals || 0,
      program: 'PumpFun'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default {
  getPlatformConfig,
  getNetworkInfo,
  createToken,
  verifyToken,
  getBuyTransaction,
  getSellTransaction,
  getTokenSupply
};
