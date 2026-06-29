const { load, upsertEvent } = require("../store");
const { aggregateEvent } = require("../aggregator");
const { buildButtonRows, buildPollEmbed } = require("../discord-ui");

async function publishDiscordPoll(client, event) {
  const channel = await client.channels.fetch(event.channelId);
  const summary = aggregateEvent(event);
  const embed = buildPollEmbed(event, summary);
  const components = buildButtonRows(event, false);

  const message = await channel.send({
    embeds: [embed],
    components
  });

  event.messageId = message.id;
  upsertEvent(load(), event);

  const sportLabel = event.sport === "f1" ? "F1" : "MotoGP";
  console.log(`[CP] ${sportLabel} poll opened: ${event.eventName}`);

  return event;
}

module.exports = { publishDiscordPoll };
