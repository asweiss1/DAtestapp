// Pure vineyard rules: time, closing a job, legacy import, and exports.
// No network and no DOM, so the phone and the tests share one copy.

export function slugify(label) {
  const s = String(label || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s || "item";
}

export function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  let hour = Number(parts.hour);
  let day = Number(parts.day);
  let month = Number(parts.month);
  let year = Number(parts.year);
  if (hour === 24) {
    hour = 0;
    const next = addCalendarDays(year, month, day, 1);
    year = next.y;
    month = next.m;
    day = next.d;
  }
  return {
    year,
    month,
    day,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function addCalendarDays(year, month, day, n) {
  const dt = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + Number(n)));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function zonedTimeToUtc(year, month, day, hour, minute, second, timeZone) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second || 0);
    const diff = desired - asUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export function parseEod(eodTime) {
  const bits = String(eodTime || "14:25").split(":");
  return {
    h: Number(bits[0]) || 0,
    m: Number(bits[1]) || 0,
    s: Number(bits[2]) || 0,
  };
}

export function vineyardToday(timeZone, now = new Date()) {
  const p = zonedParts(now, timeZone);
  return isoDate(p.year, p.month, p.day);
}

export function seasonYear(timeZone, now = new Date()) {
  return zonedParts(now, timeZone).year;
}

export function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function eodCloseInstant(startedAt, timeZone, eodTime) {
  const start = new Date(startedAt);
  const parts = zonedParts(start, timeZone);
  const eod = parseEod(eodTime);
  let close = zonedTimeToUtc(parts.year, parts.month, parts.day, eod.h, eod.m, eod.s, timeZone);
  if (start.getTime() >= close.getTime()) {
    const next = addCalendarDays(parts.year, parts.month, parts.day, 1);
    close = zonedTimeToUtc(next.y, next.m, next.d, eod.h, eod.m, eod.s, timeZone);
  }
  return close;
}

export function editCutoffDate(timeZone, windowDays, now = new Date()) {
  const p = zonedParts(now, timeZone);
  const cut = addCalendarDays(p.year, p.month, p.day, -Number(windowDays || 0));
  return isoDate(cut.y, cut.m, cut.d);
}

export function hoursBetween(startIso, endIso, pauseSeconds = 0) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const hours = ms / 3600000 - Number(pauseSeconds || 0) / 3600;
  return round3(Math.max(0, hours));
}

