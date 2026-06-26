function interactionContext(interaction) {
  return {
    customId: interaction.customId,
    userId: interaction.user?.id,
    username: interaction.user?.username,
    deferred: interaction.deferred,
    replied: interaction.replied
  };
}

function logInteractionError(handler, message, interaction, err) {
  console.error(`❌ Interaction error [${handler}]: ${message}`);
  console.error("   context:", interactionContext(interaction));
  if (err) {
    console.error(err);
  }
}

module.exports = {
  interactionContext,
  logInteractionError
};
