const { loadXpConfig, isXpLevelingEnabled } = require("./config");
const { BoundedCooldownMap } = require("./cooldown");
const { rollXpAmount, calculateLevelFromXp } = require("./levels");
const { awardXpAtomic } = require("./persist");
const { announceLevelUp } = require("./announce");

let cooldownMap = null;
let inFlight = 0;

function getCooldownMap() {
  if (!cooldownMap) {
    const config = loadXpConfig();
    cooldownMap = new BoundedCooldownMap(
      config.cooldownMs,
      config.cooldownMaxEntries
    );
  }
  return cooldownMap;
}

function isIgnorableMessage(message) {
  if (!message) return true;
  if (message.author?.bot) return true;
  if (message.system) return true;

  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (!content) return true;

  // Prefix commands (existing Jarvis style) — never award XP for commands.
  if (content.startsWith("!")) return true;

  return false;
}

/**
 * Non-blocking entry from messageCreate.
 * Never throws. Never awaits Discord/Supabase on the caller stack.
 */
function handleMessage(client, message) {
  try {
    if (!isXpLevelingEnabled()) {
      return;
    }

    const config = loadXpConfig();
    if (!config.enabled) {
      return;
    }

    if (isIgnorableMessage(message)) {
      return;
    }

    const userId = message.author?.id;
    if (!userId) {
      return;
    }

    const cooldowns = getCooldownMap();
    if (cooldowns.isOnCooldown(userId)) {
      return;
    }

    // Backpressure: skip XP rather than queue unbounded work.
    if (inFlight >= config.maxInFlight) {
      return;
    }

    const xpAmount = rollXpAmount(config.minXp, config.maxXp);

    // Accept work: set cooldown before scheduling so bursts cannot stampede DB.
    cooldowns.setCooldown(userId);

    const memberMention = `<@${userId}>`;
    schedulePersistence(xpAmount, userId, memberMention);
  } catch (err) {
    console.error("[XP] Handler error:", err.message || err);
  }
}

function schedulePersistence(xpAmount, userId, memberMention) {
  inFlight += 1;

  Promise.resolve()
    .then(() => awardXpAtomic(userId, xpAmount))
    .then(async (result) => {
      if (!result) {
        return;
      }

      const previousLevel =
        result.previousLevel ?? calculateLevelFromXp(result.previousXp);
      const newLevel = result.newLevel ?? calculateLevelFromXp(result.newXp);

      if (newLevel > previousLevel) {
        // One announcement for the final level only (multi-level jumps collapse).
        await announceLevelUp(memberMention, newLevel);
      }
    })
    .catch((err) => {
      console.error("[XP] Async persistence error:", err.message || err);
    })
    .finally(() => {
      inFlight = Math.max(0, inFlight - 1);
    });
}

function getInFlightCount() {
  return inFlight;
}

function resetHandlerState() {
  cooldownMap = null;
  inFlight = 0;
}

module.exports = {
  handleMessage,
  isIgnorableMessage,
  getCooldownMap,
  getInFlightCount,
  resetHandlerState,
  schedulePersistence
};