export function round3(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

export function effectivePauseSeconds(job, at) {
  let pause = Number(job.pause_seconds || 0);
  if (job.paused_at) {
    const extra = (new Date(at).getTime() - new Date(job.paused_at).getTime()) / 1000;
    if (extra > 0) pause += extra;
  }
  return Math.round(pause);
}

export function elapsedSeconds(job, now = new Date()) {
  const end = job.paused_at ? new Date(job.paused_at) : new Date(now);
  const start = new Date(job.started_at);
  const pause = Number(job.pause_seconds || 0);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000) - pause);
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatHours(hours) {
  if (hours == null || hours === "") return "";
  const n = round3(hours);
  if (!Number.isFinite(n)) return "";
  const text = n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

export function splitHours(total, count) {
  const n = Number(count);
  const t = round3(total || 0);
  if (!n || n < 1) return [];
  const base = Math.floor((t / n) * 1000) / 1000;
  const slices = Array(n).fill(base);
  const used = round3(base * (n - 1));
  slices[n - 1] = round3(t - used);
  return slices;
}

export function jobsToAutoclose(jobs, now, timeZone, eodTime) {
  const out = [];
  const nowMs = new Date(now).getTime();
  for (const job of jobs || []) {
    if (job.deleted_at || job.ended_at || job.entry_kind !== "open") continue;
    const closeAt = eodCloseInstant(job.started_at, timeZone, eodTime);
    if (nowMs >= closeAt.getTime()) out.push({ job, at: closeAt.toISOString() });
  }
  return out;
}

export function closeOpenJob({
  job,
  at,
  completion = null,
  rowEnd = null,
  passTaskIds = [],
  reason = "tap",
  markProgress = true,
  uuid = () => crypto.randomUUID(),
}) {
  const pause = effectivePauseSeconds(job, at);
  const total = hoursBetween(job.started_at, at, pause);
  const closedAt = new Date(at).toISOString();
  const endRow = rowEnd == null || rowEnd === "" ? null : Number(rowEnd);
  const status = completion || null;
  const crewJobId = job.crew_job_id || job.id;
  const common = {
    vineyard_id: job.vineyard_id,
    user_id: job.user_id,
    logged_by: job.logged_by || job.user_id,
    season_year: job.season_year,
    work_date: job.work_date,
    block_id: job.block_id || null,
    area_id: job.area_id || null,
    pass_id: job.pass_id || null,
    crew_job_id: crewJobId,
    row_start: job.row_start == null ? null : Number(job.row_start),
    row_end: endRow,
    row_status: status,
    started_at: job.started_at,
    ended_at: closedAt,
    pause_seconds: pause,
    paused_at: null,
    close_reason: reason,
    source: job.source || "taps",
    notes: job.notes || "",
    deleted_at: null,
    client_updated_at: closedAt,
  };

  let labor;
  if (!job.pass_id) {
    labor = [{
      ...common,
      id: job.id,
      task_id: job.task_id,
      pass_group_id: null,
      entry_kind: "task",
      hours: total,
    }];
  } else {
    const ids = passTaskIds.slice();
    const slices = splitHours(total, ids.length || 1);
    const groupId = job.id;
    labor = [{
      ...common,
      id: job.id,
      task_id: null,
      pass_group_id: groupId,
      entry_kind: "pass_total",
      hours: total,
    }];
    ids.forEach((taskId, i) => {
      labor.push({
        ...common,
        id: uuid(),
        task_id: taskId,
        pass_group_id: groupId,
        entry_kind: "pass_slice",
        hours: slices[i] ?? 0,
      });
    });
  }

  const taskIds = job.pass_id ? passTaskIds.slice() : job.task_id ? [job.task_id] : [];
  const progress = [];
  if (markProgress && job.block_id && status && job.row_start != null && endRow != null) {
    const lo = Math.min(Number(job.row_start), endRow);
    const hi = Math.max(Number(job.row_start), endRow);
    for (const taskId of taskIds) {
      for (let n = lo; n <= hi; n++) {
        progress.push({
          id: uuid(),
          vineyard_id: job.vineyard_id,
          season_year: job.season_year,
          block_id: job.block_id,
          task_id: taskId,
          row_number: n,
          status,
          updated_by: job.user_id,
          client_updated_at: closedAt,
        });
      }
    }
  }
  return { labor, progress, hours: total };
}

function uuidBytes(id) {
  const hex = String(id || "").replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  const out = [];
  for (let i = 0; i < 16; i++) out.push(parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return out;
}

function bytesToUuid(bytes) {
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Same id on every phone for one person on one shared job.
export function crewMemberEntryId(crewJobId, userId) {
  const a = uuidBytes(crewJobId);
  const b = uuidBytes(userId);
  if (!a || !b) return null;
  const out = a.map((byte, i) => byte ^ b[i]);
  out[6] = (out[6] & 0x0f) | 0x50;
  out[8] = (out[8] & 0x3f) | 0x80;
  return bytesToUuid(out);
}

function earlierIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return String(a) <= String(b) ? a : b;
}

function laterIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return String(a) >= String(b) ? a : b;
}

// Two phones may both add, check off, or end the same person. Keep one interval:
// the earlier join and the earlier leave. A later leave does not add time.
export function mergeCrewEntry(current, incoming) {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current.entry_kind === "pass_slice" || incoming.entry_kind === "pass_slice") return incoming.id === current.id ? incoming : current;
  if (!current.crew_job_id && !incoming.crew_job_id) return incoming;
  const started = earlierIso(current.started_at, incoming.started_at);
  const ended = earlierIso(current.ended_at, incoming.ended_at);
  const pause = Math.max(Number(current.pause_seconds) || 0, Number(incoming.pause_seconds) || 0);
  const pausedAt = ended ? null : earlierIso(current.paused_at, incoming.paused_at);
  const endOwner = !ended
    ? (laterIso(current.client_updated_at, incoming.client_updated_at) === String(incoming.client_updated_at || "") ? incoming : current)
    : (current.ended_at && String(current.ended_at) === String(ended) ? current : incoming);
  const completeSides = [current, incoming].filter((row) => row.row_status === "complete");
  let status = endOwner.row_status || null;
  let rowEnd = ended ? (endOwner.row_end ?? null) : (endOwner.row_end ?? current.row_end ?? incoming.row_end ?? null);
  if (completeSides.length) {
    completeSides.sort((a, b) => String(a.ended_at || "9999").localeCompare(String(b.ended_at || "9999")));
    status = "complete";
    rowEnd = completeSides[0].row_end ?? rowEnd;
  }
  const entryKind = ended
    ? (endOwner.entry_kind === "open" ? (endOwner.pass_id ? "pass_total" : "task") : endOwner.entry_kind)
    : "open";
  return {
    ...endOwner,
    id: current.id,
    vineyard_id: current.vineyard_id,
    user_id: current.user_id,
    crew_job_id: current.crew_job_id || incoming.crew_job_id || null,
    started_at: started,
    ended_at: ended,
    pause_seconds: pause,
    paused_at: pausedAt,
    row_end: rowEnd,
    row_status: status,
    entry_kind: entryKind,
    hours: ended ? hoursBetween(started, ended, pause) : null,
    client_updated_at: laterIso(current.client_updated_at, incoming.client_updated_at),
  };
}

