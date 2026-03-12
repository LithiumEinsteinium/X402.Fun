/**
 * Token Launch & Trading API with Supabase Integration
 */

import { supabase, isSupabaseConfigured } from '../utils/supabase.js';

const GRADUATION_LIQUIDITY_SOL = 1_500_000_000; // 1.5 SOL devnet
const GRADUATION_LIQUIDITY_LAMPORTS = BigInt(GRADUATION_LIQUIDITY_SOL);
const PLATFORM_FEE = 0.01;

// In-memory fallback
const tokens = new Map();
const bondingCurves = new Map();

/**
 * Launch a new token
 */
export async function launchToken(req, res) {
  try {
    const { agentId, name, symbol, uri, creatorWallet } = req.body;
    
    if (!agentId || !name || !symbol) {
      return res.status(400).json({ error: 'Agent ID, name, and symbol required' });
    }
    
    const mintAddress = generateMintAddress();
    const tokenId = `token_${Date.now()}`;
    
    const bondingCurve = {
      mint: mintAddress,
      virtualTokenReserves: 1_073_000_000_000_000n,
      virtualSolReserves: 30_000_000_000n,
      realTokenReserves: 793_100_000_000_000n,
      realSolReserves: 0n,
      tokenTotalSupply: 1_000_000_000_000_000n,
      complete: false,
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
    
    // Try Supabase
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('tokens').insert({
          id: tokenId,
          mint: mintAddress,
          name,
          symbol,
          uri: uri || '',
          creator_agent_id: agentId,
          creator_wallet: creatorWallet || '',
          graduated: false,
          created_at: new Date().toISOString()
        });
        
        await supabase.from('bonding_curves').insert({
          id: tokenId,
          token_id: tokenId,
          virtual_token_reserves: Number(bondingCurve.virtualTokenReserves),
          virtual_sol_reserves: Number(bondingCurve.virtualSolReserves),
          real_token_reserves: Number(bondingCurve.realTokenReserves),
          real_sol_reserves: 0,
          complete: false
        });
      } catch (e) {
        console.log('Supabase insert failed, using memory');
      }
    }
    
    tokens.set(tokenId, token);
    bondingCurves.set(mintAddress, bondingCurve);
    
    // Announce
    const { announceLaunch } = await import('../utils/telegram.js');
    announceLaunch?.({ name, symbol, creator: agentId, mint: mintAddress });
    
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
      message: 'Token launched on bonding curve'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get token info
 */
export async function getToken(req, res) {
  const { id } = req.params;
  
  // Try memory first
  let token = tokens.get(id);
  
  // Try Supabase
  if (!token && isSupabaseConfigured()) {
    try {
      const { data } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', id)
        .single();
      
      if (data) {
        const { data: curveData } = await supabase
          .from('bonding_curves')
          .select('*')
          .eq('token_id', id)
          .single();
        
        token = {
          ...data,
          bondingCurve: curveData ? {
            virtualTokenReserves: BigInt(curveData.virtual_token_reserves),
            virtualSolReserves: BigInt(curveData.virtual_sol_reserves),
            realTokenReserves: BigInt(curveData.real_token_reserves),
            realSolReserves: BigInt(curveData.real_sol_reserves),
            complete: curveData.complete,
            totalBuys: 0,
            totalSells: 0,
            liquidity: Number(curveData.real_sol_reserves) / 1e9
          } : null
        };
      }
    } catch (e) {
      console.log('Supabase query failed');
    }
  }
  
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  res.json({ token: formatToken(token) });
}

/**
 * List all tokens
 */
export async function listTokens(req, res) {
  const { graduated } = req.query;
  
  let tokenList = Array.from(tokens.values());
  
  // Try Supabase
  if (isSupabaseConfigured() && tokens.size === 0) {
    try {
      let query = supabase.from('tokens').select('*').order('created_at', { ascending: false });
      
      const { data } = await query;
      
      if (data && data.length > 0) {
        tokenList = data;
      }
    } catch (e) {
      console.log('Supabase list failed');
    }
  }
  
  if (graduated !== undefined) {
    tokenList = tokenList.filter(t => t.graduated === (graduated === 'true'));
  }
  
  res.json({
    tokens: tokenList.map(formatToken)
  });
}

/**
 * Buy tokens
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
    
    const solIn = BigInt(Math.floor(solAmount * 1e9));
    const tokensOut = calculateBuyOutput(solIn, curve.virtualSolReserves, curve.virtualTokenReserves);
    
    curve.virtualSolReserves += solIn;
    curve.virtualTokenReserves -= tokensOut;
    curve.realSolReserves += solIn;
    curve.totalBuys++;
    curve.liquidity = curve.realSolReserves;
    
    const progress = (curve.realSolReserves * 100n) / GRADUATION_LIQUIDITY_LAMPORTS;
    const graduated = curve.realSolReserves >= GRADUATION_LIQUIDITY_LAMPORTS;
    
    if (graduated) {
      curve.complete = true;
    }
    
    res.json({
      success: true,
      tokensReceived: Number(tokensOut) / 1e9,
      liquidity: Number(curve.liquidity) / 1e9,
      price: calculatePrice(curve),
      progress: Number(progress),
      graduated: curve.complete
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Sell tokens
 */
export async function sellTokens(req, res) {
  try {
    const { mint, agentId, tokenAmount } = req.body;
    
    if (!mint || !agentId || !tokenAmount) {
      return res.status(400).json({ error: 'All fields required' });
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
    
    curve.virtualSolReserves -= solOut;
    curve.virtualTokenReserves += tokensIn;
    curve.realSolReserves -= solOut;
    curve.totalSells++;
    curve.liquidity = curve.realSolReserves;
    
    res.json({
      success: true,
      solReceived: Number(solOut) / 1e9,
      liquidity: Number(curve.liquidity) / 1e9,
      price: calculatePrice(curve)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Add collaborator
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
 * Contribute liquidity
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
    
    const solIn = BigInt(Math.floor(solAmount * 1e9));
    curve.realSolReserves += solIn;
    curve.liquidity = curve.realSolReserves;
    
    const progress = (curve.realSolReserves * 100n) / GRADUATION_LIQUIDITY_LAMPORTS;
    const graduated = curve.realSolReserves >= GRADUATION_LIQUIDITY_LAMPORTS;
    
    if (graduated) {
      curve.complete = true;
      token.graduated = true;
      
      // Update Supabase
      if (isSupabaseConfigured()) {
        try {
          await supabase.from('tokens').update({ graduated: true }).eq('id', id);
        } catch (e) {}
      }
      
      // Announce
      const { announceGraduation } = await import('../utils/telegram.js');
      announceGraduation?.({ name: token.name, symbol: token.symbol, creator: token.agentId, mint: token.mint });
    }
    
    res.json({
      success: true,
      liquidity: Number(curve.liquidity) / 1e9,
      progress: Number(progress),
      graduated: curve.complete,
      target: GRADUATION_LIQUIDITY_SOL,
      message: graduated ? 'Graduated! 🎉' : `${100 - Number(progress)}% to go`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

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
  const curve = token.bondingCurve || bondingCurves.get(token.mint);
  const progress = curve ? (Number(curve.realSolReserves || curve.real_sol_reserves || 0) * 100) / GRADUATION_LIQUIDITY_SOL : 0;
  
  return {
    id: token.id,
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    creator: token.agentId || token.creator_agent_id,
    graduated: token.graduated,
    collaborators: token.collaborators || [],
    createdAt: token.createdAt || token.created_at,
    bondingCurve: curve ? {
      liquidity: Number(curve.liquidity || curve.realSolReserves || curve.real_sol_reserves || 0) / 1e9,
      price: calculatePrice(curve),
      progress: Math.min(100, progress),
      totalBuys: curve.totalBuys || 0,
      totalSells: curve.totalSells || 0
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
