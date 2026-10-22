import {
  APP_VERSION,
  LEGACY_FLAG_KEY,
  LEGACY_STORAGE_KEY,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  CORNVILLE_LAT,
  CORNVILLE_LON,
  DEFAULT_WEATHER_URL,
  THEME_KEY,
  TOUR_SEEN_PREFIX,
} from "./config.js";
import {
  allRows,
  deleteRecord,
  enqueue,
  getFile,
  kvGet,
  kvSet,
  openDb,
  outboxItems,
  putFile,
  putRecord,
  putRecords,
  recordKey,
} from "./idb.js";
import {
  buildManualEntry,
  buildReports,
  canEditLabor,
  closeOpenJob,
  combineDateAndTime,
  crewMemberEntryId,
  foldCrewLabor,
  sharedCrewJobId,
  crewWorkKey,
  editCutoffDate,
  elapsedSeconds,
  formatDuration,
  jobsToAutoclose,
  legacyToRecords,
  mergeProgress,
  openJobFor,
  progressKey,
  rowStatus,
  seasonYear,
  slugify,
  vineyardToday,
  zonedParts,
  addHours,
} from "./logic.js";
import { machineQuery, needsModel, partSearchUrl, pushPartRecent } from "./parts.js";
import { BUNDLED_FACTS } from "./facts.js";
import { BUNDLED_NOTES, NOTE_FIELDS, noteForVariety } from "./notes.js";
import { BUNDLED_QUOTES, varietyFull } from "./quotes.js";
import { signedPhotoUrls, syncAll } from "./sync.js";
import { tourSteps } from "./tour.js";
import { renderApp } from "./ui.js";
import { fetchNwsWeather, heatAlert, vineyardPoint } from "./weather.js";

const KEY_BY_TABLE = {
  blocks: "blocks",
  tasks: "tasks",
  passes: "passes",
  pass_tasks: "passTasks",
  areas: "areas",
  chemicals: "chemicals",
  labor_entries: "labor",
  row_progress: "rows",
  spray_logs: "sprays",
  watering_logs: "watering",
  weed_logs: "weeds",
  harvest_samples: "samples",
  equipment: "equipment",
  variety_quotes: "quotes",
  wine_facts: "facts",
  variety_notes: "notes",
  service_types: "serviceTypes",
  service_logs: "serviceLogs",
  contractors: "contractors",
  contractor_costs: "contractorCosts",
  memberships: "members",
  profiles: "profiles",
  invites: "invites",
  manager_requests: "managerRequests",
  wage_rates: "wages",
  bug_reports: "bugs",
  season_notes: "seasons",
};

const SESSION_KEY = "sb-skpburnqszcrwuftizsw-auth-token";

function emptyData() {
  return {
    blocks: [], tasks: [], passes: [], passTasks: [], areas: [], chemicals: [],
    labor: [], rows: [], sprays: [], watering: [], weeds: [], samples: [],
    equipment: [], serviceTypes: [], serviceLogs: [], quotes: [], facts: [], notes: [], contractors: [], contractorCosts: [],
    members: [], profiles: [], invites: [], managerRequests: [], wages: [], bugs: [], seasons: [],
  };
}

const state = {
  route: "loading",
  param: "",
  session: null,
  userId: null,
  profile: null,
  vineyard: null,
  role: null,
  year: new Date().getFullYear(),
  exportYear: null,
  data: emptyData(),
  flow: { step: "place", crew: {} },
  modal: null,
  notice: "",
  syncError: "",
  syncing: false,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  outbox: 0,
  tab: "tasks",
  sprayId: null,
  laborMode: "task",
  reports: null,
  edit: null,
  photoUrls: {},
  authMode: "in",
  installEvent: null,
  demo: false,
  costRows: [],
  lastSync: null,
  pendingPaint: false,
  weather: null,
  heatAsk: false,
  partQuery: "",
  partRecent: [],
  quoteEdit: null,
  factEdit: null,
};

let db = null;
let client = null;
let activeUser = null;
let enterPromise = null;
let signingOut = false;
let syncTimer = null;
let flight = null;
let syncAgain = false;
const errors = [];

function tz() {
  return state.vineyard?.timezone || "America/Phoenix";
}

function lead() {
  return state.role === "manager" || state.role === "developer";
}

function editCtx() {
  return {
    role: state.role,
    userId: state.userId,
    cutoff: editCutoffDate(tz(), state.vineyard?.edit_window_days ?? 3),
  };
}

function pushError(error) {
  errors.push(String(error?.message || error || "error").slice(0, 300));
  if (errors.length > 20) errors.shift();
}

function applyTheme(id) {
  const theme = ["sage", "sand", "night", "grape"].includes(id) ? id : "sage";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
}

function userIsTyping() {
  const active = document.activeElement;
  const root = document.getElementById("app");
  return Boolean(active && root?.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
}

function refreshReports() {
  const year = state.exportYear || state.year;
  const photoLinks = {};
  for (const spray of state.data.sprays) {
    const url = spray.photo_path ? state.photoUrls[spray.photo_path] : "";
    if (url && /^https?:/i.test(url)) photoLinks[spray.id] = url;
  }
  state.reports = buildReports({
    year,
    blocks: state.data.blocks,
    tasks: state.data.tasks,
    passes: state.data.passes,
    rows: state.data.rows,
    sprays: state.data.sprays,
    watering: state.data.watering,
    weeds: state.data.weeds,
    samples: state.data.samples,
    labor: state.data.labor,
    contractors: state.data.contractors,
    photoLinks,
    includeCost: state.role === "manager",
    laborMode: state.laborMode || "task",
    costRows: state.costRows || [],
  });
}

function paint() {
  refreshReports();
  const root = document.getElementById("app");
  if (!root) return;
  if (userIsTyping()) {
    state.pendingPaint = true;
    return;
  }
  state.pendingPaint = false;
  root.innerHTML = renderApp(state);
  const timer = document.getElementById("live-timer");
  const job = openJobFor(state.data.labor, state.userId);
  if (timer && job) timer.textContent = formatDuration(elapsedSeconds(job));
}

function blankToNull(record) {
  const nullable = /(_id|_at)$|^(photo_path|plant_count|hours|row_start|row_end|row_status|close_reason|year)$/;
  for (const key of Object.keys(record)) {
    if (record[key] === "" && nullable.test(key) && key !== "client_id") record[key] = null;
  }
  return record;
}

function remember(table, record) {
  if (table === "vineyards") {
    state.vineyard = { ...state.vineyard, ...record };
    return;
  }
  const key = KEY_BY_TABLE[table];
  if (!key) return;
  const id = recordKey(table, record);
  const list = state.data[key];
  const idx = list.findIndex((row) => recordKey(table, row) === id);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  if (table === "profiles" && record.id === state.userId) state.profile = record;
  if (table === "memberships" && record.user_id === state.userId && record.vineyard_id === state.vineyard?.id) {
    state.role = record.role;
  }
}

function save(table, record, { paintNow = true } = {}) {
  record.client_updated_at = new Date().toISOString();
  blankToNull(record);
  remember(table, record);
  if (paintNow) queueMicrotask(paint);
  if (!state.demo && db) persist(table, record);
  return record;
}

function persist(table, record) {
  const key = recordKey(table, record);
  return putRecord(db, table, record)
    .then(() => enqueue(db, {
      id: `upsert:${table}:${key}`,
      kind: "upsert",
      table,
      key,
      at: record.client_updated_at,
      attempts: 0,
    }))
    .then(() => outboxItems(db))
    .then((items) => {
      state.outbox = items.length;
      scheduleSync();
    })
    .catch((error) => pushError(error));
}

function scheduleSync() {
  if (state.demo) return;
  if (flight) {
    syncAgain = true;
    return;
  }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncNow(); }, 800);
  const ready = navigator.serviceWorker?.ready;
  if (ready) ready.then((reg) => reg.sync?.register("daranch")).catch(() => {});
}

function syncNow() {
  if (state.demo || !client || !db || !state.vineyard) return Promise.resolve();
  if (flight) return flight;
  flight = runSync().finally(() => {
    flight = null;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync();
    }
  });
  return flight;
}

async function runSync() {
  state.syncing = true;
  paint();
  try {
    const res = await syncAll({
      client,
      db,
      vineyardId: state.vineyard.id,
      userId: state.userId,
      role: state.role,
      season: state.year,
    });
    state.online = Boolean(res.online);
    if (!res.online) {
      state.syncError = "";
      return;
    }
    state.syncError = "";
    if (res.dropped?.length) {
      state.notice = "That change was not allowed, so this phone kept the server copy.";
    }
    await hydrate();
    await refreshPhotos();
    maybeLegacy();
  } catch (error) {
    state.syncError = "Saved on this phone. It will send when Wi-Fi is back.";
    pushError(error);
  } finally {
    state.syncing = false;
    if (db) state.outbox = (await outboxItems(db)).length;
    maybeTour();
    paint();
  }
}

async function refreshPhotos() {
  const paths = [...new Set(state.data.sprays.map((s) => s.photo_path).filter(Boolean))];
  if (!paths.length || !client || state.demo) return;
  try {
    const signed = await signedPhotoUrls(client, paths);
    state.photoUrls = { ...state.photoUrls, ...signed };
  } catch {
    // The report says "photo on file" until a link can be made.
  }
}

async function dedupeLabor(rows) {
  const folded = foldCrewLabor(rows);
  const keep = new Set(folded.map((row) => row.id));
  for (const row of rows) {
    if (!keep.has(row.id)) await deleteRecord(db, "labor_entries", row.id);
  }
  return folded;
}

