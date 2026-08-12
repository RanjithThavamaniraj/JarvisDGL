/**
 * Offline verification for XP leveling (no Discord / no live Supabase writes).
 * Run: node xp-leveling/test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  calculateLevelFromXp,
  calculateXpRequiredForLevel,
  rollXpAmount
} = require("./levels");
const { BoundedCooldownMap } = require("./cooldown");
const {
  isIgnorableMessage,
  resetHandlerState,
  handleMessage,
  getInFlightCount
} = require("./handler");
const {
  loadXpConfig,
  resetXpConfigCache,
  logStartupStatus,
  isXpLevelingEnabled
} = require("./config");
const {
  awardXpAtomic,
  setPersistClientForTests,
  resetPersistClient
} = require("./persist");
const {
  announceLevelUp,
  resolveLevelUpChannel,
  resetAnnounceCache,
  getCachedLevelUpChannel
} = require("./announce");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function main() {
  console.log("\n1) XP / level calculation");
  test("Level 1 requires 0 XP", () => {
    assert.strictEqual(calculateXpRequiredForLevel(1), 0);
  });
  test("Level thresholds approximately match targets", () => {
    const targets = {
      2: 100,
      3: 280,
      4: 520,
      5: 800,
      6: 1120,
      7: 1500,
      8: 1920,
      9: 2400,
      10: 2950
    };
    for (const [level, target] of Object.entries(targets)) {
      const actual = calculateXpRequiredForLevel(Number(level));
      const tolerance = Math.max(80, target * 0.12);
      assert.ok(
        Math.abs(actual - target) <= tolerance,
        `L${level}: got ${actual}, target ${target}, tol ${tolerance}`
      );
    }
  });
  test("calculateLevelFromXp inverse of thresholds", () => {
    for (let level = 1; level <= 20; level += 1) {
      const need = calculateXpRequiredForLevel(level);
      assert.strictEqual(
        calculateLevelFromXp(need),
        level,
        `exact threshold L${level} xp=${need}`
      );
      if (level > 1) {
        assert.strictEqual(
          calculateLevelFromXp(need - 1),
          level - 1,
          `just below L${level}`
        );
      }
    }
  });
  test("rollXpAmount stays in 15–25 by default", () => {
    for (let i = 0; i < 200; i += 1) {
      const v = rollXpAmount(15, 25);
      assert.ok(v >= 15 && v <= 25, `got ${v}`);
      assert.strictEqual(v, Math.floor(v));
    }
  });

  console.log("\n2) Cooldown Map");
  test("60s-style cooldown blocks immediately after set", () => {
    const map = new BoundedCooldownMap(60_000, 100);
    assert.strictEqual(map.isOnCooldown("u1"), false);
    map.setCooldown("u1");
    assert.strictEqual(map.isOnCooldown("u1"), true);
  });
  await testAsync("cooldown expires after ttl", async () => {
    const map = new BoundedCooldownMap(30, 100);
    map.setCooldown("u1");
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(map.isOnCooldown("u1"), false);
  });
  test("cooldown Map is bounded and cannot grow indefinitely", () => {
    const map = new BoundedCooldownMap(60_000, 10);
    for (let i = 0; i < 50; i += 1) {
      map.setCooldown(`user-${i}`);
    }
    assert.ok(map.size() <= 10, `size ${map.size()} > 10`);
  });

  console.log("\n3) Message filters");
  test("ignores bots", () => {
    assert.strictEqual(
      isIgnorableMessage({
        author: { bot: true },
        content: "hello",
        system: false
      }),
      true
    );
  });
  test("ignores system messages", () => {
    assert.strictEqual(
      isIgnorableMessage({ author: { bot: false }, content: "x", system: true }),
      true
    );
  });
  test("ignores empty messages", () => {
    assert.strictEqual(
      isIgnorableMessage({
        author: { bot: false },
        content: "   ",
        system: false
      }),
      true
    );
  });
  test("ignores commands", () => {
    assert.strictEqual(
      isIgnorableMessage({
        author: { bot: false },
        content: "!leaderboard",
        system: false
      }),
      true
    );
  });
  test("allows normal chat", () => {
    assert.strictEqual(
      isIgnorableMessage({
        author: { bot: false, id: "1" },
        content: "great race",
        system: false
      }),
      false
    );
  });

  console.log("\n4) Feature flag / config");
  test("feature flag env parsing", () => {
    const prev = process.env.ENABLE_XP_LEVELING;
    process.env.ENABLE_XP_LEVELING = "false";
    resetXpConfigCache();
    assert.strictEqual(loadXpConfig().enabled, false);

    process.env.ENABLE_XP_LEVELING = "true";
    resetXpConfigCache();
    assert.strictEqual(loadXpConfig().enabled, true);
    assert.strictEqual(loadXpConfig().minXp, Number(process.env.XP_MIN) || 15);
    assert.strictEqual(
      loadXpConfig().cooldownMs,
      Number(process.env.XP_COOLDOWN_MS) || 60_000
    );

    if (prev === undefined) delete process.env.ENABLE_XP_LEVELING;
    else process.env.ENABLE_XP_LEVELING = prev;
    resetXpConfigCache();
  });
  test("missing supabase disables via logStartupStatus", () => {
    const prevEnable = process.env.ENABLE_XP_LEVELING;
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.ENABLE_XP_LEVELING = "true";
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    resetXpConfigCache();
    const cfg = logStartupStatus();
    assert.strictEqual(cfg.enabled, false);
    assert.strictEqual(isXpLevelingEnabled(), false);
    if (prevEnable === undefined) delete process.env.ENABLE_XP_LEVELING;
    else process.env.ENABLE_XP_LEVELING = prevEnable;
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    resetXpConfigCache();
  });

  console.log("\n5) Persistence + level-up detection (mocked)");
  await testAsync("atomic award maps RPC row and detects level-up", async () => {
    setPersistClientForTests({
      rpc: async () => ({
        data: [
          {
            discord_user_id: "u1",
            xp: 100,
            level: 2,
            messages_count: 5,
            previous_xp: 80,
            previous_level: 1
          }
        ],
        error: null
      })
    });
    const result = await awardXpAtomic("u1", 20);
    assert.strictEqual(result.newXp, 100);
    assert.strictEqual(result.previousXp, 80);
    assert.strictEqual(result.newLevel, 2);
    assert.strictEqual(result.previousLevel, 1);
    assert.ok(result.newLevel > result.previousLevel);
    resetPersistClient();
  });
  await testAsync("supabase failure returns null without throw", async () => {
    setPersistClientForTests({
      rpc: async () => ({ data: null, error: { message: "boom" } })
    });
    const result = await awardXpAtomic("u1", 20);
    assert.strictEqual(result, null);
    resetPersistClient();
  });
  test("multi-level jump collapses to final level", () => {
    const previousLevel = calculateLevelFromXp(0);
    const newLevel = calculateLevelFromXp(800);
    assert.strictEqual(previousLevel, 1);
    assert.ok(newLevel >= 5);
    assert.ok(newLevel - previousLevel > 1);
  });

  console.log("\n6) Level-up channel handling (no production sends)");
  await testAsync("missing channel id leaves cache empty", async () => {
    resetAnnounceCache();
    const fakeClient = {
      channels: { cache: new Map(), fetch: async () => null }
    };
    const ch = await resolveLevelUpChannel(fakeClient, "");
    assert.strictEqual(ch, null);
    assert.strictEqual(getCachedLevelUpChannel(), null);
  });
  await testAsync("invalid channel fetch fails soft", async () => {
    resetAnnounceCache();
    const fakeClient = {
      channels: {
        cache: new Map(),
        fetch: async () => {
          throw new Error("Unknown Channel");
        }
      }
    };
    const ch = await resolveLevelUpChannel(fakeClient, "123");
    assert.strictEqual(ch, null);
  });
  await testAsync("announce without cache does not throw", async () => {
    resetAnnounceCache();
    const ok = await announceLevelUp("<@99>", 5);
    assert.strictEqual(ok, false);
  });
  await testAsync("announce uses member mention and no everyone/here", async () => {
    resetAnnounceCache();
    let sent = null;
    const fakeChannel = {
      send: async (payload) => {
        sent = payload;
        return { id: "m1" };
      }
    };
    const fakeClient = {
      channels: {
        cache: { get: () => fakeChannel },
        fetch: async () => fakeChannel
      }
    };
    await resolveLevelUpChannel(fakeClient, "chan");
    await announceLevelUp("<@42>", 5);
    assert.ok(sent.content.includes("<@42>"));
    assert.ok(sent.content.includes("Level 5"));
    assert.ok(!sent.content.includes("@everyone"));
    assert.ok(!sent.content.includes("@here"));
    assert.deepStrictEqual(sent.allowedMentions.parse, []);
    assert.deepStrictEqual(sent.allowedMentions.users, ["42"]);
  });

  console.log("\n7) Handler isolation / schema separation");
  test("disabled flag skips without scheduling", () => {
    const prev = process.env.ENABLE_XP_LEVELING;
    process.env.ENABLE_XP_LEVELING = "false";
    resetXpConfigCache();
    resetHandlerState();
    handleMessage(
      {},
      {
        author: { bot: false, id: "u9" },
        content: "hello world",
        system: false
      }
    );
    assert.strictEqual(getInFlightCount(), 0);
    if (prev === undefined) delete process.env.ENABLE_XP_LEVELING;
    else process.env.ENABLE_XP_LEVELING = prev;
    resetXpConfigCache();
    resetHandlerState();
  });
  test("XP table is separate from prediction points schema", () => {
    const sql = fs.readFileSync(
      path.join(__dirname, "..", "schema-xp-leveling.sql"),
      "utf8"
    );
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS public.discord_member_levels"));
    assert.ok(sql.includes("award_discord_member_xp"));

    const tableStart = sql.indexOf(
      "CREATE TABLE IF NOT EXISTS public.discord_member_levels"
    );
    const tableBlock = sql.slice(tableStart, sql.indexOf(";", tableStart));
    assert.ok(!tableBlock.includes("total_points"));
    assert.ok(tableBlock.includes("discord_user_id"));
    assert.ok(tableBlock.includes("xp"));
    assert.ok(tableBlock.includes("level"));
    assert.ok(tableBlock.includes("messages_count"));

    const main = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
    assert.ok(main.includes("total_points"));
    assert.ok(!main.includes("discord_member_levels"));
  });
  test("XP totals persist via Supabase RPC (not process memory)", () => {
    const persistSrc = fs.readFileSync(path.join(__dirname, "persist.js"), "utf8");
    assert.ok(persistSrc.includes("award_discord_member_xp"));
  });

  console.log("\n8) Existing Jarvis touchpoints remain minimal");
  test("index.js keeps prediction commands and a single messageCreate listener", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
    assert.ok(src.includes('command === "!leaderboard"'));
    assert.ok(src.includes('command === "!setwinner"'));
    assert.ok(src.includes("xp-leveling"));
    const listeners = src.match(/client\.on\("messageCreate"/g) || [];
    assert.strictEqual(listeners.length, 1);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
