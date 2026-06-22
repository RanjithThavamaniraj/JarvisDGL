const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const IST = "Asia/Kolkata";
const SCHEDULE_PATH = path.join(__dirname, "..", "schedule.json");
const CACHE_PATH = path.join(__dirname, "..", "motogp-cache.json");

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildEventId(sport, eventName, raceStart) {
  const year = dayjs(raceStart).year();
  return `${sport}_${year}_${slugify(eventName)}`;
}

function loadScheduleJson() {
  try {
    if (fs.existsSync(SCHEDULE_PATH)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"));
    }
  } catch (err) {
    console.error("[CommunityPredictions] schedule.json read error:", err);
  }
  return { sessions: [] };
}

function loadMotoGpCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    }
  } catch (err) {
    console.error("[CommunityPredictions] motogp-cache.json read error:", err);
  }
  return null;
}

function getF1RaceSession() {
  const data = loadScheduleJson();
  const race = data.sessions.find(
    (s) =>
      s.event.includes("Formula 1") &&
      (s.name.includes("Grand Prix") || s.name === "Formula 1 Grand Prix")
  );
  if (!race) return null;

  return {
    sport: "f1",
    eventName: race.event === "Formula 1" ? "Formula 1 Grand Prix" : race.event,
    sessionName: race.name,
    raceStart: race.start,
    eventId: buildEventId("f1", race.event, race.start)
  };
}

function getMotoGPRaceSession() {
  const cache = loadMotoGpCache();
  if (!cache || !Array.isArray(cache.sessions)) return null;

  const race = cache.sessions.find((s) => s.name === "MotoGP Race");
  if (!race) return null;

  const eventName = formatMotoGpEventName(race.event);

  return {
    sport: "motogp",
    eventName,
    sessionName: race.name,
    raceStart: race.start,
    eventId: buildEventId("motogp", race.event, race.start),
    sessionId: race.id,
    eventUuid: cache.eventUuid,
    categoryUuid: cache.categoryUuid
  };
}

function formatMotoGpEventName(name) {
  if (!name) return "MotoGP Grand Prix";
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, "of");
}

function getRaceSessionForSport(sport) {
  if (sport === "f1") return getF1RaceSession();
  if (sport === "motogp") return getMotoGPRaceSession();
  return null;
}

function getClosesAt(raceStart) {
  return dayjs(raceStart).subtract(30, "minute").toISOString();
}

function isRaceThisWeekend(raceStart) {
  const race = dayjs(raceStart).tz(IST);
  const now = dayjs().tz(IST);
  const fridayStart = now.day(5).startOf("day");
  const mondayEnd = fridayStart.add(3, "day");
  return !race.isBefore(fridayStart) && race.isBefore(mondayEnd);
}

function isMotoGpRaceResultsPosted() {
  const cache = loadMotoGpCache();
  if (!cache || !Array.isArray(cache.sessions)) return false;
  const race = cache.sessions.find((s) => s.type === "RAC");
  return !!(race && race.resultsPosted);
}

function getMotoGpRaceSessionFromCache() {
  const cache = loadMotoGpCache();
  if (!cache || !Array.isArray(cache.sessions)) return null;
  return cache.sessions.find((s) => s.type === "RAC") || null;
}

module.exports = {
  IST,
  buildEventId,
  getF1RaceSession,
  getMotoGPRaceSession,
  getRaceSessionForSport,
  getClosesAt,
  isRaceThisWeekend,
  isMotoGpRaceResultsPosted,
  getMotoGpRaceSessionFromCache,
  loadMotoGpCache,
  formatMotoGpEventName
};