async function dedupeProgress(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = progressKey(row);
    const prev = best.get(key);
    if (!prev || String(row.client_updated_at || "") >= String(prev.client_updated_at || "")) best.set(key, row);
  }
  const keep = new Set([...best.values()].map((row) => row.id));
  for (const row of rows) {
    if (!keep.has(row.id)) await deleteRecord(db, "row_progress", row.id);
  }
  return [...best.values()];
}

async function hydrate() {
  const stored = await allRows(db);
  const data = emptyData();
  const vines = [];
  for (const row of stored) {
    if (row.table === "vineyards") vines.push(row.record);
    const key = KEY_BY_TABLE[row.table];
    if (key) data[key].push(row.record);
  }
  data.rows = await dedupeProgress(data.rows);
  data.labor = await dedupeLabor(data.labor);
  state.data = data;
  const mine = data.members.filter((m) => m.user_id === state.userId && m.active !== false);
  const saved = await kvGet(db, "activeVineyard");
  const mem = mine.find((m) => m.vineyard_id === saved) || mine[0] || null;
  state.role = mem?.role || null;
  state.vineyard = mem ? (vines.find((v) => v.id === mem.vineyard_id) || null) : null;
  if (state.vineyard) await kvSet(db, "activeVineyard", state.vineyard.id);
  const profile = data.profiles.find((p) => p.id === state.userId);
  if (profile) state.profile = profile;
  if (state.profile?.theme) applyTheme(state.profile.theme);
  state.year = seasonYear(tz());
  state.outbox = (await outboxItems(db)).length;
  state.lastSync = await kvGet(db, "lastSync");
  if (state.role === "manager" && state.vineyard) {
    state.costRows = (await kvGet(db, `cost:${state.vineyard.id}:${state.exportYear || state.year}`)) || [];
  } else {
    state.costRows = [];
  }
  await attachLocalPhotos();
}

async function attachLocalPhotos() {
  if (!db) return;
  for (const spray of state.data.sprays) {
    if (!spray.photo_path || state.photoUrls[spray.photo_path]) continue;
    const fileId = String(spray.photo_path).split("/").pop();
    const file = fileId ? await getFile(db, fileId) : null;
    if (file?.blob) state.photoUrls[spray.photo_path] = URL.createObjectURL(file.blob);
  }
}

async function ensureSeason() {
  if (!state.vineyard) return;
  const year = seasonYear(tz());
  state.year = year;
  const exists = state.data.seasons.some((s) => Number(s.season_year) === year && s.vineyard_id === state.vineyard.id);
  if (exists) return;
  save("season_notes", {
    vineyard_id: state.vineyard.id,
    season_year: year,
    archived_at: new Date().toISOString(),
  }, { paintNow: false });
}

function passTaskIds(passId) {
  return state.data.passTasks
    .filter((pt) => pt.pass_id === passId)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((pt) => pt.task_id);
}

function finishJob(job, { at, completion, rowEnd, reason, markProgress = true, paintNow = true }) {
  const result = closeOpenJob({
    job,
    at,
    completion: completion || null,
    rowEnd: rowEnd == null || rowEnd === "" ? null : Number(rowEnd),
    passTaskIds: job.pass_id ? passTaskIds(job.pass_id) : [],
    reason,
    markProgress,
  });
  for (const row of result.labor) save("labor_entries", row, { paintNow: false });
  const allow = state.role === "manager" || state.role === "developer";
  const merged = mergeProgress(state.data.rows, result.progress, { allowDowngrade: allow });
  for (const row of merged) save("row_progress", row, { paintNow: false });
  if (paintNow) paint();
}

function personLabel(userId) {
  return state.data.profiles.find((p) => p.id === userId)?.display_name || "That person";
}

function openCrew(crewJobId) {
  return state.data.labor.filter((row) => !row.deleted_at && row.entry_kind === "open" && !row.ended_at && (row.crew_job_id || row.id) === crewJobId);
}

function beginJob(next) {
  const open = openJobFor(state.data.labor, state.userId);
  if (open) {
    askSwitch(next);
    return;
  }
  const now = new Date().toISOString();
  const work = {
    vineyard_id: state.vineyard.id,
    work_date: vineyardToday(tz()),
    block_id: next.blockId || null,
    area_id: next.areaId || null,
    task_id: next.passId ? null : (next.taskId || null),
    pass_id: next.passId || null,
    row_start: next.rowStart == null ? null : Number(next.rowStart),
  };
  const sameWork = (row) => !row.deleted_at && row.entry_kind !== "pass_slice" && row.source !== "manual" && crewWorkKey(row) === crewWorkKey(work);
  const openSame = state.data.labor.find((row) => sameWork(row) && row.entry_kind === "open" && !row.ended_at);
  const closedSelf = state.data.labor.find((row) => sameWork(row) && row.user_id === state.userId && row.ended_at);
  let id;
  let crewJobId;
  if (openSame) {
    crewJobId = openSame.crew_job_id || openSame.id;
    id = openSame.user_id === state.userId ? openSame.id : (crewMemberEntryId(crewJobId, state.userId) || crypto.randomUUID());
  } else if (closedSelf) {
    id = crypto.randomUUID();
    crewJobId = id;
  } else {
    crewJobId = sharedCrewJobId(work);
    id = crewMemberEntryId(crewJobId, state.userId) || crypto.randomUUID();
  }
  save("labor_entries", {
    id,
    vineyard_id: state.vineyard.id,
    user_id: state.userId,
    logged_by: state.userId,
    season_year: seasonYear(tz()),
    work_date: vineyardToday(tz()),
    block_id: next.blockId || null,
    area_id: next.areaId || null,
    task_id: next.passId ? null : (next.taskId || null),
    pass_id: next.passId || null,
    pass_group_id: null,
    crew_job_id: crewJobId,
    entry_kind: "open",
    row_start: next.rowStart == null ? null : Number(next.rowStart),
    row_end: null,
    row_status: null,
    started_at: now,
    ended_at: null,
    pause_seconds: 0,
    paused_at: null,
    hours: null,
    close_reason: null,
    source: "taps",
    notes: "",
    deleted_at: null,
  }, { paintNow: false });
  state.flow = { step: "place", crew: {} };
  state.notice = "";
  if ((location.hash || "#/") !== "#/") location.hash = "#/";
  else paint();
}

function askSwitch(next) {
  state.flow = { ...(state.flow || { crew: {} }), after: next };
  state.modal = { type: "switch" };
  paint();
}

function autoclose() {
  if (!state.vineyard || !state.userId) return;
  const due = jobsToAutoclose(state.data.labor, new Date(), tz(), state.vineyard.eod_time || "14:25");
  if (!due.length) return;
  for (const item of due) {
    finishJob(item.job, {
      at: item.at,
      completion: item.job.row_start ? "partial" : null,
      rowEnd: item.job.row_start,
      reason: "eod",
      paintNow: false,
    });
  }
  state.notice = "An open clock was stopped at the end of the day.";
  paint();
}

function lunch() {
  const job = openJobFor(state.data.labor, state.userId);
  if (!job) return;
  const next = { ...job };
  if (next.paused_at) {
    const extra = Math.round((Date.now() - new Date(next.paused_at).getTime()) / 1000);
    next.pause_seconds = Number(next.pause_seconds || 0) + Math.max(0, extra);
    next.paused_at = null;
  } else {
    next.paused_at = new Date().toISOString();
  }
  save("labor_entries", next);
}

function complete(status) {
  const mine = openJobFor(state.data.labor, state.userId);
  const crewJobId = state.flow?.finishJobId || (mine ? (mine.crew_job_id || mine.id) : null);
  const members = crewJobId ? openCrew(crewJobId) : [];
  const job = members[0];
  if (!job) {
    location.hash = "#/";
    return;
  }
  if (job.block_id && !state.flow?.rowEnd) {
    state.notice = "Tap the last row you finished.";
    paint();
    return;
  }
  const at = new Date().toISOString();
  const rowEnd = job.block_id ? state.flow.rowEnd : null;
  members.forEach((member, index) => {
    finishJob(member, {
      at,
      completion: status || null,
      rowEnd,
      reason: "tap",
      markProgress: index === 0,
      paintNow: false,
    });
  });
  state.flow = { step: "place", crew: {} };
  state.modal = null;
  state.pendingNotice = members.length > 1 ? "The job is finished. Each person kept their own time." : "";
  if ((location.hash || "#/") !== "#/") location.hash = "#/";
  else {
    state.notice = state.pendingNotice;
    state.pendingNotice = "";
    paint();
  }
}

function addCrew(crewJobId, userId) {
  const anchor = state.data.labor.find((row) => !row.deleted_at && row.entry_kind !== "pass_slice" && (row.crew_job_id || row.id) === crewJobId);
  if (!anchor || !userId) return;
  const name = personLabel(userId);
  if (openJobFor(state.data.labor, userId)) {
    state.notice = `${name} is already clocked in.`;
    paint();
    return;
  }
  const prior = state.data.labor.find((row) => !row.deleted_at && row.entry_kind !== "pass_slice" && row.crew_job_id === (anchor.crew_job_id || anchor.id) && row.user_id === userId);
  if (prior) {
    state.notice = `${name} already has time on this job.`;
    paint();
    return;
  }
  const now = new Date().toISOString();
  const id = crewMemberEntryId(anchor.crew_job_id || anchor.id, userId) || crypto.randomUUID();
  save("labor_entries", {
    id,
    vineyard_id: anchor.vineyard_id,
    user_id: userId,
    logged_by: state.userId,
    season_year: seasonYear(tz()),
    work_date: vineyardToday(tz()),
    block_id: anchor.block_id || null,
    area_id: anchor.area_id || null,
    task_id: anchor.task_id || null,
    pass_id: anchor.pass_id || null,
    pass_group_id: null,
    crew_job_id: anchor.crew_job_id || anchor.id,
    entry_kind: "open",
    row_start: anchor.row_start == null ? null : Number(anchor.row_start),
    row_end: null,
    row_status: null,
    started_at: now,
    ended_at: null,
    pause_seconds: 0,
    paused_at: null,
    hours: null,
    close_reason: null,
    source: userId === state.userId ? "taps" : "crew",
    notes: "",
    deleted_at: null,
  }, { paintNow: false });
  state.notice = `${name} joined. Their clock starts now.`;
  paint();
}

