const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const {
  buildEventId,
  isRaceThisWeekend,
  loadScheduleJson,
  IST
} = require("./schedule");

dayjs.extend(utc);

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

function isF1RaceSession(session) {
  return (
    session.event.includes("Formula 1") &&
    (session.name.includes("Grand Prix") || session.name === "Formula 1 Grand Prix")
  );
}

function toF1RaceSession(session) {
  return {
    sport: "f1",
    eventName: session.event === "Formula 1" ? "Formula 1 Grand Prix" : session.event,
    sessionName: session.name,
    raceStart: session.start,
    eventId: buildEventId("f1", session.event, session.start)
  };
}

function toF1RaceSessionFromJolpica(race) {
  const raceUtc = dayjs.utc(`${race.date}T${race.time || "00:00:00Z"}`);
  const eventName = race.raceName || "Formula 1 Grand Prix";
  const raceStart = raceUtc.toISOString();
  return {
    sport: "f1",
    eventName,
    sessionName: "Formula 1 Grand Prix",
    raceStart,
    eventId: buildEventId("f1", eventName, raceStart)
  };
}

function listF1RacesFromSchedule() {
  const data = loadScheduleJson();
  return data.sessions
    .filter(isF1RaceSession)
    .sort((a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf());
}

/**
 * Pick the best F1 race from schedule.json:
 * 1. Race occurring this weekend (Fri–Mon IST window)
 * 2. Next upcoming race by start time
 * 3. Most recent race in the file (fallback)
 */
function getF1RaceSessionFromSchedule() {
  const races = listF1RacesFromSchedule();
  if (races.length === 0) return null;

  const thisWeekend = races.find((race) => isRaceThisWeekend(race.start));
  if (thisWeekend) return toF1RaceSession(thisWeekend);

  const now = dayjs();
  const upcoming = races.find((race) => dayjs(race.start).isAfter(now));
  if (upcoming) return toF1RaceSession(upcoming);

  return toF1RaceSession(races[races.length - 1]);
}

async function fetchJolpicaSeasonRaces(year) {
  const res = await fetch(`${JOLPICA_BASE}/${year}.json?limit=30`);
  if (!res.ok) return [];

  const data = await res.json();
  return data?.MRData?.RaceTable?.Races || [];
}

/**
 * Resolve the current F1 race session. Uses schedule.json when it matches the
 * active weekend; otherwise falls back to the Jolpica/Ergast season calendar.
 */
async function getF1RaceSessionResolved() {
  const fromSchedule = getF1RaceSessionFromSchedule();
  if (fromSchedule && isRaceThisWeekend(fromSchedule.raceStart)) {
    return fromSchedule;
  }

  const year = dayjs().tz(IST).year();
  const races = await fetchJolpicaSeasonRaces(year);

  for (const race of races) {
    const session = toF1RaceSessionFromJolpica(race);
    if (isRaceThisWeekend(session.raceStart)) {
      return session;
    }
  }

  return fromSchedule;
}

module.exports = {
  getF1RaceSessionFromSchedule,
  getF1RaceSessionResolved,
  toF1RaceSessionFromJolpica
};
