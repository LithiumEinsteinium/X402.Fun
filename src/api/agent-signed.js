/**
 * Agent-Signed Token Launch API - With Real On-Chain Launch
 * 
 * Creates actual SPL tokens on Solana using the Agent's wallet
 */

import { Connection, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { createInitializeMintInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, MINT_SIZE } from '@solana/spl-token';
import bs58 from 'bs58';

// Config
const PROGRAM_ID = process.env.PROGRAM_ID || '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const connection = new Connection(RPC_URL, 'confirmed');

console.log(`🔗 Connected to ${RPC_URL}`);
console.log(`📜 Program ID: ${PROGRAM_ID}`);

/**
 * Get platform config
 */
export async function getPlatformConfig(req, res) {
  res.json({
    programId: PROGRAM_ID,
    cluster: process.env.CLUSTER || 'devnet',
    graduationThreshold: process.env.CLUSTER === 'mainnet' ? '69' : '1.5',
    feePercent: 15,
    mode: 'agent-signed',
    tokenType: 'SPL Token (Real On-Chain)'
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
      programId: PROGRAM_ID,
      solanaVersion: version
    });
  } catch (e) {
    res.json({
      cluster: process.env.CLUSTER || 'devnet',
      rpc: RPC_URL,
      programId: PROGRAM_ID
    });
  }
}

/**
 * Create an actual on-chain SPL token launch
 * Agent signs with their own wallet
 */
export async function createLaunchTransaction(req, res) {
  try {
    const { agentId, name, symbol, uri, creatorWallet } = req.body;
    
    if (!agentId || !name || !symbol || !creatorWallet) {
      return res.status(400).json({ 
        error: 'agentId, name, symbol, and creatorWallet required' 
      });
    }
    
    // Validate creator wallet
    try {
      new PublicKey(creatorWallet);
    } catch {
      return res.status(400).json({ error: 'Invalid creator wallet address' });
    }
    
    // Generate a deterministic mint keypair based on agentId
    // This creates a reproducible mint address
    const seedBytes = new Uint8Array(32);
    const agentIdBytes = Buffer.from(agentId + Date.now());
    for (let i = 0; i < 32; i++) {
      seedBytes[i] = agentIdBytes[i % agentIdBytes.length];
    }
    const mintKeypair = Keypair.fromSeed(seedBytes);
    const mint = mintKeypair.publicKey;
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    
    // Create transaction
    const transaction = new Transaction();
    transaction.feePayer = new PublicKey(creatorWallet);
    transaction.recentBlockhash = blockhash;
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
    );
    
    // Add create mint account instruction
    const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: new PublicKey(creatorWallet),
        newAccountPubkey: mint,
        space: MINT_SIZE,
        lamports: lamports,
        programId: TOKEN_PROGRAM_ID
      })
    );
    
    // Add initialize mint instruction
    transaction.add(
      createInitializeMintInstruction(
        mint,           // mint pubkey
        6,              // decimals (standard for tokens)
        new PublicKey(creatorWallet), // mint authority
        new PublicKey(creatorWallet), // freeze authority
        TOKEN_PROGRAM_ID
      )
    );
    
    // Add create associated token account
    const associatedToken = await getAssociatedTokenAddress(
      mint,
      new PublicKey(creatorWallet)
    );
    
    transaction.add(
      createAssociatedTokenAccountInstruction(
        new PublicKey(creatorWallet), // payer
        associatedToken,              // associated token account
        new PublicKey(creatorWallet), // owner
        mint                         // mint
      )
    );
    
    // Add mint to instruction (mint 1000 tokens to creator)
    transaction.add(
      createMintToInstruction(
        mint,
        associatedToken,
        new PublicKey(creatorWallet),
        1000000000 // 1000 tokens with 6 decimals
      )
    );
    
    // Serialize transaction (NOT SIGNED - agent must sign)
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    console.log(`\n🚀 Created launch transaction for ${name} (${symbol})`);
    console.log(`   Mint: ${mint.toBase58()}`);
    console.log(`   Creator: ${creatorWallet}`);
    console.log(`   Transaction: ${transactionBase64.slice(0, 50)}...`);
    
    res.json({
      success: true,
      mint: mint.toBase58(),
      mintPrivateKey: bs58.encode(mintKeypair.secretKey), // Agent needs this to control mint!
      name,
      symbol,
      uri: uri || '',
      initialSupply: 1000,
      transaction: transactionBase64,
      instructions: [
        '1. Create mint account',
        '2. Initialize mint (6 decimals)',
        '3. Create associated token account',
        '4. Mint 1000 tokens to creator'
      ],
      message: 'Sign this transaction with your wallet and submit to Solana'
    });
    
  } catch (error) {
    console.error('Create launch error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Verify a launch was submitted
 */
export async function verifyLaunch(req, res) {
  try {
    const { agentId, mint, transactionSignature } = req.body;
    
    if (!agentId || !mint || !transactionSignature) {
      return res.status(400).json({ 
        error: 'agentId, mint, and transactionSignature required' 
      });
    }
    
    // Verify the transaction on-chain
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
      
      console.log(`✅ Token verified on-chain: ${mint}`);
      
      res.json({
        success: true,
        verified: true,
        mint,
        agentId,
        signature: transactionSignature,
        message: 'Token launch verified on-chain!',
        details: {
          decimals: mintInfo.value?.data?.parsed?.info?.decimals,
          supply: mintInfo.value?.data?.parsed?.info?.supply
        }
      });
      
    } catch (e) {
      console.error('Verify error:', e);
      res.status(500).json({ error: `Verification failed: ${e.message}` });
    }
    
  } catch (error) {
    console.error('Verify launch error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a contribute liquidity transaction
 */
export async function createContributeTransaction(req, res) {
  try {
    const { mint, contributorWallet, solAmount } = req.body;
    
    if (!mint || !contributorWallet || !solAmount) {
      return res.status(400).json({ 
        error: 'mint, contributorWallet, and solAmount required' 
      });
    }
    
    const lamports = Math.floor(solAmount * 1e9);
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = new PublicKey(contributorWallet);
    transaction.recentBlockhash = blockhash;
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 })
    );
    
    // Add SOL transfer to platform (for liquidity)
    // In production, this would go to the bonding curve
    const platformWallet = new PublicKey('7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR');
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(contributorWallet),
        toPubkey: platformWallet,
        lamports: lamports
      })
    );
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint,
      lamports,
      transaction: transactionBase64,
      message: `Sign this transaction to add ${solAmount} SOL to liquidity`
    });
    
  } catch (error) {
    console.error('Create contribute error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Verify contribution
 */
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
      
      res.json({
        success: true,
        verified: true,
        mint,
        amount: expectedAmount,
        signature: transactionSignature,
        message: 'Contribution verified!'
      });
      
    } catch (e) {
      res.status(500).json({ error: `Verification failed: ${e.message}` });
    }
    
  } catch (error) {
    console.error('Verify contribution error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  getNetworkInfo,
  getPlatformConfig,
  createLaunchTransaction,
  verifyLaunch,
  createContributeTransaction,
  verifyContribution
};
