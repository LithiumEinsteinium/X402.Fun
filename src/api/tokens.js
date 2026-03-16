/**
 * Token Launch & Trading API with On-Chain Integration
 */

import { supabase, isSupabaseConfigured } from '../utils/supabase.js';
import { announceLaunch, announceGraduation, announceBuy, announceSell } from '../utils/telegram.js';

const GRADUATION_LIQUIDITY_SOL = 1_500_000_000;
const GRADUATION_LIQUIDITY_LAMPORTS = BigInt(GRADUATION_LIQUIDITY_SOL);
const PLATFORM_FEE = 0.01;
const MODE = process.env.MODE || 'simulation';

const tokens = new Map();
const bondingCurves = new Map();

function generateMintAddress() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function launchToken(req, res) {
  try {
    const { agentId, name, symbol, uri, creatorWallet } = req.body;
    
    if (!agentId || !name || !symbol) {
      return res.status(400).json({ error: 'Agent ID, name, and symbol required' });
    }
    
    const tokenId = `token_${Date.now()}`;
    const mintAddress = generateMintAddress();
    
    const bondingCurve = {
      mint: mintAddress,
      virtualSolReserves: 30000000000,
      virtualTokenReserves: 1073000000000000,
      realSolReserves: 0,
      realTokenReserves: 793100000000000,
      complete: false,
      createdAt: new Date().toISOString(),
      totalBuys: 0,
      totalSells: 0,
      liquidity: 0
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
    
    // Announce to Telegram
    announceLaunch({
      name: token.name,
      symbol: token.symbol,
      creator: token.creatorWallet,
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
          price: 2.8e-5,
          progress: 0
        }
      },
      message: 'Token launched on bonding curve (simulation)'
    });
    
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function listTokens(req, res) {
  const tokenList = Array.from(tokens.values());
  res.json({ tokens: tokenList });
}

export async function getToken(req, res) {
  const { id } = req.params;
  const token = tokens.get(id) || Array.from(tokens.values()).find(t => t.mint === id);
  
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  res.json({ token });
}

export async function contributeLiquidity(req, res) {
  try {
    const { id } = req.params;
    const { agentId, solAmount } = req.body;
    
    if (!solAmount) {
      return res.status(400).json({ error: 'solAmount required' });
    }
    
    const token = tokens.get(id) || Array.from(tokens.values()).find(t => t.mint === id);
    
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
    
    curve.realSolReserves += solAmount;
    curve.liquidity = curve.realSolReserves;
    
    const progress = (curve.realSolReserves / (GRADUATION_LIQUIDITY_SOL / 1e9)) * 100;
    const graduated = curve.realSolReserves >= (GRADUATION_LIQUIDITY_SOL / 1e9);
    
    if (graduated) {
      curve.complete = true;
      token.graduated = true;
      
      // Announce graduation
      announceGraduation({
        name: token.name,
        symbol: token.symbol,
        creator: token.creatorWallet,
        mint: token.mint
      });
    }
    
    res.json({
      success: true,
      liquidity: solAmount,
      progress: Math.round(progress),
      graduated,
      target: 1.5,
      message: graduated ? 'Graduated!' : `${solAmount} SOL added. Progress: ${Math.round(progress)}%`
    });
    
  } catch (error) {
    console.error('Contribute error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function addCollaborator(req, res) {
  const { id } = req.params;
  const { agentId, solContribution } = req.body;
  
  const token = tokens.get(id);
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  if (!token.collaborators.includes(agentId)) {
    token.collaborators.push(agentId);
  }
  
  res.json({ success: true, collaborators: token.collaborators });
}

export async function buyTokens(req, res) {
  res.json({ message: 'Buy not implemented in simulation mode' });
}

export async function sellTokens(req, res) {
  res.json({ message: 'Sell not implemented in simulation mode' });
}

export default {
  launchToken,
  listTokens,
  getToken,
  contributeLiquidity,
  addCollaborator,
  buyTokens,
  sellTokens
};
