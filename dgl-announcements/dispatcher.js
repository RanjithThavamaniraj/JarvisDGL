const { normalizeActivityType, ACTIVITY_TYPES } = require("./types");
const { isProcessed, claimActivity, markPosted, markFailed } = require("./store");
const { handleTournamentPublished } = require("./handlers/tournament-published");

function getActivityType(row) {
  return (
    row.activity_type ||
    row.type ||
    row.event_type ||
    row.kind ||
    null
  );
}

/**
 * Process one community_activity row end-to-end.
 * Idempotent via local claim store (Phase J1 is read-only against Supabase).
 */
async function dispatchActivity(discordClient, row, source = "unknown") {
  if (!row || !row.id) {
    console.warn(`[DGL] Skipping activity without id (source=${source})`);
    return { status: "skipped", reason: "missing_id" };
  }

  const activityId = String(row.id);
  const rawType = getActivityType(row);
  const type = normalizeActivityType(rawType);

  if (type !== ACTIVITY_TYPES.TOURNAMENT_PUBLISHED) {
    return { status: "ignored", reason: "unsupported_type", type: rawType };
  }

  if (isProcessed(activityId)) {
    console.log(`[DGL] Skip duplicate activity ${activityId} (source=${source})`);
    return { status: "duplicate" };
  }

  if (!claimActivity(activityId)) {
    console.log(`[DGL] Skip race-claimed activity ${activityId} (source=${source})`);
    return { status: "duplicate" };
  }

  try {
    const message = await handleTournamentPublished(discordClient, row);
    markPosted(activityId, message.id);
    return { status: "posted", messageId: message.id };
  } catch (err) {
    markFailed(activityId, err.message);
    console.error(
      `[DGL] Failed to process activity ${activityId} (source=${source}):`,
      err
    );
    return { status: "failed", error: err.message };
  }
}

module.exports = {
  dispatchActivity,
  getActivityType
};
