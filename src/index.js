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
import tokens from './api/tokens.js';
import x402 from './api/x402.js';
import pumpswap from './api/pumpswap.js';
import agentSigned from './api/agent-signed.js';
import program from './api/program-integration.js';
import pumpfun from './api/pumpfun.js';

app.post('/api/agents/register', agents.registerAgent);
app.get('/api/agents/:id', agents.getAgent);
app.post('/api/agents/verify', agents.verifyAgent);
app.get('/api/agents', agents.listAgents);

// Full program integration (with real bonding curve)
app.get('/api/program/config', program.getPlatformConfig);
app.get('/api/program/network', program.getNetworkInfo);
app.post('/api/program/initialize', program.initializeProgram);
app.post('/api/program/create-launch', program.createLaunchTransaction);
app.post('/api/program/verify-launch', program.verifyLaunch);
app.post('/api/program/create-contribute', program.createContributeTransaction);
app.post('/api/program/verify-contribute', program.verifyContribution);
app.post('/api/program/create-pool', program.createPumpSwapPool);
app.post('/api/program/create-buy', program.createBuyTransaction);
app.post('/api/program/create-sell', program.createSellTransaction);

// PumpFun SDK integration (real bonding curve)
app.get('/api/pumpfun/config', pumpfun.getPlatformConfig);
app.get('/api/pumpfun/network', pumpfun.getNetworkInfo);
app.post('/api/pumpfun/create', pumpfun.createToken);
app.post('/api/pumpfun/verify', pumpfun.verifyToken);
app.post('/api/pumpfun/buy', pumpfun.getBuyTransaction);
app.post('/api/pumpfun/sell', pumpfun.getSellTransaction);
app.get('/api/pumpfun/supply/:mint', pumpfun.getTokenSupply);

// Agent-signed endpoints (legacy)
app.get('/api/agent/config', agentSigned.getPlatformConfig);
app.post('/api/agent/create-launch', agentSigned.createLaunchTransaction);
app.post('/api/agent/verify-launch', agentSigned.verifyLaunch);
app.post('/api/agent/create-contribute', agentSigned.createContributeTransaction);
app.post('/api/agent/verify-contribute', agentSigned.verifyContribution);

app.post('/api/tokens/launch', tokens.launchToken);
app.get('/api/tokens', tokens.listTokens);
app.get('/api/tokens/:id', tokens.getToken);
app.post('/api/tokens/buy', tokens.buyTokens);
app.post('/api/tokens/sell', tokens.sellTokens);
app.post('/api/tokens/:id/collaborate', tokens.addCollaborator);
app.post('/api/tokens/:id/contribute', tokens.contributeLiquidity);

app.get('/api/x402/price', x402.getPrice);
app.post('/api/x402/verify', x402.verifyPayment);
app.post('/api/x402/create', x402.createPaymentRequest);
app.post('/api/x402/webhook', x402.paymentWebhook);

app.post('/api/pumpswap/quote', pumpswap.getQuote);
app.post('/api/pumpswap/swap', pumpswap.executeSwap);
app.post('/api/pumpswap/create-pool', pumpswap.createPool);
app.post('/api/pumpswap/add-liquidity', pumpswap.addLiquidity);
app.get('/api/pumpswap/price/:mint', pumpswap.getPrice);
app.get('/api/pumpswap/pool/:mint', pumpswap.getPoolInfo);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🤖 X402.Fun running on port ${PORT}`);
  console.log(`   Agent-only meme token launchpad`);
});

export default app;
