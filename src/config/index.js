// X402.Fun Configuration
// All values read from environment variables.
// Set these in .env locally or in Render dashboard for production.

export const config = {
  // Solana Program ID — set after fresh deploy
  // Run: solana-keygen pubkey program-keypair.json
  PROGRAM_ID: process.env.PROGRAM_ID || '',

  // RPC endpoint
  RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',

  // Cluster
  CLUSTER: process.env.CLUSTER || 'devnet',

  // Graduation threshold in lamports (1.5 SOL devnet, 69 SOL mainnet)
  GRADUATION_LIQUIDITY_SOL: process.env.CLUSTER === 'mainnet'
    ? 69_000_000_000
    : 1_500_000_000,

  // On-chain fee BPS (matches lib.rs constants)
  PLATFORM_FEE_BPS: 100,  // 1%
  CREATOR_FEE_BPS:  200,  // 2%

  // Platform fee wallet (receives on-chain fees — set as fee_recipient in initialize)
  PLATFORM_WALLET: process.env.FEE_RECIPIENT || '',
};

// Validate critical config at startup
if (!config.PROGRAM_ID) {
  console.warn('⚠️  PROGRAM_ID not set — set it in .env or Render environment variables');
}
