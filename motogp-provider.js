const fs = require("fs");
const {
  CACHE_SCHEMA_VERSION,
  parseMotoGpApiDate,
  normalizeStoredStart,
  isMotoGpSessionPast,
  getMotoGpTodayDateString
} = require("./utils/motogp-time");

const SCHEDULE_PATH = "./schedule.json";
const CACHE_PATH = "./motogp-cache.json";

function loadManualSchedule() {
  try {
    if (fs.existsSync(SCHEDULE_PATH)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Error loading schedule.json:", err);
  }
  return { sessions: [] };
}

function saveManualSchedule(data) {
  try {
    fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving schedule.json:", err);
  }
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    }
  } catch (err) {
    // Ignore cache load errors
  }
  return null;
}

function saveCache(data) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving cache:", err);
  }
}

function normalizeCacheSessions(sessions, countryIso) {
  if (!Array.isArray(sessions)) return sessions;
  return sessions.map((session) => ({
    ...session,
    start: normalizeStoredStart(session.start, countryIso)
  }));
}

function isCacheFresh(cache) {
  if (!cache || !cache.timestamp) return false;
  if (cache.schemaVersion !== CACHE_SCHEMA_VERSION) return false;
  const cacheDuration = 24 * 60 * 60 * 1000;
  return Date.now() - cache.timestamp < cacheDuration;
}

async function fetchMotoGPSchedule() {
  const seasonsRes = await fetch("https://api.motogp.pulselive.com/motogp/v1/results/seasons");
  const seasons = await seasonsRes.json();
  const currentSeason = seasons.find(s => s.current) || seasons.sort((a, b) => b.year - a.year)[0];
  if (!currentSeason) {
    throw new Error("No current MotoGP season found");
  }

  const categoriesRes = await fetch(`https://api.motogp.pulselive.com/motogp/v1/results/categories?seasonUuid=${currentSeason.id}`);
  const categories = await categoriesRes.json();
  const motoGPCat = categories.find(c => c.name.toLowerCase().includes("motogp"));
  if (!motoGPCat) {
    throw new Error("MotoGP category not found");
  }

  const eventsRes = await fetch(`https://api.motogp.pulselive.com/motogp/v1/results/events?seasonUuid=${currentSeason.id}`);
  const events = await eventsRes.json();

  const nonTestEvents = events
    .filter(e => !e.test)
    .sort((a, b) => a.date_start.localeCompare(b.date_start));

  const todayStr = getMotoGpTodayDateString();
  const activeEvent = nonTestEvents.find(e => e.date_end >= todayStr);
  if (!activeEvent) {
    throw new Error("No active or upcoming MotoGP event found");
  }

  const sessionsRes = await fetch(`https://api.motogp.pulselive.com/motogp/v1/results/sessions?eventUuid=${activeEvent.id}&categoryUuid=${motoGPCat.id}`);
  const sessions = await sessionsRes.json();
  if (!Array.isArray(sessions)) {
    throw new Error("Invalid sessions response from MotoGP API");
  }

  const countryIso = activeEvent.country?.iso;
  const parsedSessions = [];
  const eventName = activeEvent.name;

  const qSessions = sessions
    .filter(s => s.type === "Q")
    .sort((a, b) => a.date.localeCompare(b.date));
  if (qSessions.length > 0) {
    parsedSessions.push({
      id: qSessions[0].id,
      type: "Q",
      name: "MotoGP Qualifying",
      event: eventName,
      start: parseMotoGpApiDate(qSessions[0].date, countryIso),
      reminded: false
    });
  }

  const sprintSession = sessions.find(s => s.type === "SPR");
  if (sprintSession) {
    parsedSessions.push({
      id: sprintSession.id,
      type: "SPR",
      name: "MotoGP Sprint",
      event: eventName,
      start: parseMotoGpApiDate(sprintSession.date, countryIso),
      reminded: false
    });
  }

  const raceSession = sessions.find(s => s.type === "RAC");
  if (raceSession) {
    parsedSessions.push({
      id: raceSession.id,
      type: "RAC",
      name: "MotoGP Race",
      event: eventName,
      start: parseMotoGpApiDate(raceSession.date, countryIso),
      reminded: false
    });
  }

  return {
    sessions: parsedSessions,
    eventUuid: activeEvent.id,
    categoryUuid: motoGPCat.id,
    countryIso
  };
}

