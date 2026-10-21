import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BUNDLED_QUOTES, pickQuote, quoteCounts, varietyKey } from "../js/quotes.js";

test("every bundled line has an author and a source", () => {
  assert.equal(BUNDLED_QUOTES.length, 19);
  for (const row of BUNDLED_QUOTES) {
    assert.ok(row.text.length >= 8, row.id);
    assert.ok(row.author.length >= 2, row.id);
    assert.ok(row.source.length >= 8, row.id);
  }
  assert.deepEqual(quoteCounts(), {
    "Any block": 4,
    "Cabernet Sauvignon": 3,
    Syrah: 2,
    Tempranillo: 2,
    Grenache: 1,
    "Petite Sirah": 1,
    Tannat: 1,
    Teroldego: 1,
    Greco: 1,
    Malvasia: 1,
    "Seyval Blanc": 1,
    Vermentino: 1,
  });
});

test("the seed file stores the same words", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261021120400_seed.sql", import.meta.url), "utf8");
  for (const row of BUNDLED_QUOTES) assert.ok(sql.includes(row.text), row.id);
});

test("block spellings match the variety, and a visit stays on one line", () => {
  assert.equal(varietyKey("Cabernet"), "cabernet sauvignon");
  assert.equal(varietyKey("Grenach"), "grenache");
  assert.equal(varietyKey("Grecco De Tuffo"), "greco");
  assert.equal(varietyKey("Counois"), "counoise");
  assert.equal(varietyKey("Toraldego"), "teroldego");
  assert.equal(varietyKey("Petit Sirah"), "petite sirah");
  assert.equal(varietyKey("Syrah 525"), "syrah");

  const tannat = pickQuote(BUNDLED_QUOTES, "Tannat", "1");
  assert.equal(tannat.author, "Hugh Johnson");
  assert.equal(pickQuote(BUNDLED_QUOTES, "Tannat", "2").text, tannat.text);

  const cab = pickQuote(BUNDLED_QUOTES, "Cabernet", "cab");
  assert.equal(varietyKey(cab.variety), "cabernet sauvignon");
  assert.match(cab.source, /Pocket Wine Book 2023|jancisrobinson\.com/);

  const seen = new Set();
  for (let i = 0; i < 30; i += 1) seen.add(pickQuote(BUNDLED_QUOTES, "Counois", String(i)).text);
  assert.ok(seen.size >= 2);
  for (const text of seen) {
    const row = BUNDLED_QUOTES.find((item) => item.text === text);
    assert.equal(row.variety, "");
  }

  const removed = BUNDLED_QUOTES.map((row) => row.variety === "Tannat" ? { ...row, deleted_at: "x" } : row);
  assert.equal(pickQuote(removed, "Tannat", "1").variety, "");
});
