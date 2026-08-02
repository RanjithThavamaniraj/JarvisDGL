require("dotenv").config();

let cachedConfig = null;

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function loadDglConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    enabled: parseBoolean(process.env.ENABLE_DGL_ANNOUNCEMENTS, false),
    channelId: process.env.DGL_ANNOUNCEMENTS_CHANNEL_ID?.trim() || "",
    supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY?.trim() || "",
    activityTable: process.env.DGL_COMMUNITY_ACTIVITY_TABLE?.trim() || "community_activity",
    catchupLimit: Number(process.env.DGL_CATCHUP_LIMIT) || 50,
    catchupIntervalMs: Number(process.env.DGL_CATCHUP_INTERVAL_MS) || 5 * 60 * 1000
  };

  return cachedConfig;
}

function validateEnabledConfig(config = loadDglConfig()) {
  const missing = [];
  if (!config.channelId) missing.push("DGL_ANNOUNCEMENTS_CHANNEL_ID");
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  return missing;
}

function isDglAnnouncementsEnabled() {
  return loadDglConfig().enabled;
}

function logStartupStatus() {
  const config = loadDglConfig();

  if (!config.enabled) {
    console.log("DGL Announcements: DISABLED");
    return config;
  }

  const missing = validateEnabledConfig(config);
  if (missing.length > 0) {
    console.error(
      `[DGL] Enabled but missing required env: ${missing.join(", ")}`
    );
    config.enabled = false;
    console.log("DGL Announcements: DISABLED");
    return config;
  }

  console.log("DGL Announcements: ENABLED (read-only Realtime)");
  return config;
}

module.exports = {
  loadDglConfig,
  validateEnabledConfig,
  isDglAnnouncementsEnabled,
  logStartupStatus
};