function findMotoGpSessionMatch(sessions, session) {
  if (!sessions || !session) return null;
  if (session.id) {
    const byId = sessions.find((s) => s.id === session.id);
    if (byId) return byId;
  }
  return sessions.find((s) => s.event === session.event && s.name === session.name);
}

function mergeRemindedStates(newSessions, previousSessions) {
  if (!previousSessions || !Array.isArray(previousSessions)) return newSessions;
  return newSessions.map((newSession) => {
    const prev =
      (newSession.id && previousSessions.find((p) => p.id === newSession.id)) ||
      previousSessions.find((p) => p.event === newSession.event && p.name === newSession.name);
    if (prev) {
      return {
        ...newSession,
        reminded: prev.reminded || false,
        resultsPosted: prev.resultsPosted || false
      };
    }
    return newSession;
  });
}

async function getSchedule() {
  const manualData = loadManualSchedule();
  const f1Sessions = manualData.sessions.filter(s => s.event.includes("Formula 1"));

  let motoGPSessions = [];
  let cache = loadCache();

  if (isCacheFresh(cache)) {
    motoGPSessions = normalizeCacheSessions(cache.sessions, cache.countryIso);
  } else {
    try {
      console.log("🌐 Fetching current MotoGP schedule from API...");
      const { sessions: fetchedSessions, eventUuid, categoryUuid, countryIso } = await fetchMotoGPSchedule();
      let newSessions = fetchedSessions;

      if (cache && cache.sessions) {
        newSessions = mergeRemindedStates(newSessions, cache.sessions);
      }
      newSessions = mergeRemindedStates(newSessions, manualData.sessions);

      saveCache({
        schemaVersion: CACHE_SCHEMA_VERSION,
        timestamp: Date.now(),
        lastAnnouncedEvent: cache ? cache.lastAnnouncedEvent : undefined,
        eventUuid,
        categoryUuid,
        countryIso,
        sessions: newSessions
      });
      motoGPSessions = newSessions;
      console.log("✅ MotoGP schedule successfully updated from API");
    } catch (err) {
      console.error("❌ Failed to fetch MotoGP schedule from API:", err.message);
      if (cache && cache.sessions) {
        console.log("⚠️ Using expired MotoGP cache as fallback");
        motoGPSessions = normalizeCacheSessions(cache.sessions, cache.countryIso);
      } else {
        console.log("⚠️ Falling back to MotoGP schedule from schedule.json");
        motoGPSessions = manualData.sessions.filter(s => !s.event.includes("Formula 1"));
      }
    }
  }

  return [...f1Sessions, ...motoGPSessions];
}

function hasAnnounced(eventName) {
  const cache = loadCache();
  return !!(cache && cache.lastAnnouncedEvent === eventName);
}

function markAnnounced(eventName) {
  const cache = loadCache() || { timestamp: 0, sessions: [] };
  cache.lastAnnouncedEvent = eventName;
  saveCache(cache);
}

function markReminded(session) {
  if (session.event.includes("Formula 1")) {
    const manualData = loadManualSchedule();
    const target = manualData.sessions.find(s => s.event === session.event && s.name === session.name && s.start === session.start);
    if (target) {
      target.reminded = true;
      saveManualSchedule(manualData);
      console.log(`✅ F1 reminder marked in schedule.json for ${session.name}`);
    }
    return;
  }

  const cache = loadCache();
  if (cache && cache.sessions) {
    const target = findMotoGpSessionMatch(cache.sessions, session);
    if (target) {
      target.reminded = true;
      saveCache(cache);
      console.log(`✅ MotoGP reminder marked in cache for ${session.name}`);
      return;
    }
  }

  console.error(`❌ MotoGP reminder not persisted — session not found in cache: ${session.name}`);
}

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function formatEventName(name) {
  if (!name) return "";
  return name.toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bOf\b/g, 'of');
}

