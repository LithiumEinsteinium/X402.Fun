/**
 * Token Launch & Trading API with Solana Integration
 * 
 * Bonding curve implementation similar to Pump.fun
 * Multi-agent collaboration support
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { announceLaunch, announceGraduation, announceMilestone } from '../utils/telegram.js';

const PROGRAM_ID = '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF';
const RPC_URL = 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const GRADUATION_LIQUIDITY_SOL = 1_500_000_000; // 1.5 SOL devnet
const GRADUATION_LIQUIDITY_LAMPORTS = BigInt(GRADUATION_LIQUIDITY_SOL);
const PLATFORM_FEE = 0.01; // 1%

const tokens = new Map();
const bondingCurves = new Map();

/**
 * Launch a new token
 * POST /api/tokens/launch
 * 
 * Body: { agentId, name, symbol, uri, creatorWallet }
 */
export async function launchToken(req, res) {
  try {
    const { agentId, name, symbol, uri, creatorWallet } = req.body;
    
    if (!agentId || !name || !symbol) {
      return res.status(400).json({ error: 'Agent ID, name, and symbol required' });
    }
    
    // Generate mint address (in production, this would be created on-chain)
    const mintAddress = generateMintAddress();
    const tokenId = `token_${Date.now()}`;
    
    // Initialize bonding curve
    const bondingCurve = {
      mint: mintAddress,
      virtualTokenReserves: 1_073_000_000_000_000n,
      virtualSolReserves: 30_000_000_000n,
      realTokenReserves: 793_100_000_000_000n,
      realSolReserves: 0n,
      tokenTotalSupply: 1_000_000_000_000_000n,
      complete: false,
      creator: agentId,
      createdAt: new Date().toISOString(),
      totalBuys: 0,
      totalSells: 0,
      liquidity: 0n
    };
    
    const token = {
      id: tokenId,
      mint: mintAddress,
      name,
      symbol,
      uri: uri || '',
      agentId,
      creatorWallet: creatorWallet || '',
      bondingCurve,
      collaborators: [],
      graduated: false,
      createdAt: new Date().toISOString()
    };
    
    tokens.set(tokenId, token);
    bondingCurves.set(mintAddress, bondingCurve);
    
    // Announce on Telegram
    announceLaunch({
      name: token.name,
      symbol: token.symbol,
      creator: token.agentId,
      mint: token.mint
    });
    
    res.json({
      success: true,
      token: {
        id: token.id,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        bondingCurve: {
          liquidity: 0,
          price: calculatePrice(bondingCurve),
          progress: 0
        }
      },
      // Transaction instructions would go here in production
      message: 'Token launched on bonding curve (devnet mock)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get token info
 * GET /api/tokens/:id
 */
export async function getToken(req, res) {
  const { id } = req.params;
  const token = tokens.get(id);
  
  if (!token) {
    // Check by mint address
    const tokenByMint = Array.from(tokens.values()).find(t => t.mint === id);
    if (tokenByMint) {
      return res.json({ token: formatToken(tokenByMint) });
    }
    return res.status(404).json({ error: 'Token not found' });
  }
  
  res.json({ token: formatToken(token) });
}

/**
 * List all tokens
 * GET /api/tokens
 */
export async function listTokens(req, res) {
  const { graduated } = req.query;
  
  let tokenList = Array.from(tokens.values());
  
  if (graduated !== undefined) {
    tokenList = tokenList.filter(t => t.graduated === (graduated === 'true'));
  }
  
  res.json({
    tokens: tokenList.map(formatToken)
  });
}

/**
 * Buy tokens on bonding curve
 * POST /api/tokens/buy
 * 
 * Body: { mint, agentId, solAmount }
 */
export async function buyTokens(req, res) {
  try {
    const { mint, agentId, solAmount } = req.body;
    
    if (!mint || !agentId || !solAmount) {
      return res.status(400).json({ error: 'Mint, agent ID, and SOL amount required' });
    }
    
    const curve = bondingCurves.get(mint);
    if (!curve) {
      return res.status(404).json({ error: 'Bonding curve not found' });
    }
    
    if (curve.complete) {
      return res.status(400).json({ error: 'Token already graduated' });
    }
    
    // Calculate tokens received
    const solIn = BigInt(Math.floor(solAmount * 1e9));
    const tokensOut = calculateBuyOutput(solIn, curve.virtualSolReserves, curve.virtualTokenReserves);
    
    // Update reserves
    curve.virtualSolReserves += solIn;
    curve.virtualTokenReserves -= tokensOut;
    curve.realSolReserves += solIn;
    curve.totalBuys++;
    curve.liquidity = Number(curve.realSolReserves) / 1e9;
    
    // Check for graduation
    const progress = (curve.realSolReserves * 100n) / GRADUATION_LIQUIDITY_LAMPORTS;
    const graduated = curve.realSolReserves >= GRADUATION_LIQUIDITY_LAMPORTS;
    
    if (graduated) {
      curve.complete = true;
      const token = Array.from(tokens.values()).find(t => t.mint === mint);
      if (token) token.graduated = true;
    }
    
    res.json({
      success: true,
      tokensReceived: Number(tokensOut) / 1e9,
      liquidity: curve.liquidity,
      price: calculatePrice(curve),
      progress: Number(progress),
      graduated: curve.complete,
      message: 'Buy executed (devnet mock)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Sell tokens on bonding curve
 * POST /api/tokens/sell
 * 
 * Body: { mint, agentId, tokenAmount }
 */
export async function sellTokens(req, res) {
  try {
    const { mint, agentId, tokenAmount } = req.body;
    
    if (!mint || !agentId || !tokenAmount) {
      return res.status(400).json({ error: 'Mint, agent ID, and token amount required' });
    }
    
    const curve = bondingCurves.get(mint);
    if (!curve) {
      return res.status(404).json({ error: 'Bonding curve not found' });
    }
    
    if (curve.complete) {
      return res.status(400).json({ error: 'Token already graduated' });
    }
    
    const tokensIn = BigInt(Math.floor(tokenAmount * 1e9));
    const solOut = calculateSellOutput(tokensIn, curve.virtualSolReserves, curve.virtualTokenReserves);
    
    // Update reserves
    curve.virtualSolReserves -= solOut;
    curve.virtualTokenReserves += tokensIn;
    curve.realSolReserves -= solOut;
    curve.totalSells++;
    curve.liquidity = Number(curve.realSolReserves) / 1e9;
    
    res.json({
      success: true,
      solReceived: Number(solOut) / 1e9,
      liquidity: curve.liquidity,
      price: calculatePrice(curve)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Add contributor to token
 * POST /api/tokens/:id/collaborate
 */
export async function addCollaborator(req, res) {
  try {
    const { id } = req.params;
    const { agentId, role, contribution } = req.body;
    
    const token = tokens.get(id);
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    const collaborator = {
      agentId,
      role,
      contribution,
      joinedAt: new Date().toISOString()
    };
    
    token.collaborators.push(collaborator);
    
    res.json({
      success: true,
      collaborators: token.collaborators
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Contribute liquidity for graduation
 * POST /api/tokens/:id/contribute
 */
export async function contributeLiquidity(req, res) {
  try {
    const { id } = req.params;
    const { agentId, solAmount } = req.body;
    
    const token = tokens.get(id);
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    const curve = bondingCurves.get(token.mint);
    if (!curve) {
      return res.status(404).json({ error: 'Bonding curve not found' });
    }
    
    if (curve.complete) {
      return res.status(400).json({ error: 'Already graduated' });
    }
    
    // Add liquidity
    const solIn = BigInt(Math.floor(solAmount * 1e9));
    curve.realSolReserves += solIn;
    curve.liquidity = Number(curve.realSolReserves) / 1e9;
    
    const progress = (curve.realSolReserves * 100n) / GRADUATION_LIQUIDITY_LAMPORTS;
    const graduated = curve.realSolReserves >= GRADUATION_LIQUIDITY_LAMPORTS;
    
    if (graduated) {
      curve.complete = true;
      token.graduated = true;
      
      // Announce graduation
      announceGraduation({
        name: token.name,
        symbol: token.symbol,
        creator: token.agentId,
        mint: token.mint
      });
    }
    
    res.json({
      success: true,
      liquidity: curve.liquidity,
      progress: Number(progress),
      graduated: curve.complete,
      target: GRADUATION_LIQUIDITY_SOL,
      message: graduated ? 'Graduated! 🎉' : `${100 - Number(progress)}% to go`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Helper functions
function generateMintAddress() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnopqrstuvwxyz';
  let addr = '';
  for (let i = 0; i < 44; i++) {
    addr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return addr;
}

function calculatePrice(curve) {
  return Number(curve.virtualSolReserves) / Number(curve.virtualTokenReserves);
}

function calculateBuyOutput(solIn, solReserves, tokenReserves) {
  const tax = solIn / 100n;
  const netSol = solIn - tax;
  return (netSol * tokenReserves) / (solReserves + netSol);
}

function calculateSellOutput(tokensIn, solReserves, tokenReserves) {
  const tax = tokensIn / 100n;
  const netTokens = tokensIn - tax;
  return (netTokens * solReserves) / (tokenReserves + netTokens);
}

function formatToken(token) {
  const curve = bondingCurves.get(token.mint);
  const progress = curve ? (Number(curve.realSolReserves) * 100) / GRADUATION_LIQUIDITY_SOL : 0;
  
  return {
    id: token.id,
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    creator: token.agentId,
    graduated: token.graduated,
    collaborators: token.collaborators,
    createdAt: token.createdAt,
    bondingCurve: curve ? {
      liquidity: curve.liquidity,
      price: calculatePrice(curve),
      progress: Math.min(100, progress),
      totalBuys: curve.totalBuys,
      totalSells: curve.totalSells
    } : null
  };
}

export default {
  launchToken,
  getToken,
  listTokens,
  buyTokens,
  sellTokens,
  addCollaborator,
  contributeLiquidity
};
