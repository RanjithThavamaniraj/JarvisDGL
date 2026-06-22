const { parseCustomId } = require("./discord-ui");
const { recordVote, maybeUpdatePollMessage } = require("./lifecycle");
const { startScheduler } = require("./scheduler");
const { isCommunityPredictionsEnabled } = require("./config");
const { logPredictionError } = require("./logger");

function setup(client) {
  if (!isCommunityPredictionsEnabled()) {
    return;
  }

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const parsed = parseCustomId(interaction.customId);
    if (!parsed) return;

    try {
      await interaction.deferReply({ ephemeral: true });

      const result = await recordVote(interaction, parsed.eventId, parsed.candidateId);
      if (result.error) {
        return interaction.editReply({ content: result.error });
      }

      await interaction.editReply({
        content: `✅ Your pick: **${result.candidate.label}** for **${result.event.eventName}**.\nYou can change your vote anytime before voting closes.`
      });

      maybeUpdatePollMessage(client, result.event, result.summary).catch(() => {});
    } catch (err) {
      logPredictionError("Vote handler failed", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "Something went wrong recording your vote. Please try again."
        }).catch(() => {});
      }
    }
  });

  startScheduler(client);
}

module.exports = { setup };