async function checkAndPostResults(client) {
  try {
    const cache = loadCache();
    if (!cache || !cache.sessions) return;

    const targetSessions = cache.sessions.filter(s =>
      (s.type === "SPR" || s.type === "RAC") &&
      !s.resultsPosted &&
      isMotoGpSessionPast(s.start)
    );

    if (targetSessions.length === 0) return;

    const eventUuid = cache.eventUuid;
    const categoryUuid = cache.categoryUuid;
    if (!eventUuid || !categoryUuid) return;

    const sessionsRes = await fetch(`https://api.motogp.pulselive.com/motogp/v1/results/sessions?eventUuid=${eventUuid}&categoryUuid=${categoryUuid}`);
    const apiSessions = await sessionsRes.json();
    if (!Array.isArray(apiSessions)) return;

    for (const targetSession of targetSessions) {
      const apiSession = apiSessions.find(s => s.id === targetSession.id);
      if (apiSession && apiSession.status === "FINISHED") {
        console.log(`🏁 MotoGP session ${targetSession.name} is FINISHED! Fetching results...`);

        const classRes = await fetch(`https://api.motogp.pulselive.com/motogp/v1/results/session/${targetSession.id}/classification`);
        const classData = await classRes.json();

        if (classData && Array.isArray(classData.classification) && classData.classification.length >= 3) {
          const top3 = classData.classification.slice(0, 3);

          const formatRider = (entry) => {
            const riderName = entry.rider.full_name;
            const teamName = entry.team?.name;
            return teamName ? `${riderName} (${teamName})` : riderName;
          };

          const r1 = formatRider(top3[0]);
          const r2 = formatRider(top3[1]);
          const r3 = formatRider(top3[2]);

          const rawEventName = apiSession.event?.name || targetSession.event;
          const formattedEventName = formatEventName(rawEventName);
          const countryIso = apiSession.event?.country?.iso;
          const flag = countryIso ? getFlagEmoji(countryIso) : "";
          const circuitName = apiSession.event?.circuit?.name || apiSession.circuit;

          const titleFlagPart = flag ? `${flag} ` : "";
          const circuitPart = circuitName ? `📍 ${circuitName}\n\n` : "";

          let msg = "";
          if (targetSession.type === "SPR") {
            msg = `⚡ ${titleFlagPart}${formattedEventName} Sprint Results\n\n${circuitPart}🥇 ${r1}\n🥈 ${r2}\n🥉 ${r3}\n\nWho impressed you most today? 🔥`;
          } else if (targetSession.type === "RAC") {
            msg = `🏆 ${titleFlagPart}${formattedEventName} Results\n\n${circuitPart}🥇 ${r1}\n🥈 ${r2}\n🥉 ${r3}\n\nSee you next race weekend! 🏍️`;
          }

          if (msg) {
            const channel = await client.channels.fetch(process.env.MOTOGP_CHANNEL_ID);
            await channel.send(msg);
            console.log(`✅ Posted results for ${targetSession.name}`);

            targetSession.resultsPosted = true;
            const cacheSession = cache.sessions.find(s => s.id === targetSession.id);
            if (cacheSession) {
              cacheSession.resultsPosted = true;
            }
            saveCache(cache);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in checkAndPostResults:", err);
  }
}

async function rebuildCache() {
  const cache = loadCache();
  const { sessions, eventUuid, categoryUuid, countryIso } = await fetchMotoGPSchedule();
  const newSessions = mergeRemindedStates(sessions, cache?.sessions || []);
  const payload = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    timestamp: Date.now(),
    lastAnnouncedEvent: cache?.lastAnnouncedEvent,
    eventUuid,
    categoryUuid,
    countryIso,
    sessions: newSessions
  };
  saveCache(payload);
  return payload;
}

module.exports = {
  getSchedule,
  markReminded,
  hasAnnounced,
  markAnnounced,
  checkAndPostResults,
  rebuildCache
};
