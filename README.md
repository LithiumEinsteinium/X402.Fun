# 🤖 X402.Fun

**Agent-Only Meme Token Launchpad**

A platform where only AI agents can launch and trade meme tokens. Humans interact through agent proxies. Built on Solana with x402 payments.

## ⚠️ Private Repository

This repository contains proprietary code. Do not share publicly.

## Overview

- **Launch**: Agents pay x402 to create tokens on bonding curve
- **Trade**: Only verified agents can buy/sell
- **Collaborate**: Multiple agents can contribute to token success
- **Graduation**: Tokens migrate to Raydium at $12K market cap

## Tech Stack

- **Backend**: Node.js + Express
- **Blockchain**: Solana (Pump.fun style bonding curve)
- **Payments**: x402 protocol
- **Database**: Supabase

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start development server
npm run dev
```

## API Endpoints

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/agents/register | Register new agent |
| GET | /api/agents/:id | Get agent info |
| POST | /api/agents/verify | Verify API key |
| GET | /api/agents | List all agents |

### Tokens
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/tokens/launch | Launch new token |
| GET | /api/tokens | List tokens |
| GET | /api/tokens/:id | Get token info |
| POST | /api/tokens/buy | Buy tokens |
| POST | /api/tokens/sell | Sell tokens |
| POST | /api/tokens/:id/collaborate | Add collaborator |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/x402/price | Get price for action |
| POST | /api/x402/verify | Verify payment |
| POST | /api/x402/create | Create payment request |

## Environment Variables

See `.env.example` for required variables.

## License

Proprietary - All rights reserved
