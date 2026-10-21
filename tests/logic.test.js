import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReports,
  closeOpenJob,
  crewMemberEntryId,
  mergeCrewEntry,
  mergeOfflineLabor,
  sharedCrewJobId,
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

test("closing a pass splits that person's hours across the tasks", () => {
  const job = {
    id: "11111111-1111-4111-8111-111111111111",
    vineyard_id: "v",
    user_id: "u1",
    logged_by: "u1",
    season_year: 2026,
    work_date: "2026-06-15",
    block_id: "b",
    task_id: null,
    pass_id: "p",
    crew_job_id: "11111111-1111-4111-8111-111111111111",
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
    passTaskIds: ["t1", "t2"],
    reason: "tap",
    uuid: () => `id-${n++}`,
  });
  const total = result.labor.find((row) => row.entry_kind === "pass_total");
  const slices = result.labor.filter((row) => row.entry_kind === "pass_slice");
  assert.equal(Number(slices.reduce((sum, row) => sum + row.hours, 0).toFixed(3)), total.hours);
  assert.equal(total.pass_group_id, job.id);
  assert.equal(total.hours, 2);
  assert.equal(result.progress.length, 4);
});

test("each person on a shared job keeps their own join-to-leave hours", () => {
  const holly = closeOpenJob({
    job: {
      id: "11111111-1111-4111-8111-111111111111",
      crew_job_id: "11111111-1111-4111-8111-111111111111",
      vineyard_id: "v",
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      logged_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      season_year: 2026,
      work_date: "2026-06-15",
      block_id: "b",
      task_id: "t",
      entry_kind: "open",
      row_start: 1,
      started_at: "2026-06-15T15:00:00.000Z",
      pause_seconds: 0,
      source: "taps",
      notes: "",
    },
    at: "2026-06-15T17:00:00.000Z",
    completion: "complete",
    rowEnd: 4,
    markProgress: true,
    reason: "tap",
    uuid: () => "progress-1",
  });
  const nickId = crewMemberEntryId("11111111-1111-4111-8111-111111111111", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2");
  const nick = closeOpenJob({
    job: {
      id: nickId,
      crew_job_id: "11111111-1111-4111-8111-111111111111",
      vineyard_id: "v",
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      logged_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      season_year: 2026,
      work_date: "2026-06-15",
      block_id: "b",
      task_id: "t",
      entry_kind: "open",
      row_start: 1,
      started_at: "2026-06-15T16:00:00.000Z",
      pause_seconds: 0,
      paused_at: null,
      source: "crew",
      notes: "",
    },
    at: "2026-06-15T17:00:00.000Z",
    reason: "leave",
    markProgress: false,
    uuid: () => "unused",
  });
  assert.equal(holly.hours, 2);
  assert.equal(nick.hours, 1);
  assert.equal(nick.progress.length, 0);
  assert.equal(holly.labor[0].user_id === nick.labor[0].user_id, false);
  assert.equal(crewMemberEntryId("11111111-1111-4111-8111-111111111111", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"), nickId);
});

test("the earlier leave wins when two phones sync the same person", () => {
  const job = "11111111-1111-4111-8111-111111111111";
  const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const closed = {
    id: crewMemberEntryId(job, user),
    crew_job_id: job,
    user_id: user,
    vineyard_id: "v",
    entry_kind: "task",
    started_at: "2026-06-15T16:00:00.000Z",
    ended_at: "2026-06-15T17:00:00.000Z",
    pause_seconds: 600,
    paused_at: null,
    row_status: "partial",
    row_end: 3,
    client_updated_at: "2026-06-15T17:00:00.000Z",
  };
  const stillOpen = {
    ...closed,
    entry_kind: "open",
    ended_at: null,
    pause_seconds: 0,
    row_status: null,
    row_end: null,
    client_updated_at: "2026-06-15T18:00:00.000Z",
  };
  const kept = mergeCrewEntry(closed, stillOpen);
  assert.equal(kept.ended_at, "2026-06-15T17:00:00.000Z");
  assert.equal(kept.started_at, "2026-06-15T16:00:00.000Z");
  assert.equal(kept.pause_seconds, 600);
  assert.equal(kept.row_status, "partial");
  const laterLeave = mergeCrewEntry(closed, {
    ...closed,
    ended_at: "2026-06-15T18:00:00.000Z",
    row_status: "complete",
    row_end: 8,
    client_updated_at: "2026-06-15T18:00:00.000Z",
  });
  assert.equal(laterLeave.ended_at, "2026-06-15T17:00:00.000Z");
  assert.equal(laterLeave.row_status, "complete");
  assert.equal(laterLeave.row_end, 8);
  assert.equal(laterLeave.hours, 0.833);
  const earlierJoin = mergeCrewEntry(stillOpen, {
    ...stillOpen,
    started_at: "2026-06-15T15:30:00.000Z",
    client_updated_at: "2026-06-15T15:30:00.000Z",
  });
  assert.equal(earlierJoin.started_at, "2026-06-15T15:30:00.000Z");
  assert.equal(earlierJoin.ended_at, null);
});

function clock(id, user, start, end, status, rowEnd, crew = id) {
  return {
    id,
    crew_job_id: crew,
    vineyard_id: "v",
    user_id: user,
    logged_by: user,
    season_year: 2026,
    work_date: "2026-06-15",
    block_id: "b",
    task_id: "t",
    entry_kind: end ? "task" : "open",
    row_start: 3,
    row_end: rowEnd,
    row_status: status,
    started_at: start,
    ended_at: end,
    pause_seconds: 0,
    source: "taps",
  };
}

test("offline phones merge into one job with one interval per person", () => {
  const hollyA = clock("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "holly", "2026-06-15T15:00:00.000Z", null, null, null);
  const nickB = clock("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "nick", "2026-06-15T16:00:00.000Z", null, null, null);
  const started = mergeOfflineLabor([nickB, hollyA]);
  assert.equal(started.length, 2);
  assert.equal(new Set(started.map((row) => row.crew_job_id)).size, 1);
  assert.equal(started.find((row) => row.user_id === "holly").started_at, "2026-06-15T15:00:00.000Z");
  assert.equal(started.find((row) => row.user_id === "nick").started_at, "2026-06-15T16:00:00.000Z");
  assert.equal(sharedCrewJobId(hollyA), sharedCrewJobId(nickB));

  const partial = clock("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "holly", "2026-06-15T15:00:00.000Z", "2026-06-15T17:00:00.000Z", "partial", 4, hollyA.crew_job_id);
  const complete = clock("cccccccc-cccc-4ccc-8ccc-ccccccccccc3", "holly", "2026-06-15T15:10:00.000Z", "2026-06-15T18:00:00.000Z", "complete", 6, "cccccccc-cccc-4ccc-8ccc-ccccccccccc3");
  const ended = mergeOfflineLabor([complete, partial]);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].ended_at, "2026-06-15T17:00:00.000Z");
  assert.equal(ended[0].row_status, "complete");
  assert.equal(ended[0].hours, 2);
  const completeFirst = clock("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "holly", "2026-06-15T15:00:00.000Z", "2026-06-15T17:00:00.000Z", "complete", 6, hollyA.crew_job_id);
  const partialLater = clock("cccccccc-cccc-4ccc-8ccc-ccccccccccc3", "holly", "2026-06-15T15:10:00.000Z", "2026-06-15T18:00:00.000Z", "partial", 4, "cccccccc-cccc-4ccc-8ccc-ccccccccccc3");
  const stillComplete = mergeOfflineLabor([partialLater, completeFirst]);
  assert.equal(stillComplete[0].ended_at, "2026-06-15T17:00:00.000Z");
  assert.equal(stillComplete[0].row_status, "complete");
  assert.equal(stillComplete[0].hours, 2);

  const nickLeave = clock("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "nick", "2026-06-15T16:00:00.000Z", "2026-06-15T17:00:00.000Z", null, null, hollyA.crew_job_id);
  const nickEndedLater = clock("dddddddd-dddd-4ddd-8ddd-ddddddddddd4", "nick", "2026-06-15T16:00:00.000Z", "2026-06-15T19:00:00.000Z", "complete", 6, hollyA.crew_job_id);
  const hollyDone = clock("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "holly", "2026-06-15T15:00:00.000Z", "2026-06-15T19:00:00.000Z", "complete", 6, hollyA.crew_job_id);
  const mixed = mergeOfflineLabor([hollyDone, nickLeave, nickEndedLater]);
  assert.equal(mixed.length, 2);
  assert.equal(mixed.find((row) => row.user_id === "nick").ended_at, "2026-06-15T17:00:00.000Z");
  assert.equal(mixed.find((row) => row.user_id === "nick").hours, 1);
  assert.equal(mixed.find((row) => row.user_id === "holly").ended_at, "2026-06-15T19:00:00.000Z");
  assert.equal(mixed.find((row) => row.user_id === "holly").hours, 4);
  assert.equal(mixed.find((row) => row.user_id === "nick").row_status, "complete");

  const phone1 = clock("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "holly", "2026-06-15T15:00:00.000Z", "2026-06-15T18:00:00.000Z", "partial", 4);
  const phone2 = clock("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5", "holly", "2026-06-15T15:30:00.000Z", "2026-06-15T17:00:00.000Z", "partial", 4);
  const oneClock = mergeOfflineLabor([phone1, phone2]);
  assert.equal(oneClock.length, 1);
  assert.equal(oneClock[0].started_at, "2026-06-15T15:00:00.000Z");
  assert.equal(oneClock[0].ended_at, "2026-06-15T17:00:00.000Z");
  assert.equal(oneClock[0].hours, 2);

  const morning = clock("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "holly", "2026-06-15T15:00:00.000Z", "2026-06-15T17:00:00.000Z", "complete", 3);
  const afternoon = { ...clock("ffffffff-ffff-4fff-8fff-fffffffffff6", "holly", "2026-06-15T20:00:00.000Z", "2026-06-15T21:00:00.000Z", "partial", 3), row_start: 3 };
  const separate = mergeOfflineLabor([morning, afternoon]);
  assert.equal(separate.length, 2);
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
