/**
 * X402.Fun CLI — Launch Token On-Chain
 *
 * Implements the real two-step flow:
 *   Step 1: POST /api/program/create-launch
 *           → backend submits oracle receipt on-chain, returns unsigned tx
 *   Step 2: sign the transaction with your wallet keypair and submit it
 *
 * Usage:
 *   node scripts/launch-onchain.js <NAME> <SYMBOL> [URI]
 *
 * Environment variables:
 *   WALLET      path to keypair JSON          (default: ~/.config/solana/id.json)
 *   API_BASE    backend URL                   (default: https://x402-fun.onrender.com)
 *   RPC_URL     Solana RPC endpoint           (default: https://api.devnet.solana.com)
 *   PROGRAM_ID  deployed program public key   (default: read from API /config)
 *
 * Example:
 *   node scripts/launch-onchain.js "AI Meme" AIMT "https://example.com/meta.json"
 *
 * Prerequisites:
 *   - Wallet keypair with at least 0.05 SOL on devnet
 *   - Backend running with ORACLE_PRIVATE_KEY set and oracle wallet funded
 *   - Global PDA initialized (run scripts/initialize-program.js first)
 *
 * No TypeScript, no @project-serum/anchor — uses only packages already in package.json.
 */

import { Connection, Transaction, Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE  = process.env.API_BASE  || 'https://x402-fun.onrender.com';
const RPC_URL   = process.env.RPC_URL   || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const WALLET_PATH = resolve(
  (process.env.WALLET || '~/.config/solana/id.json').replace('~', homedir())
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadWallet(path) {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  } catch (e) {
    console.error(`❌  Failed to load wallet from ${path}`);
    console.error('    Create one with: solana-keygen new --outfile ~/my-wallet.json');
    console.error('    Then set WALLET=~/my-wallet.json');
    process.exit(1);
  }
}

async function apiPost(path, body) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `HTTP ${res.status} from ${url}`);
  }
  return data;
}

