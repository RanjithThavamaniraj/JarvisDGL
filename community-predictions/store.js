const fs = require("fs");
const path = require("path");
const { compareMotoGpCanonicalStarts } = require("../utils/motogp-time");

const PREDICTIONS_PATH = path.join(__dirname, "..", "predictions.json");

function defaultData() {
  return { version: 1, events: {} };
}

function load() {
  try {
    if (fs.existsSync(PREDICTIONS_PATH)) {
      const data = JSON.parse(fs.readFileSync(PREDICTIONS_PATH, "utf8"));
      if (!data.events) data.events = {};
      return data;
    }
  } catch (err) {
    console.error("[CommunityPredictions] Failed to load predictions.json:", err);
  }
  return defaultData();
}

function save(data) {
  const tmp = `${PREDICTIONS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, PREDICTIONS_PATH);
}

function getEvent(data, eventId) {
  return data.events[eventId] || null;
}

function upsertEvent(data, event) {
  data.events[event.eventId] = event;
  save(data);
  return event;
}

function findOpenEventForSport(data, sport) {
  return Object.values(data.events).find(
    (e) => e.sport === sport && e.status === "open"
  );
}

function findLatestEventForSport(data, sport) {
  const events = Object.values(data.events).filter((e) => e.sport === sport);
  if (sport === "motogp") {
    events.sort((a, b) => compareMotoGpCanonicalStarts(b.raceStart, a.raceStart));
  } else {
    events.sort((a, b) => new Date(b.raceStart) - new Date(a.raceStart));
  }
  return events[0] || null;
}

module.exports = {
  PREDICTIONS_PATH,
  load,
  save,
  getEvent,
  upsertEvent,
  findOpenEventForSport,
  findLatestEventForSport
};
