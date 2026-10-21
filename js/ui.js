import { APP_NAME, CORNVILLE_LAT, CORNVILLE_LON, DEFAULT_WEATHER_URL, THEMES } from "./config.js";
import { machineQuery, needsModel, PART_TOPICS, partSearchLinks } from "./parts.js";
import { pickQuote, quotesToShow, quoteVisitKey } from "./quotes.js";
import { tourSteps } from "./tour.js";
import { heatAlert, stationUrl, weatherLines } from "./weather.js";
import {
  countStatus,
  elapsedSeconds,
  formatDuration,
  formatHours,
  openCrewJobs,
  openJobFor,
  personHoursOnDay,
  rowStatus,
  sumPassHours,
  sumTaskHours,
  vineyardToday,
} from "./logic.js";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function byName(list) {
  return (list || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name || a.label).localeCompare(String(b.name || b.label)));
}

function alive(list) {
  return (list || []).filter((row) => !row.deleted_at && !row.archived);
}

function nameOf(list, id, field = "name") {
  return list.find((row) => row.id === id)?.[field] || "";
}

function personName(state, id) {
  return state.data.profiles.find((p) => p.id === id)?.display_name || "Crew";
}

function blockQuote(state, block) {
  if (!block) return "";
  const row = pickQuote(quotesToShow(state.data?.quotes), block.variety, state.quoteVisit || quoteVisitKey());
  if (!row?.text) return "";
  return `<p class="quote">“${esc(row.text)}” <span class="quote-by">${esc(row.author)}. ${esc(row.source)}</span></p>`;
}

export function jobTitle(state, job) {
  if (!job) return "";
  const task = job.pass_id
    ? nameOf(state.data.passes, job.pass_id)
    : nameOf(state.data.tasks, job.task_id, "label");
  const place = job.block_id
    ? nameOf(state.data.blocks, job.block_id)
    : nameOf(state.data.areas, job.area_id);
  return { task: task || "Job", place };
}

function shell(state, body, { back = true } = {}) {
  const year = state.year;
  const status = !state.online ? "Waiting for Wi-Fi" : state.syncing ? "Syncing" : state.outbox ? "Saved on this phone" : "Synced";
  const cards = crewCards(state);
  return `<header class="head">
      <div class="head-row">
        ${back ? `<button class="back" type="button" data-act="back">‹ Back</button>` : `<span></span>`}
        <button class="back" type="button" data-act="go" data-href="#/bug">Problem</button>
      </div>
      <h1>${esc(APP_NAME)}</h1>
      <p class="sub">${esc(year)} season · ${esc(status)}</p>
    </header>
    ${heatBanner(state)}
    ${cards && state.route !== "finish" ? cards : ""}
    <div class="wrap">
      ${state.notice ? `<p class="banner">${esc(state.notice)}</p>` : ""}
      ${state.syncError ? `<p class="banner">${esc(state.syncError)}</p>` : ""}
      ${body}
    </div>
    ${modal(state)}
    ${tourCard(state)}`;
}

function crewCards(state) {
  const groups = openCrewJobs(state.data.labor);
  groups.sort((a, b) => {
    const mine = (rows) => (rows.some((row) => row.user_id === state.userId) ? 0 : 1);
    return mine(a) - mine(b);
  });
  if (!groups.length) return "";
  return `<div class="wrap job-sticky" style="padding-bottom:0">
    ${groups.map((members) => {
      const job = members.find((row) => row.user_id === state.userId) || members.slice().sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)))[0];
      const crewJobId = job.crew_job_id || job.id;
      const title = jobTitle(state, job);
      const mine = members.find((row) => row.user_id === state.userId);
      const already = new Set(members.map((row) => row.user_id));
      (state.data.labor || []).forEach((row) => {
        if (!row.deleted_at && row.entry_kind !== "pass_slice" && (row.crew_job_id || row.id) === crewJobId) already.add(row.user_id);
      });
      const others = (state.data.members || []).filter((m) => m.active !== false && !already.has(m.user_id));
      const lunch = mine?.paused_at ? "Lunch in" : "Lunch out";
      return `<section class="panel">
        <p class="meta">${mine?.paused_at ? "On lunch" : mine ? "Clock is running" : "Job is running"}</p>
        <strong>${esc(title.task)}</strong>
        <p class="meta">${esc(title.place)}${job.row_start ? ` · started row ${job.row_start}` : ""}</p>
        ${mine ? `<p class="timer" data-timer="${mine.id}">${formatDuration(elapsedSeconds(mine))}</p>` : ""}
        ${members.slice().sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))).map((row) => `<div class="crew-line"><span>${esc(personName(state, row.user_id))}${row.user_id === state.userId ? " · you" : ""}${row.paused_at ? " · lunch" : ""}</span><button class="ghost" type="button" data-act="crew-off" data-id="${row.id}">Off</button></div>`).join("")}
        ${others.length ? `<p class="meta">Add person</p><div class="pair">${others.map((m) => `<button class="ghost" type="button" data-act="crew-add" data-job="${crewJobId}" data-user="${m.user_id}">${esc(personName(state, m.user_id))}</button>`).join("")}</div>` : ""}
        <div class="pair">
          ${mine ? `<button class="ghost" type="button" data-act="lunch">${lunch}</button>` : `<span></span>`}
          <button class="big" type="button" data-act="crew-done" data-job="${crewJobId}">Done</button>
        </div>
      </section>`;
    }).join("")}
  </div>`;
}

function heatBanner(state) {
  const alert = heatAlert(state.weather, state.vineyard?.timezone || "America/Phoenix");
  if (!alert) return "";
  const ask = state.heatAsk
    ? `<button class="ghost heat-btn" type="button" data-act="heat-notify">Notify this phone</button>`
    : "";
  return `<div class="heat" role="status"><strong>Heat today: ${alert.tempF}°.</strong> Take water and shade breaks.${ask}</div>`;
}

function weatherCard(state) {
  const href = stationUrl(state.vineyard);
  const lines = weatherLines(state.weather);
  const link = `<a href="${esc(href)}" target="_blank" rel="noopener">Cornville station</a>`;
  if (!lines) {
    return `<section class="panel weather" aria-label="Weather"><p class="small">Weather loads when this phone has Wi-Fi.</p><p class="small">${link}</p></section>`;
  }
  const days = (lines.days || []).map((day) => `<li><span>${esc(day.name)}</span><span>${day.tempF == null ? "" : `${esc(day.tempF)}°`}</span><span>${esc(day.wind || "")}</span><span>${day.rainPercent == null ? "" : `${esc(day.rainPercent)}% rain`}</span></li>`).join("");
  return `<section class="panel weather" aria-label="Weather">
    <p>${esc(lines.now)}</p>
    ${lines.hours ? `<p class="small">${esc(lines.hours)}</p>` : ""}
    ${lines.tomorrow ? `<p class="small">${esc(lines.tomorrow)}</p>` : ""}
    ${days ? `<ul class="forecast">${days}</ul>` : ""}
    <p class="small">Updated ${esc(lines.updated)} · ${link}</p>
  </section>`;
}

