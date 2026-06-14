require("dotenv").config();

const fs = require("fs");
const dayjs = require("dayjs");
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("🏁 Race Weekend. Jarvis standing by.");

  // AI channel test message
  try {
    const aiChannel = await client.channels.fetch(
      process.env.AI_CHANNEL_ID
    );

    await aiChannel.send(
      "🤖 AI News Module Online\n\nJarvis is now monitoring AI developments for Daddy Gaming Lobby. 🚀"
    );

    console.log("✅ AI test message sent");
  } catch (err) {
    console.error("AI channel error:", err);
  }

  setInterval(async () => {
    try {
      const data = JSON.parse(
        fs.readFileSync("./schedule.json", "utf8")
      );

      for (const session of data.sessions) {
        if (session.reminded) continue;

        const start = dayjs(session.start);
        const now = dayjs();

        const minutesUntilStart = start.diff(now, "minute");

        if (
          minutesUntilStart <= 15 &&
          minutesUntilStart >= 0
        ) {
          const channel = await client.channels.fetch(
            process.env.CHANNEL_ID
          );

          await channel.send(
`🏍️ **Hey MotoGP Fans!**

🇮🇹 **${session.event}**

⏰ **${session.name} starts in 15 minutes**

🕒 Session Start: ${start.format("HH:mm")} IST

Grab your snacks and enjoy the action! 🔥`
          );

          session.reminded = true;

          fs.writeFileSync(
            "./schedule.json",
            JSON.stringify(data, null, 2)
          );

          console.log(
            `✅ Reminder sent for ${session.name}`
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, 60000);
});

client.login(process.env.DISCORD_TOKEN);
