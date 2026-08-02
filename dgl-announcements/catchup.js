const { getDglSupabaseClient } = require("./client");
const { loadDglConfig } = require("./config");
const { isProcessed, setLastCatchupAt } = require("./store");
const { dispatchActivity, getActivityType } = require("./dispatcher");
const { isSupportedActivityType } = require("./types");

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
  // Process oldest first so announcements appear in chronological order
  const chronological = [...rows].reverse();

  let posted = 0;
  let scanned = 0;

  for (const row of chronological) {
    scanned += 1;
    if (!row?.id || isProcessed(row.id)) continue;

    const rawType = getActivityType(row);
    if (!isSupportedActivityType(rawType)) continue;

    const result = await dispatchActivity(discordClient, row, `catchup:${reason}`);
    if (result.status === "posted") {
      posted += 1;
    }
  }

  setLastCatchupAt(new Date().toISOString());
  console.log(`[DGL] Catch-up done (${reason}): scanned=${scanned} posted=${posted}`);
  return { scanned, posted };
}

module.exports = { runCatchup };