function legend() {
  return `<div class="legend">
    <span class="swatch"><i class="dot" style="background:#f6d0d0"></i> Not started</span>
    <span class="swatch"><i class="dot status-partial" style="background:linear-gradient(90deg,#2f9e44 50%,#f6d0d0 50%)"></i> Partial</span>
    <span class="swatch"><i class="dot" style="background:#2f9e44"></i> Complete</span>
  </div>`;
}

function rowGrid(state, block, taskIds, { startRow = null, endRow = null, act = "pick-row" } = {}) {
  const ids = Array.isArray(taskIds) ? taskIds : [taskIds];
  let html = `<div class="rows">`;
  for (let n = 1; n <= block.row_count; n++) {
    const statuses = ids.map((id) => rowStatus(state.data.rows, state.year, block.id, id, n));
    const status = statuses.includes("none") && statuses.some((s) => s !== "none")
      ? "partial"
      : statuses.every((s) => s === "complete")
        ? "complete"
        : statuses.some((s) => s === "partial")
          ? "partial"
          : statuses[0] || "none";
    const cls = [
      "row-btn",
      `status-${status}`,
      startRow === n ? "is-start" : "",
      endRow === n ? "is-end" : "",
    ].filter(Boolean).join(" ");
    html += `<button type="button" class="${cls}" data-act="${act}" data-row="${n}" title="Row ${n} ${status}">${n}</button>`;
  }
  html += `</div>`;
  return html;
}

function modal(state) {
  const m = state.modal;
  if (!m) return "";
  if (m.type === "switch") {
    const open = openJobFor(state.data.labor, state.userId);
    const title = jobTitle(state, open);
    return `<div class="modal-back"><div class="modal">
      <h2>Close the open job first?</h2>
      <p>You are still clocked in on ${esc(title.task)}${title.place ? ` · ${esc(title.place)}` : ""}. Your clock stops. Anyone else on that job keeps going.</p>
      <button class="big" type="button" data-act="close-then-switch">Close it, then start</button>
      <button class="ghost" type="button" data-act="dismiss">Keep this job</button>
    </div></div>`;
  }
  if (m.type === "legacy") {
    return `<div class="modal-back"><div class="modal">
      <h2>Bring in the old records?</h2>
      <p>This phone still has the vineyard notes from before sign-in. Add them to ${esc(state.vineyard?.name || "the vineyard")}?</p>
      <button class="big" type="button" data-act="import-legacy">Add them</button>
      <button class="ghost" type="button" data-act="skip-legacy">Not now</button>
    </div></div>`;
  }
  if (m.type === "confirm") {
    return `<div class="modal-back"><div class="modal">
      <p>${esc(m.text)}</p>
      <button class="danger" type="button" data-act="confirm-yes">Yes, do it</button>
      <button class="ghost" type="button" data-act="dismiss">Cancel</button>
    </div></div>`;
  }
  return "";
}

function home(state) {
  const blocks = byName(alive(state.data.blocks));
  const today = vineyardToday(state.vineyard?.timezone || "America/Phoenix");
  const mine = personHoursOnDay(state.data.labor, state.userId, today);
  const seasons = (state.data.seasons || []).map((s) => s.season_year);
  const archived = seasons.filter((y) => y < state.year);
  const banner = archived.length
    ? `${archived.sort().join(", ")} season${archived.length > 1 ? "s" : ""} archived. ${state.year} started fresh on January 1. Older seasons stay in Export.`
    : `${state.year} season. On January 1, row colors, sprays, water, weeds, and samples start fresh. Blocks stay.`;
  return shell(state, `
    <p class="note">${esc(banner)}</p>
    <p class="meta">You have ${esc(formatHours(mine) || "0")} hours today.</p>
    <button class="big" type="button" data-act="go" data-href="#/work">Start work</button>
    <button class="ghost" type="button" data-act="go" data-href="#/export">Export</button>
    ${blocks.map((b) => `<button class="tile" type="button" data-act="go" data-href="#/block/${b.id}">
      <span><strong>${esc(b.name)}</strong><p class="meta">${b.row_count} rows${b.variety ? ` · ${esc(b.variety)}` : ""}</p></span>
      <span class="meta">›</span>
    </button>`).join("") || `<p class="muted">No blocks yet.</p>`}
    <button class="ghost" type="button" data-act="go" data-href="#/more">More</button>
  `, { back: false });
}

function work(state) {
  const flow = state.flow || { step: "place" };
  const blocks = byName(alive(state.data.blocks));
  const areas = byName(alive(state.data.areas).filter((a) => a.kind === "non_field"));
  if (flow.step === "place" || (!flow.blockId && !flow.areaId)) {
    return shell(state, `
      <h2>Where are you working?</h2>
      ${blocks.map((b) => `<button class="tile" type="button" data-act="pick-place" data-kind="block" data-id="${b.id}"><span><strong>${esc(b.name)}</strong><p class="meta">${b.row_count} rows</p></span></button>`).join("")}
      ${areas.map((a) => `<button class="tile" type="button" data-act="pick-place" data-kind="area" data-id="${a.id}"><span><strong>${esc(a.name)}</strong><p class="meta">Not a vine row</p></span></button>`).join("")}
    `);
  }
  const tasks = byName(alive(state.data.tasks));
  const passes = byName(alive(state.data.passes));
  if (flow.step === "task") {
    const picked = state.data.blocks.find((b) => b.id === flow.blockId);
    return shell(state, `
      <h2>What are you doing?</h2>
      ${blockQuote(state, picked)}
      ${passes.map((p) => {
        const names = state.data.passTasks.filter((pt) => pt.pass_id === p.id).sort((a, b) => a.sort_order - b.sort_order)
          .map((pt) => nameOf(state.data.tasks, pt.task_id, "label")).filter(Boolean);
        return `<button class="tile" type="button" data-act="pick-pass" data-id="${p.id}"><span><strong>Pass · ${esc(p.name)}</strong><p class="meta">${esc(names.join(" + "))}</p></span></button>`;
      }).join("")}
      ${tasks.map((t) => `<button class="tile" type="button" data-act="pick-task" data-id="${t.id}"><strong>${esc(t.label)}</strong></button>`).join("")}
      <form class="form" id="add-task"><input name="label" placeholder="Add a task" required /><button class="ghost" type="submit">Add task</button></form>
    `);
  }
  const block = state.data.blocks.find((b) => b.id === flow.blockId);
  return shell(state, `
    <h2>Tap the row you are starting</h2>
    ${blockQuote(state, block)}
    <p class="muted">This starts your clock.</p>
    ${legend()}
    ${block ? rowGrid(state, block, flow.passId ? passTaskIds(state, flow.passId) : [flow.taskId], { act: "pick-start-row" }) : ""}
  `);
}

