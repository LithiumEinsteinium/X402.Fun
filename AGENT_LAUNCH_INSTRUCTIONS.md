# X402.Fun Agent Launch Instructions

## Overview
Use X402.Fun API to launch a meme token on Solana. The agent pays 0.25 SOL to launch.

## Base URL
```
https://x402-fun.onrender.com
```

## Program Info
- **Program ID**: `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF`
- **Cluster**: Devnet

## Token Distribution
- **30%** of tokens → Bonding curve (buyable)
- **70%** of tokens → Reserved for liquidity pool

## Fee Distribution
- **Platform**: 1%
- **Creator**: 2%
- **Graduation**: 1.5 SOL (devnet)

## Step-by-Step Process

### Step 1: Get Payment Info
```bash
curl "https://x402-fun.onrender.com/api/x402/price?action=launch"
```

Response:
```json
{
  "action": "launch",
  "price": 0.25,
  "currency": "SOL",
  "paymentAddress": "7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR"
}
```

### Step 2: Create Launch Transaction
```bash
curl -X POST "https://x402-fun.onrender.com/api/program/create-launch" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-name",
    "name": "Your Token Name",
    "symbol": "SYMBOL",
    "creatorWallet": "YOUR_SOLANA_WALLET_ADDRESS"
  }'
```

### Step 3: Sign and Submit Transaction
Use your Solana wallet to sign the transaction and submit to Solana devnet.

### Step 4: Verify Launch
```bash
curl -X POST "https://x402-fun.onrender.com/api/program/verify-launch" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-name",
    "mint": "TOKEN_MINT_ADDRESS",
    "transactionSignature": "YOUR_TX_SIGNATURE",
    "name": "Token Name",
    "symbol": "SYMBOL",
    "creatorWallet": "YOUR_WALLET"
  }'
```

### Step 5: Contribute Liquidity (Graduate)
```bash
curl -X POST "https://x402-fun.onrender.com/api/program/create-contribute" \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "TOKEN_MINT_ADDRESS",
    "contributorWallet": "YOUR_WALLET",
    "solAmount": 1.5
  }'
```

### Step 6: Verify Graduation
```bash
curl -X POST "https://x402-fun.onrender.com/api/program/verify-contribute" \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "TOKEN_MINT_ADDRESS",
    "transactionSignature": "YOUR_TX_SIGNATURE",
    "expectedAmount": 1.5
  }'
```

### Step 7: Create PumpSwap Pool (Optional)
Once graduated, create the real PumpSwap pool:
```bash
curl -X POST "https://x402-fun.onrender.com/api/program/create-pool" \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "TOKEN_MINT_ADDRESS",
    "contributorWallet": "YOUR_WALLET"
  }'
```

## Requirements
- Devnet SOL: https://faucet.solana.com/
- Solana wallet (Phantom, Solflare, etc.)

## Important Notes
1. **Devnet Only**: Currently testing on devnet
2. **Wallet**: You need a Solana wallet with devnet SOL
3. **Token Split**: 30% buyable, 70% for liquidity pool

## Contract Info
- **Program ID**: `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF`
- **View on SolScan**: https://solscan.io/program/63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF?cluster=devnet
