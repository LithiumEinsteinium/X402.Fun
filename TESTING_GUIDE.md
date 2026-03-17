# 🧪 X402.Fun Complete Testing Guide

**For:** AI Agents  
**Network:** Solana Devnet  
**Status:** Ready for Testing ✅

---

## Prerequisites

Before testing, ensure you have:

1. ✅ **Solana Devnet Wallet** with SOL balance
   - Get Devnet SOL: `https://solana.com/faucet`
   - Check balance: `solana balance --url devnet`

2. ✅ **Backend Access**
   - Base URL: `https://x402-fun.onrender.com`
   - All endpoints operational

3. ✅ **Environment**
   - Node.js installed (for local testing)
   - `@solana/web3.js` package (for transaction signing)

---

## Test Flow Overview

The X402.Fun platform uses a **two-step flow** for all operations:

```
Step 1: Backend creates x402 receipt (Oracle signs)
   ↓
Step 2: Agent executes main instruction (Agent signs)
   ↓
Step 3: Verify on-chain
```

---

## Test 1: Token Launch

### Step 1.1: Create Launch Request

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-launch \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TestToken",
    "symbol": "TST",
    "creatorWallet": "<YOUR_PUBLIC_KEY>"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "receiptTransaction": "base64_encoded_receipt_tx",
  "transaction": "base64_encoded_launch_tx",
  "mint": "mint_pda_address",
  "bondingCurve": "bonding_curve_pda",
  "message": "Step 1: Oracle submits receipt tx. Step 2: Agent signs and submits launch tx"
}
```

**Save:**
- `receiptTransaction` (backend submits this)
- `transaction` (agent signs this)
- `mint` (token mint address)

---

### Step 1.2: Backend Submits Receipt

**Backend Action:**
```javascript
// Backend submits receipt transaction with oracle wallet
const receiptSig = await connection.sendTransaction(receiptTx, [oracleKeypair]);
await connection.confirmTransaction(receiptSig);
console.log('✅ Receipt created:', receiptSig);
```

**What Happens:**
- Creates x402 receipt PDA: `[b"x402", creator_pubkey, nonce]`
- Stores: `payer`, `nonce`, `used=false`
- Oracle wallet pays fees

---

### Step 1.3: Agent Signs Launch Transaction

**Agent Action:**
```javascript
import { Transaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Decode transaction
const txBuffer = Buffer.from(transaction, 'base64');
const tx = Transaction.from(txBuffer);

// Sign with creator wallet
const creatorKeypair = Keypair.fromSecretKey(bs58.decode(CREATOR_PRIVATE_KEY));
tx.sign(creatorKeypair);

// Submit
const signature = await connection.sendTransaction(tx, [creatorKeypair]);
await connection.confirmTransaction(signature);

console.log('✅ Token launched:', signature);
console.log('Mint:', mint);
```

**What Happens:**
- Creates mint PDA: `[b"mint", creator, name]`
- Creates token state PDA
- Creates bonding curve PDA
- Initializes bonding curve with virtual reserves

---

### Step 1.4: Verify Launch

```bash
curl -X POST https://x402-fun.onrender.com/api/program/verify-launch \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_ADDRESS>",
    "transactionSignature": "<SIGNATURE>"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "verified": true,
  "message": "Token launch verified on-chain!"
}
```

---

## Test 2: Buy Tokens

### Step 2.1: Create Buy Request

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-buy \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_ADDRESS>",
    "buyerWallet": "<BUYER_PUBLIC_KEY>",
    "solAmount": 0.1
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "receiptTransaction": "base64_encoded_receipt_tx",
  "transaction": "base64_encoded_buy_tx",
  "receiptPda": "receipt_pda_address",
  "message": "Step 1: Oracle submits receipt tx. Step 2: Buyer signs and submits buy tx"
}
```

---

### Step 2.2: Backend Submits Receipt

**Backend Action:**
```javascript
const receiptSig = await connection.sendTransaction(receiptTx, [oracleKeypair]);
await connection.confirmTransaction(receiptSig);
```

---

### Step 2.3: Agent Signs Buy Transaction

**Agent Action:**
```javascript
const txBuffer = Buffer.from(transaction, 'base64');
const tx = Transaction.from(txBuffer);

// Buyer signs
const buyerKeypair = Keypair.fromSecretKey(bs58.decode(BUYER_PRIVATE_KEY));
tx.sign(buyerKeypair);

const signature = await connection.sendTransaction(tx, [buyerKeypair]);
await connection.confirmTransaction(signature);

console.log('✅ Tokens purchased:', signature);
```

**What Happens:**
- x402 receipt marked as `used=true`
- SOL transferred from buyer to bonding curve
- Tokens transferred from bonding curve to buyer
- Platform fee (1%) sent to fee recipient
- Creator fee (2%) sent to creator

---

## Test 3: Sell Tokens

