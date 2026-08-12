const { logStartupStatus, isXpLevelingEnabled, loadXpConfig } = require("./config");
const { handleMessage } = require("./handler");
const { resolveLevelUpChannel } = require("./announce");
const {
  calculateLevelFromXp,
  calculateXpRequiredForLevel
} = require("./levels");

/**
 * Initialize XP leveling (channel cache only). No new Discord listeners.
 */
async function setup(client) {
  const config = logStartupStatus();
  if (!config.enabled || !isXpLevelingEnabled()) {
    return;
  }

  if (config.levelUpChannelId) {
    const channel = await resolveLevelUpChannel(client, config.levelUpChannelId);
    if (channel) {
      console.log("[XP] Level-up channel connected");
    }
  }
}

module.exports = {
  setup,
  handleMessage,
  calculateLevelFromXp,
  calculateXpRequiredForLevel,
  loadXpConfig,
  isXpLevelingEnabled
};
