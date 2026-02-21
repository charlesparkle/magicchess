/**
 * config.js — Centralized Configuration
 * Single source of truth for app-wide constants
 */

// ── Admin Configuration ────────────────────────────────────────────────────────
// IMPORTANT: This should ideally be checked server-side via Supabase RLS policies
// For now, this is a client-side check that can be bypassed by modifying code.
// Always verify admin status server-side in Supabase RLS policies!
export const ADMIN_UID = '4f3c121c-7c08-4ea8-9510-2bf38c2bb690';

// ── Design Tokens (from CSS variables) ──────────────────────────────────────────
// These should match tokens.css for consistency
export const DESIGN_TOKENS = {
  primary: '#6366f1',
  secondary: '#a855f7',
  gold: '#eab308',
  danger: '#ef4444',
  success: '#22c55e',
};

// ── Feature Flags ──────────────────────────────────────────────────────────────
export const FEATURES = {
  ENABLE_REALTIME: true,
  ENABLE_PROFANITY_FILTER: true,
  ENABLE_LINK_FILTER: true,
};
