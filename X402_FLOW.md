# 🔐 X402.Fun Complete Flow Guide

**For AI Agents - x402 Gated Trading on Bonding Curve**

---

## Architecture Overview

**Phase 1: Bonding Curve (Agent-Only via x402)**
- ✅ Launch token
- ⏳ Buy tokens (requires x402 payment)
- ⏳ Sell tokens (requires x402 payment)
- ⏳ Contribute liquidity (requires x402 payment)
- Graduate at 1.5 SOL → creates PumpSwap pool

**Phase 2: PumpSwap (Open Trading)**
- Anyone can trade via PumpSwap after graduation
- Standard SPL token swaps
- x402 still used for agent verification/fees

---

## Step-by-Step Flow

### 0. Program Initialization (One-Time Only)

**Before any trading can occur, the program must be initialized:**

```bash
curl -X POST https://x402-fun.onrender.com/api/program/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "authority": "<ADMIN_WALLET_PUBLIC_KEY>",
    "feeRecipient": "<FEE_RECIPIENT_WALLET_PUBLIC_KEY>"
  }'
```

**Agent Action:**
1. Sign transaction with authority wallet
2. Submit to Solana
3. Confirm transaction success

**Result:** Global account created, program ready for trading

---

### 1. Launch Token (Working! ✅)

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

**Returns:** `mint`, `mintPrivateKey`, `transaction`

**Agent Action:**
1. Decode transaction
2. Sign with creator + mint keypair
3. Submit to Solana
4. Verify on-chain

---

### 2. Create x402 Payment (Required Before Buy/Sell)

**Before buying or selling, agent must pay x402 fee:**

```bash
curl -X POST https://x402-fun.onrender.com/api/x402/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "TestAgent",
    "action": "buy",
    "amount": 0.1
  }'
```

**Returns:** Payment request with instructions

**Agent Action:**
1. Pay x402 fee (transfer to fee recipient)
2. Get payment receipt PDA
3. Use receipt in buy/sell transaction

---

### 3. Buy Tokens (Bonding Curve)

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-buy \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "buyerWallet": "<BUYER_PUBLIC_KEY>",
    "solAmount": 0.1,
    "minTokensOut": 0
  }'
```

**Returns:** Transaction with x402 receipt verification

**Agent Action:**
1. Verify x402 receipt is included
2. Sign transaction with buyer wallet
3. Submit to Solana
4. Confirm token transfer

---

### 4. Sell Tokens (Bonding Curve)

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-sell \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "sellerWallet": "<SELLER_PUBLIC_KEY>",
    "tokenAmount": 1000000,
    "minSolOut": 0.05
  }'
```

**Returns:** Transaction with x402 receipt verification

**Agent Action:**
1. Verify x402 receipt is included
2. Sign transaction with seller wallet
3. Submit to Solana
4. Confirm SOL received

---

### 5. Contribute Liquidity (Graduate)

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-contribute \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "contributorWallet": "<CONTRIBUTOR_PUBLIC_KEY>",
    "solAmount": 1.5
  }'
```

**Agent Action:**
1. Sign and submit contribution
2. Verify graduation at 1.5 SOL
3. Program creates PumpSwap pool automatically

---

### 6. Create PumpSwap Pool (Post-Graduation)

Once graduated (1.5 SOL contributed):

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-pool \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "contributorWallet": "<CONTRIBUTOR_PUBLIC_KEY>",
    "poolIndex": 0
  }'
```

**Agent Action:**
1. Sign and submit pool creation
2. Liquidity migrated to PumpSwap
3. Open trading begins!

---

## x402 Payment Flow Details

### Payment Structure

```
Payment = Platform Fee (15%) + Creator Fee (2%)
Net to Curve = Amount - Fees
```

### Payment Verification

1. **Agent sends payment** to fee recipient
2. **Program verifies** payment receipt PDA
3. **Receipt marked as used** to prevent replay attacks
4. **Trade executes** only if payment verified

### Receipt PDA Derivation

```javascript
const [receiptPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('x402'), buyer.toBuffer(), nonce],
  programId
);
```

---

## Current Status

| Feature | Status | Endpoint |
|---------|--------|----------|
| Program Initialize | ✅ Implemented | `/api/program/initialize` |
| Launch Token | ✅ Working | `/api/agent/create-launch` |
| x402 Payment | ⏳ In Progress | `/api/x402/*` |
| Buy Tokens | ⏳ Needs x402 integration | `/api/program/create-buy` |
| Sell Tokens | ⏳ Needs x402 integration | `/api/program/create-sell` |
| Contribute | ⏳ Needs x402 integration | `/api/program/create-contribute` |
| Create Pool | ✅ Implemented | `/api/program/create-pool` |

---

## Error Handling

| Error | Meaning | Fix |
|-------|---------|-----|
| "Global account not found" | Program not initialized | Call `/api/program/initialize` first |
| "x402 payment required" | No valid receipt | Create x402 payment before trade |
| "Receipt already used" | Replay attack prevented | Use new nonce for each trade |
| "Insufficient liquidity" | Not enough in curve | Add liquidity or reduce trade size |

---

## Next Steps

1. ✅ Program initialization endpoint added
2. ⏳ Implement x402 payment creation
3. ⏳ Update buy/sell to verify x402 receipts
4. ⏳ Test complete flow end-to-end

**Stay tuned for updates!** 🚀
