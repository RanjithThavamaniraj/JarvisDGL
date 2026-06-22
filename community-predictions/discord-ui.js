const dayjs = require("dayjs");
const timezone = require("dayjs/plugin/timezone");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const { IST } = require("./schedule");

dayjs.extend(timezone);

const BUTTON_PREFIX = "cpick";
const MAX_PER_ROW = 5;
const MAX_ROWS = 5;

function buildCustomId(eventId, candidateId) {
  return `${BUTTON_PREFIX}:${eventId}:${candidateId}`;
}

function parseCustomId(customId) {
  if (!customId || !customId.startsWith(`${BUTTON_PREFIX}:`)) return null;
  const parts = customId.split(":");
  if (parts.length < 3) return null;
  return {
    eventId: parts[1],
    candidateId: parts.slice(2).join(":")
  };
}

function buildButtonRows(event, disabled = false) {
  const rows = [];
  const candidates = event.candidates || [];

  for (let i = 0; i < candidates.length && rows.length < MAX_ROWS; i += MAX_PER_ROW) {
    const chunk = candidates.slice(i, i + MAX_PER_ROW);
    const row = new ActionRowBuilder();
    for (const candidate of chunk) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(buildCustomId(event.eventId, candidate.id))
          .setLabel(candidate.label.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }

  return rows;
}

function formatCloseTime(closesAt) {
  return dayjs(closesAt).tz(IST).format("ddd D MMM, HH:mm") + " IST";
}

function formatRaceTime(raceStart) {
  return dayjs(raceStart).tz(IST).format("ddd D MMM, HH:mm") + " IST";
}

function buildPollEmbed(event, summary) {
  const sportLabel = event.sport === "f1" ? "F1" : "MotoGP";
  const emoji = event.sport === "f1" ? "🏎️" : "🏍️";
  const isClosed = event.status === "closed";
  const leader = summary.currentLeader;
  const leaderLine = leader
    ? `${leader.label} (${leader.percentage}%)`
    : "No votes yet";

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Community Picks — ${sportLabel} Race Winner`)
    .setDescription(
      `**${event.eventName}**\n\nWho wins the race? Tap a button to vote.\nYou can change your pick anytime before voting closes.`
    )
    .addFields(
      {
        name: "Race",
        value: formatRaceTime(event.raceStart),
        inline: true
      },
      {
        name: isClosed ? "Status" : "Closes",
        value: isClosed ? "🔒 Closed" : formatCloseTime(event.closesAt),
        inline: true
      },
      {
        name: "Leader",
        value: leaderLine,
        inline: true
      }
    )
    .setFooter({
      text: isClosed
        ? `Final · ${summary.totalVotes} vote${summary.totalVotes === 1 ? "" : "s"}`
        : `${summary.totalVotes} vote${summary.totalVotes === 1 ? "" : "s"} so far`
    })
    .setColor(isClosed ? 0x64748b : event.sport === "f1" ? 0xe10600 : 0xf59e0b);

  return embed;
}

function buildCommunityResultsMessage(event, final, actualWinner) {
  const leader = final.leader;
  const leaderName = leader ? leader.label : "No votes";
  const leaderPct = leader ? `${leader.percentage}%` : "0%";
  const totalVotes = final.totalVotes || 0;

  let correctLine = "";
  if (actualWinner && leader) {
    const { matchCandidateToWinner } = require("./candidates");
    const matchedWinner = matchCandidateToWinner(event.candidates, actualWinner.name);
    const matchedLeader = matchCandidateToWinner(event.candidates, leader.label);
    const isCorrect =
      matchedWinner &&
      matchedLeader &&
      matchedWinner.id === matchedLeader.id;

    correctLine = isCorrect
      ? "\n\n✅ The community called it right!"
      : "\n\n❌ The community missed this one.";
  }

  return (
    `🏆 **Community Results**\n\n` +
    `**${event.eventName}**\n\n` +
    `Winner: **${actualWinner ? actualWinner.name : "TBC"}**\n\n` +
    `Community Pick:\n**${leaderName}** ${leaderPct}\n\n` +
    `Total Votes: **${totalVotes}**` +
    correctLine
  );
}

module.exports = {
  BUTTON_PREFIX,
  buildCustomId,
  parseCustomId,
  buildButtonRows,
  buildPollEmbed,
  buildCommunityResultsMessage
};