function stopMember(entryId, { paintNow = true } = {}) {
  const job = state.data.labor.find((row) => row.id === entryId && row.entry_kind === "open" && !row.deleted_at && !row.ended_at);
  if (!job) return null;
  const name = personLabel(job.user_id);
  finishJob(job, {
    at: new Date().toISOString(),
    completion: null,
    rowEnd: null,
    reason: "leave",
    markProgress: false,
    paintNow: false,
  });
  const text = `${name} is off the job. Their time stopped.`;
  if (paintNow) {
    state.notice = text;
    paint();
  } else state.pendingNotice = text;
  return job;
}

function leaveCrew(entryId) {
  stopMember(entryId);
}

function onTaskRow(row) {
  const [blockId, taskId] = String(state.param || "").split("/");
  const open = openJobFor(state.data.labor, state.userId);
  const shared = state.data.labor.find((entry) => !entry.deleted_at && entry.entry_kind === "open" && !entry.ended_at && entry.block_id === blockId && entry.task_id === taskId && !entry.pass_id);
  if (shared && (!open || (open.block_id === blockId && open.task_id === taskId && !open.pass_id))) {
    state.flow = { ...(state.flow || {}), rowEnd: row, finishJobId: shared.crew_job_id || shared.id };
    location.hash = "#/finish";
    return;
  }
  const next = { blockId, areaId: null, taskId, passId: null, rowStart: row };
  if (open) askSwitch(next);
  else beginJob(next);
}

function pickWork(kind, id) {
  if (kind === "pass") {
    state.flow.passId = id;
    state.flow.taskId = null;
  } else {
    state.flow.taskId = id;
    state.flow.passId = null;
  }
  if (state.flow.blockId) {
    state.flow.step = "row";
    paint();
    return;
  }
  const next = {
    blockId: null,
    areaId: state.flow.areaId || null,
    taskId: state.flow.taskId || null,
    passId: state.flow.passId || null,
    rowStart: null,
  };
  if (openJobFor(state.data.labor, state.userId)) askSwitch(next);
  else beginJob(next);
}

function addTask(label) {
  const text = String(label || "").trim();
  if (!text) return;
  let slug = slugify(text);
  if (state.data.tasks.some((t) => t.slug === slug)) slug = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
  const sort = state.data.tasks.reduce((max, t) => Math.max(max, Number(t.sort_order) || 0), 0) + 1;
  save("tasks", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    slug,
    label: text.slice(0, 80),
    sort_order: sort,
    archived: false,
    deleted_at: null,
  });
  state.notice = "Task added.";
  paint();
}

function markRest(blockId, taskId) {
  if (!lead()) return;
  const block = state.data.blocks.find((b) => b.id === blockId);
  if (!block) return;
  const now = new Date().toISOString();
  const drafts = [];
  for (let n = 1; n <= block.row_count; n++) {
    if (rowStatus(state.data.rows, state.year, blockId, taskId, n) === "complete") continue;
    drafts.push({
      id: crypto.randomUUID(),
      vineyard_id: state.vineyard.id,
      season_year: state.year,
      block_id: blockId,
      task_id: taskId,
      row_number: n,
      status: "complete",
      updated_by: state.userId,
      client_updated_at: now,
    });
  }
  const merged = mergeProgress(state.data.rows, drafts, { allowDowngrade: false });
  for (const row of merged) save("row_progress", row, { paintNow: false });
  state.notice = "Remaining rows are marked complete. No hours were added.";
  paint();
}

function removeAsked(table, id) {
  const now = new Date().toISOString();
  if (table === "tasks" || table === "blocks" || table === "passes") {
    if (!lead()) return;
    const row = state.data[KEY_BY_TABLE[table]].find((r) => r.id === id);
    if (!row) return;
    save(table, { ...row, archived: !row.archived });
    return;
  }
  if (table === "labor_entries") {
    const entry = state.data.labor.find((r) => r.id === id);
    if (!entry || !canEditLabor(entry, editCtx())) {
      state.notice = "That day is closed. A manager can still change it.";
      paint();
      return;
    }
    const rows = entry.pass_group_id
      ? state.data.labor.filter((r) => r.pass_group_id === entry.pass_group_id && r.user_id === entry.user_id && !r.deleted_at)
      : [entry];
    for (const row of rows) save("labor_entries", { ...row, deleted_at: now }, { paintNow: false });
    state.edit = {};
    paint();
    return;
  }
  const soft = {
    watering_logs: "watering",
    weed_logs: "weeds",
    spray_logs: "sprays",
    harvest_samples: "samples",
    invites: "invites",
    variety_quotes: "quotes",
    wine_facts: "facts",
    variety_notes: "notes",
  };
  if (table === "invites" && !lead()) return;
  if ((table === "variety_quotes" || table === "wine_facts" || table === "variety_notes") && !lead()) return;
  const key = soft[table];
  const row = key ? state.data[key].find((r) => r.id === id) : null;
  if (!row) return;
  save(table, { ...row, deleted_at: now });
}

function confirmText(table, id) {
  if (table === "tasks") {
    const row = state.data.tasks.find((t) => t.id === id);
    return row?.archived ? "Put this task back on the list?" : "Archive this task? Hours already logged stay in the reports.";
  }
  if (table === "blocks") {
    const row = state.data.blocks.find((b) => b.id === id);
    return row?.archived ? "Put this block back?" : "Archive this block? It leaves the home screen. Old records stay.";
  }
  if (table === "passes") return "Archive this pass? Hours already logged stay in the reports.";
  if (table === "labor_entries") return "Remove this time entry?";
  if (table === "invites") return "Remove this person from the waiting list?";
  if (table === "variety_quotes") return "Remove this quote?";
  if (table === "wine_facts") return "Remove this fact?";
  if (table === "variety_notes") return "Remove this variety note?";
  return "Remove this?";
}

function currentSpray() {
  const kind = state.tab === "herbicide" ? "herbicide" : "foliar";
  const list = state.data.sprays
    .filter((s) => !s.deleted_at && s.block_id === state.param && s.kind === kind && s.season_year === state.year)
    .sort((a, b) => String(b.spray_date).localeCompare(String(a.spray_date)));
  return list.find((s) => s.id === state.sprayId) || list[0] || null;
}

function clockFace(iso) {
  if (!iso) return "";
  const parts = zonedParts(new Date(iso), tz());
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function parseHash() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const query = new URLSearchParams(qs || "");
  const head = parts[0] || "home";
  if (head === "block" && parts[1]) return { route: "block", param: parts[1], editId: null };
  if (head === "task" && parts[2]) return { route: "task", param: `${parts[1]}/${parts[2]}`, editId: null };
  if (head === "parts") return { route: "parts", param: parts[1] || "", editId: null };
  if (head === "learn" && parts[1]) return { route: "learn", param: parts[1], editId: null };
  const known = ["work", "finish", "export", "more", "hours", "manual", "crew", "passes", "setup", "contractors", "maintenance", "settings", "bug", "bugs", "managers"];
  if (!parts.length) return { route: "home", param: "", editId: null };
  if (known.includes(head)) return { route: head, param: "", editId: head === "manual" ? query.get("edit") : null };
  return { route: "home", param: "", editId: null };
}

function applyRoute() {
  const parsed = parseHash();
  if (parsed.route === "work" && state.route !== "work") state.flow = { step: "place", crew: {} };
  if (parsed.route === "block" && parsed.param !== state.param) {
    state.tab = "tasks";
    state.sprayId = null;
  }
  if (parsed.route === "parts" && (state.route !== "parts" || parsed.param !== state.param)) {
    const gear = state.data.equipment.find((row) => row.id === parsed.param);
    state.partQuery = gear && needsModel(gear) ? "" : machineQuery(gear);
    state.partRecent = loadPartRecent(parsed.param);
  }
  state.route = parsed.route;
  state.param = parsed.param;
  if (parsed.route === "manual") {
    const entry = parsed.editId ? state.data.labor.find((r) => r.id === parsed.editId) : null;
    state.edit = entry ? { ...entry, start: clockFace(entry.started_at), end: clockFace(entry.ended_at) } : {};
  }
}

function back() {
  if (state.route === "work" && state.flow?.step === "row") {
    state.flow.step = "task";
    paint();
    return;
  }
  if (state.route === "work" && state.flow?.step === "task") {
    state.flow = { step: "place", crew: {} };
    paint();
    return;
  }
  if (history.length > 1) history.back();
  else location.hash = "#/";
}

async function shareReport(kind, id) {
  const report = state.reports?.[id];
  if (!report) return;
  try {
    if (kind === "csv") {
      const file = new File([report.csv], report.name, { type: "text/csv" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: report.title });
        return;
      }
      download(report.csv, report.name, "text/csv");
      return;
    }
    if (kind === "text") {
      if (navigator.share) {
        await navigator.share({ title: report.title, text: report.text });
        return;
      }
      download(report.text, report.name.replace(/\.csv$/, ".txt"), "text/plain");
      return;
    }
    await navigator.clipboard.writeText(report.text);
    state.notice = "Copied.";
    paint();
  } catch (error) {
    if (error?.name === "AbortError") return;
    download(kind === "csv" ? report.csv : report.text, kind === "csv" ? report.name : report.name.replace(/\.csv$/, ".txt"), kind === "csv" ? "text/csv" : "text/plain");
  }
}

