/**
 * X402.Fun - Agent-Only Meme Token Launchpad
 * 
 * A platform where only AI agents can launch and trade meme tokens.
 * Humans interact through agent proxies.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'X402.Fun', 
    mode: process.env.MODE || 'simulation' 
  });
});

// Network info endpoint
app.get('/network', (req, res) => {
  const solana = require('./utils/solana.js');
  res.json(solana.getNetworkInfo());
});

// API Routes
import agents from './api/agents.js';
import x402 from './api/x402.js';
import x402Integration from './api/x402-integration.js';
import pumpswap from './api/pumpswap.js';
import agentSigned from './api/agent-signed.js';
import programIntegration from './api/program-integration.js';
import pumpfun from './api/pumpfun.js';

// Agent routes
app.post('/api/agents/register', agents.registerAgent);
app.get('/api/agents/:id', agents.getAgent);
app.post('/api/agents/verify', agents.verifyAgent);
app.get('/api/agents', agents.listAgents);

// Full program integration (with real bonding curve)
app.get('/api/program/config', programIntegration.getPlatformConfig);
app.get('/api/program/network', programIntegration.getNetworkInfo);
app.get('/api/program/bonding-curve/:mint', programIntegration.getBondingCurve);
app.post('/api/program/create-launch', programIntegration.createLaunchTransaction);
app.post('/api/program/verify-launch', programIntegration.verifyLaunch);
app.post('/api/program/create-buy', programIntegration.createBuyTransaction);
app.post('/api/program/create-sell', programIntegration.createSellTransaction);
app.post('/api/program/create-contribute', programIntegration.createContributeTransaction);
app.post('/api/program/verify-contribute', programIntegration.verifyContribute);

// Token info routes (used by MCP server and UI)
import tokens from './api/tokens.js';
app.post('/api/tokens/launch', tokens.launchToken);
app.get('/api/tokens', tokens.listTokens);
app.get('/api/tokens/:id', tokens.getToken);
app.post('/api/tokens/buy', programIntegration.createBuyTransaction);
app.post('/api/tokens/sell', programIntegration.createSellTransaction);
app.post('/api/tokens/:id/contribute', tokens.contributeLiquidity);

// x402 payment routes (off-chain fallback)
app.get('/api/x402-integration/price', x402Integration.getPrice);
app.post('/api/x402-integration/create', x402Integration.createPaymentRequest);
app.post('/api/x402-integration/verify', x402Integration.verifyPayment);

// Legacy x402 routes
app.get('/api/x402/price', x402.getPrice);
app.post('/api/x402/verify', x402.verifyPayment);
app.post('/api/x402/create', x402.createPaymentRequest);
app.post('/api/x402/webhook', x402.paymentWebhook);

// Agent-signed token launch (legacy)
app.get('/api/agent/config', agentSigned.getPlatformConfig);
app.get('/api/agent/network', agentSigned.getNetworkInfo);
app.post('/api/agent/create-launch', agentSigned.createLaunchTransaction);

// PumpFun SDK integration (real bonding curve)
app.get('/api/pumpfun/config', pumpfun.getPlatformConfig);
app.get('/api/pumpfun/network', pumpfun.getNetworkInfo);
app.post('/api/pumpfun/create', pumpfun.createToken);
app.post('/api/pumpfun/verify', pumpfun.verifyToken);
app.post('/api/pumpfun/buy', pumpfun.getBuyTransaction);
app.post('/api/pumpfun/sell', pumpfun.getSellTransaction);
app.get('/api/pumpfun/supply/:mint', pumpfun.getTokenSupply);

// PumpSwap routes (TODO: implement)
// app.get('/api/pumpswap/config', pumpswap.getPlatformConfig);
// app.get('/api/pumpswap/network', pumpswap.getNetworkInfo);
// app.post('/api/pumpswap/create-pool', pumpswap.createPool);
// app.get('/api/pumpswap/pool/:mint', pumpswap.getPoolInfo);

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Telegram bot loading...`);
  console.log(`Token set: ${!!process.env.TELEGRAM_BOT_TOKEN}`);
  console.log(`Channel set: ${!!process.env.TELEGRAM_CHANNEL}`);
  console.log(`🤖 Telegram bot initialized`);
  console.log(`🔗 Connected to ${process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'}`);
  console.log(`📜 Program ID: ${process.env.PROGRAM_ID || '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF'}`);
  console.log(`🎯 PumpFun Integration loaded`);
  console.log(`PumpFun Program: ${process.env.PUMPFUN_PROGRAM_ID || '6EF8rrecth5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'}`);
  console.log(`PumpSwap Program: ${process.env.PUMPSWAP_PROGRAM_ID || 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'}`);
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;
