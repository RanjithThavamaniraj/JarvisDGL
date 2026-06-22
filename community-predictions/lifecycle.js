const dayjs = require("dayjs");
const { load, save, upsertEvent, getEvent } = require("./store");
const { aggregateEvent, buildFinalSnapshot } = require("./aggregator");
const { getCandidatesForSport } = require("./candidates");
const { getRaceSessionForSport, getClosesAt } = require("./schedule");
const { getChannelIdForSport } = require("./config");
const { logPredictionError } = require("./logger");
const {
  buildButtonRows,
  buildPollEmbed,
  buildCommunityResultsMessage
} = require("./discord-ui");

const timezone = require("dayjs/plugin/timezone");
dayjs.extend(timezone);

async function openPoll(client, sport, { force = false } = {}) {
  const data = load();
  const raceSession = getRaceSessionForSport(sport);
  if (!raceSession) {
    console.log(`[CommunityPredictions] No ${sport} race session found to open poll`);
    return null;
  }

  const existing = data.events[raceSession.eventId];
  if (existing && (existing.status === "open" || existing.status === "closed")) {
    if (!force) {
      console.log(`[CommunityPredictions] Poll already exists for ${raceSession.eventId}`);
      return existing;
    }
  }

  const channelId = getChannelIdForSport(sport);
  if (!channelId) {
    throw new Error(`Missing channel ID for sport: ${sport}`);
  }

  const sportLabel = sport === "f1" ? "F1" : "MotoGP";
  console.log(`🗳️ Opening ${sportLabel} prediction poll: ${raceSession.eventName}`);

  const candidates = await getCandidatesForSport(sport);
  const closesAt = getClosesAt(raceSession.raceStart);

  const event = {
    eventId: raceSession.eventId,
    sport,
    eventName: raceSession.eventName,
    type: "race_winner",
    status: "open",
    raceStart: raceSession.raceStart,
    closesAt,
    channelId,
    messageId: existing?.messageId || null,
    candidates,
    votes: existing?.status === "open" ? existing.votes || {} : {},
    final: null,
    communityResultsPosted: false,
    lastResultsPollAt: null,
    openedAt: new Date().toISOString(),
    motogpSessionId: raceSession.sessionId || null
  };

  const channel = await client.channels.fetch(channelId);
  const summary = aggregateEvent(event);
  const embed = buildPollEmbed(event, summary);
  const components = buildButtonRows(event, false);

  const message = await channel.send({
    embeds: [embed],
    components
  });

  event.messageId = message.id;
  upsertEvent(data, event);

  console.log(`🗳️ Opened ${sportLabel} prediction poll: ${event.eventName}`);
  return event;
}

async function closePoll(client, eventId) {
  const data = load();
  const event = getEvent(data, eventId);
  if (!event || event.status !== "open") return null;

  console.log(`🔒 Closing prediction poll: ${event.eventName}`);

  event.status = "closed";
  event.closedAt = new Date().toISOString();
  event.final = buildFinalSnapshot(event);

  upsertEvent(data, event);

  try {
    const channel = await client.channels.fetch(event.channelId);
    const message = await channel.messages.fetch(event.messageId);
    const summary = aggregateEvent(event);
    const embed = buildPollEmbed(event, summary);
    const components = buildButtonRows(event, true);
    await message.edit({ embeds: [embed], components });
  } catch (err) {
    logPredictionError(`Failed to update closed poll message for ${eventId}`, err);
  }

  console.log(`🔒 Closed prediction poll: ${event.eventName}`);
  return event;
}

async function recordVote(interaction, eventId, candidateId) {
  const data = load();
  const event = getEvent(data, eventId);
  if (!event) {
    return { error: "This prediction poll no longer exists." };
  }

  if (event.status !== "open") {
    return { error: "🔒 Voting is closed for this race." };
  }

  if (dayjs().isAfter(dayjs(event.closesAt))) {
    return { error: "🔒 Voting has closed for this race." };
  }

  const candidate = event.candidates.find((c) => c.id === candidateId);
  if (!candidate) {
    return { error: "Invalid pick." };
  }

  event.votes[interaction.user.id] = {
    candidateId,
    username: interaction.user.username,
    votedAt: new Date().toISOString()
  };

  upsertEvent(data, event);

  console.log(
    `✅ Vote recorded: ${interaction.user.username} -> ${candidate.label}`
  );

  return {
    event,
    candidate,
    summary: aggregateEvent(event)
  };
}

let lastEmbedEdit = {};

async function maybeUpdatePollMessage(client, event, summary) {
  const key = event.eventId;
  const now = Date.now();
  if (lastEmbedEdit[key] && now - lastEmbedEdit[key] < 10000) {
    return;
  }
  lastEmbedEdit[key] = now;

  try {
    const channel = await client.channels.fetch(event.channelId);
    const message = await channel.messages.fetch(event.messageId);
    const embed = buildPollEmbed(event, summary);
    await message.edit({ embeds: [embed], components: message.components });
  } catch (err) {
    logPredictionError(`Failed to refresh poll embed for ${event.eventId}`, err);
  }
}

async function postCommunityResults(client, event, actualWinner) {
  const data = load();
  const fresh = getEvent(data, event.eventId);
  if (!fresh || fresh.communityResultsPosted) return;

  const final = fresh.final || buildFinalSnapshot(fresh);
  const channel = await client.channels.fetch(fresh.channelId);
  const message = buildCommunityResultsMessage(fresh, final, actualWinner);

  console.log(`🏆 Posting community results: ${fresh.eventName}`);

  await channel.send(message);

  fresh.communityResultsPosted = true;
  fresh.status = "completed";
  fresh.completedAt = new Date().toISOString();
  fresh.actualWinner = actualWinner ? actualWinner.name : null;
  fresh.resultsSource = actualWinner?.source || null;
  upsertEvent(data, fresh);

  console.log(`🏆 Posted community results: ${fresh.eventName}`);
}

module.exports = {
  openPoll,
  closePoll,
  recordVote,
  maybeUpdatePollMessage,
  postCommunityResults
};
