const fs = require("fs");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
dayjs.extend(isoWeek);

function setResult(driver, voteFile, eventPrefix) {
  let history = [];
  try {
    const rawData = fs.readFileSync("./results-history.json", "utf8");
    const parsedData = JSON.parse(rawData);
    if (Array.isArray(parsedData)) {
      history = parsedData;
    } else {
      history = [];
    }
  } catch (err) {
    history = [];
  }

  const eventId = eventPrefix + "_" + dayjs().year() + "_" + dayjs().isoWeek();

  if (history.includes(eventId)) {
    return { error: `Results already processed for ${eventPrefix}.` };
  }

  let votesData = "{}";
  try {
    votesData = fs.readFileSync(voteFile, "utf8");
  } catch {}

  const votes = JSON.parse(votesData);

  if (Object.keys(votes).length === 0) {
    return { error: `No ${eventPrefix.toLowerCase()} predictions found. Results not processed.` };
  }

  let leaderboard = {};
  try {
    leaderboard = JSON.parse(fs.readFileSync("./leaderboard.json", "utf8"));
  } catch {}

  const winners = [];

  for (const userId in votes) {
    const vote = votes[userId];

    if (vote.driver === driver) {
      winners.push(vote.user);

      if (!leaderboard[userId]) {
        leaderboard[userId] = {
          user: vote.user,
          points: 0
        };
      }

      leaderboard[userId].points += 10;
    }
  }

  fs.writeFileSync("./leaderboard.json", JSON.stringify(leaderboard, null, 2));

  history.push(eventId);
  fs.writeFileSync("./results-history.json", JSON.stringify(history, null, 2));

  // Additive Supabase Migration: Dual-write in background
  const { syncLeaderboard } = require("./supabase");
  syncLeaderboard(leaderboard);

  return { winners };
}

module.exports = { setResult };
