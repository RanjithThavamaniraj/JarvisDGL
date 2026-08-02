const { publishToDglChannel, buildSimpleEmbed } = require("../publisher");

/**
 * Expected community_activity row shape (flexible):
 * - id: uuid (required for idempotency)
 * - activity_type / type: tournament_published
 * - payload / metadata / data: object with tournament fields
 * - title / message: optional preformatted text from website
 *
 * Payload fields used when present:
 * - name / tournament_name / title
 * - game / game_name
 * - starts_at / start_time / registration_opens_at
 * - url / tournament_url / link
 */
function extractPayload(row) {
  const raw =
    row.payload ||
    row.metadata ||
    row.data ||
    row.details ||
    {};
  return typeof raw === "string" ? safeJsonParse(raw) : raw || {};
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

async function handleTournamentPublished(discordClient, row) {
  const payload = extractPayload(row);

  const tournamentName = pickFirst(
    payload.name,
    payload.tournament_name,
    payload.title,
    row.title,
    row.tournament_name,
    "a new tournament"
  );

  const game = pickFirst(payload.game, payload.game_name, row.game);
  const when = pickFirst(
    payload.starts_at,
    payload.start_time,
    payload.registration_opens_at,
    payload.scheduled_at
  );
  const url = pickFirst(
    payload.url,
    payload.tournament_url,
    payload.link,
    row.url
  );

  const fields = [];
  if (game) fields.push({ name: "Game", value: game, inline: true });
  if (when) fields.push({ name: "Starts", value: when, inline: true });
  if (url) fields.push({ name: "Details", value: url, inline: false });

  const embed = buildSimpleEmbed({
    title: "🏆 Tournament Published",
    description:
      pickFirst(row.message, row.body, payload.message) ||
      `**${tournamentName}** is now live on Daddy Gaming Lobby.\nRegistrations are open — don't miss out.`,
    fields,
    color: 0xf59e0b
  });

  const message = await publishToDglChannel(discordClient, {
    content: "📢 **DGL Update**",
    embeds: [embed]
  });

  console.log(
    `[DGL] Posted tournament_published for activity ${row.id} → message ${message.id}`
  );

  return message;
}

module.exports = { handleTournamentPublished };
