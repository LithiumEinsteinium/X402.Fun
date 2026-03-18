# X402.Fun — Fresh Devnet Deployment Guide

## Why a fresh deploy?

The existing Global PDA (`BPUGjQR5hp5gwYaJpodDrXNxCZ3gnYHDhNeGVuW59z8M`) was
initialized with corrupted reserve values — all three fields are 256,000× larger
than the constants in `lib.rs`. There is no `close_global` instruction, so the
account cannot be reset in place. A new program ID gets a clean slate.

Discriminators are derived from instruction names, not the program ID, so they
are **identical** after redeployment. No backend discriminator changes needed.

---

## Prerequisites

```bash
# Versions used in this project
anchor --version   # 0.32.1
solana --version   # 1.18.x or later
rustc --version    # 1.75+
node --version     # 18+
```

---

## Step 1 — Generate a new program keypair

```bash
solana-keygen new --outfile program-keypair.json --no-bip39-passphrase
solana-keygen pubkey program-keypair.json
```

Copy the printed public key — this is your `NEW_PROGRAM_ID`.
Keep `program-keypair.json` safe; you need it every time you redeploy.

```bash
# Fund your deployer wallet if needed (needs ~3–4 SOL for a fresh deploy)
solana airdrop 4 $(solana-keygen pubkey ~/.config/solana/id.json) --url devnet
```

---

## Step 2 — Update the program ID in three places

### 2a. `programs/x402-fun/src/lib.rs` — line 1 of declare_id!
```rust
declare_id!("NEW_PROGRAM_ID");
```

### 2b. `Anchor.toml`
```toml
[programs.devnet]
x402_fun = "NEW_PROGRAM_ID"

[programs.mainnet]
x402_fun = "NEW_PROGRAM_ID"
```

### 2c. Backend env var on Render
```
PROGRAM_ID=NEW_PROGRAM_ID
```
The backend reads `process.env.PROGRAM_ID` at startup and all three JS files
(`program-integration.js`, `initialize-program.js`, `index.js`) use that value.
No code changes required in the backend — just update the env var.

---

## Step 3 — Build the program

```bash
anchor build
```

This produces `target/deploy/x402_fun.so` and regenerates
`target/idl/x402_fun.json`. The build takes 2–5 minutes on first run.

Verify the embedded program ID matches:
```bash
solana-keygen pubkey target/deploy/x402_fun-keypair.json
# Must match NEW_PROGRAM_ID
```

---

## Step 4 — Deploy to devnet

```bash
anchor deploy --provider.cluster devnet --program-keypair program-keypair.json
```

Or equivalently:
```bash
solana program deploy target/deploy/x402_fun.so \
  --url devnet \
  --keypair ~/.config/solana/id.json \
  --program-id program-keypair.json
```

Expected output:
```
Program Id: NEW_PROGRAM_ID
Deploy success
```

Confirm on SolScan:
```
https://solscan.io/account/NEW_PROGRAM_ID?cluster=devnet
```
Should show: `Executable: true`, `Owner: BPF Upgradeable Loader`

---

## Step 5 — Copy updated IDL into repo

```bash
cp target/idl/x402_fun.json fetched_idl.json
```

This keeps `fetched_idl.json` in sync with the deployed program.

---

## Step 6 — Initialize the Global PDA

Set your env vars:
```bash
export ADMIN_PRIVATE_KEY=<your deployer wallet base58 private key>
export FEE_RECIPIENT=<base58 pubkey to receive platform fees>   # optional
export RPC_URL=https://api.devnet.solana.com
```

Run:
```bash
node scripts/initialize-program.js
```

Expected output:
```
✅  Program initialized successfully!
   Global PDA   : <new global PDA address>
   Authority    : <your admin wallet>
   Fee wallet   : <fee recipient>
```

Copy the Global PDA address — verify it on SolScan:
- Owner: NEW_PROGRAM_ID  ✓
- Executable: false  ✓
- Length: 105 bytes  ✓
- initialized field = 0x01 at byte offset 72  ✓

---

## Step 7 — Set Render environment variables

In the Render dashboard, update / add these vars and redeploy:

| Variable | Value |
|---|---|
| `PROGRAM_ID` | NEW_PROGRAM_ID |
| `ORACLE_PRIVATE_KEY` | base58 private key of oracle wallet |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` |
| `CLUSTER` | `devnet` |

The oracle wallet needs at least **0.5 SOL** on devnet at all times.
Each `record_x402_payment` call costs ~0.002 SOL in rent for the receipt PDA.

Top it up before running the test suite:
```bash
solana airdrop 2 <ORACLE_PUBKEY> --url devnet
```

---

## Step 8 — Run the test suite

Work through the phases in `AGENT_DEVNET_TEST.md`.

Phase 1 quick check:
```bash
curl https://x402-fun.onrender.com/health
# {"status":"ok","service":"X402.Fun","cluster":"devnet"}

curl https://x402-fun.onrender.com/api/program/config
# programId should be NEW_PROGRAM_ID

curl https://x402-fun.onrender.com/api/program/network
# slot should be incrementing
```

---

## Checklist

- [ ] New program keypair generated, pubkey noted
- [ ] `declare_id!` in `lib.rs` updated
- [ ] `Anchor.toml` updated  
- [ ] `anchor build` succeeds
- [ ] `anchor deploy` succeeds, program shows as executable on SolScan
- [ ] `fetched_idl.json` copied from `target/idl/x402_fun.json`
- [ ] `PROGRAM_ID` env var updated on Render
- [ ] `node scripts/initialize-program.js` succeeds, Global PDA = 105 bytes
- [ ] Oracle wallet has ≥ 0.5 SOL on devnet
- [ ] Render redeployed with new env vars
- [ ] Phase 1–3 agent test passes
