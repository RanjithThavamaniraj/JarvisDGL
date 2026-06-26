const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

/** Canonical display timezone for all user-facing MotoGP times. */
const DISPLAY_TIMEZONE = "Asia/Kolkata";
const DISPLAY_TIMEZONE_LABEL = "IST";

/**
 * PulseLive MotoGP API maps ISO country codes to IANA circuit timezones.
 * Used when interpreting API `date` wall-clock values.
 */
const COUNTRY_TIMEZONES = {
  QA: "Asia/Qatar",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  KZ: "Asia/Almaty",
  GB: "Europe/London",
  AT: "Europe/Vienna",
  SM: "Europe/Rome",
  IN: "Asia/Kolkata",
  ID: "Asia/Makassar",
  JP: "Asia/Tokyo",
  AU: "Australia/Melbourne",
  TH: "Asia/Bangkok",
  MY: "Asia/Kuala_Lumpur",
  US: "America/Chicago",
  AR: "America/Argentina/Buenos_Aires",
  CZ: "Europe/Prague",
  HU: "Europe/Budapest"
};

/** Bump when stored cache shape or timestamp normalization rules change. */
const CACHE_SCHEMA_VERSION = 2;

/**
 * MotoGP PulseLive API `date` field behaviour (verified against official schedules):
 *
 * - Format: ISO-8601 string, e.g. "2026-06-20T10:50:00+00:00"
 * - The clock portion (10:50) is circuit-local wall time, NOT UTC.
 * - The "+00:00" offset is misleading and must be ignored.
 * - Correct parse: strip the offset suffix, interpret the wall clock in the
 *   circuit timezone, then store/export as a canonical UTC instant (ISO Z).
 */
function circuitTimezoneForCountry(countryIso) {
  if (!countryIso) return "UTC";
  return COUNTRY_TIMEZONES[countryIso.toUpperCase()] || "UTC";
}

function parseMotoGpApiDate(rawDate, countryIso) {
  if (!rawDate) return rawDate;
  const circuitTz = circuitTimezoneForCountry(countryIso);
  const wallClock = String(rawDate).slice(0, 19);
  return dayjs.tz(wallClock, circuitTz).toISOString();
}

function toMotoGpDayjs(canonicalStart) {
  return dayjs(canonicalStart);
}

function formatMotoGpTime(canonicalStart, pattern = "HH:mm") {
  return toMotoGpDayjs(canonicalStart).tz(DISPLAY_TIMEZONE).format(pattern);
}

function formatMotoGpDate(canonicalStart, pattern = "D MMMM YYYY") {
  return toMotoGpDayjs(canonicalStart).tz(DISPLAY_TIMEZONE).format(pattern);
}

function getMotoGpDisplayTime(canonicalStart) {
  const time = formatMotoGpTime(canonicalStart);
  return {
    time,
    timezone: DISPLAY_TIMEZONE,
    label: DISPLAY_TIMEZONE_LABEL,
    formatted: `${time} ${DISPLAY_TIMEZONE_LABEL}`
  };
}

function formatMotoGpSessionLine(canonicalStart) {
  return getMotoGpDisplayTime(canonicalStart).formatted;
}

function formatMotoGpSessionDateTime(canonicalStart) {
  return `${formatMotoGpDate(canonicalStart)}, ${formatMotoGpSessionLine(canonicalStart)}`;
}

function formatMotoGpRaceEmbedTime(canonicalStart) {
  return (
    toMotoGpDayjs(canonicalStart).tz(DISPLAY_TIMEZONE).format("ddd D MMM, HH:mm") +
    ` ${DISPLAY_TIMEZONE_LABEL}`
  );
}

function getMotoGpMinutesUntilStart(canonicalStart) {
  return toMotoGpDayjs(canonicalStart).diff(dayjs(), "minute");
}

function isMotoGpSessionPast(canonicalStart) {
  return dayjs().isAfter(toMotoGpDayjs(canonicalStart));
}

function isMotoGpSameCalendarDay(canonicalStartA, canonicalStartB) {
  const a = toMotoGpDayjs(canonicalStartA).tz(DISPLAY_TIMEZONE);
  const b = toMotoGpDayjs(canonicalStartB).tz(DISPLAY_TIMEZONE);
  return a.isSame(b, "day");
}

function getMotoGpYear(canonicalStart) {
  return toMotoGpDayjs(canonicalStart).tz(DISPLAY_TIMEZONE).year();
}

function subtractMinutes(canonicalStart, minutes) {
  return toMotoGpDayjs(canonicalStart).subtract(minutes, "minute").toISOString();
}

function isMotoGpRaceThisWeekend(canonicalStart) {
  const race = toMotoGpDayjs(canonicalStart).tz(DISPLAY_TIMEZONE);
  const now = dayjs().tz(DISPLAY_TIMEZONE);
  const fridayStart = now.day(5).startOf("day");
  const mondayEnd = fridayStart.add(3, "day");
  return !race.isBefore(fridayStart) && race.isBefore(mondayEnd);
}

/** Calendar date (YYYY-MM-DD) in the display timezone — used for event window lookups. */
function getMotoGpTodayDateString() {
  return dayjs().tz(DISPLAY_TIMEZONE).format("YYYY-MM-DD");
}

function getMotoGpInstantValue(canonicalStart) {
  return toMotoGpDayjs(canonicalStart).valueOf();
}

function compareMotoGpCanonicalStarts(a, b) {
  return getMotoGpInstantValue(a) - getMotoGpInstantValue(b);
}

function isMotoGpClosureReached(canonicalClosesAt) {
  return isMotoGpSessionPast(canonicalClosesAt);
}

/**
 * Re-normalize a stored `start` value. Handles legacy cache entries that still
 * contain raw API strings with the misleading +00:00 offset.
 */
function normalizeStoredStart(storedStart, countryIso) {
  if (!storedStart) return storedStart;
  const reparsed = parseMotoGpApiDate(storedStart, countryIso);
  if (toMotoGpDayjs(storedStart).valueOf() === toMotoGpDayjs(reparsed).valueOf()) {
    return toMotoGpDayjs(storedStart).toISOString();
  }
  return reparsed;
}

function parseMotoGpSession(apiSession, countryIso) {
  return {
    id: apiSession.id,
    type: apiSession.type,
    start: parseMotoGpApiDate(apiSession.date, countryIso)
  };
}

module.exports = {
  DISPLAY_TIMEZONE,
  DISPLAY_TIMEZONE_LABEL,
  COUNTRY_TIMEZONES,
  CACHE_SCHEMA_VERSION,
  circuitTimezoneForCountry,
  parseMotoGpApiDate,
  parseMotoGpSession,
  normalizeStoredStart,
  toMotoGpDayjs,
  formatMotoGpTime,
  formatMotoGpDate,
  getMotoGpDisplayTime,
  formatMotoGpSessionLine,
  formatMotoGpSessionDateTime,
  formatMotoGpRaceEmbedTime,
  getMotoGpMinutesUntilStart,
  isMotoGpSessionPast,
  isMotoGpSameCalendarDay,
  getMotoGpYear,
  subtractMinutes,
  isMotoGpRaceThisWeekend,
  getMotoGpTodayDateString,
  getMotoGpInstantValue,
  compareMotoGpCanonicalStarts,
  isMotoGpClosureReached
};
