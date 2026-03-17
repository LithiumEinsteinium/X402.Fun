/**
 * X402.Fun - Program Integration
 *
 * Wires all API endpoints to the deployed Anchor program.
 *
 * Every instruction that requires an x402 receipt follows this two-step flow:
 *   Step 1 (backend): call record_x402_payment — oracle wallet signs and submits onchain
 *   Step 2 (agent):   backend returns unsigned transaction referencing the receipt PDA
 *
 * Anchor discriminators are sha256("global:<instruction_name>")[0..8].
 * All values below were computed from the deployed program's instruction names.
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
import { getBase58Decoder } from '@solana/codecs';
import crypto from 'crypto';

const PROGRAM_ID = new PublicKey('63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF');
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PLATFORM_WALLET = new PublicKey(
  process.env.PLATFORM_WALLET || '7tZMag1w7P1YyGCbAMCdsrYqgeHMm5EdAzKpDs12mmTR'
);

const connection = new Connection(RPC_URL, 'confirmed');

// Anchor instruction discriminators: sha256("global:<name>")[0..8]
const DISCRIMINATORS = {
  record_x402_payment:   Buffer.from([247, 255,  28,  60,  50,  13, 181, 137]),
  launch_token:          Buffer.from([ 10, 128,  86, 171,   3, 137, 161, 244]),
  buy:                   Buffer.from([102,   6,  61,  18,   1, 218, 235, 234]),
  sell:                  Buffer.from([ 51, 230, 133, 164,   1, 127, 131, 173]),
  contribute_liquidity:  Buffer.from([ 63, 184, 212, 155,  74, 150, 161, 161]),
  graduate_to_pumpswap:  Buffer.from([ 67,  55,  59,  29,  96, 164,  96, 148]),
};

// TOKEN_DECIMALS must match the program constant (9).
const TOKEN_DECIMALS = 9;

// ─── PDA helpers ────────────────────────────────────────────────────────────

function deriveGlobalPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('global')], PROGRAM_ID);
}

function deriveReceiptPDA(agentPubkey, nonce) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('x402'), agentPubkey.toBuffer(), nonce],
    PROGRAM_ID
  );
}

function deriveMintPDA(creatorPubkey, name) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mint'), creatorPubkey.toBuffer(), Buffer.from(name)],
    PROGRAM_ID
  );
}

function deriveTokenPDA(mintPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('token'), mintPubkey.toBuffer()],
    PROGRAM_ID
  );
}

function deriveBondingCurvePDA(mintPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('curve'), mintPubkey.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Oracle wallet ───────────────────────────────────────────────────────────

function getOracleKeypair() {
  const key = process.env.ORACLE_PRIVATE_KEY;
  if (!key) {
    throw new Error('ORACLE_PRIVATE_KEY not set in environment');
  }
  const secretKey = getBase58Decoder().decode(key);
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// ─── Step 1: create receipt onchain (oracle signs and submits) ───────────────

async function submitReceiptTransaction(agentPubkey) {
  const nonce = crypto.randomBytes(32);
  const [receiptPda] = deriveReceiptPDA(agentPubkey, nonce);
  const oracleKeypair = getOracleKeypair();

  const { blockhash } = await connection.getLatestBlockhash();

  const instructionData = Buffer.concat([DISCRIMINATORS.record_x402_payment, nonce]);

  const transaction = new Transaction({
    feePayer: oracleKeypair.publicKey,
    recentBlockhash: blockhash,
  });

  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
    {
      keys: [
        { pubkey: receiptPda,               isSigner: false, isWritable: true  },
        { pubkey: oracleKeypair.publicKey,  isSigner: true,  isWritable: true  },
        { pubkey: agentPubkey,              isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId,  isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: instructionData,
    }
  );

  transaction.sign(oracleKeypair);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(signature, 'confirmed');

  return { receiptPda, nonce, signature };
}

// ─── Encode instruction args ─────────────────────────────────────────────────

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function encodeU64(value) {
  const buffer = Buffer.alloc(8);
  // BigInt handles values > 2^53
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function encodeU16LE(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export async function getPlatformConfig(req, res) {
  res.json({
    programId: PROGRAM_ID.toBase58(),
    cluster: 'devnet',
    graduationThreshold: '1.5 SOL (devnet) / 69 SOL (mainnet)',
    fees: { platformBps: 100, creatorBps: 200 },
    tokenDecimals: TOKEN_DECIMALS,
    mode: 'program-integrated',
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
 * POST /api/program/create-launch
 *
 * Body: { name, symbol, uri, creatorWallet }
 *
 * Returns an unsigned transaction for the agent to sign and submit.
 * The oracle receipt is submitted onchain by the backend before returning.
 */