function download(text, name, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function diagnostics() {
  const open = state.data.labor.filter((r) => r.user_id === state.userId && r.entry_kind === "open" && !r.deleted_at && !r.ended_at);
  return {
    version: APP_VERSION,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    role: state.role,
    vineyardId: state.vineyard?.id || null,
    route: `${state.route}${state.param ? `/${state.param}` : ""}`,
    outbox: state.outbox,
    lastSync: state.lastSync,
    syncError: state.syncError || "",
    openJobIds: open.map((r) => r.id),
    errors: errors.slice(-20),
  };
}

function onClick(event) {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "crew" || act === "year") return;
  if (act === "back") back();
  else if (act === "go") location.hash = el.dataset.href;
  else if (act === "lunch") lunch();
  else if (act === "pick-place") {
    state.flow = {
      step: "task",
      crew: {},
      blockId: el.dataset.kind === "block" ? el.dataset.id : null,
      areaId: el.dataset.kind === "area" ? el.dataset.id : null,
    };
    paint();
  } else if (act === "pick-task") pickWork("task", el.dataset.id);
  else if (act === "pick-pass") pickWork("pass", el.dataset.id);
  else if (act === "pick-start-row") {
    const next = {
      blockId: state.flow.blockId,
      areaId: null,
      taskId: state.flow.passId ? null : state.flow.taskId,
      passId: state.flow.passId || null,
      rowStart: Number(el.dataset.row),
    };
    if (openJobFor(state.data.labor, state.userId)) askSwitch(next);
    else beginJob(next);
  } else if (act === "pick-end-row") {
    state.flow = { ...(state.flow || {}), rowEnd: Number(el.dataset.row) };
    state.notice = "";
    paint();
  } else if (act === "task-row") onTaskRow(Number(el.dataset.row));
  else if (act === "complete") complete(el.dataset.status || "");
  else if (act === "crew-add") addCrew(el.dataset.job, el.dataset.user);
  else if (act === "crew-off") leaveCrew(el.dataset.id);
  else if (act === "switch-task") {
    if (!openJobFor(state.data.labor, state.userId)) return;
    state.modal = { type: "switch-task" };
    paint();
  } else if (act === "confirm-switch-task") {
    const mine = openJobFor(state.data.labor, state.userId);
    state.modal = null;
    if (mine) stopMember(mine.id, { paintNow: false });
    else state.pendingNotice = "";
    state.flow = { step: "place", crew: {} };
    const here = location.hash || "#/";
    if (here !== "#/work") location.hash = "#/work";
    else {
      state.notice = state.pendingNotice || "";
      state.pendingNotice = "";
      paint();
    }
  } else if (act === "crew-done") {
    state.flow = { ...(state.flow || {}), finishJobId: el.dataset.job, rowEnd: null };
    location.hash = "#/finish";
  } else if (act === "close-then-switch") {
    const mine = openJobFor(state.data.labor, state.userId);
    const next = state.flow?.after || null;
    state.modal = null;
    if (mine) {
      finishJob(mine, {
        at: new Date().toISOString(),
        completion: null,
        rowEnd: null,
        reason: "switch",
        markProgress: false,
        paintNow: false,
      });
    }
    state.flow = { step: "place", crew: {} };
    if (next) beginJob(next);
    else paint();
  } else if (act === "dismiss") {
    state.modal = null;
    if (state.flow) state.flow.after = null;
    paint();
  } else if (act === "import-legacy") importLegacy();
  else if (act === "skip-legacy") {
    try { localStorage.setItem(LEGACY_FLAG_KEY, "skip"); } catch { /* keep going */ }
    state.modal = null;
    maybeTour();
    paint();
  } else if (act === "confirm-yes") {
    const modal = state.modal;
    state.modal = null;
    if (modal?.action === "mark-rest") markRest(modal.block, modal.task);
    else if (modal?.action === "delete") removeAsked(modal.table, modal.id);
    else paint();
  } else if (act === "ask-delete") {
    state.modal = { type: "confirm", text: confirmText(el.dataset.table, el.dataset.id), action: "delete", table: el.dataset.table, id: el.dataset.id };
    paint();
  } else if (act === "mark-rest") {
    state.modal = { type: "confirm", text: "Mark every unfinished row complete? This does not add hours.", action: "mark-rest", block: el.dataset.block, task: el.dataset.task };
    paint();
  }   else if (act === "tab") {
    state.tab = el.dataset.id;
    state.sprayId = null;
    paint();
    if (el.dataset.id === "water" || el.dataset.id === "foliar" || el.dataset.id === "herbicide") refreshWeather();
  } else if (act === "heat-notify") allowHeatNotes();
  else if (act === "select-spray") {
    state.sprayId = el.dataset.id;
    paint();
  } else if (act === "spray-row") toggleSprayRow(Number(el.dataset.row));
  else if (act === "share-csv") shareReport("csv", el.dataset.id);
  else if (act === "share-text") shareReport("text", el.dataset.id);
  else if (act === "copy-text") shareReport("copy", el.dataset.id);
  else if (act === "labor-mode") {
    state.laborMode = el.dataset.id;
    paint();
  } else if (act === "set-role") setRole(el.dataset.id, el.dataset.role);
  else if (act === "decide-manager") decideManager(el.dataset.id, el.dataset.approve === "yes");
  else if (act === "rename-task") renameTask(el.dataset.id);
  else if (act === "theme") {
    applyTheme(el.dataset.id);
    const profile = {
      ...(state.profile || { id: state.userId, display_name: state.session?.user?.email?.split("@")[0] || "Crew" }),
      theme: el.dataset.id,
    };
    state.profile = profile;
    save("profiles", profile);
  } else if (act === "sign-out") signOut();
  else if (act === "auth-mode") {
    state.authMode = state.authMode === "up" ? "in" : "up";
    state.notice = "";
    paint();
  } else if (act === "forgot") forgotPassword();
  else if (act === "check-again") checkAgain();
  else if (act === "install") state.installEvent?.prompt();
  else if (act === "tour-next") advanceTour();
  else if (act === "tour-skip") finishTour();
  else if (act === "edit-quote") {
    state.quoteEdit = el.dataset.id;
    paint();
  } else if (act === "edit-fact") {
    state.factEdit = el.dataset.id;
    paint();
  } else if (act === "part-chip") {
    const gear = state.data.equipment.find((row) => row.id === state.param);
    const machine = gear && !needsModel(gear) ? machineQuery(gear) : "";
    state.partQuery = [machine, el.dataset.q].filter(Boolean).join(" ");
    paint();
  } else if (act === "open-part") {
    if (state.online === false) {
      state.notice = "Find parts needs a connection.";
      paint();
      return;
    }
    const query = document.querySelector("#parts-q")?.value.trim() || state.partQuery || "";
    const partNumber = document.querySelector("#parts-number")?.value.trim() || "";
    const url = partSearchUrl(el.dataset.site, query);
    if (!url) return;
    state.partQuery = query;
    rememberPart(state.param, { query, partNumber });
    window.open(url, "_blank", "noopener");
  } else if (act === "replay-tour") {
    state.tour = { step: 0, moved: true };
    paint();
  }
}

function onChange(event) {
  const el = event.target.closest?.("[data-act]");
  if (!el) return;
  if (el.dataset.act === "year") {
    const year = Number(el.value);
    if (year >= 2000 && year <= 2100) {
      state.exportYear = year;
      loadExportCost(year).finally(() => paint());
    }
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const fd = new FormData(form);
  const id = form.id;
  if (id === "signin-form") return signIn(fd);
  if (id === "signup-form") return signUp(fd);
  if (id === "add-task") return addTask(fd.get("label"));
  if (id === "add-water") return saveLog("watering_logs", fd);
  if (id === "add-weed") return saveLog("weed_logs", fd);
  if (id === "spray-form") return saveSpray(form, fd);
  if (id === "sample-form") return saveSample(fd);
  if (id === "block-meta") return saveBlockMeta(fd);
  if (id === "manual-form") return saveManual(fd);
  if (id === "invite-form") return saveInvite(fd);
  if (id === "wage-form") return saveWage(form, fd);
  if (id === "pass-form") return savePass(fd);
  if (id === "add-block") return saveNewBlock(fd);
  if (id === "add-area") return saveArea(fd);
  if (id === "add-chemical") return saveChemical(fd);
  if (id === "contractor-form") return saveContractor(fd);
  if (id === "equip-form") return saveEquip(fd);
  if (id === "equip-model") return saveEquipModel(fd);
  if (id === "quote-form") return saveQuote(fd);
  if (id === "fact-form") return saveFact(fd);
  if (id === "note-form") return saveNote(fd);
  if (id === "parts-query") return savePartNumber(fd);
  if (id === "service-form") return saveService(fd);
  if (id === "type-form") return saveServiceType(fd);
  if (id === "name-form") return saveName(fd);
  if (id === "eod-form") return saveEod(fd);
  if (id === "weather-form") return saveWeatherPlace(fd);
  if (id === "bug-form") return saveBug(fd);
}

function saveLog(table, fd) {
  const hours = Number(fd.get("hours"));
  if (!Number.isFinite(hours) || hours < 0) {
    state.notice = "Type the hours as a number.";
    paint();
    return;
  }
  const key = table === "watering_logs" ? "watering" : "weeds";
  save(table, {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    season_year: state.year,
    block_id: state.param,
    log_date: fd.get("date"),
    hours,
    notes: String(fd.get("notes") || ""),
    created_by: state.userId,
    deleted_at: null,
  });
  state.notice = "Saved.";
  void key;
}

function saveSample(fd) {
  save("harvest_samples", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    season_year: state.year,
    block_id: state.param.split("/")[0],
    sample_date: fd.get("date"),
    rows_sampled: String(fd.get("rows") || ""),
    brix: String(fd.get("brix") || ""),
    ph: String(fd.get("ph") || ""),
    ta: String(fd.get("ta") || ""),
    notes: String(fd.get("notes") || ""),
    created_by: state.userId,
    deleted_at: null,
  });
  state.notice = "Sample saved.";
}

