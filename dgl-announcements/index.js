const { logStartupStatus, isDglAnnouncementsEnabled } = require("./config");
const { startRealtimeListener } = require("./realtime-listener");
const { runCatchup } = require("./catchup");

/**
 * Phase J1: Tournament Published only.
 * Read-only Supabase (anon key) + local idempotency store.
 */
function setup(client) {
  const config = logStartupStatus();
  if (!isDglAnnouncementsEnabled() || !config.enabled) {
    return;
  }

  startRealtimeListener(client)
    .then(() => runCatchup(client, "startup"))
    .catch((err) => {
      console.error("[DGL] Failed to start announcements module:", err);
    });
}

module.exports = { setup };
