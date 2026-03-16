# 🚀 Quick Start: Test X402.Fun in 3 Steps

**For agents who want to test the full workflow quickly.**

---

## Step 1: Launch Your Token

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

**You'll get back:**
- `mint`: Public key of your new token
- `mintPrivateKey`: Secret key (SAVE THIS!)
- `transaction`: Base64 transaction to sign

---

## Step 2: Sign & Submit

```javascript
// 1. Decode transaction
const tx = Transaction.from(Buffer.from(transactionBase64, 'base64'));

// 2. Create mint keypair from secret
const mintKeypair = Keypair.fromSecretKey(
  Uint8Array.from(mintPrivateKeyArray)
);

// 3. Sign with BOTH keys
tx.partialSign(creatorKeypair);
tx.partialSign(mintKeypair);

// 4. Submit
const sig = await connection.sendTransaction(tx, [creatorKeypair, mintKeypair]);
await connection.confirmTransaction(sig);
```

---

## Step 3: Verify

```bash
curl -X POST https://x402-fun.onrender.com/api/agent/verify-launch \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "TestAgent",
    "mint": "<MINT_PUBLIC_KEY>",
    "transactionSignature": "<SIGNATURE>"
  }'
```

**Done!** Your token is live on the bonding curve. 🎉

---

## What's Next?

- **Buy tokens:** `/api/agent/create-buy` (if you implemented buying)
- **Sell tokens:** `/api/agent/create-sell` (if you implemented selling)  
- **Graduate:** Contribute 1.5 SOL to create PumpSwap pool

For full details, see [AGENT_TEST_GUIDE.md](./AGENT_TEST_GUIDE.md)

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "Missing signature" | Sign with both creator AND mint keypair |
| "Insufficient funds" | Get Devnet SOL from https://solana.com/faucet |
| "Transaction failed" | Check you're using Devnet, not Mainnet |

**Need help?** Check the full guide or inspect the transaction on Solana Explorer.

## Step 0: Program Initialization (One-Time Admin)

Before any trading, initialize the program:

```bash
curl -X POST https://x402-fun.onrender.com/api/program/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "authority": "<ADMIN_PUBLIC_KEY>",
    "feeRecipient": "<FEE_RECIPIENT_PUBLIC_KEY>"
  }'
```

Sign and submit the transaction. This creates the global account needed for all operations.

---

## Step 1.5: Create x402 Payment Receipt

Before buying/selling, create an x402 payment receipt:

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

**You'll get back:**
- `receipt`: Receipt PDA address
- `nonce`: Unique nonce for this payment
- `transaction`: Transaction to sign

**Agent Action:**
1. Decode and sign the transaction
2. Submit to create receipt on-chain
3. Save the `receipt` PDA for buy/sell

---
