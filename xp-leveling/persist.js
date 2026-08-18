const { createClient } = require("@supabase/supabase-js");
const { calculateLevelFromXp } = require("./levels");
const { loadXpConfig } = require("./config");

let supabase = null;
let clientInitialized = false;

/**
 * Prefer native WebSocket (Node 22+ / browsers). Fall back to `ws` on Node 20.
 * Same pattern as dgl-announcements/client.js — required because createClient()
 * constructs a RealtimeClient even though XP only uses HTTP RPC.
 */
function resolveWebSocketTransport() {
  if (typeof globalThis.WebSocket === "function") {
    return globalThis.WebSocket;
  }
  return require("ws");
}

function getSupabase() {
  if (clientInitialized) {
    return supabase;
  }
  clientInitialized = true;

  const config = loadXpConfig();
  if (
    !config.supabaseUrl ||
    !config.supabaseServiceRoleKey ||
    config.supabaseUrl === "your_project_url"
  ) {
    supabase = null;
    return supabase;
  }

  try {
    const transport = resolveWebSocketTransport();
    supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        transport
      }
    });
  } catch (err) {
    console.error("[XP] Failed to initialize Supabase client:", err.message || err);
    supabase = null;
  }
  return supabase;
}

/**
 * Atomically increment XP via Postgres RPC.
 * Returns { previousXp, newXp, previousLevel, newLevel, messagesCount } or null on failure.
 * Does not retry.
 */
async function awardXpAtomic(discordUserId, xpDelta) {
  const client = getSupabase();
  if (!client) {
    console.error("[XP] Persistence failure: Supabase client unavailable");
    return null;
  }

  try {
    const { data, error } = await client.rpc("award_discord_member_xp", {
      p_discord_user_id: String(discordUserId),
      p_xp_delta: xpDelta
    });

    if (error) {
      console.error("[XP] Persistence failure:", error.message || error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.error("[XP] Persistence failure: empty RPC response");
      return null;
    }

    const previousXp = Number(row.previous_xp);
    const newXp = Number(row.xp);
    const messagesCount = Number(row.messages_count);

    // Prefer RPC-provided levels when present; otherwise derive in JS (single source in levels.js).
    const previousLevel =
      row.previous_level != null
        ? Number(row.previous_level)
        : calculateLevelFromXp(previousXp);
    const newLevel =
      row.level != null ? Number(row.level) : calculateLevelFromXp(newXp);

    return {
      previousXp,
      newXp,
      previousLevel,
      newLevel,
      messagesCount
    };
  } catch (err) {
    console.error("[XP] Persistence failure:", err.message || err);
    return null;
  }
}

/** Test-only helpers */
function resetPersistClient() {
  supabase = null;
  clientInitialized = false;
}

function setPersistClientForTests(client) {
  supabase = client;
  clientInitialized = true;
}

module.exports = {
  awardXpAtomic,
  getSupabase,
  resetPersistClient,
  setPersistClientForTests
};
