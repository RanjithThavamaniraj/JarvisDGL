const { load } = require("./store");
const { getCandidatesForSport } = require("./candidates");
const { getRaceSessionForSport, getClosesAt } = require("./schedule");
const { getChannelIdForSport } = require("./config");

async function createPrediction(sport, { force = false, raceSession = null } = {}) {
  const data = load();
  const session = raceSession || getRaceSessionForSport(sport);
  if (!session) {
    return null;
  }

  const existing = data.events[session.eventId];
  if (
    existing &&
    (existing.status === "open" ||
      existing.status === "closed" ||
      existing.status === "completed") &&
    !force
  ) {
    return { event: existing, created: false };
  }

  const channelId = getChannelIdForSport(sport);
  if (!channelId) {
    throw new Error(`Missing channel ID for sport: ${sport}`);
  }

  const candidates = await getCandidatesForSport(sport);
  const closesAt = getClosesAt(session.raceStart, sport);

  const event = {
    eventId: session.eventId,
    sport,
    eventName: session.eventName,
    type: "race_winner",
    status: "open",
    raceStart: session.raceStart,
    closesAt,
    channelId,
    messageId: existing?.messageId || null,
    candidates,
    votes: existing?.status === "open" ? existing.votes || {} : {},
    final: null,
    communityResultsPosted: false,
    lastResultsPollAt: null,
    openedAt: new Date().toISOString(),
    motogpSessionId: session.sessionId || null,
    redditPostId: existing?.redditPostId || null,
    redditPostedAt: existing?.redditPostedAt || null
  };

  return { event, created: true };
}

module.exports = { createPrediction };
