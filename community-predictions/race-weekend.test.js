/**
 * Offline verification for race-weekend poll eligibility (Fri–Mon IST).
 * Run: node community-predictions/race-weekend.test.js
 */

const assert = require("assert");
const {
  isRaceWeekendActiveAt,
  DISPLAY_TIMEZONE
} = require("../utils/motogp-time");
const { isRaceThisWeekend } = require("./schedule");

const IST = DISPLAY_TIMEZONE;

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

function at(isoDate, hour = 12) {
  return `${isoDate}T${String(hour).padStart(2, "0")}:00:00+05:30`;
}

function expectWeekendAt(raceStart, nowIso, expected, label) {
  assert.strictEqual(
    isRaceWeekendActiveAt(raceStart, nowIso, IST),
    expected,
    `${label}: isRaceWeekendActiveAt expected ${expected}`
  );
}

function main() {
  console.log("\nRace weekend eligibility (Fri–Mon IST)\n");

  const sundayRace = "2026-03-22T09:30:00.000Z"; // Sun 15:00 IST
  const saturdayRace = "2026-03-21T09:30:00.000Z"; // Sat 15:00 IST
  const fridayRace = "2026-03-20T09:30:00.000Z"; // Fri 15:00 IST

  console.log("A) Sunday race");
  test("previous Sunday → false", () => {
    expectWeekendAt(sundayRace, at("2026-03-15"), false, "prev Sun");
  });
  test("Monday–Thursday before race weekend → false", () => {
    expectWeekendAt(sundayRace, at("2026-03-16"), false, "Mon");
    expectWeekendAt(sundayRace, at("2026-03-17"), false, "Tue");
    expectWeekendAt(sundayRace, at("2026-03-18"), false, "Wed");
    expectWeekendAt(sundayRace, at("2026-03-19"), false, "Thu");
  });
  test("Friday → true", () => {
    expectWeekendAt(sundayRace, at("2026-03-20"), true, "Fri");
  });
  test("Saturday → true", () => {
    expectWeekendAt(sundayRace, at("2026-03-21"), true, "Sat");
  });
  test("Sunday race day → true", () => {
    expectWeekendAt(sundayRace, at("2026-03-22"), true, "Sun");
  });
  test("Monday → true", () => {
    expectWeekendAt(sundayRace, at("2026-03-23"), true, "Mon");
  });
  test("Tuesday → false", () => {
    expectWeekendAt(sundayRace, at("2026-03-24"), false, "Tue");
  });

  console.log("\nB) Saturday race");
  test("previous week → false", () => {
    expectWeekendAt(saturdayRace, at("2026-03-15"), false, "prev Sun");
    expectWeekendAt(saturdayRace, at("2026-03-19"), false, "Thu");
  });
  test("Friday → true", () => {
    expectWeekendAt(saturdayRace, at("2026-03-20"), true, "Fri");
  });
  test("Saturday → true", () => {
    expectWeekendAt(saturdayRace, at("2026-03-21"), true, "Sat");
  });
  test("Sunday → true", () => {
    expectWeekendAt(saturdayRace, at("2026-03-22"), true, "Sun");
  });
  test("Monday → true", () => {
    expectWeekendAt(saturdayRace, at("2026-03-23"), true, "Mon");
  });
  test("Tuesday → false", () => {
    expectWeekendAt(saturdayRace, at("2026-03-24"), false, "Tue");
  });

  console.log("\nC) Friday race");
  test("Thursday → false", () => {
    expectWeekendAt(fridayRace, at("2026-03-19"), false, "Thu");
  });
  test("Friday → true", () => {
    expectWeekendAt(fridayRace, at("2026-03-20"), true, "Fri");
  });
  test("Saturday → true", () => {
    expectWeekendAt(fridayRace, at("2026-03-21"), true, "Sat");
  });
  test("Sunday → true", () => {
    expectWeekendAt(fridayRace, at("2026-03-22"), true, "Sun");
  });
  test("Monday → true", () => {
    expectWeekendAt(fridayRace, at("2026-03-23"), true, "Mon");
  });
  test("Tuesday → false", () => {
    expectWeekendAt(fridayRace, at("2026-03-24"), false, "Tue");
  });

  console.log("\nD) Regression: old bug opened ~7 days early");
  test("Sunday one week before race is not eligible", () => {
    expectWeekendAt(sundayRace, at("2026-03-15"), false, "7 days early");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
