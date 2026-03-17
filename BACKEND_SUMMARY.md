# 🔧 Backend Implementation Summary

**For:** Program Developer  
**Date:** March 16, 2026  
**Program:** X402.Fun v3 (Deployed on Solana Devnet)  
**Program ID:** `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF`

---

## Overview

This document summarizes the backend implementation of the X402.Fun platform, which enables agent-only token launches and trading on Solana with x402 payment verification.

---

## Architecture

### Two-Step Flow

All program instructions follow a two-step pattern:

1. **Step 1: Create x402 Receipt** (Backend/Oracle signs)
   - Calls `record_x402_payment` instruction
   - Creates receipt PDA: `[b"x402", agent_pubkey, nonce]`
   - Oracle wallet signs this transaction
   - Receipt stores: `payer`, `nonce`, `used=false`

2. **Step 2: Execute Main Instruction** (Agent signs)
   - Calls `launch_token`, `buy`, or `sell`
   - References the receipt PDA from Step 1
   - Agent signs this transaction
   - Program marks receipt as `used=true`

---

## Implemented Endpoints

### 1. Token Launch

**Endpoint:** `POST /api/program/create-launch`

**Flow:**
```javascript
// Step 1: Backend creates x402 receipt
const { receiptPda, nonce } = await createX402Receipt(creator, 'launch');
// Oracle signs record_x402_payment

// Step 2: Agent signs launch_token
const launchTx = await createLaunchTransaction({ name, symbol, creatorWallet });
// Agent signs and submits
```

**Program Instructions Used:**
- `record_x402_payment` (oracle signs)
- `launch_token` (agent signs)

**Accounts Required:**
- Global account (must be initialized)
- x402_receipt PDA (created in Step 1)
- Token state PDA
- Bonding curve PDA
- Mint account
- Creator (signer)

---

### 2. Verify Launch

**Endpoint:** `POST /api/program/verify-launch`

**Purpose:** Verify token launch on-chain after submission

**Parameters:**
- `mint`: Token mint address
- `transactionSignature`: Launch transaction signature

---

### 3. Program Info

**Endpoints:**
- `GET /api/program/config` - Platform configuration
- `GET /api/program/network` - Network status

---

## Key Implementation Details

### x402 Receipt PDA Derivation

```javascript
const [receiptPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('x402'), agentPubkey.toBuffer(), nonce],
  new PublicKey(PROGRAM_ID)
);
```

**Constraints:**
- `payer` must match `receipt.payer`
- `nonce` must match `receipt.nonce`
- Receipt is single-use (`used` flag)

### Oracle Wallet

The backend uses an "oracle" wallet to sign `record_x402_payment` instructions:

```javascript
const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
const oracleKeypair = Keypair.fromSecretKey(bs58.decode(ORACLE_PRIVATE_KEY));
```

**Security Notes:**
- Oracle wallet is separate from agent wallets
- Oracle only signs receipt creation, not main transactions
- Receipt PDA derivation is deterministic (agent pubkey + nonce)

### Discriminators Used

```javascript
// record_x402_payment: sha256("global:record_x402_payment")[:8]
const RECORD_DISCRIMINATOR = Buffer.from([71, 134, 30, 217, 93, 174, 144, 205]);

// initialize: sha256("global:initialize")[:8]
const INITIALIZE_DISCRIMINATOR = Buffer.from([10, 128, 86, 171, 3, 137, 161, 244]);
```

---

## Program Instructions Expected

The backend expects the following instructions to exist in the program:

### 1. `record_x402_payment`
```rust
pub fn record_x402_payment(
    context: Context<RecordX402Payment>,
    nonce: [u8; 32],
) -> Result<()>
```

**Accounts:**
- `receipt: Account<'info, X402Receipt>` (init, PDA)
- `oracle: Signer<'info>` (mut)
- `payer: UncheckedAccount<'info>` (the agent)
- `system_program: Program<'info, System>`

---

