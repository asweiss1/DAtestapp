import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BUNDLED_FACTS, factsToShow, pickFact } from "../js/facts.js";

test("every bundled fact has a source and fits the card", () => {
  assert.equal(BUNDLED_FACTS.length, 12);
  for (const row of BUNDLED_FACTS) {
    assert.ok(row.text.trim().length >= 12 && row.text.length <= 420, row.id);
    assert.ok(row.source.trim().length >= 8 && row.source.length <= 320, row.id);
  }
  assert.equal(BUNDLED_FACTS.filter((row) => row.source.includes("bpg.bcwgc.org")).length, 10);
  assert.equal(BUNDLED_FACTS.filter((row) => row.source.includes("390126.pdf")).length, 1);
  assert.equal(BUNDLED_FACTS.filter((row) => row.source.includes("35488.pdf")).length, 1);
});

test("the seed file stores the same facts", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261021120400_seed.sql", import.meta.url), "utf8");
  for (const row of BUNDLED_FACTS) assert.ok(sql.includes(row.text), row.id);
});

test("a visit stays on one fact, and the next visit can change it", () => {
  const first = pickFact(BUNDLED_FACTS, "1");
  assert.equal(pickFact(BUNDLED_FACTS, "1").text, first.text);
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) seen.add(pickFact(BUNDLED_FACTS, String(i)).text);
  assert.ok(seen.size >= 2);
});

test("an empty phone uses the bundle, and a saved list replaces it", () => {
  assert.equal(factsToShow(undefined).length, 12);
  assert.equal(factsToShow([]).length, 12);
  const gone = BUNDLED_FACTS.map((row) => ({ ...row, deleted_at: "x" }));
  assert.equal(pickFact(gone, "1"), null);
  const only = [{ id: "local", text: "A fact typed on this ranch.", source: "The ranch notebook." }];
  assert.equal(pickFact(only, "1").text, "A fact typed on this ranch.");
});
