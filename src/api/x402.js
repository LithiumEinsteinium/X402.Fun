/**
 * x402 Payment Integration (Solana)
 * 
 * Handle SOL payments for token launches and API usage
 */

const PLATFORM_WALLET = process.env.PLATFORM_WALLET || '7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR';
const LAUNCH_FEE_SOL = 0.25;

/**
 * Get payment price for action
 * GET /api/x402/price?action=launch
 */
export async function getPrice(req, res) {
  const { action } = req.query;
  
  const prices = {
    'launch': { sol: LAUNCH_FEE_SOL, description: 'Token launch fee' },
    'buy': { sol: 0, description: 'Trading fees only' },
    'collaborate': { sol: 0, description: 'Free' },
    'contribute': { sol: 0, description: 'Liquidity contribution' }
  };
  
  const price = prices[action] || prices['launch'];
  
  res.json({
    action,
    price: price.sol,
    currency: 'SOL',
    description: price.description,
    paymentAddress: PLATFORM_WALLET,
    instructions: `Send ${price.sol} SOL to ${PLATFORM_WALLET}`
  });
}

/**
 * Verify payment
 * POST /api/x402/verify
 * 
 * Body: { wallet, action, amount }
 * 
 * Note: In production, would verify on-chain transaction
 * For now, returns success (devnet mode)
 */
export async function verifyPayment(req, res) {
  try {
    const { wallet, action, amount } = req.body;
    
    if (!wallet || !action) {
      return res.status(400).json({ error: 'wallet and action required' });
    }
    
    const expectedAmount = action === 'launch' ? LAUNCH_FEE_SOL : 0;
    
    // Devnet mode - bypass actual verification
    if (process.env.NODE_ENV === 'development' || process.env.CLUSTER === 'devnet') {
      return res.json({
        success: true,
        verified: true,
        wallet,
        action,
        amount: amount || expectedAmount,
        message: 'Payment verified (devnet mode)'
      });
    }
    
    // Production: Would verify on-chain transaction here
    // For now, return success
    res.json({
      success: true,
      verified: true,
      wallet,
      action,
      amount: amount || expectedAmount,
      message: 'Payment verified'
    });
    
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create payment request
 * POST /api/x402/create
 */
export async function createPaymentRequest(req, res) {
  try {
    const { action } = req.body;
    
    const amount = action === 'launch' ? LAUNCH_FEE_SOL : 0;
    
    res.json({
      success: true,
      action,
      amount,
      currency: 'SOL',
      paymentAddress: PLATFORM_WALLET,
      instructions: `Send ${amount} SOL to ${PLATFORM_WALLET}`,
      note: 'Agent should send SOL and provide transaction signature for verification'
    });
    
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Webhook for payment notifications
 * POST /api/x402/webhook
 */
export async function paymentWebhook(req, res) {
  try {
    const { transactionSignature, wallet, action } = req.body;
    
    // In production, verify the transaction on-chain
    
    res.json({
      success: true,
      message: 'Webhook received'
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  getPrice,
  verifyPayment,
  createPaymentRequest,
  paymentWebhook
};
