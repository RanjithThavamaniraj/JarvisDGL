/**
 * Canonical activity_type values (snake_case).
 * Handler files use kebab-case names matching these types, e.g.
 *   giveaway_created      → handlers/giveaway-created.js
 *   registration_opened   → handlers/registration-opened.js (future)
 */
const ACTIVITY_TYPES = {
  TOURNAMENT_PUBLISHED: "tournament_published",
  GIVEAWAY_CREATED: "giveaway_created",
  GIVEAWAY_COMPLETED: "giveaway_completed"
  // Future (do not register until implemented):
  // REGISTRATION_OPENED: "registration_opened",
  // REGISTRATION_CLOSED: "registration_closed",
  // TOURNAMENT_STARTED: "tournament_started",
  // TOURNAMENT_COMPLETED: "tournament_completed",
  // TOURNAMENT_CANCELLED: "tournament_cancelled",
  // TOURNAMENT_FEATURED: "tournament_featured"
};

/**
 * Normalize website variants (camelCase, kebab-case, UPPER) to snake_case.
 */
function normalizeActivityType(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();
}

module.exports = {
  ACTIVITY_TYPES,
  normalizeActivityType
};
