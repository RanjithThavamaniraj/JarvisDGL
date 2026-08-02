const { getDglSupabaseClient } = require("./client");
const { loadDglConfig } = require("./config");
const { dispatchActivity } = require("./dispatcher");
const { runCatchup } = require("./catchup");

let channel = null;
let catchupTimer = null;
let reconnectCatchupScheduled = false;

function scheduleReconnectCatchup(discordClient) {
  if (reconnectCatchupScheduled) return;
  reconnectCatchupScheduled = true;

  setTimeout(async () => {
    reconnectCatchupScheduled = false;
    try {
      await runCatchup(discordClient, "realtime-reconnect");
    } catch (err) {
      console.error("[DGL] Reconnect catch-up failed:", err);
    }
  }, 2000);
}

async function startRealtimeListener(discordClient) {
  const supabase = getDglSupabaseClient();
  const config = loadDglConfig();

  if (!supabase) {
    console.error("[DGL] Cannot start Realtime: anon client unavailable");
    return null;
  }

  if (channel) {
    console.log("[DGL] Realtime listener already active");
    return channel;
  }

  const channelName = `dgl-community-activity`;

  channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: config.activityTable
      },
      async (payload) => {
        try {
          const row = payload.new;
          await dispatchActivity(discordClient, row, "realtime");
        } catch (err) {
          console.error("[DGL] Realtime dispatch error:", err);
        }
      }
    )
    .subscribe((status, err) => {
      console.log(`[DGL] Realtime status: ${status}`);
      if (err) {
        console.error("[DGL] Realtime subscribe error:", err);
      }

      if (status === "SUBSCRIBED") {
        scheduleReconnectCatchup(discordClient);
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        console.warn(`[DGL] Realtime channel unhealthy (${status}); SDK will retry`);
      }
    });

  if (config.catchupIntervalMs > 0) {
    catchupTimer = setInterval(() => {
      runCatchup(discordClient, "interval").catch((err) => {
        console.error("[DGL] Interval catch-up failed:", err);
      });
    }, config.catchupIntervalMs);

    if (typeof catchupTimer.unref === "function") {
      catchupTimer.unref();
    }
  }

  console.log(
    `[DGL] Realtime listening on public.${config.activityTable} (INSERT)`
  );

  return channel;
}

async function stopRealtimeListener() {
  if (catchupTimer) {
    clearInterval(catchupTimer);
    catchupTimer = null;
  }

  const supabase = getDglSupabaseClient();
  if (supabase && channel) {
    await supabase.removeChannel(channel);
  }
  channel = null;
}

module.exports = {
  startRealtimeListener,
  stopRealtimeListener
};
