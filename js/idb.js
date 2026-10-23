const VERSION = 1;

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB error"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB aborted"));
  });
}

export function openDb(userId) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`daranch-${userId}`, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("rows")) db.createObjectStore("rows", { keyPath: "key" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function recordKey(table, record) {
  if (table === "season_notes") return `${record.vineyard_id}:${record.season_year}`;
  if (table === "contractor_costs") return record.entry_id;
  if (table === "invite_wages") return record.invite_id;
  return record.id;
}

export async function putRecord(db, table, record) {
  const id = recordKey(table, record);
  const tx = db.transaction("rows", "readwrite");
  tx.objectStore("rows").put({ key: `${table}:${id}`, table, id, record });
  await done(tx);
}

export async function putRecords(db, table, records) {
  if (!records.length) return;
  const tx = db.transaction("rows", "readwrite");
  const store = tx.objectStore("rows");
  for (const record of records) {
    const id = recordKey(table, record);
    store.put({ key: `${table}:${id}`, table, id, record });
  }
  await done(tx);
}

export async function allRows(db) {
  const tx = db.transaction("rows", "readonly");
  const req = tx.objectStore("rows").getAll();
  const rows = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await done(tx);
  return rows;
}

export async function deleteRecord(db, table, id) {
  const tx = db.transaction("rows", "readwrite");
  tx.objectStore("rows").delete(`${table}:${id}`);
  await done(tx);
}

export async function getRecord(db, table, id) {
  const tx = db.transaction("rows", "readonly");
  const req = tx.objectStore("rows").get(`${table}:${id}`);
  const row = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  await done(tx);
  return row?.record || null;
}

export async function enqueue(db, item) {
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").put(item);
  await done(tx);
}

export async function outboxItems(db) {
  const tx = db.transaction("outbox", "readonly");
  const req = tx.objectStore("outbox").getAll();
  const rows = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  await done(tx);
  return rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export async function removeOutbox(db, id) {
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").delete(id);
  await done(tx);
}

export async function putFile(db, file) {
  const tx = db.transaction("files", "readwrite");
  tx.objectStore("files").put(file);
  await done(tx);
}

export async function getFile(db, id) {
  const tx = db.transaction("files", "readonly");
  const req = tx.objectStore("files").get(id);
  const row = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  await done(tx);
  return row;
}

export async function kvGet(db, key) {
  const tx = db.transaction("kv", "readonly");
  const req = tx.objectStore("kv").get(key);
  const row = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  await done(tx);
  return row ? row.value : null;
}

export async function kvSet(db, key, value) {
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").put({ key, value });
  await done(tx);
}