function passTaskIds(state, passId) {
  return state.data.passTasks.filter((pt) => pt.pass_id === passId).sort((a, b) => a.sort_order - b.sort_order).map((pt) => pt.task_id);
}

function finish(state) {
  const groups = openCrewJobs(state.data.labor);
  const wanted = state.flow?.finishJobId;
  const members = groups.find((rows) => (rows[0].crew_job_id || rows[0].id) === wanted)
    || groups.find((rows) => rows.some((row) => row.user_id === state.userId))
    || groups[0];
  const job = members?.find((row) => row.user_id === state.userId) || members?.[0];
  if (!job) return shell(state, `<p>No clock is running.</p><button class="big" type="button" data-act="go" data-href="#/">Home</button>`);
  const title = jobTitle(state, job);
  const block = state.data.blocks.find((b) => b.id === job.block_id);
  const flow = state.flow || {};
  const taskIds = job.pass_id ? passTaskIds(state, job.pass_id) : [job.task_id];
  const names = members.map((row) => personName(state, row.user_id)).join(", ");
  return shell(state, `
    <h2>Finish ${esc(title.task)}</h2>
    <p class="meta">${esc(title.place)} · still on it: ${esc(names)}</p>
    ${blockQuote(state, block)}
    <p class="note">This stops the clock for everyone still on the job. Each person keeps the time from when they joined.</p>
    ${block ? `<section class="panel stack"><h2>Tap the last row you finished</h2>${legend()}${rowGrid(state, block, taskIds, { startRow: job.row_start, endRow: flow.rowEnd, act: "pick-end-row" })}
      <div class="pair">
        <button class="ghost" type="button" data-act="complete" data-status="partial">Partial</button>
        <button class="big" type="button" data-act="complete" data-status="complete">Complete</button>
      </div>
    </section>` : `<button class="big" type="button" data-act="complete" data-status="">Stop and save</button>`}
  `);
}

function blockScreen(state) {
  const block = state.data.blocks.find((b) => b.id === state.param);
  if (!block) return shell(state, `<p>That block is not on this phone.</p>`);
  const tab = state.tab || "tasks";
  const tasks = byName(alive(state.data.tasks));
  const water = state.data.watering.filter((w) => !w.deleted_at && w.block_id === block.id && w.season_year === state.year);
  const weeds = state.data.weeds.filter((w) => !w.deleted_at && w.block_id === block.id && w.season_year === state.year);
  const hours = water.reduce((s, w) => s + Number(w.hours || 0), 0);
  const plants = Number(block.plant_count);
  const tabs = ["tasks", "water", "foliar", "herbicide", "weeds"].map((id) => {
    const label = { tasks: "Tasks", water: "Water", foliar: "Foliar", herbicide: "Herbicide", weeds: "Weeds" }[id];
    return `<button type="button" class="${tab === id ? "on" : ""}" data-act="tab" data-id="${id}">${label}</button>`;
  }).join("");
  let body = "";
  if (tab === "tasks") {
    body = tasks.map((t) => {
      const done = countStatus(state.data.rows, state.year, block.id, t.id, "complete");
      const partial = countStatus(state.data.rows, state.year, block.id, t.id, "partial");
      const hrs = sumTaskHours(state.data.labor, state.data.contractors, state.year, t.id, block.id);
      return `<button class="tile" type="button" data-act="go" data-href="#/task/${block.id}/${t.id}"><span><strong>${esc(t.label)}</strong><p class="meta">${done} of ${block.row_count} complete${partial ? ` · ${partial} partial` : ""} · ${esc(formatHours(hrs) || "0")} hrs</p></span></button>`;
    }).join("");
  } else if (tab === "water") {
    body = `<section class="panel"><p class="stat">${esc(formatHours(hours) || "0")} hours</p>
      <p class="meta">Water this season on ${esc(block.name)}</p>
      ${plants ? `<p class="meta">About ${Math.round(hours * plants)} gal if ${plants} plants × 1 gal/plant/hour</p>` : ""}
      <p class="note">We talk about watering in <strong>hours</strong>. Each plant has 2 half-gallon emitters, so about <strong>1 gallon per plant per hour</strong>.</p>
      ${weatherCard(state)}
      <form class="form" id="add-water"><input name="date" type="date" value="${vineyardToday(state.vineyard.timezone)}" required /><input name="hours" inputmode="decimal" placeholder="Hours" required /><input name="notes" placeholder="Notes" /><button class="big" type="submit">Save hours</button></form>
      <ul class="list">${water.map((w) => `<li><div><strong>${esc(w.log_date)} · ${esc(w.hours)} hrs</strong><p class="meta">${esc(w.notes || "")}</p></div><button class="danger" type="button" data-act="ask-delete" data-table="watering_logs" data-id="${w.id}">Remove</button></li>`).join("")}</ul>
    </section>`;
  } else if (tab === "weeds") {
    const wh = weeds.reduce((s, w) => s + Number(w.hours || 0), 0);
    body = `<p class="note">Weed whacking happens all season. Log each time. Do not mark it done once.</p>
      <section class="panel"><p class="stat">${esc(formatHours(wh) || "0")} hours</p>
      <form class="form" id="add-weed"><input name="date" type="date" value="${vineyardToday(state.vineyard.timezone)}" required /><input name="hours" inputmode="decimal" placeholder="Hours" required /><input name="notes" placeholder="Notes" /><button class="big" type="submit">Save log</button></form>
      <ul class="list">${weeds.map((w) => `<li><div><strong>${esc(w.log_date)} · ${esc(w.hours)} hrs</strong></div><button class="danger" type="button" data-act="ask-delete" data-table="weed_logs" data-id="${w.id}">Remove</button></li>`).join("")}</ul>
      </section>`;
  } else {
    body = sprayPanel(state, block, tab);
  }
  const lead = state.role === "manager" || state.role === "developer";
  return shell(state, `
    <h2>${esc(block.name)}</h2>
    ${blockQuote(state, block)}
    <div class="tabs">${tabs}</div>
    ${body}
    ${lead && tab === "tasks" ? `<form class="form" id="block-meta">
      <input name="variety" placeholder="Variety" value="${esc(block.variety || "")}" />
      <input name="rows" type="number" min="1" value="${block.row_count}" />
      <input name="plants" type="number" min="0" placeholder="Plants (optional)" value="${esc(block.plant_count ?? "")}" />
      <button class="ghost" type="submit">Save block</button>
    </form>
    <button class="danger" type="button" data-act="ask-delete" data-table="blocks" data-id="${block.id}">Archive this block</button>` : ""}
  `);
}