function saveBlockMeta(fd) {
  if (!lead()) return;
  const block = state.data.blocks.find((b) => b.id === state.param);
  if (!block) return;
  const rows = Number(fd.get("rows"));
  if (!Number.isFinite(rows) || rows < 1 || rows > 500) {
    state.notice = "Row count has to be between 1 and 500.";
    paint();
    return;
  }
  const plants = String(fd.get("plants") ?? "").trim();
  save("blocks", {
    ...block,
    variety: String(fd.get("variety") || "").trim(),
    row_count: rows,
    plant_count: plants === "" ? null : Number(plants),
  });
  state.notice = "Block saved.";
}

function saveManual(fd) {
  const original = state.edit?.id ? state.data.labor.find((r) => r.id === state.edit.id) : null;
  if (original && (original.entry_kind === "pass_total" || original.entry_kind === "pass_slice")) {
    state.notice = "A combined pass has to be removed as a whole. Use Remove this entry.";
    paint();
    return;
  }
  if (original && !canEditLabor(original, editCtx())) {
    state.notice = "That day is closed. A manager can still change it.";
    paint();
    return;
  }
  const place = String(fd.get("place") || "");
  const workDate = String(fd.get("date") || "");
  const taskId = String(fd.get("task_id") || "");
  const start = String(fd.get("start") || "");
  const end = String(fd.get("end") || "");
  const hoursText = String(fd.get("hours") || "").trim();
  let startedAt;
  let endedAt;
  if (start && end) {
    startedAt = combineDateAndTime(workDate, start, tz());
    endedAt = combineDateAndTime(workDate, end, tz());
    if (new Date(endedAt) <= new Date(startedAt)) endedAt = addHours(endedAt, 24);
  } else if (hoursText) {
    startedAt = combineDateAndTime(workDate, "08:00", tz());
    endedAt = addHours(startedAt, Number(hoursText));
  } else {
    state.notice = "Enter a start and end, or just the hours.";
    paint();
    return;
  }
  const entry = buildManualEntry({
    id: original?.id || crypto.randomUUID(),
    vineyardId: state.vineyard.id,
    userId: original?.user_id || state.userId,
    season: Number(workDate.slice(0, 4)) || state.year,
    workDate,
    blockId: place.startsWith("block:") ? place.slice(6) : null,
    areaId: place.startsWith("area:") ? place.slice(5) : null,
    taskId,
    startedAt,
    endedAt,
    notes: String(fd.get("notes") || ""),
  });
  if (original?.logged_by) entry.logged_by = original.logged_by;
  if (!canEditLabor(entry, editCtx())) {
    state.notice = "That day is closed. A manager can still change it.";
    paint();
    return;
  }
  save("labor_entries", entry);
  state.notice = "Hours saved.";
  location.hash = "#/hours";
}

function saveInvite(fd) {
  if (!lead()) return;
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const invite = {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    email,
    display_name: String(fd.get("display_name") || "").trim(),
    role: fd.get("role") === "manager" ? "manager" : "employee",
    invited_by: state.userId,
    accepted_at: null,
    accepted_user_id: null,
    deleted_at: null,
  };
  save("invites", invite, { paintNow: false });
  const wage = String(fd.get("wage") || "").trim();
  if (state.role === "manager" && wage) {
    save("invite_wages", {
      invite_id: invite.id,
      vineyard_id: state.vineyard.id,
      hourly_rate: Number(wage),
    }, { paintNow: false });
  }
  state.notice = "Added. They create an account with that same email.";
  paint();
}

function saveWage(form, fd) {
  if (state.role !== "manager") return;
  const userId = form.dataset.user;
  const rate = Number(fd.get("hourly_rate"));
  if (!Number.isFinite(rate) || rate < 0) {
    state.notice = "Type the hourly wage as a number.";
    paint();
    return;
  }
  const effective = String(fd.get("effective_from") || vineyardToday(tz()));
  const existing = state.data.wages.find((w) => w.user_id === userId && String(w.effective_from).slice(0, 10) === effective);
  save("wage_rates", existing ? { ...existing, hourly_rate: rate, effective_from: effective } : {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    user_id: userId,
    hourly_rate: rate,
    effective_from: effective,
    created_by: state.userId,
  });
  state.notice = "Wage saved.";
}

function savePass(fd) {
  if (!lead()) return;
  const name = String(fd.get("name") || "").trim();
  const taskIds = fd.getAll("task").filter(Boolean);
  if (taskIds.length < 2) {
    state.notice = "Pick at least two tasks for a pass.";
    paint();
    return;
  }
  const passId = crypto.randomUUID();
  save("passes", {
    id: passId,
    vineyard_id: state.vineyard.id,
    name,
    archived: false,
    deleted_at: null,
  }, { paintNow: false });
  taskIds.forEach((taskId, index) => {
    save("pass_tasks", {
      id: crypto.randomUUID(),
      vineyard_id: state.vineyard.id,
      pass_id: passId,
      task_id: taskId,
      sort_order: index,
    }, { paintNow: false });
  });
  state.notice = "Pass saved.";
  paint();
}

function saveNewBlock(fd) {
  if (!lead()) return;
  const rows = Number(fd.get("rows") || 40);
  save("blocks", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    name: String(fd.get("name") || "").trim(),
    variety: "",
    row_count: Math.min(500, Math.max(1, rows)),
    plant_count: null,
    sort_order: state.data.blocks.length + 1,
    archived: false,
    deleted_at: null,
  });
}

function saveArea(fd) {
  if (!lead()) return;
  save("areas", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    name: String(fd.get("name") || "").trim(),
    kind: "non_field",
    is_system: false,
    sort_order: state.data.areas.length + 1,
    archived: false,
    deleted_at: null,
  });
}

function saveChemical(fd) {
  if (!lead()) return;
  save("chemicals", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    name: String(fd.get("name") || "").trim(),
    category: String(fd.get("category") || "other"),
    sds_url: String(fd.get("sds_url") || "").trim(),
    is_system: false,
    sort_order: state.data.chemicals.length + 1,
    archived: false,
    deleted_at: null,
  });
}

function saveContractor(fd) {
  if (!lead()) return;
  const id = crypto.randomUUID();
  const hoursText = String(fd.get("hours") || "").trim();
  save("contractors", {
    id,
    vineyard_id: state.vineyard.id,
    season_year: state.year,
    person_name: String(fd.get("person_name") || "").trim(),
    company: String(fd.get("company") || "").trim(),
    description: String(fd.get("description") || "").trim(),
    work_date: fd.get("date"),
    hours: hoursText === "" ? null : Number(hoursText),
    task_id: fd.get("task_id") || null,
    block_id: null,
    area_id: null,
    created_by: state.userId,
    deleted_at: null,
  }, { paintNow: false });
  const amount = String(fd.get("amount") || "").trim();
  if (state.role === "manager" && amount !== "") {
    save("contractor_costs", {
      entry_id: id,
      vineyard_id: state.vineyard.id,
      amount: Number(amount),
    }, { paintNow: false });
  }
  state.notice = "Contractor saved.";
  paint();
}

function equipmentFields(fd, prior = {}) {
  const make = String(fd.get("make") ?? prior.make ?? "").trim();
  const model = String(fd.get("model") ?? prior.model ?? "").trim();
  const serial = String(fd.get("serial") ?? prior.serial ?? "").trim();
  const raw = fd.get("year");
  let year = prior.year ?? null;
  if (raw !== null && raw !== undefined) {
    const text = String(raw).trim();
    if (text === "") year = null;
    else {
      const n = Number(text);
      if (!Number.isInteger(n) || n < 1900 || n > 2100) return { error: "Year should be between 1900 and 2100." };
      year = n;
    }
  }
  return { make, model, serial, year };
}

function saveEquip(fd) {
  const fields = equipmentFields(fd);
  if (fields.error) {
    state.notice = fields.error;
    paint();
    return;
  }
  save("equipment", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    name: String(fd.get("name") || "").trim(),
    notes: String(fd.get("notes") || ""),
    make: fields.make,
    model: fields.model,
    serial: fields.serial,
    year: fields.year,
    archived: false,
    deleted_at: null,
  });
  state.notice = "Equipment saved.";
}

function saveEquipModel(fd) {
  const gear = state.data.equipment.find((row) => row.id === state.param);
  if (!gear) return;
  const fields = equipmentFields(fd, gear);
  if (fields.error) {
    state.notice = fields.error;
    paint();
    return;
  }
  if (!fields.model) {
    state.notice = "Type the model.";
    paint();
    return;
  }
  const next = { ...gear, ...fields };
  save("equipment", next, { paintNow: false });
  state.partQuery = machineQuery(next);
  state.notice = "Model saved.";
  paint();
}

