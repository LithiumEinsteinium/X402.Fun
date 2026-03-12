// Supabase client for X402.Fun

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || 'https://utjjvgsfmmhssiffjpgo.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0amp2Z3NmbW1oc3NpZmZqcGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMTc2MDAsImV4cCI6MjA1MzY5MzYwMH0.Z8LHS6JsJ0d5gzYeNB-I0tFDEO2YqN4aqRVKyTaXUI4'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Helper to check if Supabase is configured
export function isSupabaseConfigured() {
  return supabaseUrl && supabaseKey && supabaseUrl !== 'your-supabase-url'
}
