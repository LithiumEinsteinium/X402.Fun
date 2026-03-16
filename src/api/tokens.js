/**
 * Token Launch & Trading API with On-Chain Integration
 * 
 * Supports both simulated (dev) and real on-chain (prod) modes
 */

import { supabase, isSupabaseConfigured } from '../utils/supabase.js';
import solana, { createMintKeypair, getNetworkInfo, getSolBalance } from '../utils/solana.js';

const GRADUATION_LIQUIDITY_SOL = 1_500_000_000; // 1.5 SOL devnet
// Helper to convert BigInt to string for JSON
function toJSON(obj) {
  return JSON.stringify(obj, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  );
}


function toJSONParse(jsonString) {
  return JSON.parse(jsonString, (key, value) => {
    if (typeof value === 'string' && /^\d+n$/.test(value)) {
      return BigInt(value);
    }
    return value;
  });
}


/**
 * Convert BigInt values to strings in response
 */
function sanitizeForJSON(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(sanitizeForJSON);
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizeForJSON(obj[key]);
    }
    return result;
  }
  return obj;
}


const PLATFORM_FEE = 0.01;

// Mode: 'simulation' | 'onchain'
const MODE = process.env.MODE || 'simulation';

// In-memory fallback
const tokens = new Map();
const bondingCurves = new Map();

/**
 * Generate a mock mint address for simulation
 */
function generateMintAddress() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}


/**
 * Launch a new token
 */
