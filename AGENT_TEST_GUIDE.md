# 🤖 Agent Testing Guide: X402.Fun Full Workflow

**Backend URL:** `https://x402-fun.onrender.com`  
**Program ID:** `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF`  
**Cluster:** Solana Devnet

---

## Prerequisites

- Agent has a Solana Devnet wallet (keypair)
- Agent has Devnet SOL (for gas fees and testing trades)
- Agent can sign transactions and submit to Solana RPC
- Agent can parse base64-encoded transactions

---

## Step 1: Register Agent (One-Time)

```bash
curl -X POST https://x402-fun.onrender.com/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestAgent",
    "description": "Full workflow testing agent",
    "publicKey": "<YOUR_SOLANA_WALLET_PUBLIC_KEY>"
  }'
```

**Save:** The returned `apiKey` for subsequent calls.

**Expected Response:**
```json
{
  "success": true,
  "apiKey": "some-uuid-here",
  "agent": {
    "id": "...",
    "name": "TestAgent",
    ...
  }
}
```

---

## Step 2: Launch a Token

```bash
curl -X POST https://x402-fun.onrender.com/api/agent/create-launch \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AgentTestToken",
    "symbol": "AGNT",
    "creatorWallet": "<YOUR_SOLANA_WALLET_PUBLIC_KEY>"
  }'
```

**Critical Check:** Response **MUST** include:
- ✅ `mint` (public key)
- ✅ `mintPrivateKey` (secret key array) ← **This was the bug fix!**
- ✅ `bondingCurve` (PDA)
- ✅ `tokenAccount` (PDA)
- ✅ `transaction` (base64)

**Expected Response:**
```json
{
  "success": true,
  "mint": "PublicKeyString",
  "mintPrivateKey": "[59,128,234,...]",
  "bondingCurve": "BondingCurvePDA",
  "tokenAccount": "TokenPDA",
  "transaction": "base64_encoded_tx",
  "message": "Sign this transaction with your wallet and submit to Solana devnet"
}
```

---

## Step 3: Parse & Deserialize Transaction

Your agent must:

### 3.1 Decode the base64 transaction:
```javascript
const txBuffer = Buffer.from(transactionBase64, 'base64');
const tx = Transaction.from(txBuffer);
```

### 3.2 Extract the mint keypair:
```javascript
const mintSecretKey = Uint8Array.from(mintPrivateKeyArray);
const mintKeypair = Keypair.fromSecretKey(mintSecretKey);
```

### 3.3 Sign with BOTH keypairs:
```javascript
tx.partialSign(creatorKeypair);  // Your agent's wallet
tx.partialSign(mintKeypair);     // The generated mint keypair
```

### 3.4 Submit to Solana Devnet:
```javascript
const signature = await connection.sendTransaction(tx, [creatorKeypair, mintKeypair], {
  skipPreflight: false,
  preflightCommitment: 'confirmed'
});
await connection.confirmTransaction(signature, 'confirmed');
```

**Save:** The transaction `signature` for verification.

---

## Step 4: Verify Launch On-Chain

```bash
curl -X POST https://x402-fun.onrender.com/api/program/verify-launch \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY_FROM_STEP_2>",
    "transactionSignature": "<SIGNATURE_FROM_STEP_3>",
    "name": "AgentTestToken",
    "symbol": "AGNT",
    "creatorWallet": "<YOUR_SOLANA_WALLET_PUBLIC_KEY>"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "verified": true,
  "mint": "PublicKeyString",
  "name": "AgentTestToken",
  "symbol": "AGNT",
  "bondingCurve": "BondingCurvePDA",
  "message": "Token launched successfully on devnet!"
}
```

---

## Step 5: Buy Tokens (Test Bonding Curve)

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-buy \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "buyerWallet": "<BUYER_WALLET_PUBLIC_KEY>",
    "solAmount": 0.1,
    "minTokensOut": 0
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "mint": "PublicKeyString",
  "buyer": "BuyerPublicKey",
  "solAmount": 0.1,
  "minTokensOut": "auto-calculated",
  "x402Receipt": "ReceiptPDA",
  "nonce": "hex_nonce",
  "vaultTokenAccount": "VaultPDA",
  "buyerTokenAccount": "BuyerTokenPDA",
  "transaction": "base64_encoded_tx",
  "message": "Sign to buy 0.1 SOL worth of tokens"
}
```

**Agent Action:**
1. Decode and sign the transaction with buyer's wallet
2. Submit to Solana Devnet
3. Confirm transaction success

---

## Step 6: Sell Tokens (Test Bonding Curve Exit)

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-sell \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "sellerWallet": "<SELLER_WALLET_PUBLIC_KEY>",
    "tokenAmount": 1000000,
    "minSolOut": 0.05
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "mint": "PublicKeyString",
  "seller": "SellerPublicKey",
  "tokenAmount": 1000000,
  "minSolOut": "auto-calculated",
  "x402Receipt": "ReceiptPDA",
  "vaultTokenAccount": "VaultPDA",
  "sellerTokenAccount": "SellerTokenPDA",
  "transaction": "base64_encoded_tx",
  "message": "Sign to sell 1000000 tokens"
}
```

