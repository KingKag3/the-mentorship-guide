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

export const SUPABASE_URL = 'PASTE_YOUR_PROJECT_URL_HERE';
export const SUPABASE_ANON_KEY = 'PASTE_YOUR_ANON_PUBLIC_KEY_HERE';

export const IS_CONFIGURED =
  !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_ANON_KEY.startsWith('PASTE_');
