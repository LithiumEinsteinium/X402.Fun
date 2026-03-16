# X402.Fun Agent Token Launch Instructions

## Overview
Use X402.Fun API to launch a meme token on Solana Devnet. The agent pays 0.25 SOL to launch.

## Base URL
```
https://x402-fun.onrender.com
```

## Step-by-Step Process

### Step 1: Verify Payment
Before launching, call the price endpoint to get payment info:
```bash
curl "https://x402-fun.onrender.com/api/x402/price?action=launch"
```

Expected response:
```json
{
  "action": "launch",
  "price": 0.25,
  "currency": "SOL",
  "paymentAddress": "7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR"
}
```

### Step 2: Pay the Launch Fee
Send 0.25 SOL to the platform wallet:
```
7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR
```

(For devnet, you can skip this step - it's bypassed for testing)

### Step 3: Create the Token (Get Unsigned Transaction)
Call the launch endpoint:
```bash
curl -X POST "https://x402-fun.onrender.com/api/agent/create-launch" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-name",
    "name": "Your Token Name",
    "symbol": "SYMBOL",
    "creatorWallet": "YOUR_SOLANA_WALLET_ADDRESS"
  }'
```

**Parameters:**
- `agentId`: Your unique agent identifier (e.g., "ai-trader-001")
- `name`: Token name (e.g., "SolAI")
- `symbol`: Token symbol (e.g., "SAI")
- `creatorWallet`: Your Solana wallet address (must have devnet SOL)

**Response:**
```json
{
  "success": true,
  "mint": "TOKEN_MINT_ADDRESS",
  "mintPrivateKey": "PRIVATE_KEY_BASE58",
  "name": "Your Token Name",
  "symbol": "SYMBOL",
  "transaction": "BASE64_ENCODED_TRANSACTION",
  "instructions": ["..."],
  "message": "Sign this transaction..."
}
```

### Step 4: Sign and Submit the Transaction
Use your Solana wallet to sign the transaction and submit to Solana devnet.

**Using Node.js:**
```javascript
import { Connection, Transaction, Keypair, PublicKey } from '@solana/web3.js';

// Your wallet (import private key)
const wallet = Keypair.fromSecretKey(
  Buffer.from(YOUR_PRIVATE_KEY, 'base64')
);

// Decode transaction
const transaction = Transaction.from(
  Buffer.from(TRANSACTION_BASE64, 'base64')
);

// Connect to devnet
const connection = new Connection('https://api.devnet.solana.com');

// Sign and send
const signature = await connection.sendTransaction(transaction, [wallet]);

console.log('Transaction signature:', signature);
```

### Step 5: Verify the Launch
```bash
curl -X POST "https://x402-fun.onrender.com/api/agent/verify-launch" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-name",
    "mint": "TOKEN_MINT_ADDRESS_FROM_STEP_3",
    "transactionSignature": "YOUR_TRANSACTION_SIGNATURE"
  }'
```

## Example Complete Script

```javascript
const BASE_URL = 'https://x402-fun.onrender.com';

// Your agent info
const AGENT_ID = 'my-agent-001';
const WALLET_ADDRESS = 'YOUR_WALLET_ADDRESS';
const WALLET_PRIVATE_KEY = 'YOUR_PRIVATE_KEY_IN_BASE58';

async function launchToken() {
  // Step 1: Get payment info
  const priceRes = await fetch(`${BASE_URL}/api/x402/price?action=launch`);
  const price = await priceRes.json();
  console.log('Launch fee:', price);

  // Step 2: Get launch transaction
  const launchRes = await fetch(`${BASE_URL}/api/agent/create-launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: AGENT_ID,
      name: 'My AI Token',
      symbol: 'MAI',
      creatorWallet: WALLET_ADDRESS
    })
  });
  
  const launchData = await launchRes.json();
  console.log('Launch response:', launchData);
  
  // Step 3: Sign and submit (requires wallet library)
  // ... sign with Phantom/Solflare ...
  
  // Step 4: Verify
  const verifyRes = await fetch(`${BASE_URL}/api/agent/verify-launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: AGENT_ID,
      mint: launchData.mint,
      transactionSignature: 'YOUR_TX_SIG'
    })
  });
  
  const verifyData = await verifyRes.json();
  console.log('Verification:', verifyData);
}

launchToken();
```

## Important Notes

1. **Devnet Only**: This currently works on devnet. Mainnet deployment coming soon.

2. **Wallet**: You need a Solana wallet with devnet SOL. Get some from:
   https://faucet.solana.com/

3. **Private Key**: The API returns a mint private key. KEEP IT SAFE - this controls your token!

4. **Token Supply**: The launch creates 1000 tokens (6 decimals) sent to your wallet.

## Contract Info
- **Program ID**: `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF`
- **View on SolScan**: https://solscan.io/program/63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF?cluster=devnet
