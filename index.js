require("dotenv").config();

const fs = require("fs");
const dayjs = require("dayjs");
const cron = require("node-cron");
const Parser = require("rss-parser");
const { Client, GatewayIntentBits } = require("discord.js");

const parser = new Parser();

const client = new Client({
intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent
]
});

client.once("clientReady", async () => {

  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("🏁 Race Weekend. Jarvis standing by.");
  console.log("🤖 AI News Module Active.");

  require("./race-poll").setupListener(client);

  let aiChannel;

try {
aiChannel = await client.channels.fetch(
process.env.AI_CHANNEL_ID
);

console.log("✅ AI channel connected");

} catch (err) {
console.error("AI channel error:", err);
}

// Daily AI News Check - 10:00 AM IST
cron.schedule(
"0 10 * * *",
async () => {
try {
const feed = await parser.parseURL(
"https://deepmind.google/blog/rss.xml"
);

    const latest = feed.items[0];

    const newsData = JSON.parse(
      fs.readFileSync("./ai-news.json", "utf8")
    );

    if (newsData.lastPosted === latest.link) {
      console.log("📰 No new AI article.");
      return;
    }

    if (!aiChannel) {
      console.log("❌ AI channel unavailable.");
      return;
    }

    await aiChannel.send(

`🤖 **AI Daily Update**

📰 **${latest.title}**

🔗 ${latest.link}

#AI #GoogleDeepMind`
);

    newsData.lastPosted = latest.link;

    fs.writeFileSync(
      "./ai-news.json",
      JSON.stringify(newsData, null, 2)
    );

    console.log("✅ AI news posted");

  } catch (err) {
    console.error("AI News Error:", err);
  }
},
{
  timezone: "Asia/Kolkata"
}

);

// Race Reminder Scheduler
setInterval(async () => {
try {
const data = JSON.parse(
fs.readFileSync("./schedule.json", "utf8")
);

  for (const session of data.sessions) {

    if (session.reminded) continue;

    const start = dayjs(session.start);
    const now = dayjs();

    const minutesUntilStart =
      start.diff(now, "minute");

    if (
      minutesUntilStart <= 15 &&
      minutesUntilStart >= 0
    ) {

      const channel = await client.channels.fetch(
        process.env.CHANNEL_ID
      );

      if (session.event.includes("Formula 1")) {

        await channel.send(

`🏎️ **Hey F1 Fans!**

🏁 **${session.event}**

⏰ **${session.name} starts in 15 minutes**

🕒 Session Start: ${start.format("HH:mm")} IST

Get ready for lights out and an exciting race! 🔥`
);

      } else {

        await channel.send(

`🏍️ **Hey MotoGP Fans!**

🏁 **${session.event}**

⏰ **${session.name} starts in 15 minutes**

🕒 Session Start: ${start.format("HH:mm")} IST

Grab your snacks and enjoy the action! 🔥`
);

      }

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

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  console.log("COMMAND:", message.content);
  console.log("AUTHOR:", message.author.id);

  if (message.content.startsWith("!setpole") || message.content.startsWith("!winners") || message.content === "!leaderboard" || message.content === "!createpoll") {
    if (message.author.id !== "1427524651013242951") {
      return;
    }

    if (message.content === "!createpoll") {
      try {
        const { createPoll } = require("./race-poll");
        await createPoll(client);
        return message.reply("✅ Race poll created successfully!");
      } catch (err) {
        console.error("CREATE POLL ERROR:", err);
        return message.reply("Error creating poll.");
      }
    }

    if (message.content.startsWith("!setpole")) {
      const args = message.content.trim().split(/\s+/);
      const driver = args.slice(1).join(" ");
      if (!driver) {
        return message.reply("Please provide a driver name.");
      }

      const { setPole } = require("./results");
      const res = setPole(driver);
      
      if (res.error) {
        return message.reply(res.error);
      }
      
      return message.reply(`✅ Pole set to **${driver}**!\nWinners: ${res.winners.length > 0 ? res.winners.join(", ") : "None"}`);
    }

    if (message.content.startsWith("!winners")) {
      try {
        const args = message.content.trim().split(/\s+/);
        const driver = args.slice(1).join(" ");
        if (!driver) {
          return message.reply("Please provide a driver name.");
        }

        let votes = {};
        if (fs.existsSync("./race-votes.json")) {
          votes = JSON.parse(fs.readFileSync("./race-votes.json", "utf8"));
        }

        const correctPredictors = [];
        for (const userId in votes) {
          if (votes[userId].driver.toLowerCase() === driver.toLowerCase()) {
            correctPredictors.push(votes[userId].user);
          }
        }

        let reply = `🏁 Barcelona GP Prediction Results 🏁\n\n`;
        reply += `🥇 Race Winner: ${driver}\n\n`;
        reply += `🎯 Correct Predictors:\n\n`;

        if (correctPredictors.length > 0) {
          correctPredictors.forEach(user => {
            reply += `• ${user}\n`;
          });
        } else {
          reply += `None\n`;
        }

        reply += `\n👏 Congratulations to everyone who predicted the winner correctly!`;

        return message.reply(reply);
      } catch (err) {
        console.error("WINNERS ERROR:", err);
        return message.reply("Error processing race winners.");
      }
    }

    if (message.content === "!leaderboard") {
      try {
        let leaderboard = {};
        if (fs.existsSync("./leaderboard.json")) {
          leaderboard = JSON.parse(fs.readFileSync("./leaderboard.json", "utf8"));
        }
        
        const sorted = Object.values(leaderboard).sort((a, b) => b.points - a.points);
        
        console.log("LEADERBOARD COUNT:", sorted.length);
        console.log(sorted);

        if (sorted.length === 0) {
          return message.reply("Leaderboard is empty.");
        }
        
        let reply = "🏆 Leaderboard 🏆\n\n";
        sorted.forEach((entry, index) => {
          reply += `${index + 1}. ${entry.user} - ${entry.points} pts\n\n`;
        });
        
        return message.reply(reply.trim());
      } catch (err) {
        console.error(err);
        return message.reply("Error reading leaderboard.");
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
