const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { getRedditClient, getRedditConfig, isRedditConfigured } = require("./client");
const { load, upsertEvent } = require("../../community-predictions/store");
const { IST } = require("../../community-predictions/schedule");

dayjs.extend(utc);
dayjs.extend(timezone);

const PIT_WALL_URL =
  process.env.PIT_WALL_URL?.trim() || "https://pit-wall-sable.vercel.app";
const RECOVERY_SCAN_LIMIT = 25;

function formatGpShortName(eventName) {
  if (!eventName) {
    return "MotoGP";
  }

  const grandPrixSuffix = / Grand Prix$/i;
  if (grandPrixSuffix.test(eventName)) {
    return eventName.replace(grandPrixSuffix, " GP");
  }

  const grandPrixOf = /^Grand Prix of (.+)$/i.exec(eventName);
  if (grandPrixOf) {
    const location = grandPrixOf[1].replace(/^the /i, "").trim();
    return `${location} GP`;
  }

  return eventName;
}

function buildThreadTitle(event) {
  return `🏁 ${formatGpShortName(event.eventName)} Community Predictions`;
}

function buildThreadBody(event) {
  const contenderLines = (event.candidates || []).map(
    (candidate) => `🏍 ${candidate.displayName || candidate.label}`
  );

  return [
    "Who do you think will win this weekend?",
    "",
    "Current contenders:",
    "",
    ...contenderLines,
    "",
    "Comment below with your prediction and tell everyone why.",
    "",
    "We'll compare the community predictions after the race.",
    "",
    "For live timings, standings and race weekend coverage:",
    "",
    PIT_WALL_URL
  ].join("\n");
}

function getFreshEvent(event) {
  const data = load();
  return data.events[event.eventId] || event;
}

function persistRedditPost(event, submission) {
  const data = load();
  const fresh = data.events[event.eventId] || event;

  fresh.redditPostId = submission.id;
  fresh.redditPostedAt = submission.created_utc
    ? new Date(submission.created_utc * 1000).toISOString()
    : new Date().toISOString();

  upsertEvent(data, fresh);
  return fresh;
}

function isRecoverableCommunityPrediction(submission, event, title) {
  if (!submission || submission.title !== title) {
    return false;
  }

  const created = dayjs.unix(submission.created_utc).tz(IST);
  const today = dayjs().tz(IST);

  if (created.isSame(today, "day")) {
    return true;
  }

  if (event.openedAt) {
    const opened = dayjs(event.openedAt).tz(IST);
    if (created.isSame(opened, "day")) {
      return true;
    }
  }

  const raceStart = dayjs(event.raceStart).tz(IST);
  const windowStart = raceStart.subtract(5, "day").startOf("day");
  const windowEnd = raceStart.add(3, "day").endOf("day");

  return !created.isBefore(windowStart) && !created.isAfter(windowEnd);
}

async function verifyStoredSubmission(reddit, postId) {
  try {
    const submission = await reddit.getSubmission(postId).fetch();
    return submission || null;
  } catch (err) {
    const status = err?.statusCode || err?.status;
    if (status === 404 || /not found/i.test(String(err?.message || ""))) {
      return null;
    }
    throw err;
  }
}

async function findRecoverableSubmission(reddit, event, title) {
  const config = getRedditConfig();
  const subreddit = await reddit.getSubreddit(config.subreddit);
  const submissions = await subreddit.getNew({ limit: RECOVERY_SCAN_LIMIT });

  return submissions.find((submission) =>
    isRecoverableCommunityPrediction(submission, event, title)
  );
}

async function publishRedditPrediction(event) {
  if (!event || event.sport !== "motogp") {
    return null;
  }

  if (!isRedditConfigured()) {
    console.log("[Reddit] Skipped (not configured).");
    return null;
  }

  event = getFreshEvent(event);
  const title = buildThreadTitle(event);

  try {
    console.log("[Reddit] Logging in...");
    const reddit = getRedditClient();

    if (event.redditPostId) {
      const existing = await verifyStoredSubmission(reddit, event.redditPostId);
      if (existing) {
        console.log("[Reddit] Existing thread verified.");
        return event;
      }
    }

    const recovered = await findRecoverableSubmission(reddit, event, title);
    if (recovered) {
      console.log("[Reddit] Existing thread recovered.");
      return persistRedditPost(event, recovered);
    }

    console.log("[Reddit] Creating prediction thread...");
    const config = getRedditConfig();
    const submission = await reddit
      .getSubreddit(config.subreddit)
      .submitSelfpost({
        title,
        text: buildThreadBody(event)
      });

    console.log("[Reddit] Posted successfully.");
    return persistRedditPost(event, submission);
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[Reddit] Publish failed: ${message}`);
    throw err;
  }
}

module.exports = {
  formatGpShortName,
  buildThreadTitle,
  buildThreadBody,
  publishRedditPrediction,
  isRecoverableCommunityPrediction,
  verifyStoredSubmission
};
