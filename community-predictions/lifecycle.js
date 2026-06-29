const dayjs = require("dayjs");
const { load, upsertEvent, getEvent } = require("./store");
const { aggregateEvent, buildFinalSnapshot } = require("./aggregator");
const { createPrediction } = require("./create-prediction");
const { publishDiscordPoll } = require("./publishers/discord-publisher");
const { logPredictionError } = require("./logger");
const { isMotoGpClosureReached } = require("../utils/motogp-time");
const {
  buildButtonRows,
  buildPollEmbed,
  buildCommunityResultsMessage
} = require("./discord-ui");

const timezone = require("dayjs/plugin/timezone");
dayjs.extend(timezone);

async function openPoll(client, sport, { force = false, raceSession = null } = {}) {
  const result = await createPrediction(sport, { force, raceSession });
  if (!result) {
    return null;
  }

  if (!result.created) {
    return result.event;
  }

  return publishDiscordPoll(client, result.event);
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

  if (event.sport === "motogp") {
    if (isMotoGpClosureReached(event.closesAt)) {
      return { error: "🔒 Voting has closed for this race." };
    }
  } else if (dayjs().isAfter(dayjs(event.closesAt))) {
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
