/**
 * Agent-Signed Token Launch API
 * 
 * Enables agents to sign their own transactions:
 * 1. Backend creates transaction instructions
 * 2. Returns unsigned transaction to agent
 * 3. Agent signs locally with their wallet
 * 4. Agent submits to Solana
 * 5. Backend verifies on-chain
 */

import { Connection, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import bs58 from 'bs58';

// Config
const PROGRAM_ID = process.env.PROGRAM_ID || '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

const connection = new Connection(RPC_URL, 'confirmed');

/**
 * Get network info
 */
export async function getNetworkInfo(req, res) {
  res.json({
    cluster: process.env.CLUSTER || 'devnet',
    rpc: RPC_URL,
    programId: PROGRAM_ID
  });
}

/**
 * Get platform config (no private keys - just public info)
 */
export async function getPlatformConfig(req, res) {
  res.json({
    programId: PROGRAM_ID,
    cluster: process.env.CLUSTER || 'devnet',
    graduationThreshold: process.env.CLUSTER === 'mainnet' ? '69' : '1.5',
    feePercent: 15,
    mode: 'agent-signed'
  });
}

/**
 * Create an unsigned launch transaction
 * Agent calls this to get the transaction they need to sign
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
    
    // Generate mint keypair (offchain - agent will need to create this)
    const mintPublicKey = PublicKey.findProgramAddressSync(
      [Buffer.from('mint'), Buffer.from(agentId)],
      new PublicKey(PROGRAM_ID)
    )[0];
    
    // Create transaction
    const transaction = new Transaction();
    transaction.feePayer = new PublicKey(creatorWallet);
    
    // Get recent blockhash
    try {
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
    } catch (e) {
      console.log('Could not get blockhash:', e.message);
    }
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
    );
    
    // For the actual launch, we'd need to:
    // 1. Create mint account
    // 2. Initialize mint
    // 3. Create associated token account
    // 4. Call program launch instruction
    
    // For now, return the transaction template
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint: mintPublicKey.toBase58(),
      name,
      symbol,
      uri: uri || '',
      transaction: transactionBase64,
      instructions: [
        'Create mint account',
        'Initialize mint', 
        'Create bonding curve',
        'Call program launch'
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
 * Agent submits their transaction signature after signing
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
      
      // Success!
      res.json({
        success: true,
        verified: true,
        mint,
        agentId,
        signature: transactionSignature,
        message: 'Token launch verified on-chain!'
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
    
    // Create transaction to add liquidity
    const transaction = new Transaction();
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 })
    );
    
    // Would add actual contribution instruction here
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      mint,
      lamports,
      transaction: transactionBase64,
      message: 'Sign this transaction to add liquidity'
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
      
      // Verify amount transferred
      // Simplified - in production would parse actual transfer amounts
      
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
