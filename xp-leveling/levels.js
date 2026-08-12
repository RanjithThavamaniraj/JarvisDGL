/**
 * XP → level progression (isolated, tunable).
 *
 * Cumulative XP required to *be* at `level`:
 *   n = level - 1
 *   xp = 30*n² + 70*n
 *
 * Approximate targets:
 *   L1=0, L2=100, L3=260, L4=480, L5=760,
 *   L6=1100, L7=1500, L8=1960, L9=2480, L10=3060
 * (spec targets ≈ 0/100/280/520/800/1120/1500/1920/2400/2950)
 */

function calculateXpRequiredForLevel(level) {
  const lv = Math.floor(Number(level));
  if (!Number.isFinite(lv) || lv <= 1) {
    return 0;
  }
  const n = lv - 1;
  return 30 * n * n + 70 * n;
}

function calculateLevelFromXp(xp) {
  const x = Math.floor(Number(xp));
  if (!Number.isFinite(x) || x <= 0) {
    return 1;
  }
  // Inverse of 30n² + 70n = xp → n = (-70 + sqrt(4900 + 120*xp)) / 60
  const discriminant = 4900 + 120 * x;
  const n = Math.floor((-70 + Math.sqrt(discriminant)) / 60);
  return Math.max(1, n + 1);
}

function rollXpAmount(minXp, maxXp) {
  const min = Math.floor(Number(minXp));
  const max = Math.floor(Number(maxXp));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return 15;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  calculateXpRequiredForLevel,
  calculateLevelFromXp,
  rollXpAmount
};