function saveQuote(fd) {
  if (!lead()) return;
  const text = String(fd.get("text") || "").trim();
  const author = String(fd.get("author") || "").trim();
  const source = String(fd.get("source") || "").trim();
  const variety = String(fd.get("variety") || "").trim();
  if (text.length < 8 || author.length < 2 || source.length < 8) {
    state.notice = "A quote needs the words, who said them, and the book or article.";
    paint();
    return;
  }
  const existing = state.quoteEdit ? (state.data.quotes || []).find((row) => row.id === state.quoteEdit) : null;
  save("variety_quotes", {
    id: existing?.id || crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    variety,
    text,
    author,
    source,
    archived: false,
    deleted_at: null,
  });
  state.quoteEdit = null;
  state.notice = "Quote saved.";
}

function saveFact(fd) {
  if (!lead()) return;
  const text = String(fd.get("text") || "").trim();
  const source = String(fd.get("source") || "").trim();
  if (text.length < 12 || text.length > 420 || source.length < 8 || source.length > 320) {
    state.notice = "A fact needs the sentence and where it came from.";
    paint();
    return;
  }
  const existing = state.factEdit ? (state.data.facts || []).find((row) => row.id === state.factEdit) : null;
  save("wine_facts", {
    id: existing?.id || crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    text,
    source,
    archived: false,
    deleted_at: null,
  });
  state.factEdit = null;
  state.notice = "Fact saved.";
}

function saveNote(fd) {
  if (!lead()) return;
  const variety = String(fd.get("variety") || "").trim();
  if (variety.length < 1 || variety.length > 80) {
    state.notice = "Type the variety name.";
    paint();
    return;
  }
  const fields = {};
  for (const [key] of NOTE_FIELDS) {
    const value = String(fd.get(key) || "").trim();
    if (value.length > 800) {
      state.notice = "Each section can be 800 characters.";
      paint();
      return;
    }
    fields[key] = value;
  }
  const sources = String(fd.get("sources") || "").trim();
  if (sources.length > 500) {
    state.notice = "The sources line can be 500 characters.";
    paint();
    return;
  }
  const block = state.data.blocks.find((row) => row.id === state.param);
  const current = noteForVariety(state.data.notes, block?.variety || variety);
  const same = current && varietyFull(current.variety) === varietyFull(variety) ? current : null;
  save("variety_notes", {
    id: same?.id || crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    variety,
    needs_research: fd.get("needs_research") != null,
    ...fields,
    sources,
    archived: false,
    deleted_at: null,
  });
  state.notice = "Note saved.";
}

function savePartNumber(fd) {
  const query = String(fd.get("q") || state.partQuery || "").trim();
  const partNumber = String(fd.get("part_number") || "").trim();
  if (!partNumber && !query) return;
  state.partQuery = query;
  rememberPart(state.param, { query, partNumber });
  state.notice = partNumber ? "Part number saved on this phone." : "Search saved on this phone.";
  paint();
}

function loadPartRecent(id) {
  try {
    const bag = JSON.parse(localStorage.getItem("daranch-parts") || "{}");
    return bag[id || "any"] || [];
  } catch {
    return [];
  }
}

function rememberPart(id, entry) {
  const key = id || "any";
  let bag = {};
  try { bag = JSON.parse(localStorage.getItem("daranch-parts") || "{}"); } catch { bag = {}; }
  bag[key] = pushPartRecent(bag[key] || [], entry);
  try { localStorage.setItem("daranch-parts", JSON.stringify(bag)); } catch { /* still show it this session */ }
  state.partRecent = bag[key];
}

function saveService(fd) {
  save("service_logs", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    equipment_id: fd.get("equipment_id") || null,
    service_type: String(fd.get("service_type") || ""),
    log_date: fd.get("date") || vineyardToday(tz()),
    hours: String(fd.get("hours") || ""),
    notes: String(fd.get("notes") || ""),
    created_by: state.userId,
    deleted_at: null,
  });
  state.notice = "Service logged.";
}

function saveServiceType(fd) {
  save("service_types", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    name: String(fd.get("type") || "").trim(),
    sort_order: state.data.serviceTypes.length + 1,
    archived: false,
    deleted_at: null,
  });
}

function saveName(fd) {
  const displayName = String(fd.get("display_name") || "").trim();
  if (!displayName) return;
  save("profiles", {
    ...(state.profile || { id: state.userId }),
    id: state.userId,
    display_name: displayName.slice(0, 80),
    theme: state.profile?.theme || "sage",
  });
  state.notice = "Name saved.";
}

function saveEod(fd) {
  if (state.role !== "manager") return;
  const time = String(fd.get("eod_time") || "14:25").slice(0, 5);
  const days = Math.min(30, Math.max(0, Number(fd.get("edit_window_days") ?? 3)));
  save("vineyards", {
    ...state.vineyard,
    eod_time: `${time}:00`,
    edit_window_days: days,
  });
  state.notice = "End of day saved.";
}

function saveWeatherPlace(fd) {
  if (state.role !== "manager") return;
  const lat = Number(fd.get("latitude"));
  const lon = Number(fd.get("longitude"));
  const url = String(fd.get("weather_url") || "").trim();
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    state.notice = "Latitude and longitude need to be a real map point.";
    paint();
    return;
  }
  if (url && !/^https:\/\//i.test(url)) {
    state.notice = "The station link needs to start with https://.";
    paint();
    return;
  }
  save("vineyards", {
    ...state.vineyard,
    latitude: Math.round(lat * 10000) / 10000,
    longitude: Math.round(lon * 10000) / 10000,
    weather_url: url || DEFAULT_WEATHER_URL,
  });
  state.notice = "Weather location saved.";
  refreshWeather({ force: true });
}

function saveBug(fd) {
  const note = String(fd.get("note") || "").trim();
  if (!note) return;
  const id = crypto.randomUUID();
  save("bug_reports", {
    id,
    client_id: id,
    vineyard_id: state.vineyard.id,
    user_id: state.userId,
    note,
    diagnostics: diagnostics(),
    created_at: new Date().toISOString(),
  });
  state.notice = "Saved on this phone. It sends when there is Wi-Fi.";
}

async function saveSpray(form, fd) {
  const chemId = String(fd.get("chemical_id") || "");
  const typed = String(fd.get("chemical_name") || "").trim();
  const chem = state.data.chemicals.find((c) => c.id === chemId);
  const name = typed || chem?.name || "";
  if (!name) {
    state.notice = "Pick a chemical, or type its name.";
    paint();
    return;
  }
  const photo = fd.get("photo");
  const hasPhoto = photo && typeof photo === "object" && photo.size > 0;
  if (hasPhoto && photo.size > 10 * 1024 * 1024) {
    state.notice = "That photo is over 10 MB. Take a smaller one.";
    paint();
    return;
  }
  const sprayId = crypto.randomUUID();
  const fileId = hasPhoto ? crypto.randomUUID() : null;
  const photoPath = fileId ? `${state.vineyard.id}/${sprayId}/${fileId}` : null;
  save("spray_logs", {
    id: sprayId,
    vineyard_id: state.vineyard.id,
    season_year: state.year,
    block_id: state.param,
    kind: fd.get("kind") === "herbicide" ? "herbicide" : "foliar",
    spray_date: fd.get("date"),
    chemical_id: chemId || null,
    chemical_name: name,
    rate: String(fd.get("rate") || ""),
    volume: String(fd.get("volume") || ""),
    tank: String(fd.get("tank") || ""),
    notes: String(fd.get("notes") || ""),
    rec_number: String(fd.get("rec_number") || ""),
    photo_path: photoPath,
    rows_done: {},
    created_by: state.userId,
    deleted_at: null,
  }, { paintNow: false });
  state.sprayId = sprayId;
  if (hasPhoto) {
    state.photoUrls[photoPath] = URL.createObjectURL(photo);
    if (db && !state.demo) {
      try {
        await putFile(db, { id: fileId, blob: photo, type: photo.type || "image/jpeg" });
        await enqueue(db, {
          id: `photo:${sprayId}`,
          kind: "photo",
          fileId,
          vineyardId: state.vineyard.id,
          sprayId,
          table: "spray_logs",
          key: sprayId,
          at: new Date().toISOString(),
          attempts: 0,
        });
        scheduleSync();
      } catch (error) {
        pushError(error);
      }
    }
  }
  state.notice = "Spray pass logged.";
  form.reset();
  paint();
}

function toggleSprayRow(row) {
  const spray = currentSpray();
  if (!spray) return;
  const done = { ...(spray.rows_done || {}) };
  const key = String(row);
  if (done[key]) delete done[key];
  else done[key] = true;
  save("spray_logs", { ...spray, rows_done: done });
}

function setRole(id, role) {
  if (!lead()) return;
  if (role !== "employee" && role !== "manager") return;
  const row = state.data.members.find((m) => m.id === id);
  if (!row || row.role === "developer") {
    state.notice = "The developer login is changed from the setup SQL.";
    paint();
    return;
  }
  if (role === "employee") {
    if (row.role !== "manager") return;
    save("memberships", { ...row, role: "employee" });
    state.notice = "They are an employee.";
    return;
  }
  const pending = (state.data.managerRequests || []).some((r) => r.user_id === row.user_id && r.status === "pending" && r.vineyard_id === state.vineyard.id);
  if (pending || row.role === "manager") {
    state.notice = row.role === "manager" ? "They are already a manager." : "Aaron already has this request.";
    paint();
    return;
  }
  save("manager_requests", {
    id: crypto.randomUUID(),
    vineyard_id: state.vineyard.id,
    user_id: row.user_id,
    requested_by: state.userId,
    status: "pending",
    decided_at: null,
    decided_by: null,
  });
  state.notice = "Request sent. They stay an employee until Aaron approves.";
}

