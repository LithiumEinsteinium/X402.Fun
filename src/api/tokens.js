/**
 * Token Launch & Trading API
 * 
 * Bonding curve implementation similar to Pump.fun
 * Multi-agent collaboration support
 */

const tokens = new Map();
const bondingCurves = new Map();

const GRADUATION_MARKET_CAP = 12000; // $12K
const PLATFORM_FEE = 0.01; // 1%

/**
 * Launch a new token
 * POST /api/tokens/launch
 * 
 * Body: { agentId, name, symbol, uri, initialLiquiditySol }
 */
export async function launchToken(req, res) {
  try {
    const { agentId, name, symbol, uri, initialLiquiditySol } = req.body;
    
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
      marketCap: 0
    };
    
    const token = {
      id: tokenId,
      mint: mintAddress,
      name,
      symbol,
      uri: uri || '',
      agentId,
      bondingCurve,
      collaborators: [],
      graduated: false,
      createdAt: new Date().toISOString()
    };
    
    tokens.set(tokenId, token);
    bondingCurves.set(mintAddress, bondingCurve);
    
    res.json({
      success: true,
      token: {
        id: token.id,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        bondingCurve: {
          marketCap: 0,
          price: calculatePrice(bondingCurve)
        }
      }
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
    return res.status(404).json({ error: 'Token not found' });
  }
  
  const curve = bondingCurves.get(token.mint);
  
  res.json({
    token: {
      ...token,
      bondingCurve: curve ? {
        marketCap: calculateMarketCap(curve),
        price: calculatePrice(curve),
        virtualSolReserves: curve.virtualSolReserves.toString(),
        virtualTokenReserves: curve.virtualTokenReserves.toString(),
        totalBuys: curve.totalBuys,
        totalSells: curve.totalSells
      } : null
    }
  });
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
    tokens: tokenList.map(t => ({
      ...t,
      bondingCurve: undefined // Remove curve data for list
    }))
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
    curve.totalBuys++;
    
    // Calculate market cap
    const marketCap = calculateMarketCap(curve);
    curve.marketCap = marketCap;
    
    // Check for graduation
    if (marketCap >= GRADUATION_MARKET_CAP) {
      curve.complete = true;
      const token = Array.from(tokens.values()).find(t => t.mint === mint);
      if (token) token.graduated = true;
    }
    
    res.json({
      success: true,
      tokensReceived: tokensOut.toString(),
      marketCap,
      price: calculatePrice(curve),
      graduated: curve.complete
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
    curve.totalSells++;
    
    // Deduct platform fee
    const fee = solOut * BigInt(PLATFORM_FEE * 100);
    const netSolOut = solOut - fee;
    
    res.json({
      success: true,
      solReceived: Number(netSolOut) / 1e9,
      marketCap: calculateMarketCap(curve),
      price: calculatePrice(curve)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Add collaborator to token
 * POST /api/tokens/:id/collaborate
 * 
 * Body: { agentId, role, contribution }
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

// Helper functions
function generateMintAddress() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let addr = '';
  for (let i = 0; i < 44; i++) {
    addr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return addr;
}

function calculatePrice(curve) {
  // Price = SOL reserves / Token reserves
  return Number(curve.virtualSolReserves) / Number(curve.virtualTokenReserves);
}

function calculateMarketCap(curve) {
  // Market cap = token supply * price in SOL * SOL price (assume $100)
  const price = calculatePrice(curve);
  return price * Number(curve.tokenTotalSupply) / 1e9 * 100;
}

function calculateBuyOutput(solIn, solReserves, tokenReserves) {
  // Constant product formula with tax
  const tax = solIn / 100n; // 1% tax
  const netSol = solIn - tax;
  return (netSol * tokenReserves) / (solReserves + netSol);
}

function calculateSellOutput(tokensIn, solReserves, tokenReserves) {
  // Constant product formula with tax
  const tax = tokensIn / 100n;
  const netTokens = tokensIn - tax;
  return (netTokens * solReserves) / (tokenReserves + netTokens);
}

export default {
  launchToken,
  getToken,
  listTokens,
  buyTokens,
  sellTokens,
  addCollaborator
};
