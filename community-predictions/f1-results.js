const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");

dayjs.extend(utc);

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const OPENF1_BASE = "https://api.openf1.org/v1";
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const RACE_MATCH_TOLERANCE_MIN = 180;

function isRaceStarted(raceStart) {
  return dayjs().isAfter(dayjs(raceStart));
}

function shouldPollF1Results(event) {
  if (!isRaceStarted(event.raceStart)) return false;

  if (!event.lastResultsPollAt) return true;

  return Date.now() - new Date(event.lastResultsPollAt).getTime() >= POLL_INTERVAL_MS;
}

function raceStartMatches(sessionStart, raceStart) {
  return (
    Math.abs(dayjs(sessionStart).diff(dayjs(raceStart), "minute")) <=
    RACE_MATCH_TOLERANCE_MIN
  );
}

async function resolveJolpicaRace(raceStart) {
  const year = dayjs(raceStart).year();
  const res = await fetch(`${JOLPICA_BASE}/${year}/races.json?limit=30`);
  if (!res.ok) return null;

  const data = await res.json();
  const races = data?.MRData?.RaceTable?.Races;
  if (!Array.isArray(races)) return null;

  for (const race of races) {
    const raceUtc = dayjs.utc(`${race.date}T${race.time || "00:00:00Z"}`);
    if (raceStartMatches(raceUtc.toISOString(), raceStart)) {
      return {
        season: race.season,
        round: race.round,
        raceName: race.raceName
      };
    }
  }

  return null;
}

function isFinishedStatus(status) {
  if (!status) return false;
  const value = String(status).toLowerCase();
  return value === "finished" || value.startsWith("+");
}

async function fetchJolpicaWinner(raceStart) {
  const resolved = await resolveJolpicaRace(raceStart);
  if (!resolved) return null;

  const res = await fetch(
    `${JOLPICA_BASE}/${resolved.season}/${resolved.round}/results.json`
  );
  if (!res.ok) return null;

  const data = await res.json();
  const race = data?.MRData?.RaceTable?.Races?.[0];
  const winner = race?.Results?.find((r) => String(r.position) === "1");
  if (!winner?.Driver || !isFinishedStatus(winner.status)) return null;

  const name = `${winner.Driver.givenName} ${winner.Driver.familyName}`;
  return {
    name,
    familyName: winner.Driver.familyName,
    source: "jolpica",
    season: resolved.season,
    round: resolved.round
  };
}

async function findOpenF1RaceSession(raceStart) {
  const year = dayjs(raceStart).year();
  const res = await fetch(`${OPENF1_BASE}/sessions?year=${year}&session_name=Race`);
  if (!res.ok) return null;

  const sessions = await res.json();
  if (!Array.isArray(sessions)) return null;

  return (
    sessions.find(
      (session) =>
        session.session_name === "Race" &&
        raceStartMatches(session.date_start, raceStart)
    ) || null
  );
}

async function fetchOpenF1Winner(raceStart) {
  const session = await findOpenF1RaceSession(raceStart);
  if (!session) return null;

  const resultRes = await fetch(
    `${OPENF1_BASE}/session_result?session_key=${session.session_key}&position=1`
  );
  if (!resultRes.ok) return null;

  const results = await resultRes.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  const top = results[0];
  if (!top || top.position !== 1) return null;

  const driverRes = await fetch(
    `${OPENF1_BASE}/drivers?session_key=${session.session_key}&driver_number=${top.driver_number}`
  );
  if (!driverRes.ok) return null;

  const drivers = await driverRes.json();
  const driver = Array.isArray(drivers) ? drivers[0] : null;
  if (!driver) return null;

  const name =
    driver.full_name ||
    driver.broadcast_name ||
    driver.name_acronym ||
    `Driver ${top.driver_number}`;

  return {
    name,
    familyName: name.split(/\s+/).pop(),
    source: "openf1",
    sessionKey: session.session_key
  };
}

async function fetchF1RaceWinnerForEvent(event) {
  const [jolpicaWinner, openF1Winner] = await Promise.all([
    fetchJolpicaWinner(event.raceStart),
    fetchOpenF1Winner(event.raceStart)
  ]);

  if (jolpicaWinner && openF1Winner) {
    return jolpicaWinner;
  }

  return jolpicaWinner || openF1Winner;
}

module.exports = {
  POLL_INTERVAL_MS,
  isRaceStarted,
  shouldPollF1Results,
  fetchF1RaceWinnerForEvent,
  fetchJolpicaWinner,
  fetchOpenF1Winner
};
