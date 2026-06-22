const express = require("express");
const { load, findOpenEventForSport, findLatestEventForSport } = require("../community-predictions/store");
const { aggregateEvent } = require("../community-predictions/aggregator");
const { loadCommunityConfig } = require("../community-predictions/config");
const { logPredictionError } = require("../community-predictions/logger");

function buildApiPayload(event) {
  if (!event) {
    return null;
  }

  const summary =
    (event.status === "closed" || event.status === "completed") && event.final
      ? {
          ...aggregateEvent(event),
          totalVotes: event.final.totalVotes,
          currentLeader: event.final.leader,
          candidates: event.final.candidates
        }
      : aggregateEvent(event);

  return {
    sport: summary.sport,
    eventName: summary.eventName,
    eventId: summary.eventId,
    status: summary.status,
    totalVotes: summary.totalVotes,
    currentLeader: summary.currentLeader,
    candidates: summary.candidates.map((c) => ({
      candidateId: c.candidateId,
      label: c.label,
      votes: c.votes,
      percentage: c.percentage
    })),
    updatedAt: summary.updatedAt
  };
}

function emptyPayload(sport) {
  return {
    sport: sport || null,
    eventName: null,
    eventId: null,
    status: null,
    totalVotes: 0,
    currentLeader: null,
    candidates: [],
    updatedAt: new Date().toISOString()
  };
}

function start() {
  const app = express();
  const { apiPort } = loadCommunityConfig();

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=60");
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/community-picks", (req, res) => {
    try {
      const data = load();
      const sport = req.query.sport ? String(req.query.sport).toLowerCase() : null;

      if (sport) {
        const event =
          findOpenEventForSport(data, sport) ||
          findLatestEventForSport(data, sport);
        return res.json(buildApiPayload(event) || emptyPayload(sport));
      }

      const events = ["f1", "motogp"].map((s) => {
        const event =
          findOpenEventForSport(data, s) || findLatestEventForSport(data, s);
        return buildApiPayload(event) || emptyPayload(s);
      });

      return res.json({ events });
    } catch (err) {
      logPredictionError("/api/community-picks request failed", err);
      res.status(500).json({ error: "Failed to load community picks" });
    }
  });

  app.listen(apiPort, () => {
    console.log(`🌐 Community API listening on port ${apiPort}`);
  });
}

module.exports = { start };
