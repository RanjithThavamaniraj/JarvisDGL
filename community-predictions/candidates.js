const fs = require("fs");
const path = require("path");
const { loadMotoGpCache, formatMotoGpEventName } = require("./schedule");

const F1_CANDIDATES_PATH = path.join(__dirname, "..", "data", "f1-candidates.json");

function loadF1Candidates() {
  const data = JSON.parse(fs.readFileSync(F1_CANDIDATES_PATH, "utf8"));
  return data.drivers.map((d) => ({
    id: d.id,
    label: d.label,
    displayName: d.displayName
  }));
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function riderToCandidate(rider) {
  const fullName = rider.full_name || rider.name?.full_name || "";
  const parts = fullName.trim().split(/\s+/);
  const label = parts.length > 0 ? parts[parts.length - 1] : fullName;
  const id = normalizeName(label) || normalizeName(fullName);

  return {
    id,
    label,
    displayName: fullName,
    matchNames: [normalizeName(fullName), normalizeName(label)]
  };
}

async function fetchMotoGpCandidates() {
  const cache = loadMotoGpCache();
  if (!cache || !cache.eventUuid || !cache.categoryUuid) {
    throw new Error("MotoGP cache missing event metadata");
  }

  const sessionsRes = await fetch(
    `https://api.motogp.pulselive.com/motogp/v1/results/sessions?eventUuid=${cache.eventUuid}&categoryUuid=${cache.categoryUuid}`
  );
  const sessions = await sessionsRes.json();
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error("No MotoGP sessions found");
  }

  const raceSession = sessions.find((s) => s.type === "RAC");
  if (!raceSession) {
    throw new Error("MotoGP race session not found");
  }

  const classRes = await fetch(
    `https://api.motogp.pulselive.com/motogp/v1/results/session/${raceSession.id}/classification?test=false`
  );

  if (classRes.ok) {
    const classData = await classRes.json();
    if (classData && Array.isArray(classData.classification) && classData.classification.length > 0) {
      const seen = new Set();
      const candidates = [];
      for (const entry of classData.classification) {
        if (!entry.rider) continue;
        const candidate = riderToCandidate(entry.rider);
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        candidates.push({
          id: candidate.id,
          label: candidate.label,
          displayName: candidate.displayName
        });
      }
      if (candidates.length > 0) return candidates;
    }
  }

  const entryRes = await fetch(
    `https://api.motogp.pulselive.com/motogp/v1/results/entry-list?eventUuid=${cache.eventUuid}&categoryUuid=${cache.categoryUuid}`
  );

  if (entryRes.ok) {
    const entries = await entryRes.json();
    if (Array.isArray(entries) && entries.length > 0) {
      const seen = new Set();
      const candidates = [];
      for (const entry of entries) {
        if (!entry.rider) continue;
        const candidate = riderToCandidate(entry.rider);
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        candidates.push({
          id: candidate.id,
          label: candidate.label,
          displayName: candidate.displayName
        });
      }
      if (candidates.length > 0) return candidates;
    }
  }

  throw new Error("Could not load MotoGP rider list");
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
    `https://api.motogp.pulselive.com/motogp/v1/results/session/${race.id}/classification`
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