export function crewWorkKey(row) {
  if (!row) return "";
  return [
    row.vineyard_id || "",
    row.work_date || "",
    row.block_id || "",
    row.area_id || "",
    row.pass_id || "",
    row.pass_id ? "" : (row.task_id || ""),
    row.row_start == null || row.row_start === "" ? "" : String(row.row_start),
  ].join("|");
}

function uuidFromString(text) {
  let h1 = 2166136261;
  let h2 = 2166136261 ^ 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 16777619);
    h2 ^= code + i;
    h2 = Math.imul(h2, 16777619);
  }
  const bytes = [];
  let x = h1 >>> 0;
  let y = h2 >>> 0;
  for (let i = 0; i < 8; i++) {
    bytes.push((x >>> ((i % 4) * 8)) & 0xff);
    x = (Math.imul(x, 16777619) ^ y) >>> 0;
  }
  for (let i = 0; i < 8; i++) {
    bytes.push((y >>> ((i % 4) * 8)) & 0xff);
    y = (Math.imul(y, 2246822519) ^ x) >>> 0;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

// Same id on every phone that starts this block, task, and row on this day.
export function sharedCrewJobId(work) {
  return uuidFromString(crewWorkKey(work));
}

export function intervalsOverlap(a, b) {
  const start = (row) => {
    const n = Date.parse(row?.started_at || "");
    return Number.isNaN(n) ? 0 : n;
  };
  const end = (row) => {
    if (!row?.ended_at) return Infinity;
    const n = Date.parse(row.ended_at);
    return Number.isNaN(n) ? Infinity : n;
  };
  return start(a) < end(b) && start(b) < end(a);
}

function clockRow(row) {
  return row && !row.deleted_at && row.entry_kind !== "pass_slice" && row.source !== "manual";
}

function clusterByOverlap(rows) {
  const parent = rows.map((_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const union = (left, right) => {
    parent[find(left)] = find(right);
  };
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const sameJob = rows[i].crew_job_id && rows[i].crew_job_id === rows[j].crew_job_id;
      if (sameJob || intervalsOverlap(rows[i], rows[j])) union(i, j);
    }
  }
  const buckets = new Map();
  rows.forEach((row, index) => {
    const id = find(index);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(row);
  });
  return [...buckets.values()];
}

function canonicalCrewId(rows) {
  const sorted = rows.slice().sort((a, b) => (
    String(a.started_at).localeCompare(String(b.started_at))
    || String(a.crew_job_id || a.id).localeCompare(String(b.crew_job_id || b.id))
  ));
  return sorted[0].crew_job_id || sorted[0].id;
}

// Rows from two phones after they sync. Same block, task, and start row
// in overlapping time become one job. Each person keeps one interval.
export function mergeOfflineLabor(rows) {
  const passthrough = [];
  const clocks = [];
  for (const row of rows || []) {
    if (!clockRow(row)) passthrough.push(row);
    else clocks.push(row);
  }
  const byWork = new Map();
  for (const row of clocks) {
    const key = crewWorkKey(row);
    if (!byWork.has(key)) byWork.set(key, []);
    byWork.get(key).push(row);
  }
  const kept = [];
  const keptIds = new Set();
  for (const group of byWork.values()) {
    for (const cluster of clusterByOverlap(group)) {
      const crewJobId = canonicalCrewId(cluster);
      const byUser = new Map();
      for (const row of cluster) {
        if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
        byUser.get(row.user_id).push(row);
      }
      for (const list of byUser.values()) {
        list.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)) || String(a.id).localeCompare(String(b.id)));
        let merged = { ...list[0], crew_job_id: crewJobId };
        for (const extra of list.slice(1)) merged = mergeCrewEntry(merged, { ...extra, crew_job_id: crewJobId });
        merged.crew_job_id = crewJobId;
        merged.id = list[0].id;
        if (merged.ended_at) {
          merged.hours = hoursBetween(merged.started_at, merged.ended_at, merged.pause_seconds);
          if (merged.entry_kind === "open") merged.entry_kind = merged.pass_id ? "pass_total" : "task";
        }
        kept.push(merged);
        keptIds.add(merged.id);
      }
    }
  }
  const slices = passthrough.filter((row) => {
    if (!row || row.entry_kind !== "pass_slice") return true;
    if (keptIds.has(row.pass_group_id)) return true;
    return !clocks.some((clock) => clock.id === row.pass_group_id);
  });
  return kept.concat(slices);
}

export function foldCrewLabor(rows) {
  return mergeOfflineLabor(rows);
}

