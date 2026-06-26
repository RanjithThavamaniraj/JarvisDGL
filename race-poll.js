const fs = require("fs");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { COMMUNITY_PICK_PREFIX, RACE_POLL_PREFIX } = require("./interactions/namespaces");
const { logInteractionError } = require("./interactions/logger");

const VOTES_FILE = "./race-votes.json";

/** Legacy Barcelona poll buttons (plain driver names, no namespace prefix). */
const LEGACY_RACE_POLL_DRIVER_IDS = new Set([
  "Piastri",
  "Norris",
  "Leclerc",
  "Hamilton",
  "Verstappen",
  "Hadjar",
  "Russell",
  "Antonelli"
]);

function isRacePollButton(customId) {
  if (!customId || customId.startsWith(COMMUNITY_PICK_PREFIX)) {
    return false;
  }

  if (customId.startsWith(RACE_POLL_PREFIX)) {
    return true;
  }

  if (customId.includes(":")) {
    return false;
  }

  return LEGACY_RACE_POLL_DRIVER_IDS.has(customId);
}

function resolveRacePollDriverId(customId) {
  if (customId.startsWith(RACE_POLL_PREFIX)) {
    return customId.slice(RACE_POLL_PREFIX.length);
  }
  return customId;
}

async function handleRacePollVote(interaction) {
  const handler = "race-poll/vote";

  const now = dayjs().tz("Asia/Kolkata");
  const isSundayPast630 =
    now.day() === 0 && (now.hour() > 18 || (now.hour() === 18 && now.minute() >= 30));
  const isMonday = now.day() === 1;

  if (isSundayPast630 || isMonday) {
    await interaction.reply({
      content: "🔒 Voting closed. Race has started.",
      ephemeral: true
    });
    return;
  }

  const driver = resolveRacePollDriverId(interaction.customId);

  let votes = {};

  try {
    votes = JSON.parse(fs.readFileSync(VOTES_FILE, "utf8"));
  } catch {}

  votes[interaction.user.id] = {
    user: interaction.user.username,
    driver
  };

  fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2));

  const { syncPrediction } = require("./supabase");
  syncPrediction(interaction.user.id, interaction.user.username, driver, "RACE_WIN");

  try {
    await interaction.reply({
      content: `✅ Vote recorded: **${driver}**`,
      ephemeral: true
    });
  } catch (err) {
    logInteractionError(handler, "reply failed", interaction, err);
    throw err;
  }
}

module.exports = {
  createPoll: async (client) => {
    const channel = await client.channels.fetch("1478334113097453598");

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("Piastri")
        .setLabel("Oscar Piastri")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("Norris")
        .setLabel("Lando Norris")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("Leclerc")
        .setLabel("Charles Leclerc")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("Hamilton")
        .setLabel("Lewis Hamilton")
        .setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("Verstappen")
        .setLabel("Max Verstappen")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("Hadjar")
        .setLabel("Isack Hadjar")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("Russell")
        .setLabel("George Russell")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("Antonelli")
        .setLabel("Kimi Antonelli")
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({
      content:
        `🏁 **BARCELONA GP RACE WINNER POLL** 🏁

Who wins Sunday's race? 🔥

⏰ Voting closes at Lights Out (6:30 PM IST)
🇪🇸 Circuit de Barcelona-Catalunya

Vote below 👇`,
      components: [row1, row2]
    });

    console.log("✅ Poll posted");
  },

  isRacePollButton,
  handleRacePollVote
};
