const { getDglSupabaseClient } = require("./client");
const { loadDglConfig } = require("./config");
const { isProcessed, setLastCatchupAt } = require("./store");
const {
  dispatchActivity,
  getActivityType,
  isSupportedActivityType
} = require("./dispatcher");

/**
 * Pull recent community_activity rows and process any not yet claimed locally.
 * Used on startup and after Realtime reconnects.
 */
async function runCatchup(discordClient, reason = "manual") {
  const supabase = getDglSupabaseClient();
  const config = loadDglConfig();
  if (!supabase) {
    console.warn(`[DGL] Catch-up skipped (${reason}): Supabase not configured`);
    return { scanned: 0, posted: 0 };
  }

  console.log(`[DGL] Catch-up starting (${reason})`);

  const { data, error } = await supabase
    .from(config.activityTable)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(config.catchupLimit);

  if (error) {
    console.error(`[DGL] Catch-up query failed (${reason}):`, error.message);
    return { scanned: 0, posted: 0, error: error.message };
  }

  const rows = Array.isArray(data) ? data : [];
  console.log("[DGL] Catch-up rows returned", {
    reason,
    count: rows.length,
    rows: rows.map((r) => ({
      id: r?.id ?? null,
      activity_type: getActivityType(r)
    }))
  });

  // Process oldest first so announcements appear in chronological order
  const chronological = [...rows].reverse();

  let posted = 0;
  let scanned = 0;

  for (const row of chronological) {
    scanned += 1;
    if (!row?.id) {
      console.log("[DGL] Catch-up skip", { reason, id: null, skipReason: "missing_id" });
      continue;
    }

    if (isProcessed(row.id)) {
      console.log("[DGL] Catch-up skip", {
        reason,
        id: row.id,
        activity_type: getActivityType(row),
        skipReason: "already_processed"
      });
      continue;
    }

    const rawType = getActivityType(row);
    if (!isSupportedActivityType(rawType)) {
      console.log("[DGL] Catch-up skip", {
        reason,
        id: row.id,
        activity_type: rawType,
        skipReason: "unsupported_type"
      });
      continue;
    }

    console.log("[DGL] Catch-up dispatching", {
      reason,
      id: row.id,
      activity_type: rawType
    });

    const result = await dispatchActivity(discordClient, row, `catchup:${reason}`);
    console.log("[DGL] Catch-up result", {
      reason,
      id: row.id,
      activity_type: rawType,
      status: result.status
    });
    if (result.status === "posted") {
      posted += 1;
    }
  }

  setLastCatchupAt(new Date().toISOString());
  console.log(`[DGL] Catch-up done (${reason}): scanned=${scanned} posted=${posted}`);
  return { scanned, posted };
}

module.exports = { runCatchup };
