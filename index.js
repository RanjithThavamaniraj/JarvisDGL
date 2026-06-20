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

// Weekly MotoGP Weekend Schedule Announcement - Friday at 9:00 AM IST
cron.schedule(
  "0 9 * * 5",
  async () => {
    try {
      const { getSchedule, hasAnnounced, markAnnounced } = require("./motogp-provider");
      const sessions = await getSchedule();
      const motogpSessions = sessions.filter(s => !s.event.includes("Formula 1"));

      if (motogpSessions.length === 0) {
        console.log("📅 No MotoGP schedule available for weekly announcement.");
        return;
      }

      const firstSession = motogpSessions[0];
      const eventName = firstSession.event;

      if (hasAnnounced(eventName)) {
        console.log(`📅 MotoGP weekend schedule already announced for event: ${eventName}`);
        return;
      }

      const qualy = motogpSessions.find(s => s.name === "MotoGP Qualifying");
      const sprint = motogpSessions.find(s => s.name === "MotoGP Sprint");
      const race = motogpSessions.find(s => s.name === "MotoGP Race");

      if (!qualy || !race) {
        console.log("❌ Incomplete MotoGP sessions data for weekly announcement.");
        return;
      }

      const qualyStart = dayjs(qualy.start);
      const qualyTimeStr = qualyStart.format("HH:mm");
      
      const raceStart = dayjs(race.start);
      const raceTimeStr = raceStart.format("HH:mm");

      let msg = `🏍️ **MotoGP Weekend Schedule**\n\n`;
      msg += `📅 ${qualyStart.format("D MMMM YYYY")}\n`;
      msg += `🏁 Qualifying — ${qualyTimeStr} IST\n`;
      
      if (sprint) {
        const sprintStart = dayjs(sprint.start);
        const sprintTimeStr = sprintStart.format("HH:mm");
        if (qualyStart.isSame(sprintStart, 'day')) {
          msg += `⚡ Sprint Race — ${sprintTimeStr} IST\n`;
        }
      }
      msg += `\n`;

      if (sprint) {
        const sprintStart = dayjs(sprint.start);
        const sprintTimeStr = sprintStart.format("HH:mm");
        if (!qualyStart.isSame(sprintStart, 'day')) {
          msg += `📅 ${sprintStart.format("D MMMM YYYY")}\n`;
          msg += `⚡ Sprint Race — ${sprintTimeStr} IST\n\n`;
        }
      }

      msg += `📅 ${raceStart.format("D MMMM YYYY")}\n`;
      msg += `🏆 Grand Prix Race — ${raceTimeStr} IST\n\n`;
      msg += `Who are you backing this weekend? 🔥`;

      const channel = await client.channels.fetch(process.env.CHANNEL_ID);
      await channel.send(msg);

      markAnnounced(eventName);
      console.log(`✅ Weekly MotoGP schedule announcement sent for event: ${eventName}`);

    } catch (err) {
      console.error("Weekly MotoGP schedule announcement error:", err);
    }
  },
  {
    timezone: "Asia/Kolkata"
  }
);

// Race Reminder Scheduler
const { getSchedule, markReminded, checkAndPostResults } = require("./motogp-provider");

