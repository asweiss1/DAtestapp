import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ASK_VARIETY_FUNCTION, askVarietyRequest } from "../js/learn.js";
import { BUNDLED_NOTES, NOTE_FIELDS, noteForVariety, notesToShow } from "../js/notes.js";

test("seed varieties and the common varieties have a stored note", () => {
  assert.equal(BUNDLED_NOTES.length, 20);
  const flagged = BUNDLED_NOTES.filter((row) => row.needs_research).map((row) => row.variety).sort();
  assert.deepEqual(flagged, ["Greco", "Malvasia", "Teroldego"]);
  for (const row of BUNDLED_NOTES) {
    assert.ok(row.variety.length >= 1 && row.variety.length <= 80, row.id);
    assert.ok(row.sources.length <= 500, row.id);
    for (const [key] of NOTE_FIELDS) assert.ok(String(row[key]).length <= 800, `${row.id} ${key}`);
    if (!row.needs_research) {
      assert.match(row.harvest, /does not publish a target Brix/);
      assert.match(row.timing, /not an Arizona date/);
    }
  }
});

test("the seed file stores the same notes", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261021120400_seed.sql", import.meta.url), "utf8");
  for (const row of BUNDLED_NOTES) {
    assert.ok(sql.includes(row.variety), row.id);
    assert.ok(sql.includes(row.vigor), row.id);
    assert.ok(sql.includes(row.harvest), row.id);
  }
});

test("block spellings find the note, and a clone does not collapse into Syrah", () => {
  assert.match(noteForVariety(BUNDLED_NOTES, "Tannat").vigor, /Fairly vigorous/);
  assert.equal(noteForVariety(BUNDLED_NOTES, "Cabernet").variety, "Cabernet Sauvignon");
  assert.equal(noteForVariety(BUNDLED_NOTES, "Grenach").variety, "Grenache");
  assert.equal(noteForVariety(BUNDLED_NOTES, "Petit Sirah").variety, "Petite Sirah");
  assert.equal(noteForVariety(BUNDLED_NOTES, "Counois").variety, "Counoise");
  assert.equal(noteForVariety(BUNDLED_NOTES, "Grecco De Tuffo").needs_research, true);
  assert.equal(noteForVariety(BUNDLED_NOTES, "Toraldego").needs_research, true);
  assert.match(noteForVariety(BUNDLED_NOTES, "Syrah 525").vigor, /Kearney/);
  assert.match(noteForVariety(BUNDLED_NOTES, "Syrah 525").vigor, /not on the certified-clone list/);
  assert.match(noteForVariety(BUNDLED_NOTES, "Syrah 471").vigor, /very few symptoms of decline/);
  assert.doesNotMatch(noteForVariety(BUNDLED_NOTES, "Syrah").vigor, /Kearney/);
  assert.equal(noteForVariety(BUNDLED_NOTES, "Syrah 999").variety, "Syrah");
  assert.equal(noteForVariety(BUNDLED_NOTES, "Aglianico"), null);
  assert.equal(noteForVariety(BUNDLED_NOTES, "Nielluccio").variety, "Sangiovese");
});

test("a saved list replaces the bundle, so a missing variety stays blank", () => {
  assert.equal(notesToShow([]).length, 20);
  const stored = [{ id: "n1", variety: "Merlot", needs_research: false, vigor: "Stored only.", timing: "", clusters: "", pests: "", climate: "", arizona: "", harvest: "", canopy: "", sources: "" }];
  assert.equal(noteForVariety(stored, "Tannat"), null);
  assert.equal(noteForVariety(stored, "Merlot").vigor, "Stored only.");
});

test("ask a question only builds a request for a later server function", () => {
  const src = readFileSync(new URL("../js/learn.js", import.meta.url), "utf8");
  assert.equal(ASK_VARIETY_FUNCTION, "ask-variety");
  assert.doesNotMatch(src, /fetch\(|functions\.invoke|supabase/);
  assert.deepEqual(askVarietyRequest(" Syrah 525 ", " Why so much sour rot? "), {
    function: "ask-variety",
    body: { variety: "Syrah 525", question: "Why so much sour rot?" },
  });
});
