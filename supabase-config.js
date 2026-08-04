// ---------------------------------------------------------------------------
// Supabase connection settings.
//
// Both values below are PUBLIC by design. The anon key is meant to ship in
// client-side source; access is enforced by row-level security policies on the
// Supabase side, not by keeping this key secret.
//
// NEVER put the service_role key in this file or anywhere else in this repo.
// It bypasses every security policy.
//
// Fill these in from: Supabase dashboard -> Project Settings -> API
// See SETUP.md for the full walkthrough.
// ---------------------------------------------------------------------------

// Base project URL — no trailing path. The client appends /rest/v1, /auth/v1
// and so on itself, so pasting the REST endpoint here would break it.
export const SUPABASE_URL = 'https://djqpgdchknwgmjmkagnr.supabase.co';

// Publishable key (the modern name for the anon key). Safe to publish.
export const SUPABASE_ANON_KEY = 'sb_publishable_j3L7Uh7EEb5320b-TXHsVA_khLKcgZY';

export const IS_CONFIGURED =
  !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_ANON_KEY.startsWith('PASTE_');
