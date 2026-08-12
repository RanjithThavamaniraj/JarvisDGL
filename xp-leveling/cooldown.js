/**
 * Bounded per-user cooldown Map.
 * Insertion order is used as approximate LRU when pruning under pressure.
 */
class BoundedCooldownMap {
  constructor(ttlMs, maxEntries) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  isOnCooldown(userId) {
    const until = this.map.get(userId);
    if (until === undefined) {
      return false;
    }
    if (Date.now() >= until) {
      this.map.delete(userId);
      return false;
    }
    return true;
  }

  setCooldown(userId) {
    // Re-insert so this user becomes newest (Map insertion order).
    this.map.delete(userId);
    this.map.set(userId, Date.now() + this.ttlMs);
    this.prune();
  }

  size() {
    return this.map.size;
  }

  prune() {
    const now = Date.now();
    for (const [id, until] of this.map) {
      if (until <= now) {
        this.map.delete(id);
      }
    }

    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.map.delete(oldest);
    }
  }
}

module.exports = { BoundedCooldownMap };
