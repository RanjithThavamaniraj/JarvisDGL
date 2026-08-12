/**
 * Cached level-up channel. Never fetch on every XP award.
 */

let cachedChannel = null;
let channelResolveAttempted = false;

async function resolveLevelUpChannel(client, channelId) {
  channelResolveAttempted = true;
  cachedChannel = null;

  if (!channelId) {
    return null;
  }

  try {
    const fromCache = client.channels?.cache?.get(channelId);
    if (fromCache && typeof fromCache.send === "function") {
      cachedChannel = fromCache;
      return cachedChannel;
    }

    const fetched = await client.channels.fetch(channelId);
    if (fetched && typeof fetched.send === "function") {
      cachedChannel = fetched;
      return cachedChannel;
    }

    console.error("[XP] LEVEL_UP_CHANNEL_ID is not a text channel");
    return null;
  } catch (err) {
    console.error(
      "[XP] Failed to resolve LEVEL_UP_CHANNEL_ID:",
      err.message || err
    );
    return null;
  }
}

function getCachedLevelUpChannel() {
  return cachedChannel;
}

/**
 * Post a single level-up announcement for the final level reached.
 * Never throws to callers; never uses @everyone/@here/role mentions.
 */
async function announceLevelUp(memberMention, newLevel) {
  const channel = cachedChannel;
  if (!channel) {
    if (channelResolveAttempted) {
      // Already logged resolve failure / missing id — stay quiet per award.
      return false;
    }
    return false;
  }

  const content =
    `🎮 **DGL LEVEL UP**\n\n` +
    `${memberMention} has reached **Level ${newLevel}!** 🎉\n\n` +
    `Keep playing. Keep climbing.`;

  try {
    await channel.send({
      content,
      allowedMentions: { parse: [], users: extractUserIds(memberMention) }
    });
    console.log(`[XP] Level-up: ${memberMention} → Level ${newLevel}`);
    return true;
  } catch (err) {
    console.error("[XP] Level-up announcement failed:", err.message || err);
    return false;
  }
}

function extractUserIds(mention) {
  const match = String(mention).match(/^<@!?(\d+)>$/);
  return match ? [match[1]] : [];
}

function resetAnnounceCache() {
  cachedChannel = null;
  channelResolveAttempted = false;
}

module.exports = {
  resolveLevelUpChannel,
  getCachedLevelUpChannel,
  announceLevelUp,
  resetAnnounceCache
};
