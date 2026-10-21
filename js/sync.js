import { SUPABASE_URL } from "./config.js";
import { allRows, enqueue, getFile, getRecord, kvGet, kvSet, outboxItems, putRecord, putRecords, recordKey, removeOutbox } from "./idb.js";

const CONFLICT = {
  row_progress: "vineyard_id,season_year,block_id,task_id,row_number",
  pass_tasks: "pass_id,task_id",
  season_notes: "vineyard_id,season_year",
  contractor_costs: "entry_id",
  invite_wages: "invite_id",
  wage_rates: "id",
};

const COLUMNS = {
  vineyards: ["id", "name", "timezone", "eod_time", "edit_window_days", "latitude", "longitude", "weather_url", "client_updated_at"],
  profiles: ["id", "display_name", "theme", "tour_seen", "client_updated_at"],
  memberships: ["id", "vineyard_id", "user_id", "role", "active", "client_updated_at"],
  invites: ["id", "vineyard_id", "email", "display_name", "role", "invited_by", "accepted_at", "accepted_user_id", "deleted_at", "client_updated_at"],
  manager_requests: ["id", "vineyard_id", "user_id", "requested_by", "status", "decided_at", "decided_by", "client_updated_at"],
  invite_wages: ["invite_id", "vineyard_id", "hourly_rate", "client_updated_at"],
  areas: ["id", "vineyard_id", "name", "kind", "is_system", "sort_order", "archived", "client_updated_at", "deleted_at"],
  blocks: ["id", "vineyard_id", "name", "variety", "row_count", "plant_count", "sort_order", "archived", "client_updated_at", "deleted_at"],
  tasks: ["id", "vineyard_id", "slug", "label", "sort_order", "archived", "client_updated_at", "deleted_at"],
  passes: ["id", "vineyard_id", "name", "archived", "client_updated_at", "deleted_at"],
  pass_tasks: ["id", "vineyard_id", "pass_id", "task_id", "sort_order", "client_updated_at"],
  chemicals: ["id", "vineyard_id", "name", "category", "sds_url", "is_system", "sort_order", "archived", "client_updated_at", "deleted_at"],
  labor_entries: ["id", "vineyard_id", "user_id", "logged_by", "season_year", "work_date", "block_id", "area_id", "task_id", "pass_id", "pass_group_id", "crew_job_id", "entry_kind", "row_start", "row_end", "row_status", "started_at", "ended_at", "pause_seconds", "paused_at", "hours", "close_reason", "source", "notes", "client_updated_at", "deleted_at"],
  row_progress: ["id", "vineyard_id", "season_year", "block_id", "task_id", "row_number", "status", "updated_by", "client_updated_at"],
  spray_logs: ["id", "vineyard_id", "season_year", "block_id", "kind", "spray_date", "chemical_id", "chemical_name", "rate", "volume", "tank", "notes", "rec_number", "photo_path", "rows_done", "created_by", "client_updated_at", "deleted_at"],
  watering_logs: ["id", "vineyard_id", "season_year", "block_id", "log_date", "hours", "notes", "created_by", "client_updated_at", "deleted_at"],
  weed_logs: ["id", "vineyard_id", "season_year", "block_id", "log_date", "hours", "notes", "created_by", "client_updated_at", "deleted_at"],
  harvest_samples: ["id", "vineyard_id", "season_year", "block_id", "sample_date", "rows_sampled", "brix", "ph", "ta", "notes", "created_by", "client_updated_at", "deleted_at"],
  equipment: ["id", "vineyard_id", "name", "notes", "make", "model", "serial", "year", "archived", "client_updated_at", "deleted_at"],
  variety_quotes: ["id", "vineyard_id", "variety", "text", "author", "source", "archived", "client_updated_at", "deleted_at"],
  service_types: ["id", "vineyard_id", "name", "sort_order", "archived", "client_updated_at", "deleted_at"],
  service_logs: ["id", "vineyard_id", "equipment_id", "service_type", "log_date", "hours", "notes", "created_by", "client_updated_at", "deleted_at"],
  contractors: ["id", "vineyard_id", "season_year", "person_name", "company", "description", "work_date", "hours", "task_id", "block_id", "area_id", "created_by", "client_updated_at", "deleted_at"],
  contractor_costs: ["entry_id", "vineyard_id", "amount", "client_updated_at"],
  wage_rates: ["id", "vineyard_id", "user_id", "hourly_rate", "effective_from", "created_by", "client_updated_at"],
  bug_reports: ["id", "vineyard_id", "user_id", "note", "diagnostics", "client_id"],
  season_notes: ["vineyard_id", "season_year", "archived_at", "client_updated_at"],
};

