const {
  publishToDglChannel,
  buildSimpleEmbed,
  DGL_EMBED_COLOR,
  GIVEAWAY_FOOTER
} = require("../publisher");
const { extractPayload, pickFirst, formatList } = require("../payload");

const GIVEAWAY_CREATED_CTA = [
  "Thank you for supporting DGL!",
  "",
  "Eligible players have already been entered automatically based on tournament participation.",
  "",
  "Good luck to everyone!"
].join("\n");

async function handleGiveawayCreated(discordClient, row) {
  const payload = extractPayload(row);

  const title = pickFirst(
    payload.title,
    payload.name,
    payload.giveaway_title,
    row.title,
    "Community Giveaway"
  );

  const reason = pickFirst(payload.reason);
  const prize = pickFirst(payload.prize);
  const entriesClose = pickFirst(
    payload.entries_close_at,
    payload.entries_close,
    payload.closes_at,
    payload.entry_closes_at
  );
  const winnerDraw = pickFirst(
    payload.winner_draw_at,
    payload.draw_at,
    payload.winner_draw_date,
    payload.draw_date
  );
  const eligible = formatList(
    payload.eligible_tournaments ??
      payload.tournaments ??
      payload.eligible_tournament_names
  );

  const fields = [];
  if (reason) fields.push({ name: "Reason", value: reason, inline: false });
  if (prize) fields.push({ name: "Prize", value: prize, inline: true });
  if (entriesClose) {
    fields.push({ name: "Entries Close", value: entriesClose, inline: true });
  }
  if (winnerDraw) {
    fields.push({ name: "Winner Draw", value: winnerDraw, inline: true });
  }
  if (eligible) {
    fields.push({ name: "Eligible Tournaments", value: eligible, inline: false });
  }

  const embed = buildSimpleEmbed({
    title: `🎁 ${title}`,
    description: GIVEAWAY_CREATED_CTA,
    fields,
    color: DGL_EMBED_COLOR,
    footer: GIVEAWAY_FOOTER
  });

  const message = await publishToDglChannel(discordClient, {
    content: "@everyone\n\n📢 **DGL Giveaway**",
    embeds: [embed]
  });

  console.log(
    `[DGL] Posted giveaway_created for activity ${row.id} → message ${message.id}`
  );

  return message;
}

module.exports = { handleGiveawayCreated };
