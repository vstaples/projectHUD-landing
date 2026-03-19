// ── HUD Platform · config.js ────────────────────────────────────────────────
// Single source of truth for Supabase credentials and environment config.
// Loaded first on every page. Defines the global PHUD namespace.
// ────────────────────────────────────────────────────────────────────────────

window.PHUD = {
  SUPABASE_URL: 'https://dvbetgdzksatcgdfftbs.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2YmV0Z2R6a3NhdGNnZGZmdGJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDc2MTYsImV4cCI6MjA4OTEyMzYxNn0.1geeKhrLL3nhjW08ieKr7YZmE0AVX4xnom7i2j1W358',

  // Active product modules — gated per firm in production via firm_modules table
  // For development both are enabled
  MODULES: ['project', 'cadence'],

  // Environment
  ENV: 'development',  // 'development' | 'production'

  // App version — stamped on deployment, recorded in audit log and validation_runs
  VERSION: '1.0.0',

  // Helper: is a given module enabled?
  hasModule(name) { return this.MODULES.includes(name); },
};