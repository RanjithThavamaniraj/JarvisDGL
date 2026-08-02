const {
  publishToDglChannel,
  buildSimpleEmbed,
  DGL_EMBED_COLOR,
  GIVEAWAY_FOOTER
} = require("../publisher");
const { extractPayload, pickFirst } = require("../payload");

async function handleGiveawayCompleted(discordClient, row) {
  const payload = extractPayload(row);

  const giveawayName = pickFirst(
    payload.title,
    payload.name,
    payload.giveaway_title,
    row.title
  );

  const winner = pickFirst(
    payload.winner,
    payload.winner_name,
    payload.winner_username,
    payload.winner_display_name
  );
  const prize = pickFirst(payload.prize);
  const reason = pickFirst(payload.reason);

  const fields = [];
  if (winner) fields.push({ name: "Winner", value: winner, inline: true });
  if (prize) fields.push({ name: "Prize", value: prize, inline: true });
  if (reason) fields.push({ name: "Reason", value: reason, inline: false });

  const congrats = winner
    ? `Congratulations to **${winner}**! 🎉`
    : "Congratulations to the winner! 🎉";

  const descriptionParts = [
    giveawayName ? `**${giveawayName}** is complete.` : "The giveaway is complete.",
    "",
    congrats
  ];

  const embed = buildSimpleEmbed({
    title: "🏆 Giveaway Complete",
    description: descriptionParts.join("\n"),
    fields,
    color: DGL_EMBED_COLOR,
    footer: GIVEAWAY_FOOTER
  });

  const message = await publishToDglChannel(discordClient, {
    content: "📢 **DGL Giveaway**",
    embeds: [embed]
  });

  console.log(
    `[DGL] Posted giveaway_completed for activity ${row.id} → message ${message.id}`
  );

  return message;
}

module.exports = { handleGiveawayCompleted };
