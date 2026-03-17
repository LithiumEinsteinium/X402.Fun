/**
 * X402.Fun - Program Integration
 *
 * All instructions are built directly against the deployed Anchor program.
 * Account ordering and discriminators are taken verbatim from fetched_idl.json.
 *
 * Two-step flow for gated instructions (launch, buy, sell):
 *   Step 1 (backend): submit record_x402_payment — oracle wallet signs and pays
 *   Step 2 (agent):   return unsigned transaction referencing the receipt PDA
 *
 * contribute_liquidity has no receipt gate — one step only.
 *
 * BUG FIXES applied in this version:
 *   FIX-1  ASSOCIATED_TOKEN_PROGRAM_ID added to buy and sell account lists.
 *          Anchor validates vault/buyer ATAs against the associated token program;
 *          if the program account isn't in the transaction, the runtime rejects it.
 *
 *   FIX-2  Global account isWritable flag on buy/sell corrected to false.
 *          IDL marks global as writable=false for Buy and Sell — the old code
 *          passed isWritable: true which causes an account constraint violation.
 *
 *   FIX-3  mint account isWritable corrected to false on buy/sell (matches IDL).
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  Keypair,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import crypto from 'crypto';

const PROGRAM_ID = new PublicKey('63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const TOKEN_DECIMALS = 9;
const GRADUATION_LAMPORTS = 1_500_000_000n; // 1.5 SOL devnet

const connection = new Connection(RPC_URL, 'confirmed');

// Discriminators taken directly from fetched_idl.json
const DISC = {
  record_x402_payment:  Buffer.from([247, 255,  28,  60,  50,  13, 181, 137]),
  launch_token:         Buffer.from([ 10, 128,  86, 171,   3, 137, 161, 244]),
  buy:                  Buffer.from([102,   6,  61,  18,   1, 218, 235, 234]),
  sell:                 Buffer.from([ 51, 230, 133, 164,   1, 127, 131, 173]),
  contribute_liquidity: Buffer.from([ 63, 184, 212, 155,  74, 150, 161, 161]),
  graduate_to_pumpswap: Buffer.from([ 67,  55,  59,  29,  96, 164,  96, 148]),
};

// ─── PDA derivations ─────────────────────────────────────────────────────────

function deriveGlobal() {
  return PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);
}

function deriveReceipt(agentPubkey, nonce) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('x402'), agentPubkey.toBuffer(), nonce],
    PROGRAM_ID
  );
}

// seeds: ["mint", creator, name] — matches LaunchToken in lib.rs
function deriveMint(creator, name) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mint'), creator.toBuffer(), Buffer.from(name)],
    PROGRAM_ID
  );
}

function deriveToken(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token'), mint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveCurve(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('curve'), mint.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Borsh-style encoding helpers ────────────────────────────────────────────

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

function encodeU64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

// ─── Account data readers ─────────────────────────────────────────────────────
// Offsets verified against IDL types:
//
//   Global:
//     8   disc
//     +32 authority     → [8..40]
//     +32 fee_recipient → [40..72]  ← readFeeRecipient reads here
//     +1  initialized
//     +8  token_count
//     ...
//
//   TokenState:
//     8   disc
//     +32 mint          → [8..40]
//     +32 creator       → [40..72]  ← readTokenCreator reads here
//     ...
//
//   BondingCurve:
//     8   disc
//     +32 mint          → [8..40]
//     +8  vtr           → [40..48]
//     +8  vsr           → [48..56]
//     +8  rtr           → [56..64]
//     +8  rsr           → [64..72]
//     +8  total_supply  → [72..80]
//     +1  complete      → [80]

function readFeeRecipient(globalData) {
  return new PublicKey(globalData.slice(40, 72));
}

function readTokenCreator(tokenData) {
  return new PublicKey(tokenData.slice(40, 72));
}

function readBondingCurveState(data) {
  const virtualTokenReserves = data.readBigUInt64LE(40);
  const virtualSolReserves   = data.readBigUInt64LE(48);
  const realTokenReserves    = data.readBigUInt64LE(56);
  const realSolReserves      = data.readBigUInt64LE(64);
  const tokenTotalSupply     = data.readBigUInt64LE(72);
  const complete             = data[80] === 1;
  return {
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
  };
}

// ─── Oracle keypair ───────────────────────────────────────────────────────────

function getOracleKeypair() {
  const key = process.env.ORACLE_PRIVATE_KEY;
  if (!key) throw new Error('ORACLE_PRIVATE_KEY not set in environment');
  return Keypair.fromSecretKey(bs58.decode(key));
}

// ─── Step 1: submit receipt onchain ──────────────────────────────────────────
// Oracle pays the rent for the receipt PDA and signs it. The agent wallet is
// passed as `payer` (a readonly account) and baked into the receipt PDA seeds.

async function submitReceipt(agentPubkey) {
  const nonce = crypto.randomBytes(32);
  const [receiptPda] = deriveReceipt(agentPubkey, nonce);
  const oracle = getOracleKeypair();
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const tx = new Transaction({
    feePayer: oracle.publicKey,
    recentBlockhash: blockhash,
  });

  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
    {
      // Account order from IDL: receipt, oracle, payer, system_program
      keys: [
        { pubkey: receiptPda,              isSigner: false, isWritable: true  }, // receipt (init PDA)
        { pubkey: oracle.publicKey,        isSigner: true,  isWritable: true  }, // oracle (payer, signer)
        { pubkey: agentPubkey,             isSigner: false, isWritable: false }, // payer (readonly — seed only)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      programId: PROGRAM_ID,
      data: Buffer.concat([DISC.record_x402_payment, nonce]),
    }
  );

  tx.sign(oracle);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(signature, 'confirmed');
  return { receiptPda, nonce, receiptSignature: signature };
}

// ─── Endpoint handlers ────────────────────────────────────────────────────────

export async function getPlatformConfig(req, res) {
  res.json({
    programId: PROGRAM_ID.toBase58(),
    cluster: 'devnet',
    graduationThresholdSol: 1.5,
    fees: { platformBps: 100, creatorBps: 200 },
    tokenDecimals: TOKEN_DECIMALS,
  });
}

export async function getNetworkInfo(req, res) {
  try {
    const [version, slot] = await Promise.all([
      connection.getVersion(),
      connection.getSlot(),
    ]);
    res.json({
      cluster: 'devnet',
      rpc: RPC_URL,
      programId: PROGRAM_ID.toBase58(),
      solanaVersion: version['solana-core'],
      slot,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/program/bonding-curve/:mint
 */
