const { COMMUNITY_PICK_PREFIX } = require("./namespaces");
const { isCommunityPredictionsEnabled } = require("../community-predictions/config");
const { handleCommunityPredictionVote } = require("../community-predictions/vote-handler");
const { isRacePollButton, handleRacePollVote } = require("../race-poll");
const { logInteractionError } = require("./logger");

let registered = false;

async function dispatchButtonInteraction(client, interaction) {
  const { customId } = interaction;

  if (customId.startsWith(COMMUNITY_PICK_PREFIX)) {
    if (!isCommunityPredictionsEnabled()) {
      await interaction.reply({
        content: "Community predictions are not available right now.",
        ephemeral: true
      });
      return;
    }

    await handleCommunityPredictionVote(client, interaction);
    return;
  }

  if (isRacePollButton(customId)) {
    await handleRacePollVote(interaction);
    return;
  }
}

async function dispatchInteraction(client, interaction) {
  if (interaction.isButton()) {
    await dispatchButtonInteraction(client, interaction);
    return;
  }

  if (interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.isAutocomplete()) {
    return;
  }
}

function setupInteractionRouter(client) {
  if (registered) {
    return;
  }
  registered = true;

  client.on("interactionCreate", async (interaction) => {
    try {
      await dispatchInteraction(client, interaction);
    } catch (err) {
      logInteractionError("router", "unhandled dispatch error", interaction, err);
    }
  });
}

module.exports = {
  setupInteractionRouter,
  dispatchInteraction
};