function decideManager(id, approve) {
  if (state.role !== "developer") return;
  const req = (state.data.managerRequests || []).find((r) => r.id === id && r.status === "pending");
  if (!req) return;
  if (state.demo || !client) {
    applyManagerDecision(req, approve);
    return;
  }
  if (navigator.onLine === false) {
    state.notice = "Approving a manager needs Wi-Fi.";
    paint();
    return;
  }
  client.rpc("decide_manager_request", { p_id: id, p_approve: approve }).then(({ error }) => {
    if (error) {
      state.notice = "That approval did not go through.";
      pushError(error);
      paint();
      return;
    }
    applyManagerDecision(req, approve);
    syncNow();
  }).catch((error) => {
    state.notice = "Approving a manager needs Wi-Fi.";
    pushError(error);
    paint();
  });
}

function applyManagerDecision(req, approve) {
  const now = new Date().toISOString();
  const updated = {
    ...req,
    status: approve ? "approved" : "rejected",
    decided_at: now,
    decided_by: state.userId,
    client_updated_at: now,
  };
  remember("manager_requests", updated);
  let member = null;
  if (approve) {
    member = state.data.members.find((m) => m.user_id === req.user_id && m.vineyard_id === req.vineyard_id && m.role === "employee");
    if (member) remember("memberships", { ...member, role: "manager", client_updated_at: now });
  }
  if (db && !state.demo) {
    putRecord(db, "manager_requests", updated).catch(pushError);
    if (member) putRecord(db, "memberships", { ...member, role: "manager", client_updated_at: now }).catch(pushError);
  }
  state.notice = approve ? "They are a manager." : "Request turned down. They stay an employee.";
  paint();
}

function renameTask(id) {
  if (!lead()) return;
  const task = state.data.tasks.find((t) => t.id === id);
  if (!task) return;
  const label = prompt("Task name", task.label);
  if (label == null) return;
  const text = label.trim();
  if (!text) return;
  save("tasks", { ...task, label: text.slice(0, 80) });
}

async function loadExportCost(year) {
  if (state.role !== "manager" || !state.vineyard) {
    state.costRows = [];
    return;
  }
  if (db) state.costRows = (await kvGet(db, `cost:${state.vineyard.id}:${year}`)) || state.costRows;
  if (!client || state.demo || !navigator.onLine) return;
  const { data, error } = await client.rpc("labor_cost_summary", { p_vineyard: state.vineyard.id, p_season: year });
  if (!error && data) {
    state.costRows = data;
    if (db) await kvSet(db, `cost:${state.vineyard.id}:${year}`, data);
  }
}

function tourKey() {
  return `${TOUR_SEEN_PREFIX}${state.userId || ""}`;
}

function tourSeenLocally() {
  try { return localStorage.getItem(tourKey()) === "1"; } catch { return false; }
}

function markTourSeen() {
  try { localStorage.setItem(tourKey(), "1"); } catch { /* private mode still hides it for this visit */ }
  const profile = {
    ...(state.profile || { id: state.userId, display_name: "Crew", theme: "sage" }),
    id: state.userId,
    tour_seen: true,
  };
  state.profile = profile;
  if (state.demo || !db) return;
  save("profiles", profile, { paintNow: false });
}

function maybeTour() {
  if (!state.session || !state.vineyard || !state.userId || state.modal) return;
  if (state.profile?.tour_seen) {
    try { localStorage.setItem(tourKey(), "1"); } catch { /* keep the profile flag */ }
  }
  const seen = Boolean(state.profile?.tour_seen) || tourSeenLocally();
  if (seen) {
    if (state.tour && !state.tour.moved) state.tour = null;
    return;
  }
  if (!state.tour) state.tour = { step: 0, moved: false };
}

function advanceTour() {
  if (!state.tour) return;
  const steps = tourSteps(state.role);
  const next = (state.tour.step || 0) + 1;
  if (next >= steps.length) {
    finishTour();
    return;
  }
  state.tour = { step: next, moved: true };
  paint();
}

function finishTour() {
  state.tour = null;
  markTourSeen();
  paint();
}

function maybeLegacy() {
  if (state.demo || !state.vineyard || state.modal) return;
  let flag = "";
  let raw = "";
  try {
    flag = localStorage.getItem(LEGACY_FLAG_KEY) || "";
    raw = localStorage.getItem(LEGACY_STORAGE_KEY) || "";
  } catch {
    return;
  }
  if (!raw || flag === "done" || flag === "skip") return;
  state.modal = { type: "legacy" };
  paint();
}

function importLegacy() {
  let raw = "";
  try { raw = localStorage.getItem(LEGACY_STORAGE_KEY) || ""; } catch { return; }
  let legacy = null;
  try { legacy = JSON.parse(raw); } catch {
    state.notice = "The old notes on this phone could not be read.";
    state.modal = null;
    paint();
    return;
  }
  const imported = legacyToRecords(legacy, {
    vineyardId: state.vineyard.id,
    userId: state.userId,
    existing: state.data,
  });
  const typeNames = new Set(state.data.serviceTypes.map((t) => String(t.name).toLowerCase()));
  const gearNames = new Set(state.data.equipment.map((e) => String(e.name).toLowerCase()));
  for (const row of imported.blocks) save("blocks", row, { paintNow: false });
  for (const row of imported.tasks) save("tasks", row, { paintNow: false });
  for (const row of imported.equipment) {
    if (!gearNames.has(String(row.name).toLowerCase())) save("equipment", row, { paintNow: false });
  }
  for (const row of imported.serviceTypes) {
    if (!typeNames.has(String(row.name).toLowerCase())) save("service_types", row, { paintNow: false });
  }
  for (const row of imported.serviceLogs) {
    if (row.equipment_id) save("service_logs", row, { paintNow: false });
  }
  for (const row of imported.sprays) save("spray_logs", row, { paintNow: false });
  for (const row of imported.watering) save("watering_logs", row, { paintNow: false });
  for (const row of imported.weeds) save("weed_logs", row, { paintNow: false });
  for (const row of imported.samples) save("harvest_samples", row, { paintNow: false });
  const progress = mergeProgress(state.data.rows, imported.rowProgress, { allowDowngrade: true });
  for (const row of progress) save("row_progress", row, { paintNow: false });
  for (const year of imported.seasons) {
    save("season_notes", {
      vineyard_id: state.vineyard.id,
      season_year: year,
      archived_at: new Date().toISOString(),
    }, { paintNow: false });
  }
  try { localStorage.setItem(LEGACY_FLAG_KEY, "done"); } catch { /* the rows are still on this phone */ }
  state.modal = null;
  state.notice = "Old records are saved on this phone. They send when there is Wi-Fi.";
  maybeTour();
  paint();
}

function authNotice(error) {
  const msg = String(error?.message || "");
  if (/fetch|network|Failed to fetch/i.test(msg)) return "The first sign-in needs Wi-Fi.";
  if (/Invalid login/i.test(msg)) return "That email or password did not match.";
  if (/already registered/i.test(msg)) return "That email already has an account. Sign in instead.";
  if (/password/i.test(msg)) return "Use a password of at least 6 characters.";
  return "That did not work. Check the email and password, and try again on Wi-Fi.";
}

async function signIn(fd) {
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    state.notice = authNotice(error);
    paint();
  }
}

async function signUp(fd) {
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const displayName = String(fd.get("display_name") || "").trim();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${location.origin}${location.pathname}`,
    },
  });
  if (error) {
    state.notice = authNotice(error);
    paint();
    return;
  }
  if (!data.session) {
    state.notice = "Account created, but email confirmation looks like it is still on. Turn that off in the Supabase dashboard, then sign in.";
    state.authMode = "in";
    paint();
  }
}

async function forgotPassword() {
  const email = document.querySelector("input[name=email]")?.value?.trim();
  if (!email) {
    state.notice = "Type your email first.";
    paint();
    return;
  }
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname}`,
  });
  state.notice = error ? authNotice(error) : "Reset link sent. Open it on this phone while you have Wi-Fi.";
  paint();
}

async function signOut() {
  signingOut = true;
  try {
    if (client) await client.auth.signOut({ scope: "local" });
  } catch (error) {
    pushError(error);
  }
  activeUser = null;
  db = null;
  state.session = null;
  state.userId = null;
  state.vineyard = null;
  state.profile = null;
  state.role = null;
  state.data = emptyData();
  state.modal = null;
  signingOut = false;
  location.hash = "#/";
  paint();
}

async function checkAgain() {
  if (state.demo) return;
  if (!client || !state.session) return;
  state.notice = "";
  state.syncing = true;
  paint();
  try {
    if (!db) db = await openDb(state.userId);
    await client.rpc("claim_invites");
    const { data: mems, error } = await client.from("memberships").select("*").eq("user_id", state.userId);
    if (error) throw error;
    if (mems?.length) {
      await putRecords(db, "memberships", mems);
      const vineyardId = mems.find((m) => m.active !== false)?.vineyard_id;
      if (vineyardId) {
        const { data: vines } = await client.from("vineyards").select("*").eq("id", vineyardId);
        if (vines?.length) await putRecords(db, "vineyards", vines);
      }
    }
    await hydrate();
    if (state.vineyard) {
      applyRoute();
      await ensureSeason();
      autoclose();
      maybeLegacy();
      await syncNow();
    } else {
      state.route = "wait";
      state.notice = "Still waiting for a manager to add this email.";
    }
  } catch (error) {
    state.notice = "Check again when this phone has Wi-Fi.";
    pushError(error);
  } finally {
    state.syncing = false;
    paint();
  }
}

function cachedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession || parsed?.session || parsed;
    if (session?.access_token && session?.user?.id) return session;
  } catch {
    return null;
  }
  return null;
}

