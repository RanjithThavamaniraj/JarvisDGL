require("dotenv").config();

let cachedClient = null;

function getRedditConfig() {
  return {
    clientId: process.env.REDDIT_CLIENT_ID?.trim() || "",
    clientSecret: process.env.REDDIT_CLIENT_SECRET?.trim() || "",
    username: process.env.REDDIT_USERNAME?.trim() || "",
    password: process.env.REDDIT_PASSWORD?.trim() || "",
    userAgent: process.env.REDDIT_USER_AGENT?.trim() || "JarvisDGL/1.0",
    subreddit: process.env.REDDIT_SUBREDDIT?.trim() || "MotoGPTamil"
  };
}

function isRedditConfigured() {
  const config = getRedditConfig();
  return !!(
    config.clientId &&
    config.clientSecret &&
    config.username &&
    config.password &&
    config.userAgent &&
    config.subreddit
  );
}

function getRedditClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getRedditConfig();
  if (!isRedditConfigured()) {
    throw new Error("Reddit credentials are not fully configured");
  }

  const snoowrap = require("snoowrap");

  cachedClient = new snoowrap({
    userAgent: config.userAgent,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    username: config.username,
    password: config.password
  });

  return cachedClient;
}

module.exports = {
  getRedditConfig,
  isRedditConfigured,
  getRedditClient
};
