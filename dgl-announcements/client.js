const { createClient } = require("@supabase/supabase-js");
const { loadDglConfig } = require("./config");

let client = null;

/**
 * Read-only Supabase client using the anon key.
 * Phase J1 must not use the service role.
 */
function getDglSupabaseClient() {
  if (client) {
    return client;
  }

  const config = loadDglConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }

  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    realtime: {
      params: {
        eventsPerSecond: 5
      }
    }
  });

  return client;
}

function isDglSupabaseConfigured() {
  return !!getDglSupabaseClient();
}

module.exports = {
  getDglSupabaseClient,
  isDglSupabaseConfigured
};
