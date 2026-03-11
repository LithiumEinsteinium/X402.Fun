/**
 * x402 Payment Integration
 * 
 * Handle payments for token launches and API usage
 */

import { Request, Response } from 'express';

// In production, this would verify x402 payment headers
// and handle USDC settlements

/**
 * Get payment price for action
 * GET /api/x402/price?action=launch
 */
export async function getPrice(req, res) {
  const { action } = req.query;
  
  const prices = {
    'launch': { usdc: 25, description: 'Token launch fee' },
    'buy': { usdc: 0, description: 'Trading fees only' },
    'collaborate': { usdc: 0, description: 'Free' },
    'api': { usdc: 0.01, description: 'Per API call' }
  };
  
  const price = prices[action] || prices['api'];
  
  res.json({
    action,
    price: price.usdc,
    currency: 'USDC',
    description: price.description,
    paymentAddress: process.env.PLATFORM_WALLET || '0x0666c680b4bE9a7c25d2A9Ce971Ac8192FFc9B80'
  });
}

/**
 * Verify payment
 * POST /api/x402/verify
 * 
 * Body: { paymentHeader, action }
 */
export async function verifyPayment(req, res) {
  try {
    const { paymentHeader, action } = req.body;
    
    if (!paymentHeader) {
      return res.status(402).json({ 
        error: 'Payment required',
        price: getPriceForAction(action)
      });
    }
    
    // In production:
    // 1. Parse x402 payment header
    // 2. Verify signature
    // 3. Confirm on-chain settlement
    
    // For now, we'll simulate verification
    const isValid = verifyMockPayment(paymentHeader, action);
    
    if (!isValid) {
      return res.status(402).json({ 
        error: 'Invalid payment',
        price: getPriceForAction(action)
      });
    }
    
    res.json({
      valid: true,
      action,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create payment request
 * POST /api/x402/create
 * 
 * Body: { action, agentId }
 */
export async function createPaymentRequest(req, res) {
  try {
    const { action, agentId } = req.body;
    
    if (!action || !agentId) {
      return res.status(400).json({ error: 'Action and agent ID required' });
    }
    
    const price = getPriceForAction(action);
    
    // Generate payment request
    const requestId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    res.json({
      requestId,
      action,
      price,
      paymentAddress: process.env.PLATFORM_WALLET || '0x0666c680b4bE9a7c25d2A9Ce971Ac8192FFc9B80',
      chain: 'base',
      token: 'USDC',
      instructions: [
        `Send ${price} USDC to ${process.env.PLATFORM_WALLET || '0x0666c680b4bE9a7c25d2A9Ce971Ac8192FFc9B80'}`,
        'Include your agent ID in transaction data',
        'Wait for confirmation'
      ]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Webhook for payment confirmation
 * POST /api/x402/webhook
 */
export async function paymentWebhook(req, res) {
  try {
    const { requestId, txHash, agentId } = req.body;
    
    // In production, verify on-chain transaction
    
    res.json({
      received: true,
      requestId,
      confirmed: true // Simulated
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Helper functions
function getPriceForAction(action) {
  const prices = {
    'launch': 25,
    'buy': 0,
    'sell': 0,
    'collaborate': 0,
    'api': 0.01
  };
  return prices[action] || 0;
}

function verifyMockPayment(header, action) {
  // In production, implement real x402 verification
  // For now, accept any header for testing
  return !!header;
}

export default {
  getPrice,
  verifyPayment,
  createPaymentRequest,
  paymentWebhook
};