setInterval(async () => {
try {
  const sessions = await getSchedule();
  await checkAndPostResults(client);

  for (const session of sessions) {

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

      const showSupport = Math.random() < 0.3;
      const supportFooter = showSupport ? "\n\n☕ *Support Pit Wall: Type `!support` or `!gear` to help keep Jarvis running!*" : "";

      if (session.event.includes("Formula 1")) {

        await channel.send(

`🏎️ **Hey F1 Fans!**

🏁 **${session.event}**

⏰ **${session.name} starts in 15 minutes**

🕒 Session Start: ${start.format("HH:mm")} IST

Get ready for lights out and an exciting race! 🔥${supportFooter}`
);

      } else {

        await channel.send(

`🏍️ **Hey MotoGP Fans!**

🏁 **${session.event}**

⏰ **${session.name} starts in 15 minutes**

🕒 Session Start: ${start.format("HH:mm")} IST

Grab your snacks and enjoy the action! 🔥${supportFooter}`
);

      }

      markReminded(session);

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

  const command = message.content.trim().split(/\s+/)[0];

  if (command === "!support") {
    return message.reply(
`☕ **Support Pit Wall & Jarvis**

Running Jarvis and the Pit Wall platform requires servers and API costs. If you enjoy our race reminders, leaderboards, and AI news, consider supporting us!

💖 **Ko-fi:** https://ko-fi.com/pitwall *(Update with your link)*
💳 **Stripe:** *(Add Stripe link here)*

*Every contribution helps keep the platform ad-free and running smoothly. Thank you!* 🏁`
    );
  }

  if (command === "!gear") {
    return message.reply(
`🏎️ **Pit Wall Recommended Gear** 🏎️

Looking to upgrade your setup or get some merch? Check out our affiliate links. It costs you nothing extra, but helps support Pit Wall!

🎮 **Sim Racing:**
• Fanatec CSL DD: *(Add Link)*
• Logitech G PRO: *(Add Link)*

👕 **Merch & Subscriptions:**
• F1 TV Pro: *(Add Link)*
• Official F1 Store: *(Add Link)*

*Thanks for supporting the community!*`
    );
  }

  const adminCommands = ["!setpole", "!setwinner", "!winners", "!leaderboard", "!createpoll", "!announce"];
  if (adminCommands.includes(command)) {
    if (message.author.id !== "1427524651013242951") {
      return;
    }

    if (command === "!announce") {
      const match = message.content.match(/!announce(?:\r\n|\s)/);
      const announcement = match ? message.content.slice(match.index + match[0].length) : "";
      if (!announcement.trim()) {
        return message.reply("Please provide a message to announce.");
      }

      try {
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);
        await channel.send(announcement);
        return message.reply("Announcement sent.");
      } catch (err) {
        console.error("ANNOUNCE ERROR:", err);
        return message.reply("Error sending announcement.");
      }
    }

    if (command === "!createpoll") {
      try {
        const { createPoll } = require("./race-poll");
        await createPoll(client);
        return message.reply("✅ Race poll created successfully!");
      } catch (err) {
        console.error("CREATE POLL ERROR:", err);
        return message.reply("Error creating poll.");
      }
    }

    if (command === "!setpole") {
      const args = message.content.trim().split(/\s+/);
      const driver = args.slice(1).join(" ");
      if (!driver) {
        return message.reply("Please provide a driver name.");
      }

      const { setResult } = require("./results");
      const res = setResult(driver, "./f1-votes.json", "Pole");
      
      if (res.error) {
        return message.reply(res.error);
      }
      
      return message.reply(`✅ Pole set to **${driver}**!\nWinners: ${res.winners.length > 0 ? res.winners.join(", ") : "None"}`);
    }

    if (command === "!setwinner") {
      const args = message.content.trim().split(/\s+/);
      const driver = args.slice(1).join(" ");
      if (!driver) {
        return message.reply("Please provide a driver name.");
      }

      const { setResult } = require("./results");
      const res = setResult(driver, "./race-votes.json", "Race");
      
      if (res.error) {
        return message.reply(res.error);
      }
      
      return message.reply(`✅ Race Winner set to **${driver}**!\nWinners: ${res.winners.length > 0 ? res.winners.join(", ") : "None"}`);
    }

    if (command === "!winners") {
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

        const showSupport = Math.random() < 0.3;
        if (showSupport) {
          reply += `\n\n☕ *Support Pit Wall: Type \`!support\` or \`!gear\` to help keep Jarvis running!*`;
        }

        return message.reply(reply);
      } catch (err) {
        console.error("WINNERS ERROR:", err);
        return message.reply("Error processing race winners.");
      }
    }

    if (command === "!leaderboard") {
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
          reply += `${index + 1}. ${entry.user} - ${entry.points} pts\n`;
        });
        
        const showSupport = Math.random() < 0.3;
        if (showSupport) {
          reply += `\n☕ *Support Pit Wall: Type \`!support\` or \`!gear\` to help keep Jarvis running!*`;
        }

        return message.reply(reply.trim());
      } catch (err) {
        console.error(err);
        return message.reply("Error reading leaderboard.");
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
