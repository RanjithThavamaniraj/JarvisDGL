const { createClient } = require("@supabase/supabase-js");
const { loadDglConfig } = require("./config");

let client = null;

/**
 * Prefer native WebSocket (Node 22+ / browsers). Fall back to `ws` on Node 20.
 */
function resolveWebSocketTransport() {
  if (typeof globalThis.WebSocket === "function") {
    return globalThis.WebSocket;
  }
  return require("ws");
}

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

  const transport = resolveWebSocketTransport();
  if (transport !== globalThis.WebSocket) {
    console.log("[DGL] Realtime transport: ws (no native WebSocket)");
  }

  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    realtime: {
      transport,
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
