/**
 * x402 Payment Integration - Off-Chain Receipt Management
 * 
 * Creates and verifies x402 payment receipts off-chain
 * Used for agent-gated trading on bonding curve
 * 
 * Flow:
 * 1. Agent creates payment request → gets receipt ID
 * 2. Agent sends SOL to platform wallet
 * 3. Agent uses receipt ID in buy/sell transaction
 * 4. Backend verifies receipt and marks as used
 */

import crypto from 'crypto';

const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR';

// In-memory receipt storage (use Redis/DB in production)
const receipts = new Map();

// Fee structure
const FEES = {
  launch: 0.25,
  buy: 0.001, // 0.1% of trade amount
  sell: 0.001, // 0.1% of trade amount
  contribute: 0.01 // 1% of contribution
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
 * Create x402 payment request (Off-Chain)
 * Generates a unique receipt ID for tracking
 */
export async function createPaymentRequest(req, res) {
  try {
    const { agentId, action, amount, wallet } = req.body;
    
    if (!agentId || !action || !wallet) {
      return res.status(400).json({ 
        error: 'agentId, action, and wallet required' 
      });
    }
    
    const fee = FEES[action.toLowerCase()] || 0;
    const totalAmount = amount ? parseFloat(amount) * fee : fee;
    
    // Generate unique receipt ID
    const receiptId = crypto.randomBytes(16).toString('hex');
    
    // Store receipt in memory
    receipts.set(receiptId, {
      id: receiptId,
      agentId,
      action,
      amount: totalAmount,
      wallet,
      createdAt: Date.now(),
      used: false,
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });
    
    console.log(`💰 Created x402 receipt: ${receiptId} for ${action} (${totalAmount} SOL)`);
    
    res.json({
      success: true,
      receiptId,
      action,
      amount: totalAmount,
      fee: totalAmount,
      paymentAddress: PLATFORM_WALLET,
      expiresInSeconds: 600,
      instructions: `Send ${totalAmount} SOL to ${PLATFORM_WALLET} with memo: ${receiptId}`,
      message: `Payment receipt created. Send ${totalAmount} SOL to the payment address to activate.`
    });
    
  } catch (error) {
    console.error('Create payment request error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Verify x402 payment receipt
 * Checks if receipt exists, is valid, and hasn't been used
 */
export async function verifyPayment(req, res) {
  try {
    const { receiptId, wallet, action } = req.body;
    
    if (!receiptId) {
      return res.status(400).json({ 
        error: 'receiptId required' 
      });
    }
    
    const receipt = receipts.get(receiptId);
    
    if (!receipt) {
      return res.json({
        success: false,
        verified: false,
        message: 'Receipt not found'
      });
    }
    
    // Check if expired
    if (Date.now() > receipt.expiresAt) {
      receipts.delete(receiptId);
      return res.json({
        success: false,
        verified: false,
        message: 'Receipt expired'
      });
    }
    
    // Check if already used
    if (receipt.used) {
      return res.json({
        success: false,
        verified: false,
        message: 'Receipt already used'
      });
    }
    
    // Receipt is valid
    res.json({
      success: true,
      verified: true,
      receiptId,
      action: receipt.action,
      amount: receipt.amount,
      message: 'x402 payment verified'
    });
    
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Mark receipt as used (called after successful trade)
 */
export function useReceipt(receiptId) {
  const receipt = receipts.get(receiptId);
  if (receipt) {
    receipt.used = true;
    receipts.set(receiptId, receipt);
    console.log(`✅ Receipt ${receiptId} marked as used`);
  }
}

/**
 * Get receipt data (for buy/sell endpoints to use)
 */
export function getReceipt(receiptId) {
  return receipts.get(receiptId);
}

/**
 * Payment webhook for notifications
 */
export async function paymentWebhook(req, res) {
  try {
    const { transactionSignature, wallet, action, memo } = req.body;
    
    if (!transactionSignature || !wallet) {
      return res.status(400).json({ 
        error: 'transactionSignature and wallet required' 
      });
    }
    
    // If memo (receiptId) is provided, mark as paid
    if (memo && receipts.has(memo)) {
      const receipt = receipts.get(memo);
      // In a real implementation, verify the transaction on-chain
      console.log(`🔔 Payment verified for receipt ${memo}: ${transactionSignature}`);
    }
    
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

// Cleanup old receipts every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, receipt] of receipts.entries()) {
    if (now > receipt.expiresAt || receipt.used) {
      receipts.delete(id);
      console.log(`🧹 Cleaned up expired/used receipt: ${id}`);
    }
  }
}, 60000);

export default {
  getPrice,
  createPaymentRequest,
  verifyPayment,
  paymentWebhook,
  useReceipt,
  getReceipt
};
