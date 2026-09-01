const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const {
  DISPLAY_TIMEZONE,
  getMotoGpYear,
  subtractMinutes,
  isMotoGpRaceThisWeekend,
  isRaceWeekendActiveAt,
  normalizeStoredStart
} = require("../utils/motogp-time");
const { getMotoGpCache } = require("../motogp-provider");

dayjs.extend(utc);
dayjs.extend(timezone);

const IST = DISPLAY_TIMEZONE;
const SCHEDULE_PATH = path.join(__dirname, "..", "schedule.json");

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function buildEventId(sport, eventName, raceStart) {
  const year =
    sport === "motogp" ? getMotoGpYear(raceStart) : dayjs(raceStart).year();
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

function getF1RaceSession() {
  return require("./f1-schedule").getF1RaceSessionFromSchedule();
}

async function getMotoGPRaceSession() {
  const cache = await getMotoGpCache();
  if (!cache || !Array.isArray(cache.sessions)) {
    console.log("[MotoGP] No race session available (cache empty)");
    return null;
  }

  const race = cache.sessions.find((s) => s.name === "MotoGP Race");
  if (!race) {
    console.log("[MotoGP] No race session available (no RAC session in cache)");
    return null;
  }

  const eventName = formatMotoGpEventName(race.event);
  const raceStart = normalizeStoredStart(race.start, cache.countryIso);

  console.log(`[MotoGP] Current event: ${eventName}`);
  console.log(`[MotoGP] Race date: ${raceStart}`);

  return {
    sport: "motogp",
    eventName,
    sessionName: race.name,
    raceStart,
    eventId: buildEventId("motogp", race.event, raceStart),
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

async function getRaceSessionForSport(sport) {
  if (sport === "f1") return getF1RaceSession();
  if (sport === "motogp") return await getMotoGPRaceSession();
  return null;
}

function getClosesAt(raceStart, sport) {
  if (sport === "motogp") {
    return subtractMinutes(raceStart, 30);
  }
  return dayjs(raceStart).subtract(30, "minute").toISOString();
}

function isRaceThisWeekend(raceStart, sport) {
  if (sport === "motogp") {
    return isMotoGpRaceThisWeekend(raceStart);
  }
  return isRaceWeekendActiveAt(raceStart, dayjs(), IST);
}

async function isMotoGpRaceResultsPosted() {
  const cache = await getMotoGpCache();
  if (!cache || !Array.isArray(cache.sessions)) return false;
  const race = cache.sessions.find((s) => s.type === "RAC");
  return !!(race && race.resultsPosted);
}

async function getMotoGpRaceSessionFromCache() {
  const cache = await getMotoGpCache();
  if (!cache || !Array.isArray(cache.sessions)) return null;
  return cache.sessions.find((s) => s.type === "RAC") || null;
}

module.exports = {
  IST,
  buildEventId,
  loadScheduleJson,
  getF1RaceSession,
  getMotoGPRaceSession,
  getRaceSessionForSport,
  getClosesAt,
  isRaceThisWeekend,
  isMotoGpRaceResultsPosted,
  getMotoGpRaceSessionFromCache,
  formatMotoGpEventName
};
