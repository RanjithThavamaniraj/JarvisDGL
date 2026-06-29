const cron = require("node-cron");
const dayjs = require("dayjs");
const timezone = require("dayjs/plugin/timezone");
const { load, upsertEvent } = require("./store");
const { closePoll, postCommunityResults } = require("./lifecycle");
const { createPrediction } = require("./create-prediction");
const { publishDiscordPoll } = require("./publishers/discord-publisher");
const { publishRedditPrediction } = require("../src/reddit/publisher");
const {
  getMotoGPRaceSession,
  isRaceThisWeekend,
  isMotoGpRaceResultsPosted,
  IST
} = require("./schedule");
const { getF1RaceSessionResolved } = require("./f1-schedule");
const { isMotoGpClosureReached } = require("../utils/motogp-time");
const { fetchMotoGpRaceWinner } = require("./candidates");
const {
  shouldPollF1Results,
  fetchF1RaceWinnerForEvent
} = require("./f1-results");
const { isCommunityPredictionsEnabled } = require("./config");
const { logPredictionError } = require("./logger");

dayjs.extend(timezone);

const SPORTS = ["f1", "motogp"];
const RECONCILE_INTERVAL_MS = 10 * 60 * 1000;

function pollExists(data, eventId) {
  const existing = data.events[eventId];
  return !!(
    existing &&
    (existing.status === "open" ||
      existing.status === "closed" ||
      existing.status === "completed")
  );
}

async function resolveRaceSession(sport) {
  if (sport === "f1") {
    return getF1RaceSessionResolved();
  }
  return getMotoGPRaceSession();
}

async function reconcileWeekendPolls(client, reason = "tick") {
  console.log(`[CP] Scheduler ${reason}`);

  const data = load();

  for (const sport of SPORTS) {
    try {
      const raceSession = await resolveRaceSession(sport);
      if (!raceSession) {
        console.log(`[CP] ${sport}: poll skipped (no race session)`);
        continue;
      }

      if (!isRaceThisWeekend(raceSession.raceStart, sport)) {
        console.log(`[CP] ${sport}: poll skipped (weekend not active)`);
        continue;
      }

      console.log(`[CP] ${sport}: weekend detected (${raceSession.eventName})`);

      if (pollExists(data, raceSession.eventId)) {
        if (sport === "motogp") {
          const freshData = load();
          const existing = freshData.events[raceSession.eventId];
          if (existing && !existing.redditPostId) {
            try {
              await publishRedditPrediction(existing);
            } catch (err) {
              console.error(`[Reddit] Publish failed: ${err.message}`);
            }
          }
        }

        console.log(`[CP] ${sport}: poll exists`);
        continue;
      }

      const created = await createPrediction(sport, { raceSession });
      if (!created || !created.created) {
        continue;
      }

      let event = created.event;
      try {
        event = await publishDiscordPoll(client, created.event);
        console.log(`[CP] ${sport}: poll created`);
      } catch (err) {
        logPredictionError(`Failed to publish ${sport} poll to Discord`, err);
      }

      if (sport === "motogp") {
        try {
          await publishRedditPrediction(event);
        } catch (err) {
          console.error(`[Reddit] Publish failed: ${err.message}`);
        }
      }
    } catch (err) {
      logPredictionError(`Failed to reconcile ${sport} poll`, err);
    }
  }
}

async function checkClosures(client) {
  const data = load();
  const now = dayjs();

  for (const event of Object.values(data.events)) {
    if (event.status !== "open") continue;

    const closureReached =
      event.sport === "motogp"
        ? isMotoGpClosureReached(event.closesAt)
        : now.isAfter(dayjs(event.closesAt));

    if (!closureReached) continue;

    try {
      await closePoll(client, event.eventId);
    } catch (err) {
      logPredictionError(`Failed to close poll ${event.eventId}`, err);
    }
  }
}

async function checkCommunityResults(client) {
  const data = load();

  for (const event of Object.values(data.events)) {
    if (event.status !== "closed") continue;
    if (event.communityResultsPosted) continue;
    if (!event.final) continue;

    try {
      if (event.sport === "motogp") {
        if (!isMotoGpRaceResultsPosted()) continue;

        const winner = await fetchMotoGpRaceWinner();
        if (!winner) continue;

        await postCommunityResults(client, event, winner);
        continue;
      }

      if (event.sport === "f1") {
        if (!shouldPollF1Results(event)) continue;

        event.lastResultsPollAt = new Date().toISOString();
        upsertEvent(data, event);

        const winner = await fetchF1RaceWinnerForEvent(event);
        if (!winner) continue;

        await postCommunityResults(client, event, winner);
      }
    } catch (err) {
      logPredictionError(`Failed community results for ${event.eventId}`, err);
    }
  }
}

async function schedulerTick(client, reason) {
  if (!isCommunityPredictionsEnabled()) return;

  try {
    await reconcileWeekendPolls(client, reason);
    await checkClosures(client);
    await checkCommunityResults(client);
  } catch (err) {
    logPredictionError("Scheduler tick failed", err);
  }
}

function startScheduler(client) {
  if (!isCommunityPredictionsEnabled()) {
    return;
  }

  cron.schedule(
    "0 18 * * 5",
    () => schedulerTick(client, "friday-cron"),
    { timezone: IST }
  );

  setInterval(() => schedulerTick(client, "tick"), RECONCILE_INTERVAL_MS);

  setTimeout(() => schedulerTick(client, "startup"), 5000);
}

module.exports = {
  startScheduler,
  reconcileWeekendPolls,
  schedulerTick,
  checkClosures,
  checkCommunityResults
};