export async function getBondingCurve(req, res) {
  try {
    const mintPubkey = new PublicKey(req.params.mint);
    const [curvePda] = deriveCurve(mintPubkey);
    const curveInfo = await connection.getAccountInfo(curvePda);
    if (!curveInfo) return res.status(404).json({ error: 'Bonding curve not found' });

    const state = readBondingCurveState(curveInfo.data);
    const progressPercent = Number((state.realSolReserves * 100n) / GRADUATION_LAMPORTS);
    const pricePerToken =
      Number(state.virtualSolReserves) / Number(state.virtualTokenReserves) / 1e9;

    res.json({
      mint: req.params.mint,
      bondingCurve: curvePda.toBase58(),
      virtualTokenReserves: state.virtualTokenReserves.toString(),
      virtualSolReserves: state.virtualSolReserves.toString(),
      realTokenReserves: state.realTokenReserves.toString(),
      realSolReserves: state.realSolReserves.toString(),
      tokenTotalSupply: state.tokenTotalSupply.toString(),
      complete: state.complete,
      progressPercent: Math.min(progressPercent, 100),
      pricePerToken,
      graduationThresholdSol: 1.5,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/create-launch
 * Body: { name, symbol, uri?, creatorWallet }
 *
 * Oracle submits receipt onchain, then returns unsigned launch_token tx.
 *
 * Account order from IDL (launch_token):
 *   global, x402_receipt, token, bonding_curve, mint, creator,
 *   token_program, system_program, rent
 */
export async function createLaunchTransaction(req, res) {
  try {
    const { name, symbol, uri = '', creatorWallet } = req.body;
    if (!name || !symbol || !creatorWallet) {
      return res.status(400).json({ error: 'name, symbol, and creatorWallet required' });
    }

    const creator = new PublicKey(creatorWallet);
    const [mintPda]   = deriveMint(creator, name);
    const [tokenPda]  = deriveToken(mintPda);
    const [curvePda]  = deriveCurve(mintPda);
    const [globalPda] = deriveGlobal();

    // Step 1: oracle submits receipt
    const { receiptPda, nonce } = await submitReceipt(creator);

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: creator, recentBlockhash: blockhash });

    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
      {
        // Account order from IDL:
        //   global, x402_receipt, token, bonding_curve, mint, creator,
        //   token_program, system_program, rent
        keys: [
          { pubkey: globalPda,               isSigner: false, isWritable: true  },
          { pubkey: receiptPda,              isSigner: false, isWritable: true  },
          { pubkey: tokenPda,                isSigner: false, isWritable: true  },
          { pubkey: curvePda,                isSigner: false, isWritable: true  },
          { pubkey: mintPda,                 isSigner: false, isWritable: true  },
          { pubkey: creator,                 isSigner: true,  isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY,      isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: Buffer.concat([
          DISC.launch_token,
          encodeString(name),
          encodeString(symbol),
          encodeString(uri),
          nonce,
        ]),
      }
    );

    res.json({
      success: true,
      mint: mintPda.toBase58(),
      bondingCurve: curvePda.toBase58(),
      tokenState: tokenPda.toBase58(),
      receiptPda: receiptPda.toBase58(),
      nonce: nonce.toString('hex'),
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      message: 'Receipt created onchain. Sign and submit this transaction to launch your token.',
    });
  } catch (error) {
    console.error('createLaunchTransaction:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/verify-launch
 * Body: { mint, transactionSignature }
 */
export async function verifyLaunch(req, res) {
  try {
    const { mint, transactionSignature } = req.body;
    if (!mint || !transactionSignature) {
      return res.status(400).json({ error: 'mint and transactionSignature required' });
    }

    const tx = await connection.getParsedTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.meta?.err) return res.status(400).json({ error: 'Transaction failed', details: tx.meta.err });

    const [tokenPda] = deriveToken(new PublicKey(mint));
    const tokenInfo  = await connection.getAccountInfo(tokenPda);

    res.json({
      success: true,
      verified: !!tokenInfo,
      mint,
      tokenState: tokenPda.toBase58(),
      signature: transactionSignature,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/create-buy
 * Body: { mint, buyerWallet, solAmount, minTokensOut? }
 *
 * Account order from IDL (buy):
 *   global, x402_receipt, token, bonding_curve, vault_token_account,
 *   buyer_token_account, mint, buyer, fee_recipient, creator,
 *   token_program, associated_token_program, system_program
 *
 * NOTE: The buyer's ATA (buyer_token_account) must already exist before calling
 * this endpoint. Create it with:
 *   spl-token create-account <MINT> --owner <BUYER> --url devnet
 */
export async function createBuyTransaction(req, res) {
  try {
    const { mint, buyerWallet, solAmount, minTokensOut = 0 } = req.body;
    if (!mint || !buyerWallet || !solAmount) {
      return res.status(400).json({ error: 'mint, buyerWallet, and solAmount required' });
    }

    const buyer      = new PublicKey(buyerWallet);
    const mintPubkey = new PublicKey(mint);
    const [curvePda]  = deriveCurve(mintPubkey);
    const [tokenPda]  = deriveToken(mintPubkey);
    const [globalPda] = deriveGlobal();

    // Vault ATA is owned by the bonding curve PDA (allowOwnerOffCurve = true)
    const vaultAta = getAssociatedTokenAddressSync(mintPubkey, curvePda, true,  TOKEN_PROGRAM_ID);
    // Buyer ATA must already exist
    const buyerAta = getAssociatedTokenAddressSync(mintPubkey, buyer,    false, TOKEN_PROGRAM_ID);

    // Read fee_recipient from Global account
    const globalInfo = await connection.getAccountInfo(globalPda);
    if (!globalInfo) return res.status(400).json({ error: 'Global account not initialized — run scripts/initialize-program.js' });
    const feeRecipient = readFeeRecipient(globalInfo.data);

    // Read creator from TokenState account
    const tokenInfo = await connection.getAccountInfo(tokenPda);
    if (!tokenInfo) return res.status(404).json({ error: 'Token not found onchain — run create-launch first' });
    const tokenCreator = readTokenCreator(tokenInfo.data);

    const { receiptPda, nonce } = await submitReceipt(buyer);

    const solLamports = BigInt(Math.floor(solAmount * 1e9));
    const minOut      = BigInt(Math.floor(minTokensOut));

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: buyer, recentBlockhash: blockhash });

    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
      {
        // Account order from IDL:
        //   global, x402_receipt, token, bonding_curve, vault_token_account,
        //   buyer_token_account, mint, buyer, fee_recipient, creator,
        //   token_program, associated_token_program, system_program
        //
        // FIX-1: ASSOCIATED_TOKEN_PROGRAM_ID added — Anchor validates vault/buyer
        //        ATAs using associated_token:: constraints, which require this program
        //        to be present in the transaction account list.
        //
        // FIX-2: global isWritable set to false (IDL: writable=false for Buy).
        //
        // FIX-3: mint isWritable set to false (IDL: writable=false for Buy).
        keys: [
          { pubkey: globalPda,                    isSigner: false, isWritable: false }, // FIX-2: was true
          { pubkey: receiptPda,                   isSigner: false, isWritable: true  },
          { pubkey: tokenPda,                     isSigner: false, isWritable: true  },
          { pubkey: curvePda,                     isSigner: false, isWritable: true  },
          { pubkey: vaultAta,                     isSigner: false, isWritable: true  },
          { pubkey: buyerAta,                     isSigner: false, isWritable: true  },
          { pubkey: mintPubkey,                   isSigner: false, isWritable: false }, // FIX-3: was true
          { pubkey: buyer,                        isSigner: true,  isWritable: true  },
          { pubkey: feeRecipient,                 isSigner: false, isWritable: true  },
          { pubkey: tokenCreator,                 isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,             isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false }, // FIX-1: was missing
          { pubkey: SystemProgram.programId,      isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: Buffer.concat([
          DISC.buy,
          encodeU64(solLamports),
          encodeU64(minOut),
          nonce,
        ]),
      }
    );

    res.json({
      success: true,
      mint,
      buyer: buyerWallet,
      solAmount,
      receiptPda: receiptPda.toBase58(),
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      message: 'Receipt created onchain. Sign and submit to buy tokens.',
    });
  } catch (error) {
    console.error('createBuyTransaction:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/create-sell
 * Body: { mint, sellerWallet, tokenAmount, minSolOut? }
 *
 * tokenAmount is whole tokens (e.g. 100). Converted to base units internally.
 *
 * Account order from IDL (sell):
 *   global, x402_receipt, token, bonding_curve, vault_token_account,
 *   seller_token_account, mint, seller, fee_recipient, creator,
 *   token_program, associated_token_program, system_program
 */
export async function createSellTransaction(req, res) {
  try {
    const { mint, sellerWallet, tokenAmount, minSolOut = 0 } = req.body;
    if (!mint || !sellerWallet || !tokenAmount) {
      return res.status(400).json({ error: 'mint, sellerWallet, and tokenAmount required' });
    }

    const seller     = new PublicKey(sellerWallet);
    const mintPubkey = new PublicKey(mint);
    const [curvePda]  = deriveCurve(mintPubkey);
    const [tokenPda]  = deriveToken(mintPubkey);
    const [globalPda] = deriveGlobal();

    const vaultAta  = getAssociatedTokenAddressSync(mintPubkey, curvePda, true,  TOKEN_PROGRAM_ID);
    const sellerAta = getAssociatedTokenAddressSync(mintPubkey, seller,   false, TOKEN_PROGRAM_ID);

    const globalInfo = await connection.getAccountInfo(globalPda);
    if (!globalInfo) return res.status(400).json({ error: 'Global account not initialized — run scripts/initialize-program.js' });
    const feeRecipient = readFeeRecipient(globalInfo.data);

    const tokenInfo = await connection.getAccountInfo(tokenPda);
    if (!tokenInfo) return res.status(404).json({ error: 'Token not found onchain — run create-launch first' });
    const tokenCreator = readTokenCreator(tokenInfo.data);

    const { receiptPda, nonce } = await submitReceipt(seller);

    const tokenBaseUnits = BigInt(Math.floor(tokenAmount * 10 ** TOKEN_DECIMALS));
    const minSolLamports = BigInt(Math.floor(minSolOut * 1e9));

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: seller, recentBlockhash: blockhash });

    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
      {
        // Account order from IDL:
        //   global, x402_receipt, token, bonding_curve, vault_token_account,
        //   seller_token_account, mint, seller, fee_recipient, creator,
        //   token_program, associated_token_program, system_program
        //
        // Same three fixes as buy (FIX-1, FIX-2, FIX-3)
        keys: [
          { pubkey: globalPda,                    isSigner: false, isWritable: false }, // FIX-2: was true
          { pubkey: receiptPda,                   isSigner: false, isWritable: true  },
          { pubkey: tokenPda,                     isSigner: false, isWritable: true  },
          { pubkey: curvePda,                     isSigner: false, isWritable: true  },
          { pubkey: vaultAta,                     isSigner: false, isWritable: true  },
          { pubkey: sellerAta,                    isSigner: false, isWritable: true  },
          { pubkey: mintPubkey,                   isSigner: false, isWritable: false }, // FIX-3: was true
          { pubkey: seller,                       isSigner: true,  isWritable: true  },
          { pubkey: feeRecipient,                 isSigner: false, isWritable: true  },
          { pubkey: tokenCreator,                 isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,             isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false }, // FIX-1: was missing
          { pubkey: SystemProgram.programId,      isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: Buffer.concat([
          DISC.sell,
          encodeU64(tokenBaseUnits),
          encodeU64(minSolLamports),
          nonce,
        ]),
      }
    );

    res.json({
      success: true,
      mint,
      seller: sellerWallet,
      tokenAmount,
      receiptPda: receiptPda.toBase58(),
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      message: 'Receipt created onchain. Sign and submit to sell tokens.',
    });
  } catch (error) {
    console.error('createSellTransaction:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/create-contribute
 * Body: { mint, contributorWallet, solAmount }
 *
 * No x402 receipt — contribute_liquidity is ungated.
 *
 * Account order from IDL:
 *   token, bonding_curve, contributor, system_program
 */
export async function createContributeTransaction(req, res) {
  try {
    const { mint, contributorWallet, solAmount } = req.body;
    if (!mint || !contributorWallet || !solAmount) {
      return res.status(400).json({ error: 'mint, contributorWallet, and solAmount required' });
    }

    const contributor = new PublicKey(contributorWallet);
    const mintPubkey  = new PublicKey(mint);
    const [curvePda]  = deriveCurve(mintPubkey);
    const [tokenPda]  = deriveToken(mintPubkey);

    const solLamports = BigInt(Math.floor(solAmount * 1e9));

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: contributor, recentBlockhash: blockhash });

    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }),
      {
        keys: [
          { pubkey: tokenPda,                isSigner: false, isWritable: true  },
          { pubkey: curvePda,                isSigner: false, isWritable: true  },
          { pubkey: contributor,             isSigner: true,  isWritable: true  },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: Buffer.concat([DISC.contribute_liquidity, encodeU64(solLamports)]),
      }
    );

    // Report current progress before the tx is submitted
    const curveInfo = await connection.getAccountInfo(curvePda);
    let progressPercent = null;
    let graduated = false;
    if (curveInfo) {
      const state = readBondingCurveState(curveInfo.data);
      progressPercent = Math.min(
        Number((state.realSolReserves * 100n) / GRADUATION_LAMPORTS),
        100
      );
      graduated = state.complete;
    }

    res.json({
      success: true,
      mint,
      contributor: contributorWallet,
      solAmount,
      bondingCurve: curvePda.toBase58(),
      progressPercent,
      graduated,
      graduationThresholdSol: 1.5,
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      message: `Sign and submit to contribute ${solAmount} SOL.`,
    });
  } catch (error) {
    console.error('createContributeTransaction:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/verify-contribute
 * Body: { mint, transactionSignature }
 */
export async function verifyContribute(req, res) {
  try {
    const { mint, transactionSignature } = req.body;
    if (!mint || !transactionSignature) {
      return res.status(400).json({ error: 'mint and transactionSignature required' });
    }

    const tx = await connection.getParsedTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.meta?.err) return res.status(400).json({ error: 'Transaction failed', details: tx.meta.err });

    const mintPubkey = new PublicKey(mint);
    const [curvePda] = deriveCurve(mintPubkey);
    const curveInfo  = await connection.getAccountInfo(curvePda);

    let graduated = false;
    let progressPercent = null;
    if (curveInfo) {
      const state = readBondingCurveState(curveInfo.data);
      graduated = state.complete;
      progressPercent = Math.min(
        Number((state.realSolReserves * 100n) / GRADUATION_LAMPORTS),
        100
      );
    }

    res.json({
      success: true,
      verified: true,
      mint,
      graduated,
      progressPercent,
      signature: transactionSignature,
      message: graduated
        ? 'Token graduated! Call /api/program/create-pool next.'
        : `Progress: ${progressPercent}%`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export default {
  getPlatformConfig,
  getNetworkInfo,
  getBondingCurve,
  createLaunchTransaction,
  verifyLaunch,
  createBuyTransaction,
  createSellTransaction,
  createContributeTransaction,
  verifyContribute,
};
