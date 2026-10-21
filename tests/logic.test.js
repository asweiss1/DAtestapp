import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReports,
  closeOpenJob,
  editCutoffDate,
  eodCloseInstant,
  hoursBetween,
  legacyToRecords,
  mergeProgress,
  slugify,
  splitHours,
  toCsv,
  zonedTimeToUtc,
} from "../js/logic.js";

test("Phoenix end of day closes the same afternoon, or the next day if already past it", () => {
  const early = eodCloseInstant("2026-06-15T15:00:00.000Z", "America/Phoenix", "14:25");
  assert.equal(early.toISOString(), "2026-06-15T21:25:00.000Z");
  const atEod = eodCloseInstant("2026-06-15T21:25:00.000Z", "America/Phoenix", "14:25");
  assert.equal(atEod.toISOString(), "2026-06-16T21:25:00.000Z");
});

test("New York winter and summer convert to the right UTC hour", () => {
  assert.equal(
    zonedTimeToUtc(2026, 1, 15, 12, 0, 0, "America/New_York").toISOString(),
    "2026-01-15T17:00:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc(2026, 7, 15, 12, 0, 0, "America/New_York").toISOString(),
    "2026-07-15T16:00:00.000Z",
  );
});

test("lunch comes out of the hours", () => {
  assert.equal(hoursBetween("2026-06-15T15:00:00.000Z", "2026-06-15T17:00:00.000Z", 1800), 1.5);
});

test("split hours add back to the total", () => {
  const slices = splitHours(1, 3);
  assert.equal(slices.reduce((sum, n) => sum + n, 0), 1);
  assert.equal(slices.length, 3);
});

test("closing a pass splits hours and gives each crew member their own group", () => {
  const job = {
    id: "job1",
    vineyard_id: "v",
    user_id: "u1",
    logged_by: "u1",
    season_year: 2026,
    work_date: "2026-06-15",
    block_id: "b",
    task_id: null,
    pass_id: "p",
    entry_kind: "open",
    row_start: 1,
    started_at: "2026-06-15T15:00:00.000Z",
    pause_seconds: 0,
    source: "taps",
    notes: "",
  };
  let n = 0;
  const result = closeOpenJob({
    job,
    at: "2026-06-15T17:00:00.000Z",
    completion: "complete",
    rowEnd: 2,
    crewIds: ["u2"],
    passTaskIds: ["t1", "t2"],
    reason: "tap",
    uuid: () => `id-${n++}`,
  });
  const owner = result.labor.filter((row) => row.user_id === "u1");
  const total = owner.find((row) => row.entry_kind === "pass_total");
  const slices = owner.filter((row) => row.entry_kind === "pass_slice");
  assert.equal(Number(slices.reduce((sum, row) => sum + row.hours, 0).toFixed(3)), total.hours);
  assert.equal(total.pass_group_id, "job1");
  const crewGroup = result.labor.find((row) => row.user_id === "u2").pass_group_id;
  assert.notEqual(crewGroup, total.pass_group_id);
  assert.equal(result.progress.length, 4);
});

test("a finished row stays finished unless a lead allows the change", () => {
  const existing = [{
    vineyard_id: "v", season_year: 2026, block_id: "b", task_id: "t", row_number: 1, status: "complete", id: "old",
  }];
  const drafts = [{
    vineyard_id: "v", season_year: 2026, block_id: "b", task_id: "t", row_number: 1, status: "partial", id: "new",
  }];
  assert.equal(mergeProgress(existing, drafts).length, 0);
  assert.equal(mergeProgress(existing, drafts, { allowDowngrade: true })[0].status, "partial");
});

test("old phone records map onto the vineyard blocks and keep their year", () => {
  const out = legacyToRecords({
    year: 2025,
    blocks: [{ id: "oldb", name: "DA Tannat", variety: "Tannat", rows: 40 }],
    tasks: [{ id: "leaf-pulling", label: "Leaf pulling" }],
    done: { "2025:oldb:leaf-pulling:3": "2025-08-01" },
    sprays: [{ blockId: "oldb", date: "2025-06-02", chemical: "Sulfur", rows: { "1": true }, rec: "R-1" }],
    history: [{
      year: 2024,
      done: { "2024:oldb:leaf-pulling:1": true },
      sprays: [],
      herbicide: [],
      watering: [],
      weedLogs: [],
      samples: [],
    }],
  }, {
    vineyardId: "v",
    userId: "u",
    existing: {
      blocks: [{ id: "newb", name: "DA Tannat" }],
      tasks: [{ id: "newt", slug: "leaf-pulling", label: "Leaf pulling" }],
    },
  });
  assert.equal(out.blocks.length, 0);
  assert.ok(out.rowProgress.some((row) => row.block_id === "newb" && row.task_id === "newt" && row.status === "complete" && row.season_year === 2025));
  assert.ok(out.seasons.includes(2024));
  assert.equal(out.sprays[0].rec_number, "R-1");
});

test("reports include rec and photo, and hide cost unless asked", () => {
  const input = {
    year: 2026,
    blocks: [{ id: "b", name: "DA Tannat", variety: "Tannat", row_count: 2 }],
    tasks: [{ id: "t", label: "Leaf pulling", slug: "leaf-pulling" }],
    passes: [],
    rows: [],
    sprays: [{
      id: "s",
      season_year: 2026,
      block_id: "b",
      kind: "foliar",
      spray_date: "2026-06-01",
      chemical_name: "Sulfur",
      rate: "2 lb",
      volume: "",
      tank: "",
      notes: "",
      rec_number: "R-9",
      photo_path: "v/s/f",
      rows_done: { "1": true },
    }],
    watering: [],
    weeds: [],
    samples: [],
    labor: [],
    contractors: [],
    photoLinks: { s: "https://example.test/photo" },
    laborMode: "task",
    costRows: [],
  };
  const plain = buildReports({ ...input, includeCost: false });
  assert.match(plain.sprays.csv, /R-9/);
  assert.match(plain.sprays.csv, /https:\/\/example.test\/photo/);
  assert.match(plain.sprays.text, /Rec R-9/);
  assert.doesNotMatch(plain.labor.csv, /Labor cost/);
  assert.match(plain.labor.text, /Hours only/);
  const priced = buildReports({ ...input, includeCost: true });
  assert.match(priced.labor.csv, /Labor cost/);
});

test("edit window and slugs and spreadsheet formulas", () => {
  assert.equal(editCutoffDate("America/Phoenix", 3, new Date("2026-06-15T15:00:00.000Z")), "2026-06-12");
  assert.equal(slugify("Leaf pulling"), "leaf-pulling");
  const csv = toCsv([["=1+1", "ok"]]);
  assert.match(csv, /'=1\+1/);
  assert.ok(csv.charCodeAt(0) === 0xfeff);
});