function sprayPanel(state, block, kind) {
  const list = state.data.sprays.filter((s) => !s.deleted_at && s.block_id === block.id && s.kind === kind && s.season_year === state.year)
    .sort((a, b) => String(b.spray_date).localeCompare(String(a.spray_date)));
  const current = list.find((s) => s.id === state.sprayId) || list[0];
  const chems = alive(state.data.chemicals).filter((c) => kind === "herbicide" ? c.category === "herbicide" : c.category !== "herbicide");
  const groups = {};
  for (const c of chems) (groups[c.category] ||= []).push(c);
  const options = Object.entries(groups).map(([cat, rows]) => `<optgroup label="${esc(cat)}">${rows.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup>`).join("");
  const label = kind === "herbicide" ? "Herbicide" : "Foliar";
  return `${weatherCard(state)}
    <p class="note">${label} is logged each pass. Start a new one when the mix or the date changes.</p>
    <form class="form" id="spray-form">
      <input type="hidden" name="kind" value="${kind}" />
      <input name="date" type="date" value="${vineyardToday(state.vineyard.timezone)}" required />
      <select name="chemical_id"><option value="">Chemical</option>${options}</select>
      <input name="chemical_name" placeholder="Or type a chemical name" />
      <input name="rate" placeholder="Rate" />
      <input name="volume" placeholder="Volume (gal/ac)" />
      <input name="tank" placeholder="Tank gal" />
      <input name="rec_number" placeholder="Rec # (optional)" />
      <input name="notes" placeholder="Notes" />
      <input name="photo" type="file" accept="image/*" />
      <button class="big" type="submit">Log pass</button>
    </form>
    ${list.map((s) => `<button class="tile" type="button" data-act="select-spray" data-id="${s.id}"><span><strong>${esc(s.spray_date)} · ${esc(s.chemical_name)}</strong><p class="meta">${[s.rate, s.rec_number ? `Rec ${s.rec_number}` : "", s.photo_path ? "Photo" : ""].filter(Boolean).join(" · ")}</p></span></button>`).join("")}
    ${current ? `<section class="panel stack"><p>${esc(current.chemical_name)} · ${Object.keys(current.rows_done || {}).length} of ${block.row_count} rows</p>
      ${current.rec_number ? `<p class="meta">Rec ${esc(current.rec_number)}</p>` : ""}
      ${state.photoUrls?.[current.photo_path] ? `<img class="shot" alt="Spray photo" src="${esc(state.photoUrls[current.photo_path])}" />` : ""}
      <div class="rows">${Array.from({ length: block.row_count }, (_, i) => {
        const on = Boolean((current.rows_done || {})[String(i + 1)]);
        return `<button type="button" class="row-btn ${on ? "status-complete" : "status-none"}" data-act="spray-row" data-row="${i + 1}">${i + 1}</button>`;
      }).join("")}</div>
      <button class="danger" type="button" data-act="ask-delete" data-table="spray_logs" data-id="${current.id}">Remove this pass</button>
    </section>` : ""}`;
}

function taskScreen(state) {
  const [blockId, taskId] = state.param.split("/");
  const block = state.data.blocks.find((b) => b.id === blockId);
  const task = state.data.tasks.find((t) => t.id === taskId);
  if (!block || !task) return shell(state, `<p>That job is not on this phone.</p>`);
  const done = countStatus(state.data.rows, state.year, block.id, task.id, "complete");
  const hrs = sumTaskHours(state.data.labor, state.data.contractors, state.year, task.id, block.id);
  const samples = state.data.samples.filter((s) => !s.deleted_at && s.block_id === block.id && s.season_year === state.year);
  const harvest = task.slug === "harvest" || /harvest/i.test(task.label);
  const lead = state.role === "manager" || state.role === "developer";
  return shell(state, `
    <h2>${esc(task.label)}</h2>
    <p class="meta">${esc(block.name)} · ${done} of ${block.row_count} complete · ${esc(formatHours(hrs) || "0")} hours this season</p>
    ${blockQuote(state, block)}
    <p class="muted">Tap a row to start the clock. Tap again, on the last row, when you stop.</p>
    ${legend()}
    ${rowGrid(state, block, [task.id], { act: "task-row", startRow: openJobFor(state.data.labor, state.userId)?.block_id === block.id && openJobFor(state.data.labor, state.userId)?.task_id === task.id ? openJobFor(state.data.labor, state.userId).row_start : null })}
    ${harvest ? `<section class="panel"><h2>Fruit samples</h2>
      <form class="form" id="sample-form"><input name="date" type="date" value="${vineyardToday(state.vineyard.timezone)}" required />
        <input name="rows" placeholder="Rows sampled" /><input name="brix" placeholder="Brix" /><input name="ph" placeholder="pH" /><input name="ta" placeholder="TA" /><input name="notes" placeholder="Notes" />
        <button class="big" type="submit">Save sample</button></form>
      <ul class="list">${samples.map((s) => `<li><div><strong>${esc(s.sample_date)}</strong><p class="meta">Brix ${esc(s.brix || "—")} · pH ${esc(s.ph || "—")} · TA ${esc(s.ta || "—")}</p></div><button class="danger" type="button" data-act="ask-delete" data-table="harvest_samples" data-id="${s.id}">Remove</button></li>`).join("")}</ul>
    </section>` : ""}
    ${lead ? `<button class="ghost" type="button" data-act="mark-rest" data-block="${block.id}" data-task="${task.id}">Mark remaining rows complete</button>` : ""}
  `);
}

function more(state) {
  const lead = state.role === "manager" || state.role === "developer";
  const items = [
    ["#/hours", "Hours"],
    ["#/manual", "Add forgotten hours"],
    ["#/maintenance", "Maintenance"],
    ["#/parts", "Find parts"],
    ["#/settings", "Color and settings"],
    ["#/bug", "Report a problem"],
  ];
  if (lead) {
    items.splice(2, 0, ["#/crew", "Crew"], ["#/passes", "Combined passes"], ["#/setup", "Blocks, tasks, chemicals"], ["#/contractors", "Contractors"]);
  }
  if (state.role === "developer") items.push(["#/managers", "Manager requests"]);
  if (state.role === "manager" || state.role === "developer") items.push(["#/bugs", "Problem reports"]);
  return shell(state, `
    <h2>More</h2>
    ${items.map(([href, label]) => `<button class="tile" type="button" data-act="go" data-href="${href}"><strong>${label}</strong></button>`).join("")}
    <button class="danger" type="button" data-act="sign-out">Sign out on this phone</button>
  `);
}

