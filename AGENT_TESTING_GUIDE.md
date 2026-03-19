# X402.Fun — Agent Testing & Debugging Guide

## Critical: How to Submit Transactions Correctly

The backend builds and returns transactions. You sign and submit them.
**The RPC you use to submit matters enormously.**

### DO NOT use `api.devnet.solana.com` to submit transactions

This endpoint is load-balanced across many nodes. Some nodes have stale state
and will reject valid transactions with misleading errors like `IncorrectProgramId`.
This is an infrastructure problem with the public endpoint — not a bug in the
transaction or the program.

### USE one of these instead

```
https://devnet.helius-rpc.com/?api-key=<YOUR_KEY>   ← best option, free signup
https://rpc.ankr.com/solana_devnet                   ← no signup needed
```

Get a free Helius key at: https://dev.helius.xyz

---

## What IncorrectProgramId Actually Means

When you see `IncorrectProgramId` on devnet, it is almost always one of two things:

**1. You are using the public devnet RPC (api.devnet.solana.com)**
The fix is to switch to Helius or Ankr as above.

**2. The transaction has an extra or wrong account**
The program sees account N expecting `system_program` but finds something else.
This is a backend bug — report it with the full transaction base64 so it can be
inspected.

It is **never** caused by the Token Program ID being wrong. `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` is a hardcoded constant in the backend code — no RPC can change it.

---

## Correct Testing Sequence

Follow these phases in order. Do not skip steps.

### Phase 1 — Verify backend is live
```
GET /health
→ { "status": "ok", "service": "X402.Fun", "cluster": "devnet" }

GET /api/program/config
→ programId must be: ES8SmrSReeDZU5Zw3VzqyotUL6rSSwYkE2QT9C4mxmJT
```

If config shows a different programId, stop — the backend env var is wrong.

### Phase 2 — Verify your RPC works
Before running any tests, confirm your RPC can see the deployed program:

```javascript
const { Connection } = require('@solana/web3.js');
const conn = new Connection('https://rpc.ankr.com/solana_devnet');
const info = await conn.getAccountInfo(
  new PublicKey('ES8SmrSReeDZU5Zw3VzqyotUL6rSSwYkE2QT9C4mxmJT')
);
console.log('executable:', info.executable); // must be true
```

If `executable` is false or info is null, your RPC is on a stale node — switch RPCs.

### Phase 3 — Launch a token (creates vault ATA automatically)

```
POST /api/program/create-launch
Body: { "name": "TestToken", "symbol": "TEST", "creatorWallet": "<YOUR_PUBKEY>" }
```

The response will contain:
- `transaction` — base64 unsigned tx (already includes vault ATA creation)
- `mint` — save this, needed for all subsequent calls
- `vaultTokenAccount` — the vault ATA that will be created when you sign/submit

**Sign and submit using Helius/Ankr RPC:**
```javascript
const tx = Transaction.from(Buffer.from(response.transaction, 'base64'));
tx.sign(yourKeypair);
// USE HELIUS OR ANKR HERE — NOT api.devnet.solana.com
const sig = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: 'confirmed'
});
await connection.confirmTransaction(sig, 'confirmed');
```

Then verify:
```
POST /api/program/verify-launch
Body: { "mint": "<mint from above>", "transactionSignature": "<sig>" }
→ verified: true
```

### Phase 4 — Create your buyer ATA (required before buying)

The vault ATA is created automatically at launch. Your personal buyer ATA is not.
You must create it before calling create-buy:

```javascript
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } 
  = require('@solana/spl-token');

const mint = new PublicKey('<mint from launch>');
const buyerAta = getAssociatedTokenAddressSync(mint, yourKeypair.publicKey);

const tx = new Transaction().add(
  createAssociatedTokenAccountInstruction(
    yourKeypair.publicKey,  // payer
    buyerAta,               // ATA address
    yourKeypair.publicKey,  // owner
    mint
  )
);
const sig = await connection.sendAndConfirmTransaction(tx, [yourKeypair]);
```

### Phase 5 — Buy tokens

```
POST /api/program/create-buy
Body: {
  "mint": "<mint>",
  "buyerWallet": "<YOUR_PUBKEY>",
  "solAmount": 0.1
}
```

Sign and submit with Helius/Ankr. Then verify with `POST /api/program/verify-launch`.

### Phase 6 — Check bonding curve progress

```
GET /api/program/bonding-curve/<mint>
→ progressPercent, pricePerToken, complete
```

### Phase 7 — Sell tokens

```
POST /api/program/create-sell
Body: {
  "mint": "<mint>",
  "sellerWallet": "<YOUR_PUBKEY>",
  "tokenAmount": 100
}
```

`tokenAmount` is whole tokens (not base units — the backend converts internally).

### Phase 8 — Contribute toward graduation (no receipt needed)

```
POST /api/program/create-contribute
Body: {
  "mint": "<mint>",
  "contributorWallet": "<YOUR_PUBKEY>",
  "solAmount": 0.5
}
```

This is ungated — no x402 receipt required. One step only.

---

## How to Diagnose a Failed Transaction

When a transaction fails, do this before reporting:

```javascript
// 1. Decode and inspect the transaction BEFORE submitting
const tx = Transaction.from(Buffer.from(response.transaction, 'base64'));
console.log('num instructions:', tx.instructions.length);
tx.instructions.forEach((ix, i) => {
  console.log(`ix[${i}] programId:`, ix.programId.toBase58());
  console.log(`ix[${i}] accounts:`, ix.keys.map(k => ({
    pubkey: k.pubkey.toBase58(),
    isSigner: k.isSigner,
    isWritable: k.isWritable
  })));
});

// 2. Simulate before submitting
const sim = await connection.simulateTransaction(tx);
console.log('simulation:', JSON.stringify(sim.value, null, 2));
```

The simulation will show the exact on-chain error before you waste a transaction.
Report the simulation output — it is far more useful than the submit error.

---

## Known Error Codes

| Error | Meaning | Fix |
|-------|---------|-----|
| `IncorrectProgramId` on submit | Almost always the public devnet RPC | Switch to Helius/Ankr |
| `AccountNotInitialized` on vault | Launch tx was submitted before this fix | Re-launch with the current backend |
| `AccountNotInitialized` on buyer ATA | You skipped Phase 4 | Create your buyer ATA first |
| `ConstraintRaw` | Wrong fee_recipient or creator in tx | Backend will fix this — report it |
| `InstructionError: 0` | Error in first instruction (vault ATA create) | Token may already have been launched — check if mint already exists |

---

## Wallet Requirements

| Action | Minimum SOL needed |
|--------|--------------------|
| Launch token | ~0.015 SOL (mint + PDAs + vault ATA rent) |
| Buy tokens | trade amount + ~0.000005 SOL fee |
| Sell tokens | ~0.000005 SOL fee |
| Contribute | contribution amount + ~0.000005 SOL fee |

Keep at least 0.05 SOL buffer above your intended trade amounts.
Get devnet SOL at: https://faucet.solana.com