### Step 3.1: Create Sell Request

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-sell \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_ADDRESS>",
    "sellerWallet": "<SELLER_PUBLIC_KEY>",
    "tokenAmount": 1000000,
    "minSolOut": 0.05
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "receiptTransaction": "base64_encoded_receipt_tx",
  "transaction": "base64_encoded_sell_tx",
  "message": "Step 1: Oracle submits receipt tx. Step 2: Seller signs and submits sell tx"
}
```

---

### Step 3.2: Backend Submits Receipt

(Same as before - oracle signs receipt)

---

### Step 3.3: Agent Signs Sell Transaction

**Agent Action:**
```javascript
const txBuffer = Buffer.from(transaction, 'base64');
const tx = Transaction.from(txBuffer);

// Seller signs
const sellerKeypair = Keypair.fromSecretKey(bs58.decode(SELLER_PRIVATE_KEY));
tx.sign(sellerKeypair);

const signature = await connection.sendTransaction(tx, [sellerKeypair]);
await connection.confirmTransaction(signature);

console.log('✅ Tokens sold:', signature);
```

**What Happens:**
- x402 receipt marked as `used=true`
- Tokens transferred from seller to bonding curve
- SOL transferred from bonding curve to seller
- Fees distributed

---

## Test 4: Contribute Liquidity (Graduate)

### Step 4.1: Create Contribution Request

```bash
curl -X POST https://x402-fun.onrender.com/api/program/create-contribute \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_ADDRESS>",
    "contributorWallet": "<CONTRIBUTOR_PUBLIC_KEY>",
    "solAmount": 1.5
  }'
```

**Note:** 1.5 SOL is the graduation threshold!

---

### Step 4.2: Agent Signs Contribution Transaction

**Agent Action:**
```javascript
const txBuffer = Buffer.from(transaction, 'base64');
const tx = Transaction.from(txBuffer);

const contributorKeypair = Keypair.fromSecretKey(bs58.decode(CONTRIBUTOR_PRIVATE_KEY));
tx.sign(contributorKeypair);

const signature = await connection.sendTransaction(tx, [contributorKeypair]);
await connection.confirmTransaction(signature);

console.log('✅ Liquidity contributed:', signature);
```

---

### Step 4.3: Verify Contribution

```bash
curl -X POST https://x402-fun.onrender.com/api/program/verify-contribute \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_ADDRESS>",
    "transactionSignature": "<SIGNATURE>",
    "expectedAmount": 1.5
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "verified": true,
  "graduated": true,
  "message": "Token graduated! Ready for PumpSwap pool creation."
}
```

---

## Test 5: Check Bonding Curve State

```bash
curl https://x402-fun.onrender.com/api/program/bonding-curve/<MINT_ADDRESS>
```

**Expected Response:**
```json
{
  "success": true,
  "mint": "mint_address",
  "virtualTokenReserves": "1073000000000000",
  "virtualSolReserves": "30000000000",
  "realTokenReserves": "793100000000000",
  "realSolReserves": "1500000000",
  "tokenTotalSupply": "1000000000000000",
  "complete": true,
  "graduated": true,
  "price": "0.000028...",
  "graduationProgress": 100
}
```

---

## Common Errors & Solutions

### Error: "AccountNotInitialized"
**Cause:** Global account doesn't exist  
**Solution:** Admin must call `initialize` endpoint first

### Error: "PaymentAlreadyUsed"
**Cause:** Receipt already consumed  
**Solution:** Create new receipt (backend generates new nonce)

### Error: "PaymentNotForCaller"
**Cause:** Wrong agent pubkey in PDA derivation  
**Solution:** Ensure PDA uses correct agent public key

### Error: "SlippageExceeded"
**Cause:** Price moved beyond `min_tokens_out` or `min_sol_out`  
**Solution:** Adjust slippage tolerance or retry

### Error: "InsufficientLiquidity"
**Cause:** Not enough SOL in bonding curve for sell  
**Solution:** Reduce sell amount or add liquidity

---

## Testing Checklist

- [ ] **Setup:** Get Devnet SOL
- [ ] **Launch:** Create token with x402 receipt
- [ ] **Verify Launch:** Confirm on-chain
- [ ] **Buy:** Purchase tokens (small amount)
- [ ] **Sell:** Sell tokens (small amount)
- [ ] **Contribute:** Add 1.5 SOL to graduate
- [ ] **Verify Graduation:** Check bonding curve state
- [ ] **Check Bonding Curve:** View reserves and price

---

## Success Criteria

✅ Token launch creates all PDAs correctly  
✅ x402 receipts are created and consumed  
✅ Buy/sell transactions update bonding curve  
✅ Fees distributed correctly (1% platform, 2% creator)  
✅ Contribution marks token as graduated  
✅ Bonding curve state reflects all operations  

---

## Next Steps After Testing

1. ✅ All tests pass → Ready for production
2. ⚠️ Issues found → Report with error messages
3. 📊 Monitor bonding curve state during tests
4. 🔍 Check transaction signatures on Solana Explorer

---

**Happy Testing! 🚀**

For questions or issues, refer to:
- Backend Summary: `BACKEND_SUMMARY.md`
- Implementation Guide: `X402_IMPLEMENTATION.md`
- Program Source: `programs/x402-fun/src/lib.rs`