function hoursScreen(state) {
  const tasks = byName(alive(state.data.tasks));
  const rows = (state.data.labor || []).filter((r) => !r.deleted_at && r.season_year === state.year && (r.entry_kind === "task" || r.entry_kind === "pass_total"))
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const visible = state.role === "manager" ? rows : rows.filter((r) => r.user_id === state.userId || r.logged_by === state.userId);
  return shell(state, `
    <h2>Hours</h2>
    <p class="muted">Totals include the whole crew. ${state.role === "manager" ? "You can fix anyone's entry." : "You can fix your own for a few days."}</p>
    ${tasks.map((t) => {
      const hrs = sumTaskHours(state.data.labor, state.data.contractors, state.year, t.id);
      if (!hrs) return "";
      return `<p><strong>${esc(t.label)}</strong> · ${esc(formatHours(hrs))} hrs</p>`;
    }).join("")}
    <h2>Entries</h2>
    <ul class="list">${visible.slice(0, 40).map((r) => {
      const label = r.pass_id ? nameOf(state.data.passes, r.pass_id) : nameOf(state.data.tasks, r.task_id, "label");
      const who = state.role === "manager" ? personName(state, r.user_id) : "";
      return `<li><div><strong>${esc(r.work_date)} · ${esc(label || "Job")}</strong><p class="meta">${esc(formatHours(r.hours) || "0")} hrs${who ? ` · ${esc(who)}` : ""}${r.close_reason === "eod" ? " · stopped at end of day" : ""}</p></div>
        <button class="ghost" type="button" data-act="go" data-href="#/manual?edit=${r.id}">Fix</button></li>`;
    }).join("") || `<li><div>No hours yet.</div></li>`}</ul>
  `);
}

