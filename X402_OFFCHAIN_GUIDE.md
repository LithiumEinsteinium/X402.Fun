# 📝 x402 Off-Chain Payment Guide

**Quick Start:** Off-chain x402 receipts for agent-gated trading

---

## Overview

Instead of creating on-chain PDAs for x402 receipts (which requires program support), we use **off-chain receipt tracking**:

1. Agent creates payment request → gets receipt ID
2. Agent sends SOL to platform wallet
3. Backend tracks receipt in memory
4. Buy/sell operations reference the receipt ID
5. Backend marks receipt as used after trade

---

## Step-by-Step Flow

### 1. Create Payment Request

```bash
curl -X POST https://x402-fun.onrender.com/api/x402-integration/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "TestAgent",
    "action": "buy",
    "amount": 0.1,
    "wallet": "<YOUR_PUBLIC_KEY>"
  }'
```

**Response:**
```json
{
  "success": true,
  "receiptId": "a1b2c3d4e5f6...",
  "action": "buy",
  "amount": 0.0001,
  "paymentAddress": "7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR",
  "expiresInSeconds": 600,
  "instructions": "Send 0.0001 SOL to 7tZMag... with memo: a1b2c3d4e5f6..."
}
```

### 2. Send Payment

Send the required SOL amount to the platform wallet:
- **To:** `7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR`
- **Amount:** As specified in receipt
- **Memo (optional):** Include receiptId for tracking

### 3. Execute Trade

Use the `receiptId` in your buy/sell transaction:

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-buy \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "buyerWallet": "<BUYER_PUBLIC_KEY>",
    "solAmount": 0.1,
    "receiptId": "a1b2c3d4e5f6..."
  }'
```

**Note:** The `receiptId` parameter is currently **optional** for testing. You can omit it to test the basic buy/sell flow.

---

## Fee Structure

| Action | Fee Type | Amount | Example |
|--------|----------|--------|---------|
| Launch | Fixed | 0.25 SOL | Token creation |
| Buy | Percentage | 0.1% | 0.1 SOL trade = 0.0001 SOL fee |
| Sell | Percentage | 0.1% | 0.1 SOL trade = 0.0001 SOL fee |
| Contribute | Percentage | 1% | 1.5 SOL contribution = 0.015 SOL fee |

---

## Receipt Lifecycle

1. **Created:** When you call `/api/x402-integration/create`
2. **Active:** For 10 minutes (600 seconds)
3. **Used:** After successful trade (marked automatically)
4. **Expired:** After 10 minutes or after use

**Important:** Receipts are single-use and expire after 10 minutes.

---

## Testing Without x402

For initial testing, you can **omit the x402 receipt** entirely:

```bash
# This works without x402 receipt (testing mode)
curl -X POST https://x402-fun.onrender.com/api/program/create-buy \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "2v6tYB5zZUKrBrN6ihg5ZneUccjTJrVZ5B4aRMr2ssLq",
    "buyerWallet": "<YOUR_PUBLIC_KEY>",
    "solAmount": 0.1
  }'
```

Once you're ready to enforce x402 payments, set `requireX402: true` in the backend config.

---

## API Reference

### GET `/api/x402-integration/price`

Get fee information for an action.

**Parameters:**
- `action` (required): `launch`, `buy`, `sell`, or `contribute`
- `amount` (optional): Trade amount for percentage fees

**Example:**
```bash
curl "https://x402-fun.onrender.com/api/x402-integration/price?action=buy&amount=0.1"
```

### POST `/api/x402-integration/create`

Create a payment receipt.

**Body:**
```json
{
  "agentId": "TestAgent",
  "action": "buy",
  "amount": 0.1,
  "wallet": "<YOUR_PUBLIC_KEY>"
}
```

### POST `/api/x402-integration/verify`

Verify a receipt is valid and unused.

**Body:**
```json
{
  "receiptId": "a1b2c3d4e5f6..."
}
```

---

## Production Notes

⚠️ **This is an off-chain implementation:**
- Receipts stored in memory (lost on restart)
- No on-chain verification
- Suitable for devnet/testing

**For production:**
- Use Redis or database for receipt storage
- Add on-chain verification
- Implement proper payment monitoring

---

**Status:** ✅ Ready for testing

The off-chain approach allows you to test the complete buy/sell flow immediately without modifying the Solana program.

