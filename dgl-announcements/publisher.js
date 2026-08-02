const { EmbedBuilder } = require("discord.js");
const { loadDglConfig } = require("./config");

/** Shared brand colour for all DGL announcement embeds. */
const DGL_EMBED_COLOR = 0xf59e0b;

const GIVEAWAY_FOOTER = "DGL Community Giveaway";

async function publishToDglChannel(discordClient, { content, embeds } = {}) {
  const { channelId } = loadDglConfig();
  if (!channelId) {
    throw new Error("DGL_ANNOUNCEMENTS_CHANNEL_ID is not configured");
  }

  const channel = await discordClient.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`DGL channel ${channelId} is missing or not text-based`);
  }

  const message = await channel.send({
    content: content || undefined,
    embeds: embeds && embeds.length > 0 ? embeds : undefined
  });

  return message;
}

function buildSimpleEmbed({
  title,
  description,
  fields = [],
  color = DGL_EMBED_COLOR,
  footer = null
} = {}) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp(new Date());

  if (description) {
    embed.setDescription(description);
  }

  for (const field of fields) {
    if (!field?.name || !field?.value) continue;
    embed.addFields({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024),
      inline: !!field.inline
    });
  }

  if (footer) {
    embed.setFooter({ text: String(footer).slice(0, 2048) });
  }

  return embed;
}

module.exports = {
  DGL_EMBED_COLOR,
  GIVEAWAY_FOOTER,
  publishToDglChannel,
  buildSimpleEmbed
};
