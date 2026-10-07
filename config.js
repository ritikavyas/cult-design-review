/*
 * Connection settings for the Vercel + Supabase deployment (see SETUP-VERCEL-SUPABASE.md).
 * Leave supabaseUrl / supabaseAnonKey empty to run in "this browser only" mode.
 * The key below is Supabase's PUBLISHABLE key: it is meant to be public. What each person may read or
 * write is enforced by the database rules in supabase/schema.sql, not by hiding this key.
 * (Never put the "secret" / "service_role" key in this file.)
 */
window.CULT_CONFIG = {
  supabaseUrl: 'https://fbthvasbpbtpidomtdvb.supabase.co',
  supabaseAnonKey: 'sb_publishable_uMQRvidmdHfqSvadmJn6KA_eS2S60j0',
  enableGoogle: false,    // set true after turning on the Google provider in Supabase (optional)
};
