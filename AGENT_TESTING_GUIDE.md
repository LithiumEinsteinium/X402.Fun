# X402.Fun Agent Testing Guide

## Overview
This guide walks an external AI agent through testing the X402.Fun program on Solana devnet.

## Prerequisites
- Solana wallet with devnet SOL
- Ability to sign and submit transactions to Solana devnet
- Access to Solana CLI or SDK

## Program Details
- **Program ID:** `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF`
- **RPC:** `https://api.devnet.solana.com`
- **Cluster:** devnet

## API Base URL
```
https://x402-fun.onrender.com
```

---

## Step 1: Get Payment Info

```bash
curl "https://x402-fun.onrender.com/api/x402/price?action=launch"
```

**Expected Response:**
```json
{
  "action": "launch",
  "price": 0.25,
  "currency": "SOL",
  "paymentAddress": "7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR"
}
```

**Note:** The 0.25 SOL launch fee goes to the platform wallet. This is currently waived for testing.

---

## Step 2: Create Launch Transaction

```bash
curl -X POST "https://x402-fun.onrender.com/api/program/create-launch" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-id",
    "name": "Your Token Name",
    "symbol": "SYMBOL",
    "creatorWallet": "YOUR_SOLANA_WALLET_ADDRESS"
  }'
```

**Parameters:**
- `agentId`: Unique identifier for your agent
- `name`: Full name of the token (max 32 chars)
- `symbol`: Token symbol/ticker (max 10 chars)
- `creatorWallet`: Your Solana wallet address (base58)

**Expected Response:**
```json
{
  "success": true,
  "mint": "TOKEN_MINT_ADDRESS",
  "bondingCurve": "BONDING_CURVE_PDA_ADDRESS",
  "transaction": "BASE64_ENCODED_TRANSACTION",
  "message": "Sign this transaction with your wallet and submit to Solana devnet"
}
```

---

## Step 3: Sign and Submit Transaction

1. Decode the base64 transaction
2. Sign with your Solana wallet
3. Submit to `https://api.devnet.solana.com`

**Important:** The transaction creates:
- Token mint
- Bonding curve PDA
- Associated token accounts

**Transaction will include:**
- Create mint account
- Initialize mint
- Create bonding curve PDA
- Create token accounts
- Create metadata (if URI provided)

---

## Step 4: Verify Launch

```bash
curl -X POST "https://x402-fun.onrender.com/api/program/verify-launch" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-id",
    "mint": "TOKEN_MINT_ADDRESS_FROM_STEP_2",
    "transactionSignature": "YOUR_TRANSACTION_SIGNATURE",
    "name": "Your Token Name",
    "symbol": "SYMBOL",
    "creatorWallet": "YOUR_SOLANA_WALLET_ADDRESS"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "verified": true,
  "mint": "TOKEN_MINT_ADDRESS",
  "name": "Your Token Name",
  "symbol": "SYMBOL",
  "bondingCurve": "BONDING_CURVE_PDA",
  "message": "Token launched successfully on devnet!"
}
```

---

## Step 5: Contribute to Graduate (1.5 SOL)

Once launched, contribute 1.5 SOL to trigger graduation:

```bash
curl -X POST "https://x402-fun.onrender.com/api/program/create-contribute" \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "TOKEN_MINT_ADDRESS",
    "contributorWallet": "YOUR_SOLANA_WALLET_ADDRESS",
    "solAmount": 1.5
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "mint": "TOKEN_MINT_ADDRESS",
  "contributor": "YOUR_WALLET",
  "amount": 1.5,
  "transaction": "BASE64_ENCODED_TRANSACTION"
}
```

---

## Step 6: Sign and Submit Contribution

1. Sign the contribution transaction
2. Submit to Solana devnet
3. This transfers 1.5 SOL to the bonding curve

---

## Step 7: Verify Graduation

```bash
curl -X POST "https://x402-fun.onrender.com/api/program/verify-contribute" \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "TOKEN_MINT_ADDRESS",
    "transactionSignature": "CONTRIBUTION_TRANSACTION_SIGNATURE",
    "expectedAmount": 1.5
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "verified": true,
  "mint": "TOKEN_MINT_ADDRESS",
  "amount": 1.5,
  "breakdown": {
    "platformFee": "0.2250",
    "poolAmount": "1.2750"
  },
  "message": "Token graduated! 🎉 Pool created with 70% tokens + 85% SOL"
}
```

---

## Step 8: Create PumpSwap Pool (OPTIONAL)

Once graduated, create the real PumpSwap liquidity pool:

```bash
curl -X POST "https://x402-fun.onrender.com/api/program/create-pool" \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "TOKEN_MINT_ADDRESS",
    "contributorWallet": "YOUR_SOLANA_WALLET_ADDRESS"
  }'
```

**This creates:**
- WSOL ATA for bonding curve
- LP token ATA for bonding curve
- Real PumpSwap pool with 70% tokens + 85% SOL

---

## Verification Links

After each step, verify on SolScan:
- **Devnet:** https://solscan.io/program/63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF?cluster=devnet

Check your token:
- **Devnet:** https://solscan.io/token/YOUR_TOKEN_MINT?cluster=devnet

---

## Complete Test Flow Summary

```
1. GET /api/x402/price?action=launch
2. POST /api/program/create-launch → Get transaction
3. Sign with wallet → Submit to Solana
4. POST /api/program/verify-launch → Confirm on-chain
5. POST /api/program/create-contribute → Get contribution tx
6. Sign with wallet → Submit 1.5 SOL
7. POST /api/program/verify-contribute → Confirm graduation
8. POST /api/program/create-pool → Create PumpSwap pool (optional)
```

---

## Troubleshooting

### "Transaction not found"
- Wait a few seconds for confirmation
- Check on SolScan

### "Insufficient funds"
- Get devnet SOL: https://faucet.solana.com/

### "Invalid transaction"
- Ensure you're using devnet RPC
- Check wallet has enough SOL for fees

---

## Test Results to Report

1. ✅ Was launch transaction created successfully?
2. ✅ Did the token appear on-chain (SolScan)?
3. ✅ Was the bonding curve created?
4. ✅ Did contribution work (1.5 SOL)?
5. ✅ Did graduation trigger?
6. ✅ Was PumpSwap pool created? (if Step 8 tested)

---

## Need Help?

If any step fails, capture:
- Error message
- Transaction signature (if any)
- Request/response payloads

This helps debug any issues!
