require("dotenv").config();

let cachedConfig = null;

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }
  return Math.floor(n);
}

function loadXpConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  let minXp = parsePositiveInt(process.env.XP_MIN, 15);
  let maxXp = parsePositiveInt(process.env.XP_MAX, 25);
  if (maxXp < minXp) {
    const swap = minXp;
    minXp = maxXp;
    maxXp = swap;
  }

  cachedConfig = {
    enabled: parseBoolean(process.env.ENABLE_XP_LEVELING, false),
    levelUpChannelId: process.env.LEVEL_UP_CHANNEL_ID?.trim() || "",
    supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    minXp,
    maxXp,
    cooldownMs: parsePositiveInt(process.env.XP_COOLDOWN_MS, 60_000),
    cooldownMaxEntries: parsePositiveInt(process.env.XP_COOLDOWN_MAX_ENTRIES, 5_000),
    maxInFlight: parsePositiveInt(process.env.XP_MAX_IN_FLIGHT, 2)
  };

  return cachedConfig;
}

function validateEnabledConfig(config = loadXpConfig()) {
  const missing = [];
  if (!config.supabaseUrl || config.supabaseUrl === "your_project_url") {
    missing.push("SUPABASE_URL");
  }
  if (!config.supabaseServiceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return missing;
}

function isXpLevelingEnabled() {
  return loadXpConfig().enabled;
}

function logStartupStatus() {
  const config = loadXpConfig();

  if (!config.enabled) {
    console.log("XP Leveling: DISABLED");
    return config;
  }

  const missing = validateEnabledConfig(config);
  if (missing.length > 0) {
    console.error(`[XP] Enabled but missing required env: ${missing.join(", ")}`);
    config.enabled = false;
    console.log("XP Leveling: DISABLED");
    return config;
  }

  if (!config.levelUpChannelId) {
    console.error(
      "[XP] LEVEL_UP_CHANNEL_ID missing — XP awards will run, level-up announcements disabled"
    );
  }

  console.log(
    `XP Leveling: ENABLED (cooldown=${config.cooldownMs}ms, xp=${config.minXp}-${config.maxXp}, maxInFlight=${config.maxInFlight})`
  );
  return config;
}

/** Test-only: clear cached config between cases. */
function resetXpConfigCache() {
  cachedConfig = null;
}

module.exports = {
  loadXpConfig,
  validateEnabledConfig,
  isXpLevelingEnabled,
  logStartupStatus,
  resetXpConfigCache
};
