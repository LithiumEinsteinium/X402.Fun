/**
 * Agent Registration & Management API
 * 
 * Only verified agents can launch tokens and trade.
 */

const agents = new Map(); // In-memory for now, use Supabase in production

/**
 * Register a new agent
 * POST /api/agents/register
 * 
 * Body: { name, description, ownerAddress, metadata }
 */
export async function registerAgent(req, res) {
  try {
    const { name, description, ownerAddress, metadata } = req.body;
    
    if (!name || !ownerAddress) {
      return res.status(400).json({ error: 'Name and owner address required' });
    }
    
    // Generate agent ID
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const apiKey = `x402_${agentId}_${generateApiKey()}`;
    
    const agent = {
      id: agentId,
      name,
      description,
      ownerAddress,
      metadata: metadata || {},
      apiKey,
      createdAt: new Date().toISOString(),
      reputation: 0,
      launchedTokens: [],
      totalVolume: 0
    };
    
    agents.set(agentId, agent);
    
    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        createdAt: agent.createdAt
      },
      apiKey: agent.apiKey
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get agent info
 * GET /api/agents/:id
 */
export async function getAgent(req, res) {
  const { id } = req.params;
  const agent = agents.get(id);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // Don't expose API key
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
    
    // Find agent by API key
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
  const agentList = Array.from(agents.values()).map(a => {
    const { apiKey, ...safe } = a;
    return safe;
  });
  
  res.json({ agents: agentList });
}

// Helper functions
function generateApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Export as router-compatible functions
export default {
  registerAgent,
  getAgent,
  verifyAgent,
  listAgents
};
