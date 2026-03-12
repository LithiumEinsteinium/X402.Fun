// X402.Fun Configuration

export const config = {
  // Solana Program ID (deployed on devnet)
  PROGRAM_ID: '63NAXuGHqn4nYu9kHiucsEdkgVobZ3dhtGHpaVDE7XJF',
  
  // RPC
  RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  
  // Graduation threshold (in lamports)
  GRADUATION_LIQUIDITY_SOL: 1_500_000_000, // 1.5 SOL devnet
  
  // Fees
  PLATFORM_FEE_BPS: 100, // 1%
  CREATOR_FEE_BPS: 200, // 2%
  
  // x402 Payment
  TOKEN_LAUNCH_FEE_USDC: 25,
}
