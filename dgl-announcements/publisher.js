const { EmbedBuilder } = require("discord.js");
const { loadDglConfig } = require("./config");

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

function buildSimpleEmbed({ title, description, fields = [], color = 0x5865f2 }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp(new Date());

  for (const field of fields) {
    if (!field?.name || !field?.value) continue;
    embed.addFields({
      name: String(field.name).slice(0, 256),
      value: String(field.value).slice(0, 1024),
      inline: !!field.inline
    });
  }

  return embed;
}

module.exports = {
  publishToDglChannel,
  buildSimpleEmbed
};
