const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const {
  isMotoGpRaceThisWeekend,
  DISPLAY_TIMEZONE
} = require("./utils/motogp-time");

dayjs.extend(utc);
dayjs.extend(timezone);

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const CACHE_PATH = path.join(__dirname, "f1-reminder-cache.json");
const SEASON_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_SCHEMA_VERSION = 1;

const SESSION_FIELDS = [
  { key: "FirstPractice", name: "Practice 1" },
  { key: "SecondPractice", name: "Practice 2" },
  { key: "ThirdPractice", name: "Practice 3" },
  { key: "SprintQualifying", name: "Sprint Qualifying" },
  { key: "SprintShootout", name: "Sprint Qualifying" },
  { key: "Qualifying", name: "Qualifying" },
  { key: "Sprint", name: "Sprint" },
  { key: "Race", name: "Race" }
];

let seasonCache = { year: null, fetchedAt: 0, races: [] };

function currentYear() {
  return dayjs().tz(DISPLAY_TIMEZONE).year();
}

function parseJolpicaStart(date, time) {
  if (!date) return null;
  const t = time || "00:00:00Z";
  return dayjs.utc(`${date}T${t}`).toISOString();
}

async function fetchSeasonRaces(year) {
  if (
    seasonCache.year === year &&
    Date.now() - seasonCache.fetchedAt < SEASON_CACHE_TTL_MS
  ) {
    return seasonCache.races;
  }

  const res = await fetch(`${JOLPICA_BASE}/${year}.json?limit=30`);
  if (!res.ok) {
    throw new Error(`Jolpica season fetch failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  const races = data?.MRData?.RaceTable?.Races || [];
  seasonCache = { year, fetchedAt: Date.now(), races };
  return races;
}

function buildSessionsForRace(race) {
  const raceName = race.raceName || "Formula 1 Grand Prix";
  const raceKey = `${race.season}_${race.round}`;
  const sessions = [];
  const seen = new Set();

  for (const { key, name } of SESSION_FIELDS) {
    const s = race[key];
    if (!s || !s.date) continue;

    const start = parseJolpicaStart(s.date, s.time);
    if (!start) continue;

    const id = `${raceKey}_${name}`;
    if (seen.has(id)) continue;
    seen.add(id);

    sessions.push({
      id,
      name,
      event: raceName,
      raceKey,
      sport: "f1",
      start,
      reminded: false
    });
  }

  sessions.sort(
    (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf()
  );
  return sessions;
}

function pickActiveRace(races) {
  for (const race of races) {
    const raceStart = parseJolpicaStart(race.date, race.time);
    if (raceStart && isMotoGpRaceThisWeekend(raceStart)) {
      return race;
    }
  }
  return null;
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    }
  } catch (err) {
    console.error("[F1] Cache read error:", err.message);
  }
  return null;
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error("[F1] Cache write error:", err.message);
  }
}

function mergeReminded(fresh, prevSessions) {
  const prevById = new Map();
  for (const s of prevSessions) prevById.set(s.id, s);

  return fresh.map((s) => {
    const prev = prevById.get(s.id);
    return prev ? { ...s, reminded: prev.reminded === true } : s;
  });
}

async function getF1SessionsForReminders() {
  const year = currentYear();
  let races;

  try {
    races = await fetchSeasonRaces(year);
  } catch (err) {
    console.error("[F1] Season fetch failed:", err.message);
    const cached = loadCache();
    if (cached && Array.isArray(cached.sessions) && cached.sessions.length > 0) {
      console.log("[F1] Using cached F1 weekend (API unavailable)");
      console.log(`[F1] Current weekend detected: ${cached.raceName || "unknown"}`);
      return cached.sessions;
    }
    console.log("[F1] No active F1 weekend detected");
    return [];
  }

  const race = pickActiveRace(races);
  if (!race) {
    console.log("[F1] No active F1 weekend detected");
    return [];
  }

  const raceName = race.raceName || "Formula 1 Grand Prix";
  const raceKey = `${race.season}_${race.round}`;
  console.log(`[F1] Current weekend detected: ${raceName}`);

  const freshSessions = buildSessionsForRace(race);
  const prev = loadCache();

  let sessions;
  if (prev && prev.raceKey === raceKey && Array.isArray(prev.sessions)) {
    sessions = mergeReminded(freshSessions, prev.sessions);
    const remindedCount = sessions.filter((s) => s.reminded).length;
    console.log(
      `[F1] Carried forward reminder state (${remindedCount} reminded)`
    );
  } else {
    sessions = freshSessions;
    if (prev && prev.raceKey && prev.raceKey !== raceKey) {
      console.log(
        `[F1] Reset reminded flags (new weekend: previous=${prev.raceName})`
      );
    }
  }

  saveCache({
    schemaVersion: CACHE_SCHEMA_VERSION,
    raceKey,
    raceName,
    season: race.season,
    round: race.round,
    fetchedAt: Date.now(),
    sessions
  });

  return sessions;
}

function markF1Reminded(session) {
  const cache = loadCache();
  if (!cache || !Array.isArray(cache.sessions)) {
    console.warn(`[F1] Could not mark reminded (no cache): ${session.name}`);
    return;
  }

  const target = cache.sessions.find((s) => s.id === session.id);
  if (!target) {
    console.warn(
      `[F1] Could not mark reminded (session not in cache): ${session.name}`
    );
    return;
  }

  target.reminded = true;
  saveCache(cache);
  console.log(`[F1] Reminder marked in cache for ${target.name}`);
}

module.exports = {
  getF1SessionsForReminders,
  markF1Reminded
};