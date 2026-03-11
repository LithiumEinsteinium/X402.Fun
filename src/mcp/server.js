/**
 * X402.Fun MCP Server
 * 
 * AI agents use this to interact with the platform
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// Available MCP tools for agents
const tools = [
  {
    name: 'x402fun_register_agent',
    description: 'Register a new AI agent on X402.Fun',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name' },
        description: { type: 'string', description: 'Agent description' },
        ownerAddress: { type: 'string', description: 'Owner wallet address' }
      },
      required: ['name', 'ownerAddress']
    }
  },
  {
    name: 'x402fun_launch_token',
    description: 'Launch a new meme token on the bonding curve',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Your agent ID' },
        name: { type: 'string', description: 'Token name' },
        symbol: { type: 'string', description: 'Token symbol' },
        uri: { type: 'string', description: 'Token metadata URI' }
      },
      required: ['agentId', 'name', 'symbol']
    }
  },
  {
    name: 'x402fun_buy_token',
    description: 'Buy tokens on the bonding curve',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Your agent ID' },
        mint: { type: 'string', description: 'Token mint address' },
        solAmount: { type: 'number', description: 'Amount of SOL to spend' }
      },
      required: ['agentId', 'mint', 'solAmount']
    }
  },
  {
    name: 'x402fun_sell_token',
    description: 'Sell tokens on the bonding curve',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Your agent ID' },
        mint: { type: 'string', description: 'Token mint address' },
        tokenAmount: { type: 'number', description: 'Amount of tokens to sell' }
      },
      required: ['agentId', 'mint', 'tokenAmount']
    }
  },
  {
    name: 'x402fun_list_tokens',
    description: 'List all tokens on the platform',
    inputSchema: {
      type: 'object',
      properties: {
        graduated: { type: 'boolean', description: 'Filter by graduation status' }
      }
    }
  },
  {
    name: 'x402fun_get_token',
    description: 'Get details about a specific token',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Token ID or mint address' }
      },
      required: ['id']
    }
  },
  {
    name: 'x402fun_collaborate',
    description: 'Add collaboration to a token (liquidity, marketing, etc)',
    inputSchema: {
      type: 'object',
      properties: {
        tokenId: { type: 'string', description: 'Token ID' },
        agentId: { type: 'string', description: 'Your agent ID' },
        role: { type: 'string', description: 'Role: liquidity, marketing, dev, community' },
        contribution: { type: 'string', description: 'Description of contribution' }
      },
      required: ['tokenId', 'agentId', 'role']
    }
  },
  {
    name: 'x402fun_get_price',
    description: 'Get x402 payment price for an action',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: launch, buy, sell, api' }
      },
      required: ['action']
    }
  }
];

// Tool implementations
async function callTool(name, args) {
  try {
    let endpoint = '';
    let method = 'POST';
    let body = args;

    switch (name) {
      case 'x402fun_register_agent':
        endpoint = '/api/agents/register';
        break;
      case 'x402fun_launch_token':
        endpoint = '/api/tokens/launch';
        break;
      case 'x402fun_buy_token':
        endpoint = '/api/tokens/buy';
        break;
      case 'x402fun_sell_token':
        endpoint = '/api/tokens/sell';
        break;
      case 'x402fun_list_tokens':
        endpoint = '/api/tokens';
        if (args.graduated !== undefined) {
          endpoint += `?graduated=${args.graduated}`;
        }
        method = 'GET';
        body = null;
        break;
      case 'x402fun_get_token':
        endpoint = `/api/tokens/${args.id}`;
        method = 'GET';
        body = null;
        break;
      case 'x402fun_collaborate':
        endpoint = `/api/tokens/${args.tokenId}/collaborate`;
        body = { agentId: args.agentId, role: args.role, contribution: args.contribution };
        break;
      case 'x402fun_get_price':
        endpoint = `/api/x402/price?action=${args.action}`;
        method = 'GET';
        body = null;
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : null
    });

    const result = await response.json();
    
    if (!response.ok) {
      return { content: [{ type: 'text', text: `Error: ${JSON.stringify(result)}` }] };
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }] };
  }
}

// Create MCP server
const server = new Server(
  { name: 'x402-fun', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Handle requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await callTool(name, args);
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport);

console.error('🤖 X402.Fun MCP Server running...');
