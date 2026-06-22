const cron = require("node-cron");
const dayjs = require("dayjs");
const timezone = require("dayjs/plugin/timezone");
const { load, upsertEvent } = require("./store");
const { openPoll, closePoll, postCommunityResults } = require("./lifecycle");
const {
  getRaceSessionForSport,
  isRaceThisWeekend,
  isMotoGpRaceResultsPosted,
  IST
} = require("./schedule");
const { fetchMotoGpRaceWinner } = require("./candidates");
const {
  shouldPollF1Results,
  fetchF1RaceWinnerForEvent
} = require("./f1-results");
const { isCommunityPredictionsEnabled } = require("./config");
const { logPredictionError } = require("./logger");

dayjs.extend(timezone);

const SPORTS = ["f1", "motogp"];

async function tryOpenWeekendPolls(client) {
  for (const sport of SPORTS) {
    try {
      const raceSession = getRaceSessionForSport(sport);
      if (!raceSession) continue;

      if (!isRaceThisWeekend(raceSession.raceStart)) {
        continue;
      }

      const data = load();
      const existing = data.events[raceSession.eventId];
      if (existing) continue;

      await openPoll(client, sport);
    } catch (err) {
      logPredictionError(`Failed to open ${sport} poll`, err);
    }
  }
}

async function checkClosures(client) {
  const data = load();
  const now = dayjs();

  for (const event of Object.values(data.events)) {
    if (event.status !== "open") continue;
    if (now.isBefore(dayjs(event.closesAt))) continue;

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

function startScheduler(client) {
  if (!isCommunityPredictionsEnabled()) {
    return;
  }

  cron.schedule(
    "0 18 * * 5",
    async () => {
      await tryOpenWeekendPolls(client);
    },
    { timezone: IST }
  );

  setInterval(async () => {
    if (!isCommunityPredictionsEnabled()) return;

    try {
      await checkClosures(client);
      await checkCommunityResults(client);
    } catch (err) {
      logPredictionError("Scheduler tick failed", err);
    }
  }, 60000);

  setTimeout(async () => {
    if (!isCommunityPredictionsEnabled()) return;

    const now = dayjs().tz(IST);
    if (now.day() === 5 && now.hour() >= 18) {
      await tryOpenWeekendPolls(client);
    }
    await checkClosures(client);
  }, 5000);
}

module.exports = { startScheduler, tryOpenWeekendPolls, checkClosures, checkCommunityResults };