**Agent Action:**
1. Decode and sign the transaction with seller's wallet
2. Submit to Solana Devnet
3. Confirm transaction success

---

## Step 7: Contribute Liquidity (Graduate Token)

To graduate, contribute at least **1.5 SOL** to the bonding curve:

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-contribute \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "contributorWallet": "<CONTRIBUTOR_WALLET_PUBLIC_KEY>",
    "solAmount": 1.5
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "mint": "PublicKeyString",
  "contributor": "ContributorPublicKey",
  "amount": 1.5,
  "platformFee": "0.1500",
  "poolAmount": "1.3500",
  "transaction": "base64_encoded_tx",
  "message": "Sign to contribute 1.5 SOL. 0.1500 SOL platform fee will be deducted."
}
```

**Agent Action:**
1. Decode and sign the transaction
2. Submit to Solana Devnet
3. Confirm transaction success

Then verify the contribution:

```bash
curl -X POST https://x402-fun.onrender.com/api/program/verify-contribute \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "transactionSignature": "<CONTRIBUTION_SIGNATURE>",
    "expectedAmount": 1.5
  }'
```

---

## Step 8: Create PumpSwap Pool (Graduation)

Once graduated (1.5 SOL contributed), create the PumpSwap pool:

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-pool \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBLIC_KEY>",
    "contributorWallet": "<CONTRIBUTOR_WALLET_PUBLIC_KEY>",
    "poolIndex": 0
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "mint": "PublicKeyString",
  "bondingCurve": "BondingCurvePDA",
  "tokenAccount": "TokenPDA",
  "pool": "PoolPDA",
  "poolIndex": 0,
  "accounts": {
    "curveWSOL": "...",
    "curveLP": "...",
    "vaultTokenAccount": "...",
    "lpMint": "...",
    "poolBaseToken": "...",
    "poolQuoteToken": "...",
    "globalConfig": "...",
    "eventAuthority": "..."
  },
  "transaction": "base64_encoded_tx",
  "message": "Sign this transaction to create the PumpSwap pool!"
}
```

**Agent Action:**
1. Decode and sign the transaction
2. Submit to Solana Devnet
3. Confirm transaction success

---

## ✅ Full Test Checklist

- [ ] **Registered** agent and saved `apiKey`
- [ ] **Launched** token and received `mintPrivateKey` ✅
- [ ] **Deserialized** transaction from base64
- [ ] **Signed** with **both** creator wallet AND mint keypair
- [ ] **Submitted** transaction to Solana Devnet
- [ ] **Confirmed** transaction succeeded
- [ ] **Verified** launch via `/api/program/verify-launch`
- [ ] **Bought** tokens on bonding curve
- [ ] **Sold** tokens on bonding curve
- [ ] **Contributed** 1.5 SOL to graduate
- [ ] **Verified** contribution via `/api/program/verify-contribute`
- [ ] **Created** PumpSwap pool for graduation

---

## 🚨 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `mintPrivateKey` missing | Wrong endpoint | Use `/api/agent/create-launch` NOT `/api/tokens/launch` |
| Transaction fails | Missing mint signature | Sign with **both** creator AND mint keypairs |
| "Insufficient funds" | No Devnet SOL | Get Devnet SOL from https://solana.com/faucet |
| "Transaction not found" | Wrong cluster | Ensure using Devnet RPC, not Mainnet |
| "Route.post() requires callback" | Old deployment | Wait for Render to finish deploying latest commit |

---

## 🔗 Useful Links

- **Devnet Faucet:** https://solana.com/faucet
- **Solana Explorer (Devnet):** https://explorer.solana.com/?cluster=devnet
- **Your Program:** `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF`
- **Backend Health:** https://x402-fun.onrender.com/health
- **GitHub Repo:** https://github.com/LithiumEinsteinium/X402.Fun

---

## 📝 Notes for Agents

1. **Always use `/api/program/*` endpoints** for the full program integration flow
2. **The `mintPrivateKey` is critical** - without it, you cannot sign the mint keypair
3. **Double-sign transactions** - both creator wallet and mint keypair are required
4. **Test on Devnet first** before any mainnet operations
5. **Save all signatures** for debugging and verification

---

**Ready to test? Start with Step 1 and report back any issues!** 🚀🤙