export async function launchToken(req, res) {
  try {
    const { agentId, name, symbol, uri, creatorWallet } = req.body;
    
    if (!agentId || !name || !symbol) {
      return res.status(400).json({ error: 'Agent ID, name, and symbol required' });
    }
    
    console.log(`\n🚀 Launching token: ${name} (${symbol})`);
    console.log(`   Mode: ${MODE}`);
    console.log(`   Agent: ${agentId}`);
    
    const tokenId = `token_${Date.now()}`;
    let mintAddress;
    let bondingCurve;
    let token;
    
    if (MODE === 'onchain') {
      // Real on-chain launch
      try {
        // Generate mint keypair
        const mintKeypair = createMintKeypair();
        mintAddress = mintKeypair.publicKey.toBase58();
        
        console.log(`   Mint: ${mintAddress}`);
        
        // On-chain would require:
        // 1. Create mint account
        // 2. Initialize mint
        // 3. Call program launch_token instruction
        // 4. Create bonding curve account
        
        // For now, store the mint and simulate the rest
        bondingCurve = {
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
          liquidity: 0n,
          onChain: false, // Not actually on-chain yet
          note: 'Mint created - full on-chain launch requires wallet signing'
        };
        
        token = {
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
          createdAt: new Date().toISOString(),
          onChain: false
        };
        
        console.log(`   ⚠️  On-chain launch requires wallet transaction signing`);
        
      } catch (e) {
        console.error('On-chain launch error:', e);
        return res.status(500).json({ error: `On-chain launch failed: ${e.message}` });
      }
    } else {
      // Simulation mode (default)
      mintAddress = generateMintAddress();
      
      bondingCurve = {
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
      
      token = {
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
    }
    
    // Store in memory
    tokens.set(tokenId, token);
    bondingCurves.set(mintAddress, bondingCurve);
    
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
        console.log('Supabase insert failed (continuing):', e.message);
      }
    }
    
    res.json(sanitizeForJSON({
      success: true,
      token: {
        id: token.id,
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        bondingCurve: {
          liquidity: token.bondingCurve.liquidity,
          price: Number(token.bondingCurve.virtualSolReserves) / Number(token.bondingCurve.virtualTokenReserves),
          progress: 0
        }
      },
      message: token.onChain ? 'Token launched on-chain (mint created)' : 'Token launched on bonding curve'
    });
    
  } catch (error) {
    console.error('Launch error:', error);
    res.status(500).json({ error: error.message });
  }
}


/**
 * Get all tokens
 */
export async function listTokens(req, res) {
  try {
    // Try Supabase first
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('tokens')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (!error && data && data.length > 0) {
          return res.json(sanitizeForJSON({ 
            tokens: data.map(t => ({
              id: t.id,
              mint: t.mint,
              name: t.name,
              symbol: t.symbol,
              creator: t.creator_agent_id,
              graduated: t.graduated,
              collaborators: [],
              createdAt: t.created_at
            }))
          });
        }
      } catch (e) {
        console.log('Supabase query failed:', e.message);
      }
    }
    
    // Fallback to memory
    const tokenList = Array.from(tokens.values());
    res.json(sanitizeForJSON({ tokens: tokenList });
    
  } catch (error) {
    console.error('List tokens error:', error);
    res.status(500).json({ error: error.message });
  }
}


/**
 * Get single token
 */
export async function getToken(req, res) {
  try {
    const { id } = req.params;
    
    // Try memory first
    const token = tokens.get(id) || Array.from(tokens.values()).find(t => t.mint === id);
    
    if (token) {
      return res.json(sanitizeForJSON({ token });
    }
    
    // Try Supabase
    if (isSupabaseConfigured()) {
      const { data } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', id)
        .single();
      
      if (data) {
        return res.json(sanitizeForJSON({ token: data });
      }
    }
    
    res.status(404).json({ error: 'Token not found' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}


/**
 * Contribute liquidity (simulated for now)
 */
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
    
    // Add liquidity
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
        await supabase
          .from('tokens')
          .update({ graduated: true })
          .eq('id', token.id);
      }
    }
    
    res.json(sanitizeForJSON({
      success: true,
      liquidity: solAmount,
      progress: Number(progress),
      graduated,
      target: Number(GRADUATION_LIQUIDITY_LAMPORTS) / 1e9,
      message: graduated ? 'Graduated! 🎉' : `${solAmount} SOL added. Progress: ${progress}%`
    });
    
  } catch (error) {
    console.error('Contribute error:', error);
    res.status(500).json({ error: error.message });
  }
}


/**
 * Add collaborator
 */
export async function addCollaborator(req, res) {
  try {
    const { id } = req.params;
    const { agentId, solContribution } = req.body;
    
    const token = tokens.get(id);
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    if (!token.collaborators.includes(agentId)) {
      token.collaborators.push(agentId);
    }
    
    // Also add liquidity if provided
    if (solContribution) {
      return contributeLiquidity(req, res);
    }
    
    res.json(sanitizeForJSON({ success: true, collaborators: token.collaborators });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}


/**
 * Buy tokens (placeholder - would need real swap logic)
 */
export async function buyTokens(req, res) {
  try {
    const { agentId, mint, solAmount } = req.body;
    
    if (!mint || !solAmount) {
      return res.status(400).json({ error: 'mint and solAmount required' });
    }
    
    const curve = bondingCurves.get(mint);
    if (!curve) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    // Simplified bonding curve pricing
    const tokensOut = (BigInt(Math.floor(solAmount * 1e9)) * curve.virtualTokenReserves) / curve.virtualSolReserves;
    
    curve.realSolReserves += BigInt(Math.floor(solAmount * 1e9));
    curve.realTokenReserves -= tokensOut;
    curve.totalBuys++;
    
    res.json(sanitizeForJSON({
      success: true,
      solSpent: solAmount,
      tokensReceived: Number(tokensOut),
      message: `Bought ${Number(tokensOut)} tokens for ${solAmount} SOL`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}


/**
 * Sell tokens (placeholder - would need real swap logic)
 */
export async function sellTokens(req, res) {
  try {
    const { agentId, mint, tokenAmount } = req.body;
    
    if (!mint || !tokenAmount) {
      return res.status(400).json({ error: 'mint and tokenAmount required' });
    }
    
    const curve = bondingCurves.get(mint);
    if (!curve) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    // Simplified bonding curve pricing
    const tokensIn = BigInt(Math.floor(tokenAmount * 1e6));
    const solOut = (tokensIn * curve.virtualSolReserves) / curve.virtualTokenReserves;
    
    curve.realTokenReserves += tokensIn;
    curve.realSolReserves -= solOut;
    curve.totalSells++;
    
    res.json(sanitizeForJSON({
      success: true,
      tokensSold: tokenAmount,
      solReceived: Number(solOut) / 1e9,
      message: `Sold ${tokenAmount} tokens for ${Number(solOut) / 1e9} SOL`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