export function openCrewJobs(labor) {
  const groups = new Map();
  for (const row of labor || []) {
    if (row.deleted_at || row.ended_at || row.entry_kind !== "open") continue;
    const key = row.crew_job_id || row.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

export function progressKey(r) {
  return [r.vineyard_id, r.season_year, r.block_id, r.task_id, r.row_number].join(":");
}

export function mergeProgress(existing, drafts, { allowDowngrade = false } = {}) {
  const by = new Map((existing || []).map((r) => [progressKey(r), r]));
  const out = [];
  for (const d of drafts || []) {
    const prev = by.get(progressKey(d));
    if (prev && prev.status === "complete" && d.status !== "complete" && !allowDowngrade) continue;
    const row = prev
      ? { ...prev, status: d.status, updated_by: d.updated_by, client_updated_at: d.client_updated_at }
      : d;
    by.set(progressKey(row), row);
    out.push(row);
  }
  return out;
}

export function canEditLabor(entry, { role, userId, cutoff }) {
  if (!entry || entry.deleted_at) return false;
  if (role === "manager") return true;
  const owns = entry.user_id === userId || entry.logged_by === userId;
  if (!owns) return false;
  if (!entry.work_date || !cutoff) return false;
  return entry.work_date >= cutoff;
}

export function openJobFor(labor, userId) {
  return (labor || []).find(
    (row) => row.user_id === userId && row.entry_kind === "open" && !row.deleted_at && !row.ended_at,
  ) || null;
}

// Same stop as checking one person off: their open row closes, everyone else stays open.
export function checkOffOne(labor, userId, at) {
  const mine = openJobFor(labor, userId);
  if (!mine) return (labor || []).slice();
  const closed = closeOpenJob({
    job: mine,
    at,
    completion: null,
    rowEnd: null,
    reason: "leave",
    markProgress: false,
  });
  return (labor || []).filter((row) => row.id !== mine.id).concat(closed.labor);
}

export function rowStatus(rows, season, blockId, taskId, rowNumber) {
  const hit = (rows || []).find(
    (r) =>
      r.season_year === season &&
      r.block_id === blockId &&
      r.task_id === taskId &&
      Number(r.row_number) === Number(rowNumber) &&
      r.status !== "none",
  );
  return hit ? hit.status : "none";
}

export function countStatus(rows, season, blockId, taskId, status) {
  return (rows || []).filter(
    (r) =>
      r.season_year === season &&
      r.block_id === blockId &&
      r.task_id === taskId &&
      r.status === status,
  ).length;
}

function alive(rows) {
  return (rows || []).filter((r) => !r.deleted_at && !r.archived);
}

export function sumTaskHours(labor, contractors, season, taskId, blockId = null, allDates = false) {
  let hours = 0;
  for (const row of labor || []) {
    if (row.deleted_at || (!allDates && row.season_year !== season)) continue;
    if (row.entry_kind !== "task" && row.entry_kind !== "pass_slice") continue;
    if (row.task_id !== taskId) continue;
    if (blockId && row.block_id !== blockId) continue;
    hours += Number(row.hours) || 0;
  }
  for (const row of contractors || []) {
    if (row.deleted_at || (!allDates && row.season_year !== season)) continue;
    if (row.task_id !== taskId) continue;
    if (blockId && row.block_id !== blockId) continue;
    hours += Number(row.hours) || 0;
  }
  return round3(hours);
}

export function sumPassHours(labor, season, passId, blockId = null) {
  let hours = 0;
  for (const row of labor || []) {
    if (row.deleted_at || row.season_year !== season) continue;
    if (row.entry_kind !== "pass_total" || row.pass_id !== passId) continue;
    if (blockId && row.block_id !== blockId) continue;
    hours += Number(row.hours) || 0;
  }
  return round3(hours);
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

export function legacyToRecords(legacy, { vineyardId, userId, existing = {}, uuid = () => crypto.randomUUID() } = {}) {
  const data = legacy || {};
  const blockMap = new Map();
  const taskMap = new Map();
  const blocks = [];
  const tasks = [];
  const existingBlocks = alive(existing.blocks);
  const existingTasks = alive(existing.tasks);

  for (const b of data.blocks || []) {
    const match = existingBlocks.find((x) => norm(x.name) === norm(b.name));
    const id = match ? match.id : uuid();
    blockMap.set(b.id, id);
    if (!match) {
      blocks.push({
        id,
        vineyard_id: vineyardId,
        name: String(b.name || "Block").trim() || "Block",
        variety: String(b.variety || "").trim(),
        row_count: Math.max(1, Number(b.rows) || 40),
        plant_count: b.plants === "" || b.plants == null ? null : Number(b.plants),
        sort_order: blocks.length + existingBlocks.length + 1,
        archived: false,
      });
    }
  }

  for (const t of data.tasks || []) {
    const match = existingTasks.find((x) => norm(x.label) === norm(t.label) || x.slug === t.id);
    const id = match ? match.id : uuid();
    taskMap.set(t.id, id);
    if (!match) {
      const slugBase = slugify(t.id && String(t.id).length < 48 ? t.id : t.label);
      tasks.push({
        id,
        vineyard_id: vineyardId,
        slug: slugBase,
        label: String(t.label || "Task").trim() || "Task",
        sort_order: tasks.length + existingTasks.length + 1,
        archived: false,
      });
    }
  }

  const rowProgress = [];
  const sprays = [];
  const watering = [];
  const weeds = [];
  const samples = [];
  const seasons = new Set();

  function absorb(bucket, year) {
    if (!bucket) return;
    seasons.add(Number(year));
    for (const [key, stamp] of Object.entries(bucket.done || {})) {
      const bits = String(key).split(":");
      if (bits.length < 4) continue;
      const [y, blockId, taskId, row] = bits;
      const bid = blockMap.get(blockId);
      const tid = taskMap.get(taskId);
      if (!bid || !tid) continue;
      rowProgress.push({
        id: uuid(),
        vineyard_id: vineyardId,
        season_year: Number(y) || Number(year),
        block_id: bid,
        task_id: tid,
        row_number: Number(row),
        status: "complete",
        updated_by: userId,
      });
    }
    const sprayLists = [
      ["foliar", bucket.sprays || []],
      ["herbicide", bucket.herbicide || []],
    ];
    for (const [kind, list] of sprayLists) {
      for (const s of list) {
        if (s.year && Number(s.year) !== Number(year) && bucket !== data) continue;
        const bid = blockMap.get(s.blockId);
        if (!bid) continue;
        sprays.push({
          id: uuid(),
          vineyard_id: vineyardId,
          season_year: Number(s.year) || Number(year),
          block_id: bid,
          kind,
          spray_date: s.date || `${year}-01-01`,
          chemical_id: null,
          chemical_name: String(s.chemical || "").trim() || "Spray",
          rate: s.rate || "",
          volume: s.volume || "",
          tank: s.tank || "",
          notes: s.notes || "",
          rec_number: s.rec || s.rec_number || "",
          photo_path: null,
          rows_done: s.rows || {},
          created_by: userId,
        });
      }
    }
    for (const w of bucket.watering || []) {
      const bid = blockMap.get(w.blockId);
      if (!bid) continue;
      watering.push({
        id: uuid(),
        vineyard_id: vineyardId,
        season_year: Number(w.year) || Number(year),
        block_id: bid,
        log_date: w.date,
        hours: Number(w.hours) || 0,
        notes: w.notes || "",
        created_by: userId,
      });
    }
    for (const w of bucket.weedLogs || []) {
      const bid = blockMap.get(w.blockId);
      if (!bid) continue;
      weeds.push({
        id: uuid(),
        vineyard_id: vineyardId,
        season_year: Number(w.year) || Number(year),
        block_id: bid,
        log_date: w.date,
        hours: Number(w.hours) || 0,
        notes: w.notes || "",
        created_by: userId,
      });
    }
    for (const s of bucket.samples || []) {
      const bid = blockMap.get(s.blockId);
      if (!bid) continue;
      samples.push({
        id: uuid(),
        vineyard_id: vineyardId,
        season_year: Number(year),
        block_id: bid,
        sample_date: s.date,
        rows_sampled: s.rows || "",
        brix: s.brix || "",
        ph: s.ph || "",
        ta: s.ta || "",
        notes: s.notes || "",
        created_by: userId,
      });
    }
  }

  absorb(data, data.year || new Date().getFullYear());
  for (const h of data.history || []) {
    absorb(
      {
        done: h.done || {},
        sprays: h.sprays || [],
        herbicide: h.herbicide || [],
        watering: h.watering || [],
        weedLogs: h.weedLogs || [],
        samples: h.samples || [],
      },
      h.year,
    );
  }

  const equipment = [];
  const equipMap = new Map();
  for (const e of data.equipment || []) {
    const id = uuid();
    equipMap.set(e.id, id);
    equipment.push({
      id,
      vineyard_id: vineyardId,
      name: String(e.name || "Equipment").trim(),
      notes: e.notes || "",
      archived: false,
    });
  }
  const serviceTypes = (data.serviceTypes || []).map((name, i) => ({
    id: uuid(),
    vineyard_id: vineyardId,
    name: String(name),
    sort_order: i + 1,
    archived: false,
  }));
  const serviceLogs = [];
  for (const l of data.serviceLogs || []) {
    serviceLogs.push({
      id: uuid(),
      vineyard_id: vineyardId,
      equipment_id: equipMap.get(l.equipmentId) || null,
      service_type: l.serviceType || "",
      log_date: l.date,
      hours: l.hours || "",
      notes: l.notes || "",
      created_by: userId,
    });
  }

  return {
    blocks,
    tasks,
    rowProgress,
    sprays,
    watering,
    weeds,
    samples,
    equipment,
    serviceTypes,
    serviceLogs,
    seasons: [...seasons].filter((y) => Number.isFinite(y)),
  };
}

function csvEscape(value) {
  let t = String(value ?? "");
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

export function toCsv(rows) {
  return `\uFEFF${rows.map((r) => r.map(csvEscape).join(",")).join("\n")}\n`;
}

function blockName(blocks, id) {
  return blocks.find((b) => b.id === id)?.name || "Unknown";
}

function latestSample(samples, blockId) {
  return (samples || [])
    .filter((s) => s.block_id === blockId && !s.deleted_at)
    .sort((a, b) => String(b.sample_date).localeCompare(String(a.sample_date)))[0];
}

function sprayCount(spray) {
  return Object.keys(spray.rows_done || {}).length;
}

function sprayedList(spray) {
  return Object.keys(spray.rows_done || {})
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .join(";");
}

export function buildReports(input) {
  const year = input.year;
  const blocks = (input.blocks || []).filter((b) => !b.archived && !b.deleted_at);
  const tasks = (input.tasks || []).filter((t) => !t.archived && !t.deleted_at);
  const passes = (input.passes || []).filter((p) => !p.archived && !p.deleted_at);
  const rows = input.rows || [];
  const sprays = (input.sprays || []).filter((s) => !s.deleted_at && s.season_year === year);
  const watering = (input.watering || []).filter((w) => !w.deleted_at && w.season_year === year);
  const weeds = (input.weeds || []).filter((w) => !w.deleted_at && w.season_year === year);
  const samples = (input.samples || []).filter((s) => !s.deleted_at);
  const labor = input.labor || [];
  const contractors = input.contractors || [];
  const photoLinks = input.photoLinks || {};
  const includeCost = Boolean(input.includeCost);
  const mode = input.laborMode || "task";
  const costRows = input.costRows || [];

  const waterHours = (id) =>
    round3(watering.filter((w) => w.block_id === id).reduce((sum, w) => sum + (Number(w.hours) || 0), 0));
  const weedHours = (id) =>
    round3(weeds.filter((w) => w.block_id === id).reduce((sum, w) => sum + (Number(w.hours) || 0), 0));

  const ovHeader = [
    "Year",
    "Block",
    "Variety",
    "Rows",
    ...tasks.map((t) => `${t.label} done`),
    "Water hours",
    "Weed hours",
    "Latest sample",
    "Brix",
    "pH",
    "TA",
    "Labor hours",
  ];
  const ovRows = [ovHeader];
  const ovLines = [`DA Ranch Vineyard App · overview · ${year}`, ""];
  for (const b of blocks) {
    const sample = latestSample(samples.filter((s) => s.season_year === year || !s.season_year), b.id);
    const laborHours = round3(
      tasks.reduce((sum, t) => sum + sumTaskHours(labor, contractors, year, t.id, b.id), 0),
    );
    ovRows.push([
      year,
      b.name,
      b.variety || "",
      b.row_count,
      ...tasks.map((t) => `${countStatus(rows, year, b.id, t.id, "complete")}/${b.row_count}`),
      waterHours(b.id) || 0,
      weedHours(b.id) || 0,
      sample?.sample_date || "",
      sample?.brix || "",
      sample?.ph || "",
      sample?.ta || "",
      laborHours || 0,
    ]);
    ovLines.push(b.name + (b.variety ? ` (${b.variety})` : ""));
    ovLines.push(
      `  Tasks: ${tasks
        .map((t) => {
          const done = countStatus(rows, year, b.id, t.id, "complete");
          const partial = countStatus(rows, year, b.id, t.id, "partial");
          return `${t.label} ${done}/${b.row_count}${partial ? ` (${partial} partial)` : ""}`;
        })
        .join("; ")}`,
    );
    ovLines.push(`  Water: ${waterHours(b.id) || 0} hrs · Weeds: ${weedHours(b.id) || 0} hrs · Labor: ${laborHours || 0} hrs`);
    ovLines.push(
      sample
        ? `  Latest harvest: ${sample.sample_date} · Brix ${sample.brix || "—"} · pH ${sample.ph || "—"} · TA ${sample.ta || "—"}`
        : "  Latest harvest: none",
    );
    ovLines.push("");
  }

  const spRows = [[
    "Year",
    "Kind",
    "Date",
    "Block",
    "Chemical",
    "Rate",
    "Volume",
    "Tank",
    "Notes",
    "Rows done",
    "Total rows",
    "Rows",
    "Rec",
    "Photo",
  ]];
  const spLines = [`Sprays log · ${year}`, ""];
  const allSprays = sprays
    .slice()
    .sort((a, b) => String(b.spray_date).localeCompare(String(a.spray_date)) || String(a.kind).localeCompare(String(b.kind)));
  for (const s of allSprays) {
    const bl = blocks.find((x) => x.id === s.block_id);
    const total = bl?.row_count || 0;
    const kind = s.kind === "herbicide" ? "Herbicide" : "Foliar";
    const photo = photoLinks[s.id] || (s.photo_path ? "photo on file" : "");
    spRows.push([
      year,
      kind,
      s.spray_date,
      blockName(blocks, s.block_id),
      s.chemical_name,
      s.rate,
      s.volume,
      s.tank,
      s.notes,
      sprayCount(s),
      total,
      sprayedList(s),
      s.rec_number || "",
      photo,
    ]);
    spLines.push(`${s.spray_date} · ${kind} · ${blockName(blocks, s.block_id)}`);
    spLines.push(
      `  ${s.chemical_name}${s.rate ? ` · Rate ${s.rate}` : ""}${s.volume ? ` · Vol ${s.volume}` : ""}${s.tank ? ` · Tank ${s.tank}` : ""}`,
    );
    const extra = [s.rec_number ? `Rec ${s.rec_number}` : "", photo ? `Photo ${photo}` : ""].filter(Boolean).join(" · ");
    spLines.push(`  Rows ${sprayCount(s)}/${total}${s.notes ? ` · ${s.notes}` : ""}${extra ? ` · ${extra}` : ""}`);
    spLines.push("");
  }
  if (!allSprays.length) spLines.push("No foliar or herbicide passes this season.");

  const blkRows = [["Year", "Block", "Section", "Date", "Detail", "Value", "Notes", "Rec", "Photo"]];
  const blkLines = [`Block-by-block · ${year}`, ""];
  for (const b of blocks) {
    blkLines.push(`=== ${b.name} ===`);
    blkLines.push(`Rows: ${b.row_count}${b.variety ? ` · ${b.variety}` : ""}`);
    for (const t of tasks) {
      const done = countStatus(rows, year, b.id, t.id, "complete");
      const partial = countStatus(rows, year, b.id, t.id, "partial");
      blkRows.push([year, b.name, "Task", "", t.label, `${done}/${b.row_count}`, partial ? `${partial} partial` : "", "", ""]);
      blkLines.push(`  ${t.label}: ${done}/${b.row_count}${partial ? ` · ${partial} partial` : ""} · ${formatHours(sumTaskHours(labor, contractors, year, t.id, b.id)) || 0} hrs`);
    }
    blkLines.push(`  Watering: ${waterHours(b.id) || 0} hrs`);
    for (const w of watering.filter((x) => x.block_id === b.id)) {
      blkRows.push([year, b.name, "Watering", w.log_date, "Hours", w.hours, w.notes, "", ""]);
      blkLines.push(`    ${w.log_date} · ${w.hours} hrs${w.notes ? ` · ${w.notes}` : ""}`);
    }
    blkLines.push(`  Weeds: ${weedHours(b.id) || 0} hrs`);
    for (const w of weeds.filter((x) => x.block_id === b.id)) {
      blkRows.push([year, b.name, "Weeds", w.log_date, "Hours", w.hours, w.notes, "", ""]);
      blkLines.push(`    ${w.log_date} · ${w.hours} hrs${w.notes ? ` · ${w.notes}` : ""}`);
    }
    for (const kind of ["foliar", "herbicide"]) {
      const list = sprays.filter((s) => s.block_id === b.id && s.kind === kind);
      const label = kind === "herbicide" ? "Herbicide" : "Foliar";
      blkLines.push(`  ${label}: ${list.length} pass(es)`);
      for (const s of list) {
        const photo = photoLinks[s.id] || (s.photo_path ? "photo on file" : "");
        blkRows.push([
          year,
          b.name,
          label,
          s.spray_date,
          s.chemical_name,
          `${sprayCount(s)}/${b.row_count}`,
          [s.rate, s.volume, s.notes].filter(Boolean).join(" · "),
          s.rec_number || "",
          photo,
        ]);
        blkLines.push(
          `    ${s.spray_date} · ${s.chemical_name} · ${sprayCount(s)}/${b.row_count}${s.rec_number ? ` · Rec ${s.rec_number}` : ""}${photo ? ` · ${photo}` : ""}`,
        );
      }
    }
    const mine = samples.filter((s) => s.block_id === b.id && s.season_year === year);
    blkLines.push(`  Harvest samples: ${mine.length}`);
    for (const s of mine) {
      blkRows.push([
        year,
        b.name,
        "Harvest",
        s.sample_date,
        s.rows_sampled,
        `Brix ${s.brix || "—"} / pH ${s.ph || "—"} / TA ${s.ta || "—"}`,
        s.notes,
        "",
        "",
      ]);
      blkLines.push(`    ${s.sample_date} · Brix ${s.brix || "—"} · pH ${s.ph || "—"} · TA ${s.ta || "—"}`);
    }
    blkLines.push("");
  }

  const laborPack = buildLaborReport({
    year,
    tasks,
    passes,
    labor,
    contractors,
    includeCost,
    mode,
    costRows,
  });

  return {
    overview: {
      title: "Vineyard overview",
      name: `vineyard-${year}-overview.csv`,
      csv: toCsv(ovRows),
      text: ovLines.join("\n"),
    },
    sprays: {
      title: "Sprays log",
      name: `vineyard-${year}-sprays.csv`,
      csv: toCsv(spRows),
      text: spLines.join("\n"),
    },
    blocks: {
      title: "Block-by-block",
      name: `vineyard-${year}-blocks.csv`,
      csv: toCsv(blkRows),
      text: blkLines.join("\n"),
    },
    labor: laborPack,
  };
}

function costFor(costRows, kind, id) {
  return (costRows || []).find((r) => r.group_kind === kind && r.group_id === id) || null;
}

export function buildLaborReport({ year, tasks, passes, labor, contractors, includeCost, mode, costRows }) {
  const lines = [`Labor · ${year}`, ""];
  const header = includeCost ? ["Year", "Group", "Name", "Hours", "Labor cost"] : ["Year", "Group", "Name", "Hours"];
  const rows = [header];
  const wantTask = mode !== "pass";
  const wantPass = mode !== "task";

  if (wantTask && wantPass) {
    lines.push("Task hours already include pass time, split evenly across the tasks in the pass.");
    lines.push("Pass totals are the full time for each pass. Do not add the two sections together.");
    lines.push("");
  }

  if (wantTask) {
    lines.push("By task");
    for (const t of tasks) {
      const hours = sumTaskHours(labor, contractors, year, t.id);
      if (!hours) continue;
      const cost = costFor(costRows, "task", t.id);
      const record = [year, "Task", t.label, formatHours(hours)];
      if (includeCost) record.push(cost ? Number(cost.cost).toFixed(2) : "");
      rows.push(record);
      lines.push(`  ${t.label}: ${formatHours(hours)} hrs${includeCost && cost ? ` · $${Number(cost.cost).toFixed(2)}` : ""}`);
    }
    const loose = costFor(costRows, "contractor", null);
    if (includeCost && loose && Number(loose.cost)) {
      rows.push([year, "Contractor", "Contractors with no task", formatHours(loose.hours || 0), Number(loose.cost).toFixed(2)]);
      lines.push(`  Contractors with no task: $${Number(loose.cost).toFixed(2)}`);
    }
    lines.push("");
  }

  if (wantPass) {
    lines.push("By pass");
    let any = false;
    for (const p of passes) {
      const hours = sumPassHours(labor, year, p.id);
      if (!hours) continue;
      any = true;
      const cost = costFor(costRows, "pass", p.id);
      const record = [year, "Pass", p.name, formatHours(hours)];
      if (includeCost) record.push(cost ? Number(cost.cost).toFixed(2) : "");
      rows.push(record);
      lines.push(`  ${p.name}: ${formatHours(hours)} hrs${includeCost && cost ? ` · $${Number(cost.cost).toFixed(2)}` : ""}`);
    }
    if (!any) lines.push("  No combined passes logged this season.");
    lines.push("");
  }

  if (!includeCost) lines.push("Hours only. Wages and labor cost are not on this login.");

  return {
    title: "Labor",
    name: `vineyard-${year}-labor.csv`,
    csv: toCsv(rows),
    text: lines.join("\n"),
  };
}

export function buildManualEntry({
  id,
  vineyardId,
  userId,
  season,
  workDate,
  blockId = null,
  areaId = null,
  taskId,
  startedAt,
  endedAt,
  notes = "",
  rowStart = null,
  rowEnd = null,
  completion = null,
}) {
  const hours = hoursBetween(startedAt, endedAt, 0);
  return {
    id,
    vineyard_id: vineyardId,
    user_id: userId,
    logged_by: userId,
    season_year: season,
    work_date: workDate,
    block_id: blockId,
    area_id: areaId,
    task_id: taskId,
    pass_id: null,
    pass_group_id: null,
    entry_kind: "task",
    row_start: rowStart,
    row_end: rowEnd,
    row_status: completion,
    started_at: startedAt,
    ended_at: endedAt,
    pause_seconds: 0,
    paused_at: null,
    hours,
    close_reason: "manual",
    source: "manual",
    notes,
    deleted_at: null,
    client_updated_at: new Date().toISOString(),
  };
}

export function combineDateAndTime(dateStr, timeStr, timeZone) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const eod = parseEod(timeStr || "08:00");
  return zonedTimeToUtc(y, m, d, eod.h, eod.m, eod.s, timeZone).toISOString();
}

export function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + Number(hours) * 3600000).toISOString();
}
