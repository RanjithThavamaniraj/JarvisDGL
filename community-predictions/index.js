const { startScheduler } = require("./scheduler");
const { isCommunityPredictionsEnabled } = require("./config");

function setup(client) {
  if (!isCommunityPredictionsEnabled()) {
    return;
  }

  startScheduler(client);
}

module.exports = { setup };
