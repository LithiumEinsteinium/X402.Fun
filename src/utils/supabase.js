// Supabase client for X402.Fun
// Configure SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.
// If not configured, tokens.js falls back to in-memory storage.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL  || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

// Only create client if both values are present
export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Helper checked by tokens.js before any DB call
export function isSupabaseConfigured() {
  return !!(supabaseUrl && supabaseKey);
}
