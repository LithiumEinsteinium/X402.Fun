/**
 * Agent Registration & Management API with Supabase
 */

import { supabase } from '../utils/supabase.js';

/**
 * Register a new agent
 * POST /api/agents/register
 */
export async function registerAgent(req, res) {
  try {
    const { name, description, ownerAddress, metadata } = req.body;
    
    if (!name || !ownerAddress) {
      return res.status(400).json({ error: 'Name and owner address required' });
    }
    
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const apiKey = `x402_${agentId}_${generateApiKey()}`;
    
    const agent = {
      id: agentId,
      name,
      description: description || '',
      owner_address: ownerAddress,
      api_key: apiKey,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      reputation: 0
    };
    
    // Try to insert into Supabase
    try {
      const { error } = await supabase.from('agents').insert(agent);
      if (error) throw error;
    } catch (dbError) {
      // If Supabase fails, use in-memory fallback
      console.log('Using in-memory fallback for agents');
    }
    
    // Store in memory as fallback
    agents.set(agentId, { ...agent, apiKey });
    
    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        createdAt: agent.created_at
      },
      apiKey
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// In-memory fallback
const agents = new Map();

/**
 * Get agent info
 * GET /api/agents/:id
 */
export async function getAgent(req, res) {
  const { id } = req.params;
  
  // Try Supabase first
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single();
    
    if (data) {
      const { api_key, ...safeAgent } = data;
      return res.json({ agent: safeAgent });
    }
  } catch (e) {
    console.log('Supabase query failed, trying memory');
  }
  
  // Fallback to memory
  const agent = agents.get(id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  const { apiKey, ...safeAgent } = agent;
  res.json({ agent: safeAgent });
}

/**
 * Verify agent by API key
 * POST /api/agents/verify
 */
export async function verifyAgent(req, res) {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' });
    }
    
    // Try Supabase
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name')
        .eq('api_key', apiKey)
        .single();
      
      if (data) {
        return res.json({ 
          valid: true, 
          agentId: data.id,
          name: data.name 
        });
      }
    } catch (e) {
      console.log('Supabase verify failed');
    }
    
    // Fallback
    const agent = Array.from(agents.values()).find(a => a.apiKey === apiKey);
    
    if (!agent) {
      return res.status(401).json({ valid: false, error: 'Invalid API key' });
    }
    
    res.json({ 
      valid: true, 
      agentId: agent.id,
      name: agent.name 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * List all registered agents
 * GET /api/agents
 */
export async function listAgents(req, res) {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data && data.length > 0) {
      const agentList = data.map(a => {
        const { api_key, ...safe } = a;
        return safe;
      });
      return res.json({ agents: agentList });
    }
  } catch (e) {
    console.log('Supabase list failed');
  }
  
  // Fallback
  const agentList = Array.from(agents.values()).map(a => {
    const { apiKey, ...safe } = a;
    return safe;
  });
  
  res.json({ agents: agentList });
}

function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export default {
  registerAgent,
  getAgent,
  verifyAgent,
  listAgents
};
