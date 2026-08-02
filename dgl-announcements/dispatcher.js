const { normalizeActivityType, ACTIVITY_TYPES } = require("./types");
const { isProcessed, claimActivity, markPosted, markFailed } = require("./store");
const { handleTournamentPublished } = require("./handlers/tournament-published");
const { handleGiveawayCreated } = require("./handlers/giveaway-created");
const { handleGiveawayCompleted } = require("./handlers/giveaway-completed");

/**
 * Permanent extension point for DGL announcements.
 *
 * To add a future type (e.g. registration_opened):
 * 1. Create handlers/registration-opened.js exporting handleRegistrationOpened
 * 2. Register it here under the snake_case activity_type key
 * 3. Add the constant in types.js ACTIVITY_TYPES (optional but recommended)
 *
 * No Realtime / catch-up / store changes required.
 */
const HANDLERS = {
  [ACTIVITY_TYPES.TOURNAMENT_PUBLISHED]: handleTournamentPublished,
  [ACTIVITY_TYPES.GIVEAWAY_CREATED]: handleGiveawayCreated,
  [ACTIVITY_TYPES.GIVEAWAY_COMPLETED]: handleGiveawayCompleted
};

function getActivityType(row) {
  return (
    row.activity_type ||
    row.type ||
    row.event_type ||
    row.kind ||
    null
  );
}

function isSupportedActivityType(raw) {
  const type = normalizeActivityType(raw);
  return !!(type && HANDLERS[type]);
}

/**
 * Process one community_activity row end-to-end.
 * Idempotent via local claim store (read-only against Supabase).
 */
async function dispatchActivity(discordClient, row, source = "unknown") {
  if (!row || !row.id) {
    console.warn(`[DGL] Skipping activity without id (source=${source})`);
    return { status: "skipped", reason: "missing_id" };
  }

  const activityId = String(row.id);
  const rawType = getActivityType(row);
  const type = normalizeActivityType(rawType);
  const handler = type ? HANDLERS[type] : null;

  console.log("[DGL] dispatch enter", {
    source,
    id: activityId,
    rawType,
    normalizedType: type,
    handlerFound: !!handler
  });

  if (!handler) {
    console.log("[DGL] dispatch ignored unsupported_type", {
      source,
      id: activityId,
      rawType,
      normalizedType: type
    });
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
    console.log("[DGL] dispatch invoking handler", {
      source,
      id: activityId,
      type
    });
    const message = await handler(discordClient, row);
    markPosted(activityId, message.id);
    return { status: "posted", messageId: message.id, type };
  } catch (err) {
    markFailed(activityId, err.message);
    console.error(
      `[DGL] Failed to process activity ${activityId} (source=${source}):`,
      err
    );
    return { status: "failed", error: err.message, type };
  }
}

module.exports = {
  HANDLERS,
  dispatchActivity,
  getActivityType,
  isSupportedActivityType
};
