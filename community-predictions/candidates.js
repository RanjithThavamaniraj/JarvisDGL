const fs = require("fs");
const path = require("path");
const { loadMotoGpCache, formatMotoGpEventName } = require("./schedule");

const F1_CANDIDATES_PATH = path.join(__dirname, "..", "data", "f1-candidates.json");
const MOTOGP_CANDIDATES_PATH = path.join(__dirname, "..", "data", "motogp-candidates.json");
const MOTOGP_RIDERS_URL = "https://api.motogp.pulselive.com/motogp/v1/riders";
const MOTOGP_API_BASE = "https://api.motogp.pulselive.com/motogp/v1/results";

function loadF1Candidates() {
  const data = JSON.parse(fs.readFileSync(F1_CANDIDATES_PATH, "utf8"));
  return data.drivers.map((d) => ({
    id: d.id,
    label: d.label,
    displayName: d.displayName
  }));
}

function loadBundledMotoGpCandidates() {
  const data = JSON.parse(fs.readFileSync(MOTOGP_CANDIDATES_PATH, "utf8"));
  return data.riders.map((r) => ({
    id: r.id,
    label: r.label,
    displayName: r.displayName
  }));
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    if (!candidate.id || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    result.push(candidate);
  }
  return result;
}

function riderToCandidate(rider) {
  const fullName =
    rider.full_name ||
    rider.name?.full_name ||
    [rider.name, rider.surname].filter(Boolean).join(" ").trim();
  const parts = fullName.trim().split(/\s+/);
  const label = (parts.length > 0 ? parts[parts.length - 1] : fullName).trim();
  const id = normalizeName(fullName) || normalizeName(label);

  return {
    id,
    label,
    displayName: fullName,
    matchNames: [normalizeName(fullName), normalizeName(label)]
  };
}

function classificationToCandidates(classData) {
  if (!classData || !Array.isArray(classData.classification)) return [];
  const candidates = [];
  for (const entry of classData.classification) {
    if (!entry.rider) continue;
    const candidate = riderToCandidate(entry.rider);
    candidates.push({
      id: candidate.id,
      label: candidate.label,
      displayName: candidate.displayName
    });
  }
  return dedupeCandidates(candidates);
}

async function fetchRaceClassificationCandidates(raceSessionId) {
  const classRes = await fetch(
    `${MOTOGP_API_BASE}/session/${raceSessionId}/classification?test=false`
  );
  if (!classRes.ok) return [];

  const classData = await classRes.json();
  return classificationToCandidates(classData);
}

async function fetchEntryListCandidates(eventUuid, categoryUuid) {
  const entryRes = await fetch(
    `${MOTOGP_API_BASE}/entry-list?eventUuid=${eventUuid}&categoryUuid=${categoryUuid}`
  );
  if (!entryRes.ok) return [];

  const entries = await entryRes.json();
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const candidates = [];
  for (const entry of entries) {
    if (!entry.rider) continue;
    const candidate = riderToCandidate(entry.rider);
    candidates.push({
      id: candidate.id,
      label: candidate.label,
      displayName: candidate.displayName
    });
  }
  return dedupeCandidates(candidates);
}

async function fetchSeasonRiderCandidates() {
  const res = await fetch(MOTOGP_RIDERS_URL);
  if (!res.ok) return [];

  const riders = await res.json();
  if (!Array.isArray(riders) || riders.length === 0) return [];

  const candidates = [];
  for (const rider of riders) {
    if (rider.retired) continue;
    const category = rider.current_career_step?.category;
    if (!category || category.legacy_id !== 3) continue;

    const candidate = riderToCandidate(rider);
    candidates.push({
      id: candidate.id,
      label: candidate.label,
      displayName: candidate.displayName
    });
  }
  return dedupeCandidates(candidates);
}

async function fetchMotoGpCandidates() {
  const sources = [];

  try {
    const cache = loadMotoGpCache();
    if (cache?.eventUuid && cache?.categoryUuid) {
      const sessionsRes = await fetch(
        `${MOTOGP_API_BASE}/sessions?eventUuid=${cache.eventUuid}&categoryUuid=${cache.categoryUuid}`
      );
      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json();
        const raceSession = Array.isArray(sessions)
          ? sessions.find((s) => s.type === "RAC")
          : null;

        if (raceSession?.id) {
          const fromClassification = await fetchRaceClassificationCandidates(raceSession.id);
          if (fromClassification.length > 0) {
            console.log(`[CP] motogp: riders from race classification (${fromClassification.length})`);
            return fromClassification;
          }
        }

        const fromEntryList = await fetchEntryListCandidates(
          cache.eventUuid,
          cache.categoryUuid
        );
        if (fromEntryList.length > 0) {
          console.log(`[CP] motogp: riders from entry-list (${fromEntryList.length})`);
          return fromEntryList;
        }
      }
    }
  } catch (err) {
    sources.push(`event-api: ${err.message}`);
  }

  try {
    const fromSeason = await fetchSeasonRiderCandidates();
    if (fromSeason.length > 0) {
      console.log(`[CP] motogp: riders from season API (${fromSeason.length})`);
      return fromSeason;
    }
  } catch (err) {
    sources.push(`season-api: ${err.message}`);
  }

  const bundled = loadBundledMotoGpCandidates();
  console.log(
    `[CP] motogp: using bundled rider list fallback (${bundled.length})${
      sources.length ? `; live sources failed: ${sources.join("; ")}` : ""
    }`
  );
  return bundled;
}

async function getCandidatesForSport(sport) {
  if (sport === "f1") return loadF1Candidates();
  if (sport === "motogp") return await fetchMotoGpCandidates();
  throw new Error(`Unknown sport: ${sport}`);
}

function matchCandidateToWinner(candidates, winnerName) {
  const normalizedWinner = normalizeName(winnerName);
  if (!normalizedWinner) return null;

  for (const candidate of candidates) {
    if (normalizeName(candidate.id) === normalizedWinner) return candidate;
    if (normalizeName(candidate.label) === normalizedWinner) return candidate;
    if (normalizeName(candidate.displayName) === normalizedWinner) return candidate;
    if (normalizeName(candidate.displayName).includes(normalizedWinner)) return candidate;
    if (normalizedWinner.includes(normalizeName(candidate.label))) return candidate;
  }

  const winnerParts = String(winnerName).trim().split(/\s+/);
  const lastName = winnerParts[winnerParts.length - 1];
  return (
    candidates.find((c) => normalizeName(c.label) === normalizeName(lastName)) || null
  );
}

async function fetchMotoGpRaceWinner() {
  const cache = loadMotoGpCache();
  const race = cache?.sessions?.find((s) => s.type === "RAC");
  if (!race || !race.id) return null;

  const classRes = await fetch(
    `${MOTOGP_API_BASE}/session/${race.id}/classification`
  );
  if (!classRes.ok) return null;

  const classData = await classRes.json();
  const winner = classData?.classification?.[0];
  if (!winner?.rider) return null;

  return {
    name: winner.rider.full_name,
    source: "motogp",
    candidate: riderToCandidate(winner.rider)
  };
}

module.exports = {
  getCandidatesForSport,
  matchCandidateToWinner,
  fetchMotoGpRaceWinner,
  normalizeName,
  formatMotoGpEventName
};
