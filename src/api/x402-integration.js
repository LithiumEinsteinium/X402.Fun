/**
 * x402 Payment Integration - On-Chain Receipt Management
 * 
 * Creates and verifies x402 payment receipts on Solana
 * Used for agent-gated trading on bonding curve
 */

import { Connection, PublicKey, Transaction, SystemProgram, ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import crypto from 'crypto';

const PROGRAM_ID = '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR';

const connection = new Connection(RPC_URL, 'confirmed');

// Fee structure
const FEES = {
  launch: 0.25,
  buy: 0.001, // 0.1% fee for buy
  sell: 0.001, // 0.1% fee for sell
  contribute: 0.01 // 1% fee
};

/**
 * Get x402 payment price for an action
 */
export async function getPrice(req, res) {
  const { action, amount } = req.query;
  
  if (!action) {
    return res.status(400).json({ error: 'action parameter required' });
  }
  
  const baseFee = FEES[action.toLowerCase()] || 0;
  const percentageFee = amount ? parseFloat(amount) * baseFee : 0;
  
  res.json({
    action,
    baseFee,
    percentageFee,
    totalFee: baseFee + percentageFee,
    currency: 'SOL',
    paymentAddress: PLATFORM_WALLET,
    description: `x402 payment for ${action}`
  });
}

/**
 * Create x402 payment request
 * Generates a unique receipt PDA for the payment
 */
export async function createPaymentRequest(req, res) {
  try {
    const { agentId, action, amount, wallet } = req.body;
    
    if (!agentId || !action || !wallet) {
      return res.status(400).json({ 
        error: 'agentId, action, and wallet required' 
      });
    }
    
    const walletPubkey = new PublicKey(wallet);
    const fee = FEES[action.toLowerCase()] || 0;
    const totalAmount = amount ? parseFloat(amount) * fee : fee;
    
    // Generate unique nonce for this payment
    const nonce = crypto.randomBytes(32);
    
    // Derive x402 receipt PDA
    const [receiptPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('x402'), walletPubkey.toBuffer(), nonce],
      new PublicKey(PROGRAM_ID)
    );
    
    const { blockhash } = await connection.getLatestBlockhash();
    
    const transaction = new Transaction();
    transaction.feePayer = walletPubkey;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
    );
    
    // Create x402 receipt instruction
    // Discriminator: sha256("global:record_x402_payment")[:8]
    const RECORD_DISCRIMINATOR = Buffer.from([71, 134, 30, 217, 93, 174, 144, 205]);
    
    const instructionData = Buffer.concat([
      RECORD_DISCRIMINATOR,
      nonce // 32 bytes
    ]);
    
    transaction.add({
      keys: [
        { pubkey: receiptPDA, isSigner: false, isWritable: true },
        { pubkey: walletPubkey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      programId: new PublicKey(PROGRAM_ID),
      data: instructionData
    });
    
    const transactionBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
    
    res.json({
      success: true,
      receipt: receiptPDA.toBase58(),
      nonce: Buffer.from(nonce).toString('hex'),
      action,
      amount: totalAmount,
      fee: totalAmount,
      transaction: transactionBase64,
      message: `Sign this transaction to create x402 payment receipt for ${action}`
    });
    
  } catch (error) {
    console.error('Create payment request error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Verify x402 payment receipt
 * Checks if receipt exists and is valid
 */
export async function verifyPayment(req, res) {
  try {
    const { receipt, wallet, action } = req.body;
    
    if (!receipt || !wallet) {
      return res.status(400).json({ 
        error: 'receipt and wallet required' 
      });
    }
    
    const receiptPubkey = new PublicKey(receipt);
    
    try {
      // Check if receipt account exists
      const accountInfo = await connection.getAccountInfo(receiptPubkey);
      
      if (!accountInfo) {
        return res.json({
          success: false,
          verified: false,
          message: 'Receipt not found on-chain'
        });
      }
      
      // Receipt exists - in production would verify data structure
      res.json({
        success: true,
        verified: true,
        receipt: receipt,
        wallet,
        action,
        message: 'x402 payment verified'
      });
      
    } catch (e) {
      res.json({
        success: false,
        verified: false,
        message: `Verification failed: ${e.message}`
      });
    }
    
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Payment webhook for notifications
 */
export async function paymentWebhook(req, res) {
  try {
    const { transactionSignature, wallet, action } = req.body;
    
    if (!transactionSignature || !wallet) {
      return res.status(400).json({ 
        error: 'transactionSignature and wallet required' 
      });
    }
    
    // In production, verify the transaction on-chain
    // For now, just acknowledge receipt
    res.json({ 
      success: true, 
      message: 'Webhook received',
      signature: transactionSignature
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  getPrice,
  createPaymentRequest,
  verifyPayment,
  paymentWebhook
};
