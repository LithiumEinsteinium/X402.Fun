/**
 * X402.Fun MCP Server
 * 
 * AI agents use this to interact with the platform
 * 
 * Usage:
 *   npm run mcp
 * 
 * Or connect via Claude Desktop / other MCP clients
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.API_BASE || 'https://x402-fun.onrender.com';

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
        name: { type: 'string', description: 'Token name (e.g., "SolMeme")' },
        symbol: { type: 'string', description: 'Token symbol (e.g., "SMEME")' },
        uri: { type: 'string', description: 'Token metadata URI (optional)' },
        creatorWallet: { type: 'string', description: 'Creator wallet address' }
      },
      required: ['agentId', 'name', 'symbol', 'creatorWallet']
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
      properties: {}
    }
  },
  {
    name: 'x402fun_get_token',
    description: 'Get details of a specific token',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Token ID or mint address' }
      },
      required: ['id']
    }
  },
  {
    name: 'x402fun_contribute_liquidity',
    description: 'Add SOL liquidity to help a token graduate',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Your agent ID' },
        id: { type: 'string', description: 'Token ID' },
        solAmount: { type: 'number', description: 'Amount of SOL to contribute' }
      },
      required: ['agentId', 'id', 'solAmount']
    }
  },
  {
    name: 'x402fun_get_payment_info',
    description: 'Get payment info for an action',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action (launch, buy, etc.)' }
      },
      required: ['action']
    }
  },
  {
    name: 'x402fun_verify_payment',
    description: 'Verify payment was made',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: { type: 'string', description: 'Wallet address' },
        action: { type: 'string', description: 'Action that was paid for' }
      },
      required: ['wallet', 'action']
    }
  },
  {
    name: 'x402fun_get_config',
    description: 'Get platform configuration',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

class X402FunServer {
  constructor() {
    this.server = new Server(
      {
        name: 'x402-fun',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        const result = await this.handleTool(name, args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async handleTool(name, args) {
    let endpoint = API_BASE;
    let method = 'GET';
    let body = null;

    switch (name) {
      case 'x402fun_register_agent':
        endpoint += '/api/agents/register';
        method = 'POST';
        body = args;
        break;
      case 'x402fun_launch_token':
        endpoint += '/api/agent/create-launch';
        method = 'POST';
        body = args;
        break;
      case 'x402fun_buy_token':
        endpoint += '/api/tokens/buy';
        method = 'POST';
        body = args;
        break;
      case 'x402fun_sell_token':
        endpoint += '/api/tokens/sell';
        method = 'POST';
        body = args;
        break;
      case 'x402fun_list_tokens':
        endpoint += '/api/tokens';
        break;
      case 'x402fun_get_token':
        endpoint += `/api/tokens/${args.id}`;
        break;
      case 'x402fun_contribute_liquidity':
        endpoint += `/api/tokens/${args.id}/contribute`;
        method = 'POST';
        body = { agentId: args.agentId, solAmount: args.solAmount };
        break;
      case 'x402fun_get_payment_info':
        endpoint += `/api/x402/price?action=${args.action || 'launch'}`;
        break;
      case 'x402fun_verify_payment':
        endpoint += '/api/x402/verify';
        method = 'POST';
        body = args;
        break;
      case 'x402fun_get_config':
        endpoint += '/api/agent/config';
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, options);
    const data = await response.json();
    return data;
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🤖 X402.Fun MCP Server running...');
  }
}

const server = new X402FunServer();
server.start().catch(console.error);
