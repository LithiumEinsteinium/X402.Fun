# 🔧 Important Clarifications - X402.Fun Flow

## ⚠️ Token Launch vs x402 Trading

### ✅ Token Launch (NO x402 Required)
**Endpoint:** `/api/agent/create-launch`  
**Purpose:** Create a new token on the bonding curve  
**x402 Required:** ❌ NO  

```bash
curl -X POST https://x402-fun.onrender.com/api/agent/create-launch \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "TestAgent",
    "name": "MyToken",
    "symbol": "MTK",
    "creatorWallet": "<YOUR_PUBLIC_KEY>"
  }'
```

**Why no x402?** The initial token launch is a one-time setup. The x402 payment system is only for **trading activities** (buy/sell) on the bonding curve.

---

### ⏳ Buy/Sell Trading (x402 REQUIRED)
**Endpoints:** 
- `/api/program/create-buy` - Buy tokens
- `/api/program/create-sell` - Sell tokens

**Purpose:** Trade tokens on the bonding curve  
**x402 Required:** ✅ YES - Payment receipt required

**Flow:**
1. Create x402 payment receipt → `/api/x402-integration/create`
2. Use receipt in buy/sell transaction → `/api/program/create-buy` or `/api/program/create-sell`

---

## 🚨 Memory Allocation Error

**Error:** `Program panic — "memory allocation failed, out of memory"`

**Cause:** Trying to create x402 receipt AND launch token in the same transaction exceeds Solana's memory limits.

**Solution:** 
- ✅ Use `/api/agent/create-launch` for token creation (no x402)
- ⏳ Use x402 flow only for buy/sell operations

---

## Correct Flow Summary

### Phase 1: Setup (No x402)
1. **Initialize Program** (one-time admin)
   - Endpoint: `/api/program/initialize`
   
2. **Launch Token** (per token)
   - Endpoint: `/api/agent/create-launch`
   - ✅ No x402 payment needed
   - Returns: `mint`, `mintPrivateKey`, `transaction`

### Phase 2: Trading (x402 Required)
3. **Create x402 Payment Receipt** (per trade)
   - Endpoint: `/api/x402-integration/create`
   - Returns: `receipt` PDA

4. **Execute Trade**
   - Buy: `/api/program/create-buy`
   - Sell: `/api/program/create-sell`
   - Include: `receipt` from step 3

### Phase 3: Graduation
5. **Contribute Liquidity** (1.5 SOL)
   - Endpoint: `/api/program/create-contribute`
   
6. **Create PumpSwap Pool**
   - Endpoint: `/api/program/create-pool`

---

## Quick Reference Table

| Operation | Endpoint | x402 Required? | Notes |
|-----------|----------|----------------|-------|
| Initialize Program | `/api/program/initialize` | ❌ No | One-time admin |
| Launch Token | `/api/agent/create-launch` | ❌ No | Use this, NOT `/api/program/create-launch` |
| Create Payment | `/api/x402-integration/create` | N/A | Creates receipt for trading |
| Buy Tokens | `/api/program/create-buy` | ✅ Yes | Needs receipt |
| Sell Tokens | `/api/program/create-sell` | ✅ Yes | Needs receipt |
| Contribute | `/api/program/create-contribute` | ⏳ TBD | May need x402 |
| Create Pool | `/api/program/create-pool` | ❌ No | Post-graduation |

---

## Common Mistakes

❌ **Wrong:** Using `/api/program/create-launch` with x402  
✅ **Correct:** Use `/api/agent/create-launch` (no x402)

❌ **Wrong:** Creating x402 receipt before launching token  
✅ **Correct:** Launch token first, then create x402 receipts for trading

❌ **Wrong:** Reusing x402 receipts (they're one-time use)  
✅ **Correct:** Create new receipt for each buy/sell operation

---

## Updated Documentation

- **Quick Start:** See `QUICK_START.md` - updated with clarification
- **Full Guide:** See `AGENT_TEST_GUIDE.md` - x402 section clarified
- **x402 Flow:** See `X402_FLOW.md` - separated launch from trading

---

**TL;DR:** Launch tokens with `/api/agent/create-launch` (no x402). Use x402 only for buy/sell trading operations.


## 🔧 Program Initialization (For Deployers Only)

If you're getting "AccountNotInitialized" errors on buy/sell, the program needs initialization.

**As the program deployer, run:**

```bash
# 1. Create .env file
cat > .env << ENV
ADMIN_PRIVATE_KEY=your_base58_private_key_here
RPC_URL=https://api.devnet.solana.com
ENV

# 2. Run initialization script
node scripts/initialize-program.js
```

This will create the global account required for buy/sell operations.

**Alternative:** Use the backend endpoint (requires high compute budget):
```bash
curl -X POST https://x402-fun.onrender.com/api/program/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "authority": "<YOUR_PUBLIC_KEY>",
    "feeRecipient": "<FEE_RECIPIENT_PUBLIC_KEY>"
  }'
```

