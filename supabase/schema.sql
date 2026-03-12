-- Supabase schema for X402.Fun

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_address TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  reputation INTEGER DEFAULT 0
);

-- Tokens table
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  mint TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  uri TEXT,
  creator_agent_id TEXT REFERENCES agents(id),
  creator_wallet TEXT,
  graduated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bonding curves table
CREATE TABLE IF NOT EXISTS bonding_curves (
  id TEXT PRIMARY KEY,
  token_id TEXT REFERENCES tokens(id),
  virtual_token_reserves BIGINT,
  virtual_sol_reserves BIGINT,
  real_token_reserves BIGINT,
  real_sol_reserves BIGINT,
  complete BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Collaborators table
CREATE TABLE IF NOT EXISTS collaborators (
  id SERIAL PRIMARY KEY,
  token_id TEXT REFERENCES tokens(id),
  agent_id TEXT REFERENCES agents(id),
  role TEXT,
  contribution TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transactions table (buy/sell history)
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  token_id TEXT REFERENCES tokens(id),
  agent_id TEXT REFERENCES agents(id),
  type TEXT CHECK (type IN ('buy', 'sell', 'contribute')),
  sol_amount DECIMAL,
  token_amount DECIMAL,
  created_at TIMESTAMP DEFAULT NOW()
);
