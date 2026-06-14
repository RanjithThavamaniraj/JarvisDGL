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

const VOTES_FILE = "./f1-votes.json";

module.exports = async (client) => {

  const channel = await client.channels.fetch(
    "1478332456162824328"
  );

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
`🏁 **BARCELONA GP QUALIFYING POLL** 🏁

Who will take Pole Position this weekend? 🔥

⏰ Qualifying: Saturday, 7:30 PM IST
🇪🇸 Circuit de Barcelona-Catalunya

Vote below 👇`,
    components: [row1, row2]
  });

  console.log("✅ Poll posted");

  client.on("interactionCreate", async interaction => {

    if (!interaction.isButton()) return;

    const now = dayjs().tz("Asia/Kolkata");
    const isSaturdayPast730 = now.day() === 6 && (now.hour() > 19 || (now.hour() === 19 && now.minute() >= 30));
    const isSunday = now.day() === 0;

    if (isSaturdayPast730 || isSunday) {
      return interaction.reply({
        content: "🔒 Voting closed. Qualifying has started.",
        ephemeral: true
      });
    }

    const driver = interaction.customId;

    let votes = {};

    try {
      votes = JSON.parse(
        fs.readFileSync(VOTES_FILE, "utf8")
      );
    } catch {}

    votes[interaction.user.id] = {
      user: interaction.user.username,
      driver
    };

    fs.writeFileSync(
      VOTES_FILE,
      JSON.stringify(votes, null, 2)
    );

    await interaction.reply({
      content:
        `✅ Vote recorded: **${driver}**`,
      ephemeral: true
    });
  });

};