function manualScreen(state) {
  const blocks = byName(alive(state.data.blocks));
  const areas = byName(alive(state.data.areas));
  const tasks = byName(alive(state.data.tasks));
  const edit = state.edit || {};
  return shell(state, `
    <h2>${edit.id ? "Fix hours" : "Add forgotten hours"}</h2>
    <form class="form" id="manual-form">
      <input name="date" type="date" value="${esc(edit.work_date || vineyardToday(state.vineyard.timezone))}" required />
      <select name="place"><option value="">Where</option>
        ${blocks.map((b) => `<option value="block:${b.id}" ${edit.block_id === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}
        ${areas.map((a) => `<option value="area:${a.id}" ${edit.area_id === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
      </select>
      <select name="task_id" required><option value="">Task</option>${tasks.map((t) => `<option value="${t.id}" ${edit.task_id === t.id ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select>
      <div class="pair"><input name="start" type="time" value="${esc(edit.start || "")}" /><input name="end" type="time" value="${esc(edit.end || "")}" /></div>
      <input name="hours" inputmode="decimal" placeholder="Or just hours" value="${esc(edit.hours ?? "")}" />
      <input name="notes" placeholder="Notes" value="${esc(edit.notes || "")}" />
      <button class="big" type="submit">Save hours</button>
    </form>
    ${edit.id ? `<button class="danger" type="button" data-act="ask-delete" data-table="labor_entries" data-id="${edit.id}">Remove this entry</button>` : ""}
  `);
}

function exportScreen(state) {
  const manager = state.role === "manager";
  const year = state.exportYear || state.year;
  return shell(state, `
    <h2>Export</h2>
    <p class="note">Share a spreadsheet or a written report. Labor can be grouped by task, by pass, or both. Pass hours are already inside the task totals. Do not add the task section and the pass section together.</p>
    <label>Season <input id="year" type="number" value="${year}" data-act="year" /></label>
    <div class="tabs">
      ${["task", "pass", "both"].map((id) => `<button type="button" class="${state.laborMode === id ? "on" : ""}" data-act="labor-mode" data-id="${id}">${id === "both" ? "Both" : id === "task" ? "By task" : "By pass"}</button>`).join("")}
    </div>
    ${manager ? `<p class="muted">Labor cost uses each person's wage on the day they worked. It is a total per task or pass, not a list of people.</p>` : `<p class="muted">This login shows hours, not wages or cost.</p>`}
    ${[["overview", "Vineyard overview"], ["sprays", "Sprays log"], ["blocks", "Block-by-block"], ["labor", "Labor"]].map(([id, label]) => `<section class="panel stack">
      <h2>${label}</h2>
      <button class="big" type="button" data-act="share-csv" data-id="${id}">Share CSV spreadsheet</button>
      <button class="ghost" type="button" data-act="share-text" data-id="${id}">Share written report</button>
      <button class="ghost" type="button" data-act="copy-text" data-id="${id}">Copy report text</button>
      <pre class="preview">${esc(state.reports?.[id]?.text || "")}</pre>
    </section>`).join("")}
  `);
}

function crewScreen(state) {
  const lead = state.role === "manager" || state.role === "developer";
  if (!lead) return shell(state, `<p>A manager adds people to the crew.</p>`);
  const manager = state.role === "manager";
  const members = (state.data.members || []).filter((m) => m.active);
  return shell(state, `
    <h2>Crew</h2>
    <p class="note">Add their email here. On their phone they tap Create account and use that same email. They pick a password once and stay signed in. Asking for a manager does not make them one. They stay an employee until Aaron approves it.</p>
    <form class="form" id="invite-form">
      <input name="display_name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      <select name="role"><option value="employee">Employee</option><option value="manager">Manager, after Aaron approves</option></select>
      ${manager ? `<input name="wage" inputmode="decimal" placeholder="Hourly wage (optional)" />` : ""}
      <button class="big" type="submit">Add them</button>
    </form>
    <h2>Pending</h2>
    <ul class="list">${(state.data.invites || []).filter((i) => !i.accepted_at && !i.deleted_at).map((i) => `<li><div><strong>${esc(i.display_name || i.email)}</strong><p class="meta">${esc(i.email)} · ${i.role === "manager" ? "Manager, after Aaron approves" : "Employee"}</p></div><button class="danger" type="button" data-act="ask-delete" data-table="invites" data-id="${i.id}">Remove</button></li>`).join("") || "<li><div>No one waiting.</div></li>"}</ul>
    <h2>On the crew</h2>
    ${members.map((m) => {
      const pending = (state.data.managerRequests || []).some((r) => r.user_id === m.user_id && r.status === "pending");
      return `<section class="panel"><strong>${esc(personName(state, m.user_id))}</strong><p class="meta">${esc(m.role)}</p>
      ${m.role === "developer" ? `<p class="muted">Developer is set from the setup SQL.</p>` : `<div class="pair">
        ${pending ? `<p class="meta">Waiting for Aaron. Still an employee.</p>` : ""}
        ${m.role === "manager" ? `<button class="ghost" type="button" data-act="set-role" data-id="${m.id}" data-role="employee">Make employee</button>` : ""}
        ${m.role === "employee" && !pending ? `<button class="ghost" type="button" data-act="set-role" data-id="${m.id}" data-role="manager">Ask for manager</button>` : ""}
      </div>`}
      ${manager ? wageBox(state, m.user_id) : ""}
    </section>`;
    }).join("")}
  `);
}

function wageBox(state, userId) {
  const today = vineyardToday(state.vineyard.timezone);
  const rates = (state.data.wages || []).filter((w) => w.user_id === userId).sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
  const current = rates.find((w) => w.effective_from <= today);
  return `<form class="form" id="wage-form" data-user="${userId}">
    <p class="meta">Current wage ${current ? `$${Number(current.hourly_rate).toFixed(2)} since ${esc(current.effective_from)}` : "not set"}</p>
    <input name="hourly_rate" inputmode="decimal" placeholder="New hourly wage" required />
    <input name="effective_from" type="date" value="${today}" />
    <button class="ghost" type="submit">Save wage</button>
    ${rates.slice(0, 4).map((w) => `<p class="small">${esc(w.effective_from)} · $${Number(w.hourly_rate).toFixed(2)}</p>`).join("")}
  </form>`;
}

function managersScreen(state) {
  if (state.role !== "developer") return shell(state, `<p>Aaron approves managers.</p>`);
  const pending = (state.data.managerRequests || []).filter((r) => r.status === "pending");
  return shell(state, `
    <h2>Manager requests</h2>
    <p class="note">Nobody becomes a manager until you approve them here. Until then they stay an employee. Wages are not on this screen.</p>
    ${pending.map((r) => `<section class="panel">
      <strong>${esc(personName(state, r.user_id))}</strong>
      <p class="meta">Asked by ${esc(personName(state, r.requested_by))}</p>
      <div class="pair">
        <button class="big" type="button" data-act="decide-manager" data-id="${r.id}" data-approve="yes">Approve</button>
        <button class="danger" type="button" data-act="decide-manager" data-id="${r.id}" data-approve="no">Turn down</button>
      </div>
    </section>`).join("") || `<p>No one is waiting.</p>`}
  `);
}

function passesScreen(state) {
  if (state.role !== "manager" && state.role !== "developer") return shell(state, `<p>A manager sets up combined passes.</p>`);
  const tasks = byName(alive(state.data.tasks));
  const passes = byName(alive(state.data.passes));
  return shell(state, `
    <h2>Combined passes</h2>
    <p class="note">A pass is several jobs done together, such as nets up, clip top, and clip bottom. Logging the pass marks every job on those rows. Hours are kept as a pass total and also split evenly across the jobs.</p>
    <form class="form" id="pass-form">
      <input name="name" placeholder="Pass name" required />
      ${tasks.map((t) => `<label class="check"><input type="checkbox" name="task" value="${t.id}"/> ${esc(t.label)}</label>`).join("")}
      <button class="big" type="submit">Save pass</button>
    </form>
    ${passes.map((p) => {
      const names = passTaskIds(state, p.id).map((id) => nameOf(state.data.tasks, id, "label")).join(" + ");
      const hrs = sumPassHours(state.data.labor, state.year, p.id);
      return `<section class="panel"><strong>${esc(p.name)}</strong><p class="meta">${esc(names)} · ${esc(formatHours(hrs) || "0")} hrs</p>
        <button class="danger" type="button" data-act="ask-delete" data-table="passes" data-id="${p.id}">Archive pass</button></section>`;
    }).join("")}
  `);
}

function setupScreen(state) {
  const lead = state.role === "manager" || state.role === "developer";
  if (!lead) return shell(state, `<p>A manager or Aaron can change these lists.</p>`);
  const tasks = byName(state.data.tasks.filter((t) => !t.deleted_at));
  const blocks = byName(state.data.blocks.filter((b) => !b.deleted_at));
  const areas = byName(state.data.areas.filter((a) => !a.deleted_at));
  const chems = byName(state.data.chemicals.filter((c) => !c.deleted_at));
  return shell(state, `
    <h2>Lists</h2>
    <section class="panel"><h2>Tasks</h2>
      <form class="form" id="add-task"><input name="label" placeholder="New task" required /><button class="ghost" type="submit">Add</button></form>
      <ul class="list">${tasks.map((t) => `<li><div><strong>${esc(t.label)}</strong>${t.archived ? `<p class="meta">Archived</p>` : ""}</div>
        <span class="pair"><button class="ghost" type="button" data-act="rename-task" data-id="${t.id}">Rename</button>
        <button class="danger" type="button" data-act="ask-delete" data-table="tasks" data-id="${t.id}">${t.archived ? "Restore" : "Archive"}</button></span></li>`).join("")}</ul>
    </section>
    <section class="panel"><h2>Blocks</h2>
      <form class="form" id="add-block"><input name="name" placeholder="Block name" required /><input name="rows" type="number" value="40" min="1" /><button class="ghost" type="submit">Add block</button></form>
      <ul class="list">${blocks.map((b) => `<li><div><strong>${esc(b.name)}</strong></div><button class="danger" type="button" data-act="ask-delete" data-table="blocks" data-id="${b.id}">${b.archived ? "Restore" : "Archive"}</button></li>`).join("")}</ul>
    </section>
    <section class="panel"><h2>Areas</h2>
      <form class="form" id="add-area"><input name="name" placeholder="Area name" required /><button class="ghost" type="submit">Add area</button></form>
      <ul class="list">${areas.map((a) => `<li><div><strong>${esc(a.name)}</strong>${a.is_system ? `<p class="meta">Built in</p>` : ""}</div></li>`).join("")}</ul>
    </section>
    <section class="panel"><h2>Chemicals</h2>
      <p class="muted">Each one can link to its safety data sheet.</p>
      <form class="form" id="add-chemical"><input name="name" placeholder="Chemical" required />
        <select name="category"><option value="fungicide">Fungicide</option><option value="insecticide">Insecticide</option><option value="herbicide">Herbicide</option><option value="foliar">Foliar</option><option value="other">Other</option></select>
        <input name="sds_url" placeholder="SDS link" /><button class="ghost" type="submit">Add chemical</button></form>
      <ul class="list">${chems.slice(0, 20).map((c) => `<li><div><strong>${esc(c.name)}</strong><p class="meta">${esc(c.category)}${c.sds_url ? ` · <a href="${esc(c.sds_url)}" target="_blank" rel="noopener">Safety sheet</a>` : ""}</p></div></li>`).join("")}
      ${chems.length > 20 ? `<li><div class="muted">${chems.length - 20} more are in the spray picker.</div></li>` : ""}</ul>
    </section>
    ${quoteEditor(state)}
  `);
}

function quoteEditor(state) {
  const stored = Array.isArray(state.data.quotes) && state.data.quotes.some((row) => !row.deleted_at);
  const rows = quotesToShow(state.data.quotes);
  const editing = stored ? (state.data.quotes || []).find((row) => row.id === state.quoteEdit && !row.deleted_at) : null;
  return `<section class="panel"><h2>Variety quotes</h2>
    <p class="muted">One short line shows on a block. Leave variety blank for every block. Keep the words, the author, and the book or article.</p>
    <form class="form" id="quote-form">
      <input name="variety" placeholder="Variety (blank for any block)" value="${esc(editing?.variety || "")}" />
      <textarea name="text" placeholder="Quote" required>${esc(editing?.text || "")}</textarea>
      <input name="author" placeholder="Author" value="${esc(editing?.author || "")}" required />
      <input name="source" placeholder="Book or article" value="${esc(editing?.source || "")}" required />
      <button class="ghost" type="submit">${editing ? "Save quote" : "Add quote"}</button>
    </form>
    <ul class="list">${rows.map((row) => `<li><div><strong>${esc(row.variety || "Any block")}</strong><p class="meta">“${esc(row.text)}” ${esc(row.author)}</p></div>
      ${stored ? `<span class="pair"><button class="ghost" type="button" data-act="edit-quote" data-id="${esc(row.id)}">Edit</button>
      <button class="danger" type="button" data-act="ask-delete" data-table="variety_quotes" data-id="${esc(row.id)}">Remove</button></span>` : ""}</li>`).join("")}</ul>
  </section>`;
}

function contractorsScreen(state) {
  if (state.role !== "manager" && state.role !== "developer") return shell(state, `<p>A manager adds contractors.</p>`);
  const tasks = byName(alive(state.data.tasks));
  const rows = (state.data.contractors || []).filter((c) => !c.deleted_at && c.season_year === state.year);
  return shell(state, `
    <h2>Contractors</h2>
    <p class="note">People who do not sign in. Their hours or a flat amount still count in the labor total. The dollar amount is only visible to a manager.</p>
    <form class="form" id="contractor-form">
      <input name="person_name" placeholder="Name" required />
      <input name="company" placeholder="Company" />
      <input name="description" placeholder="What they did" required />
      <input name="date" type="date" value="${vineyardToday(state.vineyard.timezone)}" required />
      <input name="hours" inputmode="decimal" placeholder="Hours (optional)" />
      ${state.role === "manager" ? `<input name="amount" inputmode="decimal" placeholder="Flat cost (optional)" />` : ""}
      <select name="task_id"><option value="">Task (optional)</option>${tasks.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join("")}</select>
      <button class="big" type="submit">Save contractor</button>
    </form>
    <ul class="list">${rows.map((c) => `<li><div><strong>${esc(c.person_name)}</strong><p class="meta">${esc(c.work_date)} · ${esc(c.description)}${c.hours ? ` · ${esc(c.hours)} hrs` : ""}</p></div></li>`).join("")}</ul>
  `);
}

function partsScreen(state) {
  const gear = state.param ? (state.data.equipment || []).find((row) => row.id === state.param && !row.deleted_at) : null;
  if (state.param && !gear) return shell(state, `<p>That machine is not on this phone.</p>`);
  const askModel = needsModel(gear);
  const query = state.partQuery ?? (askModel ? "" : machineQuery(gear));
  const recent = state.partRecent || [];
  const offline = state.online === false;
  const links = askModel || offline ? [] : partSearchLinks(query);
  return shell(state, `
    <h2>Find parts</h2>
    ${gear ? `<p class="meta">${esc([gear.name, gear.make, gear.model].filter(Boolean).join(" · "))}</p>` : `<p class="muted">Fencing, irrigation, tractor parts, a golf cart, or a Gator.</p>`}
    ${askModel ? `<form class="form" id="equip-model">
      <p class="note">Add the model so the search can name this machine. It is saved on the equipment record.</p>
      <input name="make" placeholder="Make" value="${esc(gear.make || "")}" />
      <input name="model" placeholder="Model" required />
      <input name="serial" placeholder="Serial" value="${esc(gear.serial || "")}" />
      <input name="year" inputmode="numeric" placeholder="Year" value="${esc(gear.year ?? "")}" />
      <button class="big" type="submit">Save model</button>
    </form>` : ""}
    ${offline ? `<p class="banner">Find parts needs a connection. These searches open in the browser, so they wait until this phone is online.</p>` : ""}
    ${askModel || offline ? "" : `<form class="form" id="parts-query">
        <input id="parts-q" name="q" placeholder="Part or material" value="${esc(query)}" />
        <input id="parts-number" name="part_number" placeholder="Part number (optional)" />
        <button class="ghost" type="submit">Save part number</button>
      </form>
      <div class="chips">${PART_TOPICS.map(([label, topic]) => `<button class="ghost" type="button" data-act="part-chip" data-q="${esc(topic)}">${label}</button>`).join("")}</div>
      <p class="muted">Each button opens a search in the browser. Nothing is ordered from this app.</p>
      ${links.map((site) => `<button class="tile" type="button" data-act="open-part" data-site="${site.id}" data-url="${esc(site.url)}"><strong>${esc(site.label)}</strong></button>`).join("")}`}
    ${recent.length ? `<h2>Recent</h2><ul class="list">${recent.map((row) => `<li><div><strong>${esc(row.partNumber || row.query)}</strong>${row.partNumber && row.query ? `<p class="meta">${esc(row.query)}</p>` : ""}</div></li>`).join("")}</ul>` : ""}
  `);
}

function maintenanceScreen(state) {
  const gear = alive(state.data.equipment);
  const types = alive(state.data.serviceTypes);
  const logs = (state.data.serviceLogs || []).filter((l) => !l.deleted_at);
  return shell(state, `
    <h2>Maintenance</h2>
    <p class="note">For time on a tractor, fence, or planting, use Start work and pick Non-field work. This list is the equipment record.</p>
    <form class="form" id="equip-form">
      <input name="name" placeholder="Equipment" required />
      <input name="make" placeholder="Make" />
      <input name="model" placeholder="Model" />
      <input name="serial" placeholder="Serial" />
      <input name="year" inputmode="numeric" placeholder="Year" />
      <input name="notes" placeholder="Notes" />
      <button class="ghost" type="submit">Add equipment</button>
    </form>
    <ul class="list">${gear.map((item) => `<li><div><strong>${esc(item.name)}</strong><p class="meta">${esc([item.make, item.model, item.year, item.serial].filter(Boolean).join(" · "))}</p></div>
      <button class="ghost" type="button" data-act="go" data-href="#/parts/${item.id}">Find parts</button></li>`).join("")}</ul>
    <form class="form" id="service-form">
      <input name="date" type="date" value="${vineyardToday(state.vineyard.timezone)}" />
      <select name="equipment_id" required><option value="">Equipment</option>${gear.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select>
      <select name="service_type">${types.map((t) => `<option>${esc(t.name)}</option>`).join("")}</select>
      <input name="hours" placeholder="Hours / meter" /><input name="notes" placeholder="Notes" />
      <button class="big" type="submit">Log service</button>
    </form>
    <form class="form" id="type-form"><input name="type" placeholder="New service type" required /><button class="ghost" type="submit">Add type</button></form>
    <ul class="list">${logs.slice(0, 30).map((l) => `<li><div><strong>${esc(l.log_date)} · ${esc(nameOf(state.data.equipment, l.equipment_id))}</strong><p class="meta">${esc(l.service_type)}</p></div></li>`).join("")}</ul>
  `);
}

function tourCard(state) {
  if (!state.tour) return "";
  const steps = tourSteps(state.role);
  const index = Math.max(0, Math.min(state.tour.step || 0, steps.length - 1));
  const step = steps[index];
  const last = index === steps.length - 1;
  return `<div class="modal-back tour-back"><div class="modal" data-tour="${esc(step.id)}">
    <p class="meta">${index + 1} of ${steps.length}</p>
    <h2>${esc(step.title)}</h2>
    <p>${esc(step.body)}</p>
    <button class="big" type="button" data-act="tour-next">${last ? "Done" : "Next"}</button>
    <button class="ghost" type="button" data-act="tour-skip">Skip</button>
  </div></div>`;
}

function settingsScreen(state) {
  const manager = state.role === "manager";
  return shell(state, `
    <h2>Your color</h2>
    <p class="muted">This only changes your phone. Row colors stay the same for everyone: pale red, half green, full green.</p>
    <div class="themes">${THEMES.map((t) => `<button type="button" class="theme-btn ${state.profile?.theme === t.id ? "on" : ""}" data-act="theme" data-id="${t.id}" style="background:${t.id === "night" ? "#1b2622" : t.id === "grape" ? "#f3e8ff" : t.id === "sand" ? "#f7f1e4" : "#e7f0e4"};color:${t.id === "night" ? "#fff" : "#1c1917"}">${t.label}</button>`).join("")}</div>
    <form class="form" id="name-form"><input name="display_name" value="${esc(state.profile?.display_name || "")}" /><button class="ghost" type="submit">Save your name</button></form>
    ${manager ? `<h2>End of day</h2>
      <p class="note">Any clock still running stops itself at this time, Arizona time. It is 2:25 in the afternoon unless you change it.</p>
      <form class="form" id="eod-form">
        <input name="eod_time" type="time" value="${esc(String(state.vineyard.eod_time || "14:25").slice(0, 5))}" />
        <label>Days a person can fix their own hours <input name="edit_window_days" type="number" min="0" max="30" value="${state.vineyard.edit_window_days ?? 3}" /></label>
        <button class="big" type="submit">Save</button>
      </form>
      <h2>Weather location</h2>
      <p class="note">Sprays and watering use this point. DA Ranch starts at Cornville Rd. The station link opens the nearby weather page.</p>
      <form class="form" id="weather-form">
        <label>Latitude <input name="latitude" inputmode="decimal" value="${esc(state.vineyard.latitude ?? CORNVILLE_LAT)}" required /></label>
        <label>Longitude <input name="longitude" inputmode="decimal" value="${esc(state.vineyard.longitude ?? CORNVILLE_LON)}" required /></label>
        <label>Station link <input name="weather_url" type="url" value="${esc(state.vineyard.weather_url || DEFAULT_WEATHER_URL)}" /></label>
        <button class="big" type="submit">Save location</button>
      </form>` : `<p class="muted">A manager sets the end-of-day time. Open jobs stop at ${esc(String(state.vineyard?.eod_time || "14:25").slice(0, 5))}.</p>`}
    <button class="ghost" type="button" data-act="replay-tour">Show the tour again</button>
    ${state.installEvent ? `<button class="big" type="button" data-act="install">Install on this phone</button>` : `<p class="note">On an iPhone, tap Share, then Add to Home Screen. On Android, use the browser menu and choose Install app.</p>`}
  `);
}

function bugScreen(state) {
  return shell(state, `
    <h2>Report a problem</h2>
    <p class="note">Write what happened. The phone also saves a short note about the screen and the clock. It sends when there is Wi-Fi.</p>
    <form class="form" id="bug-form"><textarea name="note" placeholder="What went wrong?" required></textarea><button class="big" type="submit">Send</button></form>
  `);
}

function bugsScreen(state) {
  const rows = (state.data.bugs || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return shell(state, `
    <h2>Problem reports</h2>
    ${rows.map((b) => `<section class="panel"><strong>${esc(personName(state, b.user_id))}</strong><p>${esc(b.note)}</p><p class="small meta">${esc(b.created_at || "")}</p><pre class="preview">${esc(JSON.stringify(b.diagnostics || {}, null, 2))}</pre></section>`).join("") || `<p>No reports yet.</p>`}
  `);
}

function authScreen(state) {
  const up = state.authMode === "up";
  return `<header class="head"><h1>${esc(APP_NAME)}</h1><p class="sub">Sign in once on this phone. It stays signed in.</p></header>
    <div class="wrap">
      ${state.notice ? `<p class="banner">${esc(state.notice)}</p>` : ""}
      <p class="note">The first sign-in needs Wi-Fi. After that, row taps and logs work with no service and send themselves when the phone finds the network.</p>
      <form class="form" id="${up ? "signup-form" : "signin-form"}">
        ${up ? `<input name="display_name" placeholder="Your name" required />` : ""}
        <input name="email" type="email" placeholder="Email" autocomplete="username" required />
        <input name="password" type="password" placeholder="Password" autocomplete="${up ? "new-password" : "current-password"}" required />
        <button class="big" type="submit">${up ? "Create account" : "Sign in"}</button>
      </form>
      <button class="ghost" type="button" data-act="auth-mode">${up ? "I already have an account" : "New to the crew? Create an account"}</button>
      ${up ? "" : `<button class="ghost" type="button" data-act="forgot">Email me a reset link</button>`}
    </div>`;
}

function waitScreen(state) {
  return `<header class="head"><h1>${esc(APP_NAME)}</h1><p class="sub">Signed in as ${esc(state.profile?.display_name || state.session?.user?.email || "")}</p></header>
    <div class="wrap">
      <p class="note">A manager still needs to add ${esc(state.session?.user?.email || "this email")} to the vineyard. After they do, open the app on Wi-Fi and tap Check again.</p>
      <button class="big" type="button" data-act="check-again">Check again</button>
      <button class="ghost" type="button" data-act="sign-out">Sign out</button>
    </div>`;
}

export function renderApp(state) {
  if (state.route === "loading") {
    return `<header class="head"><h1>${esc(APP_NAME)}</h1><p class="sub">Opening the records on this phone…</p></header>`;
  }
  if (!state.session) return authScreen(state);
  if (!state.vineyard) return waitScreen(state);
  const route = state.route || "home";
  if (route === "home") return home(state);
  if (route === "work") return work(state);
  if (route === "finish") return finish(state);
  if (route === "block") return blockScreen(state);
  if (route === "task") return taskScreen(state);
  if (route === "export") return exportScreen(state);
  if (route === "more") return more(state);
  if (route === "hours") return hoursScreen(state);
  if (route === "manual") return manualScreen(state);
  if (route === "crew") return crewScreen(state);
  if (route === "managers") return managersScreen(state);
  if (route === "passes") return passesScreen(state);
  if (route === "setup") return setupScreen(state);
  if (route === "contractors") return contractorsScreen(state);
  if (route === "maintenance") return maintenanceScreen(state);
  if (route === "parts") return partsScreen(state);
  if (route === "settings") return settingsScreen(state);
  if (route === "bug") return bugScreen(state);
  if (route === "bugs") return bugsScreen(state);
  return home(state);
}
