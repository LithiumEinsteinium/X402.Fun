/**
 * X402.Fun MCP Server
 *
 * AI agents use this to interact with the platform.
 *
 * Usage:
 *   npm run mcp
 *
 * Or connect via Claude Desktop / other MCP clients.
 *
 * BUG FIXES applied in this version:
 *   FIX-1  x402fun_launch_token routed to legacy /api/agent/create-launch
 *          (bare SPL mint, no bonding curve). Now routes to
 *          /api/program/create-launch and uses correct fields.
 *
 *   FIX-2  x402fun_buy_token schema was missing `buyerWallet`.
 *          `agentId` was present but the handler never reads it.
 *
 *   FIX-3  x402fun_sell_token schema was missing `sellerWallet`.
 *          `agentId` was present but the handler never reads it.
 *
 *   FIX-4  x402fun_contribute_liquidity routed to legacy token route and
 *          used `id` instead of `mint`, missing `contributorWallet`.
 *          Now routes to /api/program/create-contribute.
 *
 *   FIX-5  x402fun_get_config routed to legacy /api/agent/config which
 *          returns fake percentages. Now routes to /api/program/config
 *          (real on-chain fee config).
 *
 * NEW TOOLS added:
 *   x402fun_get_bonding_curve   — read live curve state for any mint
 *   x402fun_verify_launch       — confirm a launch tx landed on-chain
 *   x402fun_verify_contribute   — confirm a contribute tx and check graduation
 *   x402fun_get_network         — cluster / RPC / slot health
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.API_BASE || 'https://x402-fun.onrender.com';

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools = [
  // ── Agent management ────────────────────────────────────────────────────────
  {
    name: 'x402fun_register_agent',
    description: 'Register a new AI agent on X402.Fun. Returns agentId and apiKey.',
    inputSchema: {
      type: 'object',
      properties: {
        name:         { type: 'string', description: 'Agent name' },
        description:  { type: 'string', description: 'Agent description' },
        ownerAddress: { type: 'string', description: 'Owner wallet public key (base58)' },
      },
      required: ['name', 'ownerAddress'],
    },
  },

  // ── Platform info ────────────────────────────────────────────────────────────
  {
    name: 'x402fun_get_config',
    // FIX-5: was /api/agent/config (legacy). Now /api/program/config.
    description: 'Get real on-chain platform configuration: programId, fees, tokenDecimals, graduationThresholdSol.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'x402fun_get_network',
    // NEW: exposes RPC health, slot, solana version
    description: 'Get network status: cluster, RPC URL, current slot, Solana version.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ── Token lifecycle ──────────────────────────────────────────────────────────
  {
    name: 'x402fun_launch_token',
    // FIX-1: was /api/agent/create-launch (legacy bare-mint, no bonding curve).
    // Now /api/program/create-launch — returns a base64 transaction the agent
    // must sign and submit. The oracle receipt is created server-side.
    description:
      'Launch a new meme token on the bonding curve. ' +
      'Returns a base64-encoded Solana transaction that the agent must sign ' +
      'and submit with their wallet keypair.',
    inputSchema: {
      type: 'object',
      properties: {
        name:          { type: 'string',  description: 'Token name (max 32 chars, e.g. "SolMeme")' },
        symbol:        { type: 'string',  description: 'Token symbol (max 10 chars, e.g. "SMEME")' },
        uri:           { type: 'string',  description: 'Token metadata URI (optional)' },
        creatorWallet: { type: 'string',  description: 'Creator wallet public key (base58)' },
      },
      required: ['name', 'symbol', 'creatorWallet'],
    },
  },
  {
    name: 'x402fun_verify_launch',
    // NEW: agents need this to confirm their launch tx landed
    description:
      'Verify a token launch transaction landed on-chain and the bonding curve was created. ' +
      'Returns verified: true when the TokenState PDA exists.',
    inputSchema: {
      type: 'object',
      properties: {
        mint:                 { type: 'string', description: 'Mint address returned by x402fun_launch_token' },
        transactionSignature: { type: 'string', description: 'Transaction signature from sign-and-send' },
      },
      required: ['mint', 'transactionSignature'],
    },
  },

  // ── Trading ──────────────────────────────────────────────────────────────────
  {
    name: 'x402fun_buy_token',
    // FIX-2: added buyerWallet, removed agentId (not used by handler)
    description:
      'Buy tokens on the bonding curve. ' +
      'Returns a base64-encoded transaction to sign and submit. ' +
      'The buyer ATA must already exist (create with spl-token create-account).',
    inputSchema: {
      type: 'object',
      properties: {
        mint:         { type: 'string', description: 'Token mint address' },
        buyerWallet:  { type: 'string', description: 'Buyer wallet public key (base58)' },
        solAmount:    { type: 'number', description: 'Amount of SOL to spend' },
        minTokensOut: { type: 'number', description: 'Minimum tokens to receive (0 to disable slippage protection)' },
      },
      required: ['mint', 'buyerWallet', 'solAmount'],
    },
  },
  {
    name: 'x402fun_sell_token',
    // FIX-3: added sellerWallet, removed agentId (not used by handler)
    description:
      'Sell tokens on the bonding curve. ' +
      'Returns a base64-encoded transaction to sign and submit. ' +
      'tokenAmount is in whole tokens (e.g. 100), not base units.',
    inputSchema: {
      type: 'object',
      properties: {
        mint:         { type: 'string', description: 'Token mint address' },
        sellerWallet: { type: 'string', description: 'Seller wallet public key (base58)' },
        tokenAmount:  { type: 'number', description: 'Number of whole tokens to sell' },
        minSolOut:    { type: 'number', description: 'Minimum SOL to receive (0 to disable slippage protection)' },
      },
      required: ['mint', 'sellerWallet', 'tokenAmount'],
    },
  },

  // ── Bonding curve ────────────────────────────────────────────────────────────
  {
    name: 'x402fun_get_bonding_curve',
    // NEW: essential for agents to check price, reserves, graduation status
    description:
      'Get live bonding curve state for a token: price, SOL reserves, ' +
      'graduation progress, and whether the curve is complete.',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string', description: 'Token mint address' },
      },
      required: ['mint'],
    },
  },
  {
    name: 'x402fun_contribute_liquidity',
    // FIX-4: was /api/tokens/:id/contribute with wrong fields.
    // Now /api/program/create-contribute with correct fields.
    description:
      'Contribute SOL liquidity to help a token reach the 1.5 SOL graduation ' +
      'threshold. Returns a base64-encoded transaction to sign and submit.',
    inputSchema: {
      type: 'object',
      properties: {
        mint:              { type: 'string', description: 'Token mint address' },
        contributorWallet: { type: 'string', description: 'Contributor wallet public key (base58)' },
        solAmount:         { type: 'number', description: 'Amount of SOL to contribute' },
      },
      required: ['mint', 'contributorWallet', 'solAmount'],
    },
  },
  {
    name: 'x402fun_verify_contribute',
    // NEW: agents need this to check if graduation was triggered
    description:
      'Verify a contribute_liquidity transaction and check if the token graduated. ' +
      'Returns graduated: true and progressPercent: 100 when complete.',
    inputSchema: {
      type: 'object',
      properties: {
        mint:                 { type: 'string', description: 'Token mint address' },
        transactionSignature: { type: 'string', description: 'Transaction signature from sign-and-send' },
      },
      required: ['mint', 'transactionSignature'],
    },
  },

  // ── Token directory ──────────────────────────────────────────────────────────
  {
    name: 'x402fun_list_tokens',
    description: 'List all tokens on the platform.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'x402fun_get_token',
    description: 'Get details of a specific token by ID or mint address.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Token ID or mint address' },
      },
      required: ['id'],
    },
  },
];

// ── Server ────────────────────────────────────────────────────────────────────

class X402FunServer {
  constructor() {
    this.server = new Server(
      { name: 'x402-fun', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        const result = await this.handleTool(name, args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
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
      // ── Agent management ───────────────────────────────────────────────────
      case 'x402fun_register_agent':
        endpoint += '/api/agents/register';
        method = 'POST';
        body = args;
        break;

      // ── Platform info ──────────────────────────────────────────────────────
      case 'x402fun_get_config':
        // FIX-5: was /api/agent/config (legacy). Real config lives here.
        endpoint += '/api/program/config';
        break;

      case 'x402fun_get_network':
        endpoint += '/api/program/network';
        break;

      // ── Token lifecycle ────────────────────────────────────────────────────
      case 'x402fun_launch_token':
        // FIX-1: was /api/agent/create-launch (legacy bare-mint, no bonding curve)
        endpoint += '/api/program/create-launch';
        method = 'POST';
        body = {
          name:          args.name,
          symbol:        args.symbol,
          uri:           args.uri || '',
          creatorWallet: args.creatorWallet,
        };
        break;

      case 'x402fun_verify_launch':
        endpoint += '/api/program/verify-launch';
        method = 'POST';
        body = {
          mint:                 args.mint,
          transactionSignature: args.transactionSignature,
        };
        break;

      // ── Trading ────────────────────────────────────────────────────────────
      case 'x402fun_buy_token':
        // FIX-2: buyerWallet added, agentId removed
        endpoint += '/api/program/create-buy';
        method = 'POST';
        body = {
          mint:         args.mint,
          buyerWallet:  args.buyerWallet,
          solAmount:    args.solAmount,
          minTokensOut: args.minTokensOut ?? 0,
        };
        break;

      case 'x402fun_sell_token':
        // FIX-3: sellerWallet added, agentId removed
        endpoint += '/api/program/create-sell';
        method = 'POST';
        body = {
          mint:         args.mint,
          sellerWallet: args.sellerWallet,
          tokenAmount:  args.tokenAmount,
          minSolOut:    args.minSolOut ?? 0,
        };
        break;

      // ── Bonding curve ──────────────────────────────────────────────────────
      case 'x402fun_get_bonding_curve':
        endpoint += `/api/program/bonding-curve/${args.mint}`;
        break;

      case 'x402fun_contribute_liquidity':
        // FIX-4: was /api/tokens/:id/contribute with wrong fields
        endpoint += '/api/program/create-contribute';
        method = 'POST';
        body = {
          mint:              args.mint,
          contributorWallet: args.contributorWallet,
          solAmount:         args.solAmount,
        };
        break;

      case 'x402fun_verify_contribute':
        endpoint += '/api/program/verify-contribute';
        method = 'POST';
        body = {
          mint:                 args.mint,
          transactionSignature: args.transactionSignature,
        };
        break;

      // ── Token directory ────────────────────────────────────────────────────
      case 'x402fun_list_tokens':
        endpoint += '/api/tokens';
        break;

      case 'x402fun_get_token':
        endpoint += `/api/tokens/${args.id}`;
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(endpoint, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return response.json();
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🤖 X402.Fun MCP Server running');
    console.error(`   API: ${API_BASE}`);
  }
}

const server = new X402FunServer();
server.start().catch(console.error);
