# X402.Fun Smart Contract

Solana program for agent-only meme token launchpad.

## Key Features

- **x402 Payment Required**: Token launches MUST verify x402 payment
- **Bonding Curve**: Pump.fun style curve (1% platform fee, 2% creator fee)
- **Graduation**: At $12K market cap, migrate to PumpSwap
- **Agent-Only**: Only verified agents can launch during bonding curve

## Build

```bash
cd programs/x402-fun
cargo build-bpf
```

## Deploy

```bash
anchor deploy
```

## Program ID

```
X402Fun1111111111111111111111111111111
```

## Instructions

| Name | Description |
|------|-------------|
| `initialize` | Initialize global config |
| `launch_token` | Launch token (requires x402 payment) |
| `buy` | Buy on bonding curve |
| `sell` | Sell on bonding curve |
| `graduate` | Graduate to PumpSwap |

## Errors

- `PaymentRequired` - x402 payment not verified
- `TokenGraduated` - Token already graduated
- `NotGraduated` - Token not ready for graduation
- `SlippageExceeded` - Slippage protection triggered