export function pickColumns(table, record) {
  const cols = COLUMNS[table];
  const out = {};
  for (const key of cols) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

export function tablesForRole(role) {
  const tables = [
    "vineyards", "areas", "blocks", "tasks", "passes", "pass_tasks", "chemicals",
    "labor_entries", "row_progress", "spray_logs", "watering_logs", "weed_logs",
    "harvest_samples", "equipment", "service_types", "service_logs", "variety_quotes", "contractors",
    "season_notes", "memberships",
  ];
  if (role === "manager" || role === "developer") tables.push("invites", "bug_reports", "manager_requests");
  if (role === "manager") tables.push("wage_rates", "invite_wages", "contractor_costs");
  return tables;
}

export async function reachable() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function permanentError(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  if (/fetch|network|Failed to fetch|JWT|timeout/i.test(text)) return false;
  return /row-level security|42501|23514|23505|22P02|23503|PGRST/.test(text);
}

async function pullTable(client, table, vineyardId, cursor, profileIds) {
  const stamp = table === "bug_reports" ? "created_at" : "updated_at";
  const pageSize = 500;
  let from = 0;
  const rows = [];
  while (true) {
    let query = client.from(table).select("*").order(stamp, { ascending: true }).range(from, from + pageSize - 1);
    if (table === "vineyards") query = query.eq("id", vineyardId);
    else if (table === "profiles") query = query.in("id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"]);
    else query = query.eq("vineyard_id", vineyardId);
    if (cursor) query = query.gt(stamp, cursor);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function syncAll({ client, db, vineyardId, userId, role, season }) {
  const online = await reachable();
  if (!online) return { online: false, pushed: 0 };

  try {
    await client.rpc("claim_invites");
  } catch {
    // Offline or the account has no invite yet. The next sync tries again.
  }

  const pending = await outboxItems(db);
  let pushed = 0;
  const dropped = [];
  for (const item of pending) {
    try {
      if (item.kind === "photo") {
        await pushPhoto(client, db, item);
      } else {
        const record = await getRecord(db, item.table, item.key);
        if (!record) {
          await removeOutbox(db, item.id);
          continue;
        }
        const payload = pickColumns(item.table, record);
        const onConflict = CONFLICT[item.table] || "id";
        const { error } = await client.from(item.table).upsert(payload, { onConflict });
        if (error) throw error;
      }
      await removeOutbox(db, item.id);
      pushed += 1;
    } catch (error) {
      item.attempts = (item.attempts || 0) + 1;
      item.last_error = error?.message || String(error);
      if (permanentError(error) || item.attempts > 8) {
        await removeOutbox(db, item.id);
        dropped.push(item.last_error || "rejected");
      } else {
        await enqueue(db, item);
      }
      break;
    }
  }

  try {
    await client.rpc("close_stale_jobs", { p_vineyard: vineyardId });
  } catch {
    // The phone also closes open clocks itself. The server pass is a backup.
  }

  const held = new Set((await outboxItems(db)).filter((item) => item.kind !== "photo").map((item) => `${item.table}:${item.key}`));
  const tables = tablesForRole(role);
  for (const table of tables) {
    const cursor = await kvGet(db, `cursor:${vineyardId}:${table}`);
    const rows = await pullTable(client, table, vineyardId, cursor, [userId]);
    const fresh = rows.filter((row) => !held.has(`${table}:${recordKey(table, row)}`));
    if (fresh.length) await putRecords(db, table, fresh);
    if (rows.length) {
      const stamp = table === "bug_reports" ? "created_at" : "updated_at";
      const max = rows.reduce((m, row) => (row[stamp] > m ? row[stamp] : m), cursor || "");
      if (max) await kvSet(db, `cursor:${vineyardId}:${table}`, max);
    }
  }

  const memberRows = (await allRows(db)).filter((row) => row.table === "memberships").map((row) => row.record);
  const ids = [...new Set(memberRows.filter((m) => m.vineyard_id === vineyardId && m.active !== false).map((m) => m.user_id).concat(userId))];
  const people = await pullTable(client, "profiles", vineyardId, null, ids);
  if (people.length) await putRecords(db, "profiles", people);

  if (role === "manager") {
    const { data, error } = await client.rpc("labor_cost_summary", { p_vineyard: vineyardId, p_season: season });
    if (!error && data) await kvSet(db, `cost:${vineyardId}:${season}`, data);
  }

  await kvSet(db, "lastSync", new Date().toISOString());
  return { online: true, pushed, dropped };
}

async function pushPhoto(client, db, item) {
  const file = await getFile(db, item.fileId);
  if (!file) return;
  const path = `${item.vineyardId}/${item.sprayId}/${file.id}`;
  const { error } = await client.storage.from("spray-photos").upload(path, file.blob, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error && !/already exists/i.test(error.message || "")) throw error;
  const spray = await getRecord(db, "spray_logs", item.sprayId);
  if (spray) {
    spray.photo_path = path;
    spray.client_updated_at = new Date().toISOString();
    const { error: updateError } = await client.from("spray_logs").upsert(pickColumns("spray_logs", spray));
    if (updateError) throw updateError;
    await putRecord(db, "spray_logs", spray);
  }
}

export async function signedPhotoUrls(client, paths) {
  const urls = {};
  for (const path of paths) {
    if (!path) continue;
    const { data, error } = await client.storage.from("spray-photos").createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) urls[path] = data.signedUrl;
  }
  return urls;
}