### 2. `launch_token`
```rust
pub fn launch_token(
    context: Context<LaunchToken>,
    name: String,
    symbol: String,
    uri: String,
    _nonce: [u8; 32],
) -> Result<()>
```

**Accounts:**
- `global: Account<'info, Global>` (PDA: [b"global"])
- `x402_receipt: Account<'info, X402Receipt>` (PDA: [b"x402", creator, nonce])
- `token: Account<'info, TokenState>` (PDA: [b"token", mint])
- `bonding_curve: Account<'info, BondingCurve>` (PDA: [b"curve", mint])
- `mint: InterfaceAccount<'info, Mint>`
- `creator: Signer<'info>`
- `token_program`, `system_program`, `rent`

---

### 3. `buy` (Not Yet Implemented in Backend)
Expected signature:
```rust
pub fn buy(
    context: Context<Buy>,
    sol_amount: u64,
    min_tokens_out: u64,
    _nonce: [u8; 32],
) -> Result<()>
```

---

### 4. `sell` (Not Yet Implemented in Backend)
Expected signature:
```rust
pub fn sell(
    context: Context<Sell>,
    token_amount: u64,
    min_sol_out: u64,
    _nonce: [u8; 32],
) -> Result<()>
```

---

## Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| Token Launch | ✅ Implemented | Two-step flow working |
| Verify Launch | ✅ Implemented | On-chain verification |
| Buy Tokens | ⏳ Pending | Needs implementation |
| Sell Tokens | ⏳ Pending | Needs implementation |
| Contribute Liquidity | ⏳ Pending | Needs implementation |
| Graduate to PumpSwap | ⏳ Pending | Needs implementation |

---

## Environment Variables

```bash
# Required
ORACLE_PRIVATE_KEY=<base58_private_key>  # Backend oracle wallet

# Optional
RPC_URL=https://api.devnet.solana.com    # Solana RPC
PORT=10000                                # Express port
```

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `AccountNotInitialized` | Global account doesn't exist | Call `initialize` first (admin only) |
| `PaymentAlreadyUsed` | Receipt already consumed | Generate new receipt (new nonce) |
| `PaymentNotForCaller` | Wrong agent pubkey in PDA | Ensure PDA uses correct agent pubkey |
| `InvalidProgram` | System program check failed | Verify SystemProgram ID in instruction |

---

## Testing Checklist

- [x] Backend starts without errors
- [x] Oracle wallet configured
- [x] x402 receipt creation (Step 1)
- [x] Token launch (Step 2)
- [ ] Buy tokens (pending implementation)
- [ ] Sell tokens (pending implementation)
- [ ] Receipt PDA marked as used
- [ ] On-chain verification works

---

## Questions for Program Developer

1. **Global Account Initialization:**
   - Has the global account been initialized on devnet?
   - If not, we need to call `initialize` first

2. **Instruction Discriminators:**
   - Are the discriminators correct?
   - `record_x402_payment`: `[71, 134, 30, 217, 93, 174, 144, 205]`
   - `initialize`: `[10, 128, 86, 171, 3, 137, 161, 244]`

3. **Account Constraints:**
   - Are all account constraints in the backend matching the program?
   - Specifically: PDA seeds, bump seeds, init space

4. **Next Steps:**
   - Should we implement `buy` and `sell` next?
   - Any specific requirements for slippage protection?

---

## Files for Review

**Backend:**
- `src/api/program-integration.js` - Main program integration
- `src/api/x402-integration.js` - Off-chain receipt fallback
- `src/index.js` - Express routes

**Program:**
- `programs/x402-fun/src/lib.rs` - Clean deployed version

**Documentation:**
- `X402_IMPLEMENTATION.md` - Implementation guide
- `X402_FLOW.md` - Complete flow documentation

---

## Contact

For questions or clarifications about the backend implementation, please review the code in the repository or refer to the implementation guide.

**Repository:** https://github.com/LithiumEinsteinium/X402.Fun  
**Deployed Program:** `63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF` (Solana Devnet)

---

**Status:** Backend operational, ready for buy/sell implementation 🚀
