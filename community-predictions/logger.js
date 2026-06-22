function logPredictionError(message, err) {
  console.error(`❌ Prediction error: ${message}`);
  if (err) {
    console.error(err);
  }
}

module.exports = { logPredictionError };