export async function createLaunchTransaction(req, res) {
  try {
    const { name, symbol, uri = '', creatorWallet } = req.body;

    if (!name || !symbol || !creatorWallet) {
      return res.status(400).json({ error: 'name, symbol, and creatorWallet required' });
    }

    const creator = new PublicKey(creatorWallet);

    // Mint is a PDA derived from creator + name (matches program seeds).
    const [mintPubkey] = deriveMintPDA(creator, name);
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    const [tokenPubkey] = deriveTokenPDA(mintPubkey);
    const [globalPubkey] = deriveGlobalPDA();

    // Step 1: oracle submits receipt onchain.
    const { receiptPda, nonce } = await submitReceiptTransaction(creator);

    const { blockhash } = await connection.getLatestBlockhash();

    const instructionData = Buffer.concat([
      DISCRIMINATORS.launch_token,
      encodeString(name),
      encodeString(symbol),
      encodeString(uri),
      nonce, // [u8; 32]
    ]);

    const transaction = new Transaction({
      feePayer: creator,
      recentBlockhash: blockhash,
    });

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
      {
        keys: [
          { pubkey: globalPubkey,          isSigner: false, isWritable: true  },
          { pubkey: receiptPda,             isSigner: false, isWritable: true  },
          { pubkey: tokenPubkey,            isSigner: false, isWritable: true  },
          { pubkey: bondingCurvePubkey,     isSigner: false, isWritable: true  },
          { pubkey: mintPubkey,             isSigner: false, isWritable: true  },
          { pubkey: creator,                isSigner: true,  isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY,     isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      }
    );

    const transactionBase64 = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    res.json({
      success: true,
      mint: mintPubkey.toBase58(),
      bondingCurve: bondingCurvePubkey.toBase58(),
      tokenAccount: tokenPubkey.toBase58(),
      receiptPda: receiptPda.toBase58(),
      nonce: nonce.toString('hex'),
      transaction: transactionBase64,
      message: 'Receipt created onchain. Sign and submit the transaction to launch your token.',
    });
  } catch (error) {
    console.error('createLaunchTransaction error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/verify-launch
 *
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

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (tx.meta?.err) {
      return res.status(400).json({ error: 'Transaction failed', details: tx.meta.err });
    }

    const [tokenPubkey] = deriveTokenPDA(new PublicKey(mint));
    const tokenAccount = await connection.getAccountInfo(tokenPubkey);

    res.json({
      success: true,
      verified: !!tokenAccount,
      mint,
      tokenState: tokenPubkey.toBase58(),
      signature: transactionSignature,
    });
  } catch (error) {
    console.error('verifyLaunch error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/create-buy
 *
 * Body: { mint, buyerWallet, solAmount, minTokensOut (optional) }
 *
 * Returns an unsigned transaction for the agent to sign.
 * The oracle receipt is submitted onchain by the backend before returning.
 */
export async function createBuyTransaction(req, res) {
  try {
    const { mint, buyerWallet, solAmount, minTokensOut = 0 } = req.body;

    if (!mint || !buyerWallet || !solAmount) {
      return res.status(400).json({ error: 'mint, buyerWallet, and solAmount required' });
    }

    const buyer = new PublicKey(buyerWallet);
    const mintPubkey = new PublicKey(mint);
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    const [tokenPubkey] = deriveTokenPDA(mintPubkey);
    const [globalPubkey] = deriveGlobalPDA();

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mintPubkey, bondingCurvePubkey, true, TOKEN_PROGRAM_ID
    );
    const buyerTokenAccount = getAssociatedTokenAddressSync(
      mintPubkey, buyer, false, TOKEN_PROGRAM_ID
    );

    // Fetch token state to get creator and fee_recipient.
    const globalAccountInfo = await connection.getAccountInfo(globalPubkey);
    if (!globalAccountInfo) {
      return res.status(400).json({ error: 'Global account not initialized — call initialize first' });
    }
    // Global layout: 8 discriminator + 32 authority + 32 fee_recipient
    const feeRecipientPubkey = new PublicKey(globalAccountInfo.data.slice(40, 72));

    const tokenAccountInfo = await connection.getAccountInfo(tokenPubkey);
    if (!tokenAccountInfo) {
      return res.status(404).json({ error: 'Token not found onchain' });
    }
    // TokenState layout: 8 discriminator + 32 mint + 32 creator
    const tokenCreatorPubkey = new PublicKey(tokenAccountInfo.data.slice(40, 72));

    const { receiptPda, nonce } = await submitReceiptTransaction(buyer);

    const solLamports = Math.floor(solAmount * 1e9);

    const instructionData = Buffer.concat([
      DISCRIMINATORS.buy,
      encodeU64(solLamports),
      encodeU64(minTokensOut),
      nonce,
    ]);

    const { blockhash } = await connection.getLatestBlockhash();

    const transaction = new Transaction({
      feePayer: buyer,
      recentBlockhash: blockhash,
    });

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
      {
        keys: [
          { pubkey: globalPubkey,          isSigner: false, isWritable: false },
          { pubkey: receiptPda,             isSigner: false, isWritable: true  },
          { pubkey: tokenPubkey,            isSigner: false, isWritable: true  },
          { pubkey: bondingCurvePubkey,     isSigner: false, isWritable: true  },
          { pubkey: vaultTokenAccount,      isSigner: false, isWritable: true  },
          { pubkey: buyerTokenAccount,      isSigner: false, isWritable: true  },
          { pubkey: mintPubkey,             isSigner: false, isWritable: false },
          { pubkey: buyer,                  isSigner: true,  isWritable: true  },
          { pubkey: feeRecipientPubkey,     isSigner: false, isWritable: true  },
          { pubkey: tokenCreatorPubkey,     isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      }
    );

    const transactionBase64 = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    res.json({
      success: true,
      mint,
      buyer: buyerWallet,
      solAmount,
      solLamports,
      receiptPda: receiptPda.toBase58(),
      transaction: transactionBase64,
      message: 'Receipt created onchain. Sign and submit the transaction to buy tokens.',
    });
  } catch (error) {
    console.error('createBuyTransaction error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/create-sell
 *
 * Body: { mint, sellerWallet, tokenAmount, minSolOut (optional) }
 *
 * tokenAmount is in whole tokens (e.g. 100). Converted to lamports internally.
 */
export async function createSellTransaction(req, res) {
  try {
    const { mint, sellerWallet, tokenAmount, minSolOut = 0 } = req.body;

    if (!mint || !sellerWallet || !tokenAmount) {
      return res.status(400).json({ error: 'mint, sellerWallet, and tokenAmount required' });
    }

    const seller = new PublicKey(sellerWallet);
    const mintPubkey = new PublicKey(mint);
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    const [tokenPubkey] = deriveTokenPDA(mintPubkey);
    const [globalPubkey] = deriveGlobalPDA();

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mintPubkey, bondingCurvePubkey, true, TOKEN_PROGRAM_ID
    );
    const sellerTokenAccount = getAssociatedTokenAddressSync(
      mintPubkey, seller, false, TOKEN_PROGRAM_ID
    );

    const globalAccountInfo = await connection.getAccountInfo(globalPubkey);
    if (!globalAccountInfo) {
      return res.status(400).json({ error: 'Global account not initialized' });
    }
    const feeRecipientPubkey = new PublicKey(globalAccountInfo.data.slice(40, 72));

    const tokenAccountInfo = await connection.getAccountInfo(tokenPubkey);
    if (!tokenAccountInfo) {
      return res.status(404).json({ error: 'Token not found onchain' });
    }
    const tokenCreatorPubkey = new PublicKey(tokenAccountInfo.data.slice(40, 72));

    const { receiptPda, nonce } = await submitReceiptTransaction(seller);

    const tokenLamports = Math.floor(tokenAmount * 10 ** TOKEN_DECIMALS);
    const minSolLamports = Math.floor(minSolOut * 1e9);

    const instructionData = Buffer.concat([
      DISCRIMINATORS.sell,
      encodeU64(tokenLamports),
      encodeU64(minSolLamports),
      nonce,
    ]);

    const { blockhash } = await connection.getLatestBlockhash();

    const transaction = new Transaction({
      feePayer: seller,
      recentBlockhash: blockhash,
    });

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
      {
        keys: [
          { pubkey: globalPubkey,          isSigner: false, isWritable: false },
          { pubkey: receiptPda,             isSigner: false, isWritable: true  },
          { pubkey: tokenPubkey,            isSigner: false, isWritable: true  },
          { pubkey: bondingCurvePubkey,     isSigner: false, isWritable: true  },
          { pubkey: vaultTokenAccount,      isSigner: false, isWritable: true  },
          { pubkey: sellerTokenAccount,     isSigner: false, isWritable: true  },
          { pubkey: mintPubkey,             isSigner: false, isWritable: false },
          { pubkey: seller,                 isSigner: true,  isWritable: true  },
          { pubkey: feeRecipientPubkey,     isSigner: false, isWritable: true  },
          { pubkey: tokenCreatorPubkey,     isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      }
    );

    const transactionBase64 = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    res.json({
      success: true,
      mint,
      seller: sellerWallet,
      tokenAmount,
      tokenLamports,
      receiptPda: receiptPda.toBase58(),
      transaction: transactionBase64,
      message: 'Receipt created onchain. Sign and submit the transaction to sell tokens.',
    });
  } catch (error) {
    console.error('createSellTransaction error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/create-contribute
 *
 * Body: { mint, contributorWallet, solAmount }
 *
 * No x402 receipt required — contribute_liquidity has no receipt gate.
 */
export async function createContributeTransaction(req, res) {
  try {
    const { mint, contributorWallet, solAmount } = req.body;

    if (!mint || !contributorWallet || !solAmount) {
      return res.status(400).json({ error: 'mint, contributorWallet, and solAmount required' });
    }

    const contributor = new PublicKey(contributorWallet);
    const mintPubkey = new PublicKey(mint);
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    const [tokenPubkey] = deriveTokenPDA(mintPubkey);

    const solLamports = Math.floor(solAmount * 1e9);

    const instructionData = Buffer.concat([
      DISCRIMINATORS.contribute_liquidity,
      encodeU64(solLamports),
    ]);

    const { blockhash } = await connection.getLatestBlockhash();

    const transaction = new Transaction({
      feePayer: contributor,
      recentBlockhash: blockhash,
    });

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500_000 }),
      {
        keys: [
          { pubkey: tokenPubkey,             isSigner: false, isWritable: true },
          { pubkey: bondingCurvePubkey,      isSigner: false, isWritable: true },
          { pubkey: contributor,             isSigner: true,  isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
      }
    );

    const transactionBase64 = transaction
      .serialize({ requireAllSignatures: false })
      .toString('base64');

    // Read bonding curve state to report graduation progress.
    const curveAccount = await connection.getAccountInfo(bondingCurvePubkey);
    let progress = null;
    if (curveAccount) {
      // BondingCurve layout: 8 disc + 32 mint + 8 vtr + 8 vsr + 8 rtr + 8 rsr
      const realSolReserves = curveAccount.data.readBigUInt64LE(64);
      const GRADUATION_LAMPORTS = 1_500_000_000n;
      progress = Number((realSolReserves * 100n) / GRADUATION_LAMPORTS);
    }

    res.json({
      success: true,
      mint,
      contributor: contributorWallet,
      solAmount,
      solLamports,
      bondingCurve: bondingCurvePubkey.toBase58(),
      progressPercent: progress,
      graduationThresholdSol: 1.5,
      transaction: transactionBase64,
      message: `Sign and submit to contribute ${solAmount} SOL to the bonding curve.`,
    });
  } catch (error) {
    console.error('createContributeTransaction error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/program/verify-contribute
 *
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

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (tx.meta?.err) {
      return res.status(400).json({ error: 'Transaction failed', details: tx.meta.err });
    }

    const mintPubkey = new PublicKey(mint);
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    const curveAccount = await connection.getAccountInfo(bondingCurvePubkey);

    let graduated = false;
    let progressPercent = null;
    if (curveAccount) {
      const realSolReserves = curveAccount.data.readBigUInt64LE(64);
      const GRADUATION_LAMPORTS = 1_500_000_000n;
      graduated = realSolReserves >= GRADUATION_LAMPORTS;
      progressPercent = Number((realSolReserves * 100n) / GRADUATION_LAMPORTS);
    }

    res.json({
      success: true,
      verified: true,
      mint,
      graduated,
      progressPercent,
      signature: transactionSignature,
      message: graduated ? 'Token graduated! Call create-pool next.' : `Progress: ${progressPercent}%`,
    });
  } catch (error) {
    console.error('verifyContribute error:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/program/bonding-curve/:mint
 *
 * Returns current bonding curve state for a token.
 */
export async function getBondingCurve(req, res) {
  try {
    const mintPubkey = new PublicKey(req.params.mint);
    const [bondingCurvePubkey] = deriveBondingCurvePDA(mintPubkey);
    const curveAccount = await connection.getAccountInfo(bondingCurvePubkey);

    if (!curveAccount) {
      return res.status(404).json({ error: 'Bonding curve not found' });
    }

    // BondingCurve layout (after 8-byte discriminator):
    // 32 mint | 8 virtualTokenReserves | 8 virtualSolReserves |
    // 8 realTokenReserves | 8 realSolReserves | 8 tokenTotalSupply | 1 complete | 1 bump
    const data = curveAccount.data;
    const virtualTokenReserves = data.readBigUInt64LE(40);
    const virtualSolReserves   = data.readBigUInt64LE(48);
    const realTokenReserves    = data.readBigUInt64LE(56);
    const realSolReserves      = data.readBigUInt64LE(64);
    const tokenTotalSupply     = data.readBigUInt64LE(72);
    const complete             = data[80] === 1;

    const GRADUATION_LAMPORTS = 1_500_000_000n;
    const progressPercent = Number((realSolReserves * 100n) / GRADUATION_LAMPORTS);

    // Spot price: virtual_sol_reserves / virtual_token_reserves (in SOL per token)
    const pricePerToken = Number(virtualSolReserves) / Number(virtualTokenReserves) / 1e9;

    res.json({
      mint: req.params.mint,
      bondingCurve: bondingCurvePubkey.toBase58(),
      virtualTokenReserves: virtualTokenReserves.toString(),
      virtualSolReserves: virtualSolReserves.toString(),
      realTokenReserves: realTokenReserves.toString(),
      realSolReserves: realSolReserves.toString(),
      tokenTotalSupply: tokenTotalSupply.toString(),
      complete,
      progressPercent: Math.min(progressPercent, 100),
      pricePerToken,
      graduationThresholdSol: 1.5,
    });
  } catch (error) {
    console.error('getBondingCurve error:', error);
    res.status(500).json({ error: error.message });
  }
}

export default {
  getPlatformConfig,
  getNetworkInfo,
  createLaunchTransaction,
  verifyLaunch,
  createBuyTransaction,
  createSellTransaction,
  createContributeTransaction,
  verifyContribute,
  getBondingCurve,
};