async function loadSession() {
  const cached = cachedSession();
  try {
    const result = await Promise.race([
      client.auth.getSession(),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 4000)),
    ]);
    if (result === "timeout") return cached;
    return result?.data?.session || cached;
  } catch {
    return cached;
  }
}

async function enter(session) {
  if (!session?.user?.id) return;
  if (activeUser === session.user.id && (db || enterPromise)) {
    state.session = session;
    return enterPromise;
  }
  activeUser = session.user.id;
  state.session = session;
  state.userId = session.user.id;
  enterPromise = openSession();
  try {
    await enterPromise;
  } finally {
    enterPromise = null;
  }
}

async function openSession() {
  state.route = "loading";
  paint();
  try {
    db = await openDb(state.userId);
    await hydrate();
    if (!state.vineyard) state.route = "wait";
    else applyRoute();
    await ensureSeason();
    autoclose();
    paint();
    maybeLegacy();
    maybeTour();
    paint();
    loadCachedWeather().then(() => {
      paint();
      refreshWeather();
    });
    syncNow();
  } catch (error) {
    pushError(error);
    state.notice = "This phone could not open its saved records.";
    paint();
  }
}

const WEATHER_MAX_AGE_MS = 20 * 60 * 1000;
let weatherFlight = null;

function weatherKey() {
  return `weather:${state.vineyard?.id || "vineyard"}`;
}

async function readWeatherCache() {
  if (db) {
    try { return await kvGet(db, weatherKey()); } catch { return null; }
  }
  try {
    const raw = localStorage.getItem(weatherKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeWeatherCache(snapshot) {
  if (db) {
    try { await kvSet(db, weatherKey(), snapshot); } catch { /* the screen still shows this reading */ }
    return;
  }
  try { localStorage.setItem(weatherKey(), JSON.stringify(snapshot)); } catch { /* private mode */ }
}

function pointMatches(snapshot) {
  if (!snapshot) return false;
  const point = vineyardPoint(state.vineyard);
  return Math.abs(Number(snapshot.latitude) - point.lat) < 0.0001
    && Math.abs(Number(snapshot.longitude) - point.lon) < 0.0001;
}

function heatNoteKey() {
  return `daranch-heat-note:${state.vineyard?.id || "v"}:${vineyardToday(tz())}`;
}

function maybeHeatNotify() {
  const alert = heatAlert(state.weather, tz());
  state.heatAsk = false;
  if (!alert || state.online === false || typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    state.heatAsk = true;
    return;
  }
  if (Notification.permission !== "granted") return;
  const key = heatNoteKey();
  try {
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
  } catch {
    return;
  }
  const title = "Heat at DA Ranch";
  const body = `It reaches ${alert.tempF}° today. Drink water and take shade breaks.`;
  const viaPage = () => {
    try { new Notification(title, { body, tag: key }); } catch { /* this browser blocked the alert */ }
  };
  const ready = navigator.serviceWorker?.ready;
  if (ready) {
    ready.then((reg) => {
      if (!reg.showNotification) return viaPage();
      return reg.showNotification(title, { body, tag: key, renotify: false });
    }).catch(viaPage);
  } else viaPage();
}

async function allowHeatNotes() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  let permission = "denied";
  try { permission = await Notification.requestPermission(); } catch { return; }
  if (permission === "granted") maybeHeatNotify();
  else state.heatAsk = false;
  paint();
}

function refreshWeather(options) {
  if (weatherFlight) return weatherFlight;
  weatherFlight = refreshWeatherNow(options).finally(() => { weatherFlight = null; });
  return weatherFlight;
}

async function loadCachedWeather() {
  if (!state.vineyard) return;
  const cached = await readWeatherCache();
  if (!cached || !pointMatches(cached)) return;
  state.weather = cached;
  maybeHeatNotify();
}

async function refreshWeatherNow({ force = false } = {}) {
  if (!state.vineyard || state.online === false) return;
  const point = vineyardPoint(state.vineyard);
  const age = state.weather?.fetchedAt ? Date.now() - new Date(state.weather.fetchedAt).getTime() : Infinity;
  if (!force && pointMatches(state.weather) && age < WEATHER_MAX_AGE_MS) {
    maybeHeatNotify();
    return;
  }
  try {
    const snapshot = await fetchNwsWeather(point.lat, point.lon);
    state.weather = snapshot;
    await writeWeatherCache(snapshot);
    maybeHeatNotify();
    paint();
  } catch {
    // Keep the last saved forecast. The updated time stays on the screen.
  }
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "sync") syncNow();
  });
}

function startDemo() {
  const flag = new URLSearchParams(location.search).get("demo");
  const role = flag === "manager" ? "manager" : flag === "developer" ? "developer" : "employee";
  const userId = "44444444-4444-4444-8444-444444444444";
  const vineyardId = "55555555-5555-4555-8555-555555555555";
  const blockId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const sam = "66666666-6666-4666-8666-666666666666";
  state.demo = true;
  state.online = typeof navigator === "undefined" ? true : navigator.onLine;
  state.session = { user: { id: userId, email: "crew@da.test" } };
  state.userId = userId;
  state.profile = { id: userId, display_name: role === "manager" ? "Morgan" : role === "developer" ? "Aaron" : "Ada", theme: "sage" };
  state.vineyard = {
    id: vineyardId,
    name: "DA Ranch",
    timezone: "America/Phoenix",
    eod_time: "14:25:00",
    edit_window_days: 3,
    latitude: CORNVILLE_LAT,
    longitude: CORNVILLE_LON,
    weather_url: DEFAULT_WEATHER_URL,
  };
  try {
    const raw = localStorage.getItem(`weather:${vineyardId}`);
    const saved = raw ? JSON.parse(raw) : null;
    if (pointMatches(saved)) state.weather = saved;
  } catch { /* demo still fetches when it can */ }
  state.role = role;
  state.year = seasonYear("America/Phoenix");
  state.data = emptyData();
  state.data.blocks = [{ id: blockId, name: "DA Tannat", variety: "Tannat", row_count: 4, plant_count: 100, sort_order: 1 }];
  state.data.quotes = BUNDLED_QUOTES.map((row) => ({ ...row, vineyard_id: vineyardId }));
  state.data.facts = BUNDLED_FACTS.map((row) => ({ ...row, vineyard_id: vineyardId }));
  state.data.notes = BUNDLED_NOTES.map((row) => ({ ...row, vineyard_id: vineyardId }));
  state.data.equipment = [{
    id: "88888888-8888-4888-8888-888888888888",
    vineyard_id: vineyardId,
    name: "Vineyard tractor",
    make: "Kubota",
    model: "",
    serial: "K-100",
    year: 2014,
    notes: "",
    archived: false,
  }];
  state.data.tasks = [{ id: taskId, slug: "leaf-pulling", label: "Leaf pulling", sort_order: 1 }];
  state.data.areas = [{ id: "33333333-3333-4333-8333-333333333333", name: "Non-field work", kind: "non_field", is_system: true, sort_order: 0 }];
  state.data.members = [{ id: "m1", user_id: userId, vineyard_id: vineyardId, role, active: true }];
  state.data.profiles = [state.profile];
  state.data.members.push({ id: "m2", user_id: sam, vineyard_id: vineyardId, role: "employee", active: true });
  state.data.profiles.push({ id: sam, display_name: "Sam", theme: "sage" });
  if (role === "manager") {
    state.data.wages = [{ id: "w1", user_id: sam, vineyard_id: vineyardId, hourly_rate: 18, effective_from: "2026-01-01" }];
  }
  if (role === "developer") {
    state.data.managerRequests = [{
      id: "77777777-7777-4777-8777-777777777777",
      vineyard_id: vineyardId,
      user_id: sam,
      requested_by: userId,
      status: "pending",
      decided_at: null,
      decided_by: null,
    }];
  }
  applyRoute();
  maybeTour();
  maybeHeatNotify();
  paint();
  refreshWeather();
}

async function startAuth() {
  if (!window.supabase?.createClient) {
    state.route = "auth";
    state.notice = "The app files did not finish loading. Connect to Wi-Fi and reload.";
    paint();
    return;
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      if (!signingOut) return;
      return;
    }
    if (session?.user) enter(session);
  });
  const session = await loadSession();
  if (session) await enter(session);
  else {
    state.session = null;
    state.route = "auth";
    paint();
  }
}

function boot() {
  try { applyTheme(localStorage.getItem(THEME_KEY) || "sage"); } catch { applyTheme("sage"); }
  registerSW();
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("submit", onSubmit);
  document.body.addEventListener("change", onChange);
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (state.pendingPaint && !userIsTyping()) paint();
    }, 30);
  });
window.addEventListener("hashchange", () => {
  applyRoute();
  state.notice = state.pendingNotice || "";
  state.pendingNotice = "";
  paint();
});
  window.addEventListener("online", () => {
    state.online = true;
    syncNow();
    refreshWeather({ force: true });
  });
  window.addEventListener("offline", () => {
    state.online = false;
    paint();
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installEvent = event;
    paint();
  });
  window.addEventListener("error", (event) => pushError(event.message));
  window.addEventListener("unhandledrejection", (event) => pushError(event.reason));
  setInterval(() => {
    document.querySelectorAll("[data-timer]").forEach((el) => {
      const job = state.data.labor.find((row) => row.id === el.dataset.timer);
      if (job) el.textContent = formatDuration(elapsedSeconds(job));
    });
  }, 1000);
  setInterval(autoclose, 30000);
  setInterval(() => {
    if (!state.demo && state.session && (state.outbox || state.syncError || state.online === false)) syncNow();
  }, 60000);
  state.route = "loading";
  paint();
  const demo = new URLSearchParams(location.search).get("demo");
  if (demo) startDemo();
  else startAuth();
}

boot();
