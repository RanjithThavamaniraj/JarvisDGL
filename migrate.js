require("dotenv").config();
const fs = require("fs");
const { syncPrediction, syncLeaderboard, isActive } = require("./supabase");

async function migrate() {
  console.log("🚀 Starting database migration to Supabase using dual-write logic...");

  if (!isActive) {
    console.error("❌ Supabase is not active. Check your .env file.");
    process.exit(1);
  }

  // 1. Read existing JSON files
  let leaderboard = {};
  let raceVotes = {};
  let poleVotes = {};

  try {
    if (fs.existsSync("./leaderboard.json")) {
      leaderboard = JSON.parse(fs.readFileSync("./leaderboard.json", "utf8"));
    }
    if (fs.existsSync("./race-votes.json")) {
      raceVotes = JSON.parse(fs.readFileSync("./race-votes.json", "utf8"));
    }
    if (fs.existsSync("./f1-votes.json")) {
      poleVotes = JSON.parse(fs.readFileSync("./f1-votes.json", "utf8"));
    }
  } catch (err) {
    console.error("❌ Error reading JSON files:", err);
    return;
  }

  // 2. Migrate Leaderboard (Users and Points)
  const leaderKeys = Object.keys(leaderboard);
  console.log(`🏆 Migrating ${leaderKeys.length} Leaderboard entries (Users & Points)...`);
  await syncLeaderboard(leaderboard);

  // 3. Migrate Predictions (Race Votes)
  const raceKeys = Object.keys(raceVotes);
  console.log(`🎯 Migrating ${raceKeys.length} RACE_WIN predictions...`);
  for (const discordId of raceKeys) {
    const data = raceVotes[discordId];
    await syncPrediction(discordId, data.user, data.driver, "RACE_WIN");
  }

  // 4. Migrate Predictions (Pole Votes)
  const poleKeys = Object.keys(poleVotes);
  console.log(`🎯 Migrating ${poleKeys.length} POLE predictions...`);
  for (const discordId of poleKeys) {
    const data = poleVotes[discordId];
    await syncPrediction(discordId, data.user, data.driver, "POLE");
  }

  console.log("🎉 Migration complete!");
  process.exit(0);
}

migrate();
