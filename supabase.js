require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
dayjs.extend(isoWeek);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey && supabaseUrl !== "your_project_url") {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing or not configured. Supabase integration is disabled.");
}

/**
 * Ensures a user exists in the database.
 */
async function ensureUser(discordId, username) {
  if (!supabase) return false;
  try {
    const { data: existingUser } = await supabase
      .from("discord_users")
      .select("id")
      .eq("id", discordId)
      .single();

    if (existingUser) return true;

    const { error } = await supabase
      .from("discord_users")
      .insert([{ id: discordId, username: username, total_points: 0 }]);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[Supabase] ensureUser Error:", err);
    return false;
  }
}

/**
 * Ensures a driver exists.
 */
async function ensureDriver(driverId, driverName) {
  if (!supabase) return false;
  try {
    const { data: existingDriver } = await supabase
      .from("drivers")
      .select("id")
      .eq("id", driverId)
      .single();

    if (existingDriver) return true;

    const { error } = await supabase
      .from("drivers")
      .insert([{ id: driverId, name: driverName }]);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[Supabase] ensureDriver Error:", err);
    return false;
  }
}

/**
 * Gets the stable event_id based on ISO week, matching results.js logic.
 */
function getCurrentEventId() {
  return "RaceWeek_" + dayjs().year() + "_" + dayjs().isoWeek();
}

/**
 * Additive save prediction function.
 * Called asynchronously in the background. Does not block JSON logic.
 */
async function syncPrediction(discordId, username, driverId, type) {
  if (!supabase) return;
  try {
    const userOk = await ensureUser(discordId, username);
    const driverOk = await ensureDriver(driverId, driverId); // Use ID as name for now since Jarvis just has names like "Antonelli"
    
    if (!userOk || !driverOk) return;

    const eventId = getCurrentEventId();

    // Additive upsert
    await supabase.from("predictions").upsert(
      {
        user_id: discordId,
        driver_id: driverId,
        event_id: eventId,
        prediction_type: type
      },
      { onConflict: "user_id, event_id, prediction_type" }
    );
    console.log(`[Supabase] Synced ${type} prediction for ${username}`);
  } catch (err) {
    console.error("[Supabase] Sync Prediction Error:", err);
  }
}

/**
 * Additive sync leaderboard points.
 */
async function syncLeaderboard(leaderboardData) {
  if (!supabase) return;
  try {
    const upserts = [];
    for (const discordId in leaderboardData) {
      const entry = leaderboardData[discordId];
      // Ensure user exists first
      await ensureUser(discordId, entry.user);
      upserts.push({
        id: discordId,
        username: entry.user,
        total_points: entry.points
      });
    }

    if (upserts.length > 0) {
      await supabase.from("discord_users").upsert(upserts, { onConflict: "id" });
      console.log(`[Supabase] Synced ${upserts.length} leaderboard entries.`);
    }
  } catch (err) {
    console.error("[Supabase] Sync Leaderboard Error:", err);
  }
}

module.exports = {
  syncPrediction,
  syncLeaderboard,
  getCurrentEventId,
  isActive: !!supabase
};
