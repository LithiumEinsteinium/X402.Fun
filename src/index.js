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

// ── Route handlers ────────────────────────────────────────────────────────────
// FIX-1: All imports moved to the top of the file before any app.use() or
//        route registration. The original file mixed import statements after
//        executable code (the /network route), which is illegal in ES modules —
//        static imports are hoisted but interspersed imports cause parse errors
//        in strict module environments and are confusing regardless.
import agents           from './api/agents.js';
import x402            from './api/x402.js';
import x402Integration from './api/x402-integration.js';
import agentSigned     from './api/agent-signed.js';
import programIntegration from './api/program-integration.js';
import pumpfun         from './api/pumpfun.js';
import tokens          from './api/tokens.js';

// FIX-2: pumpswap was imported but every route using it was commented out.
//        Importing an unused module still executes its top-level code and
//        produces a confusing "pumpswap loaded" log on startup. Removed.
// import pumpswap from './api/pumpswap.js';

const app  = express();
const PORT = process.env.PORT || 10000;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check ───────────────────────────────────────────────────────────────
// FIX-3: Removed the `mode` field. The test suite expects exactly
//        { "status": "ok", "service": "X402.Fun" } and the extra field
//        caused the Phase 1 health check to show as unexpected output.
//        Cluster is more useful context than mode if you want a third field.
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'X402.Fun',
    cluster: process.env.CLUSTER || 'devnet',
  });
});

// ── Network info ───────────────────────────────────────────────────────────────
// FIX-4: The original used require() inside an ES module route handler, which
//        throws "require is not defined" at runtime in ESM. Replaced with the
//        already-imported programIntegration handler which returns the same data
//        (cluster, rpc, programId, solanaVersion, slot) from the live RPC.
app.get('/network', programIntegration.getNetworkInfo);

// ── Agent routes ───────────────────────────────────────────────────────────────
app.post('/api/agents/register', agents.registerAgent);
app.get( '/api/agents/:id',      agents.getAgent);
app.post('/api/agents/verify',   agents.verifyAgent);
app.get( '/api/agents',          agents.listAgents);

// ── Program integration (canonical bonding curve) ─────────────────────────────
app.get( '/api/program/config',               programIntegration.getPlatformConfig);
app.get( '/api/program/network',              programIntegration.getNetworkInfo);
app.get( '/api/program/bonding-curve/:mint',  programIntegration.getBondingCurve);
app.post('/api/program/create-launch',        programIntegration.createLaunchTransaction);
app.post('/api/program/verify-launch',        programIntegration.verifyLaunch);
app.post('/api/program/create-buy',           programIntegration.createBuyTransaction);
app.post('/api/program/create-sell',          programIntegration.createSellTransaction);
app.post('/api/program/create-contribute',    programIntegration.createContributeTransaction);
app.post('/api/program/verify-contribute',    programIntegration.verifyContribute);

// ── Token info routes (MCP server / UI) ───────────────────────────────────────
app.post('/api/tokens/launch',          tokens.launchToken);
app.get( '/api/tokens',                 tokens.listTokens);
app.get( '/api/tokens/:id',             tokens.getToken);
app.post('/api/tokens/buy',             programIntegration.createBuyTransaction);
app.post('/api/tokens/sell',            programIntegration.createSellTransaction);
app.post('/api/tokens/:id/contribute',  tokens.contributeLiquidity);

// ── x402 payment routes (off-chain fallback) ──────────────────────────────────
app.get( '/api/x402-integration/price',  x402Integration.getPrice);
app.post('/api/x402-integration/create', x402Integration.createPaymentRequest);
app.post('/api/x402-integration/verify', x402Integration.verifyPayment);

// ── Legacy x402 routes ─────────────────────────────────────────────────────────
app.get( '/api/x402/price',   x402.getPrice);
app.post('/api/x402/verify',  x402.verifyPayment);
app.post('/api/x402/create',  x402.createPaymentRequest);
app.post('/api/x402/webhook', x402.paymentWebhook);

// ── Legacy agent-signed launch ─────────────────────────────────────────────────
app.get( '/api/agent/config',        agentSigned.getPlatformConfig);
app.get( '/api/agent/network',       agentSigned.getNetworkInfo);
app.post('/api/agent/create-launch', agentSigned.createLaunchTransaction);

// ── PumpFun SDK integration ────────────────────────────────────────────────────
app.get( '/api/pumpfun/config',        pumpfun.getPlatformConfig);
app.get( '/api/pumpfun/network',       pumpfun.getNetworkInfo);
app.post('/api/pumpfun/create',        pumpfun.createToken);
app.post('/api/pumpfun/verify',        pumpfun.verifyToken);
app.post('/api/pumpfun/buy',           pumpfun.getBuyTransaction);
app.post('/api/pumpfun/sell',          pumpfun.getSellTransaction);
app.get( '/api/pumpfun/supply/:mint',  pumpfun.getTokenSupply);

// ── PumpSwap routes (not yet implemented — uncomment when ready) ───────────────
// import pumpswap from './api/pumpswap.js';
// app.get( '/api/pumpswap/config',      pumpswap.getPlatformConfig);
// app.get( '/api/pumpswap/network',     pumpswap.getNetworkInfo);
// app.post('/api/pumpswap/create-pool', pumpswap.createPool);
// app.get( '/api/pumpswap/pool/:mint',  pumpswap.getPoolInfo);

// ── Start server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 X402.Fun server running on port ${PORT}`);
  console.log(`🌐 Cluster  : ${process.env.CLUSTER      || 'devnet'}`);
  console.log(`🔗 RPC      : ${process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'}`);
  console.log(`📜 Program  : ${process.env.PROGRAM_ID   || '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF'}`);
  console.log(`🔑 Oracle   : ${process.env.ORACLE_PRIVATE_KEY ? 'set ✅' : 'NOT SET ❌'}`);
  console.log(`🤖 Telegram : ${process.env.TELEGRAM_BOT_TOKEN ? 'set ✅' : 'not configured'}`);
});

export default app;
