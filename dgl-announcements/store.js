const fs = require("fs");
const path = require("path");

const STATE_PATH = path.join(__dirname, "..", "dgl-announcements-state.json");

function defaultState() {
  return {
    version: 1,
    processed: {},
    lastCatchupAt: null
  };
}

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const data = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
      if (!data.processed || typeof data.processed !== "object") {
        data.processed = {};
      }
      return data;
    }
  } catch (err) {
    console.error("[DGL] Failed to load dgl-announcements-state.json:", err.message);
  }
  return defaultState();
}

function saveState(state) {
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

function isProcessed(activityId) {
  if (!activityId) return false;
  const state = loadState();
  return !!state.processed[String(activityId)];
}

/**
 * Claim an activity id before Discord send.
 * Returns false if already claimed (duplicate protection).
 */
function claimActivity(activityId) {
  if (!activityId) return false;

  const state = loadState();
  const key = String(activityId);
  if (state.processed[key]) {
    return false;
  }

  state.processed[key] = {
    claimedAt: new Date().toISOString(),
    status: "claimed"
  };
  saveState(state);
  return true;
}

function markPosted(activityId, messageId) {
  if (!activityId) return;

  const state = loadState();
  const key = String(activityId);
  state.processed[key] = {
    ...(state.processed[key] || {}),
    status: "posted",
    messageId: messageId || null,
    postedAt: new Date().toISOString()
  };
  saveState(state);
}

function markFailed(activityId, errorMessage) {
  if (!activityId) return;

  const state = loadState();
  const key = String(activityId);
  // Release claim so catch-up / Realtime can retry
  delete state.processed[key];
  state.lastError = {
    activityId: key,
    error: String(errorMessage || "unknown"),
    at: new Date().toISOString()
  };
  saveState(state);
}

function getOldestUnprocessedCursorHint() {
  const state = loadState();
  const postedAts = Object.values(state.processed)
    .map((entry) => entry.postedAt || entry.claimedAt)
    .filter(Boolean)
    .sort();
  return postedAts.length > 0 ? postedAts[postedAts.length - 1] : null;
}

function setLastCatchupAt(iso) {
  const state = loadState();
  state.lastCatchupAt = iso || new Date().toISOString();
  saveState(state);
}

module.exports = {
  STATE_PATH,
  loadState,
  isProcessed,
  claimActivity,
  markPosted,
  markFailed,
  getOldestUnprocessedCursorHint,
  setLastCatchupAt
};
