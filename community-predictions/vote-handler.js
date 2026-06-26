const { parseCustomId } = require("./discord-ui");
const { recordVote, maybeUpdatePollMessage } = require("./lifecycle");
const { logInteractionError } = require("../interactions/logger");

async function completeDeferredReply(interaction, content, handler) {
  try {
    await interaction.editReply({ content });
  } catch (err) {
    logInteractionError(handler, "editReply failed — deferred interaction may stay open", interaction, err);
    throw err;
  }
}

async function handleCommunityPredictionVote(client, interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) {
    return false;
  }

  const handler = "community-predictions/vote";

  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    logInteractionError(handler, "deferReply failed", interaction, err);
    throw err;
  }

  try {
    const result = await recordVote(interaction, parsed.eventId, parsed.candidateId);

    if (result.error) {
      await completeDeferredReply(interaction, result.error, handler);
      return true;
    }

    await completeDeferredReply(
      interaction,
      `✅ Your pick: **${result.candidate.label}** for **${result.event.eventName}**.\nYou can change your vote anytime before voting closes.`,
      handler
    );

    maybeUpdatePollMessage(client, result.event, result.summary).catch((err) => {
      logInteractionError(handler, "maybeUpdatePollMessage failed", interaction, err);
    });

    return true;
  } catch (err) {
    logInteractionError(handler, "vote handling failed", interaction, err);

    if (interaction.deferred || interaction.replied) {
      await completeDeferredReply(
        interaction,
        "Something went wrong recording your vote. Please try again.",
        handler
      );
      return true;
    }

    throw err;
  }
}

module.exports = { handleCommunityPredictionVote };
