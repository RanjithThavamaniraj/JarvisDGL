/**
 * Shared read-only payload helpers for DGL announcement handlers.
 * Handlers must not query Supabase — payload from community_activity only.
 */

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function extractPayload(row) {
  const raw =
    row?.payload ||
    row?.metadata ||
    row?.data ||
    row?.details ||
    {};
  return typeof raw === "string" ? safeJsonParse(raw) : raw || {};
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join(", ");
      if (joined) return joined;
      continue;
    }
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function formatList(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length > 0 ? items.map((item) => `• ${item}`).join("\n") : null;
  }
  const text = String(value).trim();
  return text || null;
}

module.exports = {
  extractPayload,
  pickFirst,
  formatList
};
