/** Activity types Jarvis recognizes in Phase J1. */
const ACTIVITY_TYPES = {
  TOURNAMENT_PUBLISHED: "tournament_published"
};

const SUPPORTED_ACTIVITY_TYPES = new Set([
  ACTIVITY_TYPES.TOURNAMENT_PUBLISHED,
  // Website may emit camelCase or UPPER variants — normalize before lookup
  "TOURNAMENT_PUBLISHED",
  "tournamentPublished"
]);

function normalizeActivityType(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  const lower = value.toLowerCase();
  if (
    lower === "tournament_published" ||
    lower === "tournamentpublished" ||
    lower === "tournament-published"
  ) {
    return ACTIVITY_TYPES.TOURNAMENT_PUBLISHED;
  }

  return lower;
}

function isSupportedActivityType(raw) {
  const normalized = normalizeActivityType(raw);
  return normalized === ACTIVITY_TYPES.TOURNAMENT_PUBLISHED;
}

module.exports = {
  ACTIVITY_TYPES,
  SUPPORTED_ACTIVITY_TYPES,
  normalizeActivityType,
  isSupportedActivityType
};