async function signAndSend(connection, txBase64, wallet) {
  const txBytes = Buffer.from(txBase64, 'base64');
  const tx = Transaction.from(txBytes);
  tx.partialSign(wallet);
  const raw = tx.serialize();
  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const name   = process.argv[2];
  const symbol = process.argv[3];
  const uri    = process.argv[4] || '';

  if (!name || !symbol) {
    console.error('Usage: node scripts/launch-onchain.js <NAME> <SYMBOL> [URI]');
    console.error('Example: node scripts/launch-onchain.js "AI Meme" AIMT "https://..."');
    process.exit(1);
  }

  if (name.length > 32) {
    console.error(`❌  Name too long (${name.length} chars, max 32)`);
    process.exit(1);
  }
  if (symbol.length > 10) {
    console.error(`❌  Symbol too long (${symbol.length} chars, max 10)`);
    process.exit(1);
  }

  console.log('');
  console.log('X402.Fun — Launch Token On-Chain');
  console.log('═══════════════════════════════════');
  console.log(`Token   : ${name} (${symbol})`);
  console.log(`API     : ${API_BASE}`);
  console.log(`RPC     : ${RPC_URL}`);
  console.log(`Wallet  : ${WALLET_PATH}`);
  console.log('');

  // ── Load wallet ─────────────────────────────────────────────────────────────
  const wallet = loadWallet(WALLET_PATH);
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log(`👛  Wallet  : ${wallet.publicKey.toBase58()}`);

  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`💰  Balance : ${(balance / 1e9).toFixed(4)} SOL`);

  if (balance < 0.05 * 1e9) {
    console.error('❌  Insufficient SOL. Need at least 0.05 SOL to cover rent + fees.');
    console.error(`    solana airdrop 1 ${wallet.publicKey.toBase58()} --url devnet`);
    process.exit(1);
  }

  // ── Step 1: request launch transaction from backend ──────────────────────────
  // The backend will:
  //   a. Submit record_x402_payment on-chain (oracle pays rent for receipt PDA)
  //   b. Return an unsigned launch_token transaction referencing that receipt
  console.log('');
  console.log('⏳  Step 1: Requesting launch transaction from backend...');
  console.log('          (Backend is submitting oracle receipt on-chain — takes 3–5s)');

  let launchData;
  try {
    launchData = await apiPost('/api/program/create-launch', {
      name,
      symbol,
      uri,
      creatorWallet: wallet.publicKey.toBase58(),
    });
  } catch (e) {
    console.error(`❌  Backend error: ${e.message}`);
    console.error('');
    console.error('Common causes:');
    console.error('  • ORACLE_PRIVATE_KEY not set on Render');
    console.error('  • Oracle wallet out of SOL');
    console.error('  • Global PDA not initialized — run: node scripts/initialize-program.js');
    process.exit(1);
  }

  console.log(`✅  Receipt PDA   : ${launchData.receiptPda}`);
  console.log(`🪙  Mint PDA      : ${launchData.mint}`);
  console.log(`📈  Bonding curve : ${launchData.bondingCurve}`);
  console.log(`📦  Token state   : ${launchData.tokenState}`);

  // ── Step 2: sign and submit the launch transaction ───────────────────────────
  console.log('');
  console.log('⏳  Step 2: Signing and submitting launch transaction...');

  let launchSig;
  try {
    launchSig = await signAndSend(connection, launchData.transaction, wallet);
  } catch (e) {
    console.error(`❌  Transaction failed: ${e.message}`);
    console.error('');
    console.error('Common causes:');
    console.error('  • Insufficient SOL in wallet for rent (token PDA + curve PDA + mint PDA)');
    console.error('  • Token with this name already launched by this wallet');
    console.error('  • Receipt PDA expired (blockhash too old — retry)');
    process.exit(1);
  }

  console.log(`✅  Launch confirmed!`);
  console.log(`    Signature : ${launchSig}`);
  console.log(`    Explorer  : https://solscan.io/tx/${launchSig}?cluster=devnet`);

  // ── Step 3: verify on-chain ──────────────────────────────────────────────────
  console.log('');
  console.log('⏳  Step 3: Verifying launch on-chain...');

  let verifyData;
  try {
    verifyData = await apiPost('/api/program/verify-launch', {
      mint: launchData.mint,
      transactionSignature: launchSig,
    });
  } catch (e) {
    console.error(`⚠️   Verify call failed: ${e.message}`);
    console.error('    The launch tx may still have succeeded — check SolScan.');
  }

  if (verifyData?.verified) {
    console.log('✅  Verified! TokenState PDA exists on-chain.');
  } else {
    console.warn('⚠️   verify-launch returned verified: false');
    console.warn('    This can happen if devnet RPC is lagging. Check SolScan directly.');
  }

  // ── Step 4: read bonding curve ───────────────────────────────────────────────
  console.log('');
  console.log('⏳  Step 4: Reading bonding curve state...');

  try {
    const curveRes = await fetch(`${API_BASE}/api/program/bonding-curve/${launchData.mint}`);
    const curveData = await curveRes.json();
    if (curveData.error) {
      console.warn(`⚠️   Bonding curve not found: ${curveData.error}`);
    } else {
      console.log(`✅  Bonding curve live!`);
      console.log(`    Price/token : ${curveData.pricePerToken.toFixed(9)} SOL`);
      console.log(`    Progress    : ${curveData.progressPercent}% to graduation`);
      console.log(`    Graduated   : ${curveData.complete}`);
    }
  } catch (e) {
    console.warn(`⚠️   Could not read bonding curve: ${e.message}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════');
  console.log('🎉  Token launched successfully!');
  console.log('');
  console.log('Record these values:');
  console.log(`  Mint address   : ${launchData.mint}`);
  console.log(`  Bonding curve  : ${launchData.bondingCurve}`);
  console.log(`  Token state    : ${launchData.tokenState}`);
  console.log(`  Launch tx      : ${launchSig}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  Buy tokens  : POST ${API_BASE}/api/program/create-buy`);
  console.log(`  Sell tokens : POST ${API_BASE}/api/program/create-sell`);
  console.log(`  Curve state : GET  ${API_BASE}/api/program/bonding-curve/${launchData.mint}`);
}

main().catch((err) => {
  console.error('❌  Fatal:', err.message);
  process.exit(1);
});
