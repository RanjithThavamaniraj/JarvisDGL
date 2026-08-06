const {
  publishToDglChannel,
  buildSimpleEmbed
} = require("../publisher");

/** Gold (#FFD700) — giveaway reminder brand colour. */
const GIVEAWAY_REMINDER_COLOR = 0xffd700;

const REMINDER_FOOTER = "Daddy Gaming Lobby";

const REMINDER_DESCRIPTION = [
  "Tomorrow we'll be celebrating **150+ members** in the Daddy Gaming Lobby Discord community!",
  "",
  "🎁 **Prize**",
  "₹1,000 Steam or PlayStation Gift Card",
  "",
  "All eligible members have already been entered into the draw.",
  "",
  "🍀 The winner will be selected randomly and announced tomorrow.",
  "",
  "Thank you for supporting Daddy Gaming Lobby.",
  "More tournaments, giveaways, and exciting events are coming soon! ❤️"
].join("\n");

/**
 * community_activity.activity_type = giveaway_reminder
 * Payload is optional metadata for the site feed; Discord copy is fixed.
 */
async function handleGiveawayReminder(discordClient, row) {
  const embed = buildSimpleEmbed({
    title: "🎉 DGL Giveaway Reminder!",
    description: REMINDER_DESCRIPTION,
    fields: [],
    color: GIVEAWAY_REMINDER_COLOR,
    footer: REMINDER_FOOTER
  });

  const message = await publishToDglChannel(discordClient, {
    content: "@everyone\n\n🎁 **DGL Giveaway Reminder**",
    embeds: [embed]
  });

  console.log(
    `[DGL] Posted giveaway_reminder for activity ${row.id} → message ${message.id}`
  );

  return message;
}

module.exports = { handleGiveawayReminder, GIVEAWAY_REMINDER_COLOR };
