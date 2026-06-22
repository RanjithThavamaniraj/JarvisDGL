require("dotenv").config();
const { logPredictionError } = require("./logger");

let cachedConfig = null;

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function loadCommunityConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    enabled: parseBoolean(process.env.ENABLE_COMMUNITY_PREDICTIONS, true),
    f1MandramChannelId: process.env.F1_MANDRAM_CHANNEL_ID?.trim() || "",
    motogpChannelId: process.env.MOTOGP_CHANNEL_ID?.trim() || "",
    apiPort: Number(process.env.API_PORT) || 3001
  };

  return cachedConfig;
}

function validateEnabledConfig(config = loadCommunityConfig()) {
  const missing = [];

  if (!config.f1MandramChannelId) {
    missing.push("F1_MANDRAM_CHANNEL_ID");
  }
  if (!config.motogpChannelId) {
    missing.push("MOTOGP_CHANNEL_ID");
  }
  if (!config.apiPort || Number.isNaN(config.apiPort)) {
    missing.push("API_PORT");
  }

  return missing;
}

function isCommunityPredictionsEnabled() {
  return loadCommunityConfig().enabled;
}

function getChannelIdForSport(sport) {
  const config = loadCommunityConfig();
  if (sport === "f1") {
    return config.f1MandramChannelId;
  }
  if (sport === "motogp") {
    return config.motogpChannelId;
  }
  return null;
}

function logStartupStatus() {
  const config = loadCommunityConfig();

  if (!config.enabled) {
    console.log("⏸️ Community predictions disabled via environment variable");
    console.log("Community Predictions: DISABLED");
    return config;
  }

  const missing = validateEnabledConfig(config);
  if (missing.length > 0) {
    logPredictionError(
      `Community Predictions enabled but missing required env: ${missing.join(", ")}`
    );
    config.enabled = false;
    console.log("Community Predictions: DISABLED");
    return config;
  }

  console.log("Community Predictions: ENABLED");
  return config;
}

module.exports = {
  loadCommunityConfig,
  validateEnabledConfig,
  isCommunityPredictionsEnabled,
  getChannelIdForSport,
  logStartupStatus
};
