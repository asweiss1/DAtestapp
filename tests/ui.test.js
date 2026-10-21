import assert from "node:assert/strict";
import test from "node:test";
import { APP_NAME } from "../js/config.js";
import { renderApp } from "../js/ui.js";

function base(overrides = {}) {
  const blockId = "b1";
  const taskId = "t1";
  return {
    route: "home",
    param: "",
    session: { user: { id: "u1", email: "a@da.test" } },
    userId: "u1",
    profile: { id: "u1", display_name: "Ada", theme: "sage" },
    vineyard: { id: "v1", name: "DA Ranch", timezone: "America/Phoenix", eod_time: "14:25:00", edit_window_days: 3 },
    role: "employee",
    year: 2026,
    data: {
      blocks: [{ id: blockId, name: "DA Tannat", variety: "Tannat", row_count: 3, sort_order: 1 }],
      tasks: [{ id: taskId, slug: "leaf-pulling", label: "Leaf pulling", sort_order: 1 }],
      passes: [],
      passTasks: [],
      areas: [{ id: "a1", name: "Non-field work", kind: "non_field", is_system: true }],
      chemicals: [],
      labor: [],
      rows: [
        { season_year: 2026, block_id: blockId, task_id: taskId, row_number: 1, status: "none" },
        { season_year: 2026, block_id: blockId, task_id: taskId, row_number: 2, status: "partial" },
        { season_year: 2026, block_id: blockId, task_id: taskId, row_number: 3, status: "complete" },
      ],
      sprays: [],
      watering: [],
      weeds: [],
      samples: [],
      equipment: [],
      serviceTypes: [],
      serviceLogs: [],
      contractors: [],
      members: [{ id: "m1", user_id: "u1", role: "employee", active: true }],
      profiles: [{ id: "u1", display_name: "Ada" }, { id: "u2", display_name: "Sam" }],
      invites: [],
      wages: [],
      bugs: [],
      seasons: [],
    },
    flow: { step: "place", crew: {} },
    modal: null,
    notice: "",
    syncError: "",
    syncing: false,
    online: true,
    outbox: 0,
    tab: "tasks",
    laborMode: "task",
    reports: { overview: { text: "overview" }, sprays: { text: "" }, blocks: { text: "" }, labor: { text: "Hours only" } },
    photoUrls: {},
    authMode: "in",
    ...overrides,
  };
}

test("the app name is DA Ranch Vineyard App", () => {
  assert.equal(APP_NAME, "DA Ranch Vineyard App");
  const html = renderApp({ route: "auth", session: null, authMode: "in", notice: "" });
  assert.match(html, /DA Ranch Vineyard App/);
  assert.match(html, /Sign in/);
});

test("row buttons keep the three status colors", () => {
  const html = renderApp({ ...base(), route: "task", param: "b1/t1" });
  assert.match(html, /status-none/);
  assert.match(html, /status-partial/);
  assert.match(html, /status-complete/);
});

test("starting another job asks to close the open one", () => {
  const html = renderApp(base({
    modal: { type: "switch" },
    data: {
      ...base().data,
      labor: [{
        id: "job",
        user_id: "u1",
        entry_kind: "open",
        ended_at: null,
        task_id: "t1",
        block_id: "b1",
        started_at: "2026-06-15T15:00:00.000Z",
        pause_seconds: 0,
      }],
    },
  }));
  assert.match(html, /Close the open job first/);
  assert.match(html, /Close it, then start/);
});

test("employees never see a wage field", () => {
  const more = renderApp({ ...base(), route: "more" });
  assert.doesNotMatch(more, /Crew/);
  assert.doesNotMatch(more, /wage/i);
  const crew = renderApp({ ...base(), route: "crew" });
  assert.doesNotMatch(crew, /wage-form/);
  assert.doesNotMatch(crew, /Hourly wage/);
});

test("a manager can set a wage and a developer cannot see cost", () => {
  const manager = renderApp(base({
    route: "crew",
    role: "manager",
    data: {
      ...base().data,
      members: [
        { id: "m1", user_id: "u1", role: "manager", active: true },
        { id: "m2", user_id: "u2", role: "employee", active: true },
      ],
      wages: [{ user_id: "u2", hourly_rate: 18, effective_from: "2026-01-01" }],
    },
  }));
  assert.match(manager, /wage-form/);
  assert.match(manager, /Hourly wage/);

  const developer = renderApp(base({
    route: "more",
    role: "developer",
    data: {
      ...base().data,
      members: [{ id: "m1", user_id: "u1", role: "developer", active: true }],
    },
  }));
  assert.match(developer, /Problem reports/);
  assert.doesNotMatch(developer, /wage-form/);

  const devCrew = renderApp(base({
    route: "crew",
    role: "developer",
    data: {
      ...base().data,
      members: [{ id: "m1", user_id: "u1", role: "developer", active: true }],
    },
  }));
  assert.doesNotMatch(devCrew, /wage-form/);
  assert.doesNotMatch(devCrew, /Hourly wage/);

  const devExport = renderApp({ ...base(), route: "export", role: "developer" });
  assert.match(devExport, /hours, not wages or cost/);
  assert.doesNotMatch(devExport, /Labor cost uses/);
});

test("a shared job lists who is on it and does not copy the same hours", () => {
  const labor = [
    {
      id: "job",
      crew_job_id: "job",
      user_id: "u1",
      entry_kind: "open",
      ended_at: null,
      task_id: "t1",
      block_id: "b1",
      started_at: "2026-06-15T15:00:00.000Z",
      pause_seconds: 0,
      row_start: 1,
    },
    {
      id: "nick",
      crew_job_id: "job",
      user_id: "u2",
      entry_kind: "open",
      ended_at: null,
      task_id: "t1",
      block_id: "b1",
      started_at: "2026-06-15T16:00:00.000Z",
      pause_seconds: 0,
      row_start: 1,
    },
  ];
  const data = {
    ...base().data,
    members: [
      { id: "m1", user_id: "u1", role: "employee", active: true },
      { id: "m2", user_id: "u2", role: "employee", active: true },
      { id: "m3", user_id: "u3", role: "employee", active: true },
    ],
    profiles: [
      { id: "u1", display_name: "Holly" },
      { id: "u2", display_name: "Nick" },
      { id: "u3", display_name: "Sam" },
    ],
    labor,
  };
  const home = renderApp(base({
    profile: { id: "u1", display_name: "Holly", theme: "sage" },
    data,
  }));
  assert.match(home, /Holly/);
  assert.match(home, /Nick/);
  assert.match(home, /Add person/);
  assert.match(home, /Sam/);
  assert.match(home, /data-act="crew-off"/);
  assert.match(home, /data-act="crew-add"/);
  assert.doesNotMatch(home, /Who else worked/);
  const finish = renderApp(base({
    route: "finish",
    flow: { finishJobId: "job" },
    profile: { id: "u1", display_name: "Holly", theme: "sage" },
    data,
  }));
  assert.match(finish, /still on it: Holly, Nick/);
  assert.match(finish, /Partial/);
  assert.match(finish, /Complete/);
  assert.doesNotMatch(finish, /Who else worked/);
  assert.doesNotMatch(finish, /same hours/);
});

test("nobody becomes a manager until Aaron approves the request", () => {
  const managerMore = renderApp(base({
    route: "more",
    role: "manager",
    data: {
      ...base().data,
      members: [
        { id: "m1", user_id: "u1", role: "manager", active: true },
        { id: "m2", user_id: "u2", role: "employee", active: true },
      ],
    },
  }));
  assert.doesNotMatch(managerMore, /Manager requests/);

  const developerMore = renderApp(base({
    route: "more",
    role: "developer",
    data: {
      ...base().data,
      members: [{ id: "m1", user_id: "u1", role: "developer", active: true }],
    },
  }));
  assert.match(developerMore, /Manager requests/);
  assert.doesNotMatch(developerMore, /wage-form/);

  const waiting = renderApp(base({
    route: "crew",
    role: "manager",
    data: {
      ...base().data,
      members: [
        { id: "m1", user_id: "u1", role: "manager", active: true },
        { id: "m2", user_id: "u2", role: "employee", active: true },
      ],
      invites: [{ id: "i1", email: "lead@da.test", display_name: "Lead", role: "manager" }],
      managerRequests: [{ id: "r1", user_id: "u2", vineyard_id: "v1", status: "pending", requested_by: "u1" }],
    },
  }));
  assert.match(waiting, /Waiting for Aaron\. Still an employee\./);
  assert.match(waiting, /Manager, after Aaron approves/);
  assert.doesNotMatch(waiting, /Ask for manager/);
  assert.match(waiting, /wage-form/);

  const ask = renderApp(base({
    route: "crew",
    role: "developer",
    data: {
      ...base().data,
      members: [
        { id: "m1", user_id: "u1", role: "developer", active: true },
        { id: "m2", user_id: "u2", role: "employee", active: true },
      ],
    },
  }));
  assert.match(ask, /Ask for manager/);
  assert.doesNotMatch(ask, /wage-form/);
  assert.doesNotMatch(ask, /Hourly wage/);

  const screen = renderApp(base({
    route: "managers",
    role: "developer",
    profile: { id: "u1", display_name: "Aaron", theme: "sage" },
    data: {
      ...base().data,
      members: [
        { id: "m1", user_id: "u1", role: "developer", active: true },
        { id: "m2", user_id: "u2", role: "employee", active: true },
      ],
      profiles: [{ id: "u1", display_name: "Aaron" }, { id: "u2", display_name: "Sam" }],
      managerRequests: [{ id: "r1", user_id: "u2", requested_by: "u1", status: "pending" }],
    },
  }));
  assert.match(screen, /Sam/);
  assert.match(screen, /Asked by Aaron/);
  assert.match(screen, /Approve/);
  assert.match(screen, /Turn down/);
  assert.match(screen, /data-act="decide-manager"/);
  assert.match(screen, /Wages are not on this screen/);
  assert.doesNotMatch(screen, /wage-form/);
  assert.doesNotMatch(screen, /Hourly wage/);

  const hidden = renderApp(base({ route: "managers", role: "manager" }));
  assert.match(hidden, /Aaron approves managers/);
  assert.doesNotMatch(hidden, /data-act="decide-manager"/);
});

test("spray and water show weather, and heat shows on every page", () => {
  const weather = {
    fetchedAt: "2026-07-15T18:00:00.000Z",
    stationName: "Cottonwood Airport",
    current: { tempF: 104, wind: "S 10 mph", rainPercent: 10, text: "Sunny" },
    hourly: [{ start: "2026-07-15T18:00:00-07:00", label: "11 AM", tempF: 104, wind: "S 10 mph", rainPercent: 10 }],
    tomorrow: { tempF: 98, nightTempF: 75, wind: "E 5 mph", rainPercent: 40, text: "Sunny" },
    daily: [{ name: "Today", start: "2026-07-15T06:00:00-07:00", tempF: 104, wind: "S 10 mph", rainPercent: 15 }],
    nights: [],
  };
  const vineyard = {
    ...base().vineyard,
    latitude: 34.7183,
    longitude: -111.9086,
    weather_url: "https://www.wunderground.com/weather/us/az/cornville",
  };
  const water = renderApp(base({ route: "block", param: "b1", tab: "water", weather, vineyard }));
  assert.match(water, /Now 104°/);
  assert.match(water, /S 10 mph/);
  assert.match(water, /10% rain/);
  assert.match(water, /Next hours: 11 AM 104°/);
  assert.match(water, /Tomorrow 98°/);
  assert.match(water, /40% rain/);
  assert.match(water, /Updated /);
  assert.match(water, /Cornville station/);
  assert.match(water, /https:\/\/www\.wunderground\.com\/weather\/us\/az\/cornville/);
  assert.match(water, /Heat today: 104°/);
  assert.match(water, /Save hours/);

  const foliar = renderApp(base({ route: "block", param: "b1", tab: "foliar", weather, vineyard }));
  assert.match(foliar, /Now 104°/);
  assert.match(foliar, /Log pass/);
  assert.match(foliar, /Cornville station/);

  const tasks = renderApp(base({ route: "block", param: "b1", tab: "tasks", weather, vineyard }));
  assert.match(tasks, /Heat today: 104°/);
  assert.doesNotMatch(tasks, /Next hours/);

  const home = renderApp(base({ weather, vineyard }));
  assert.match(home, /Heat today: 104°/);
  assert.doesNotMatch(home, /Cornville station/);

  const cool = {
    ...weather,
    current: { ...weather.current, tempF: 99 },
    hourly: [],
    daily: [{ ...weather.daily[0], tempF: 99 }],
  };
  assert.doesNotMatch(renderApp(base({ weather: cool, vineyard })), /Heat today/);

  const ask = renderApp(base({ weather, vineyard, heatAsk: true }));
  assert.match(ask, /Notify this phone/);

  const waiting = renderApp(base({ route: "block", param: "b1", tab: "water", vineyard }));
  assert.match(waiting, /Weather loads when this phone has Wi-Fi/);
  assert.match(waiting, /Cornville station/);
});

test("a manager edits the weather point and the station link", () => {
  const manager = renderApp(base({ route: "settings", role: "manager" }));
  assert.match(manager, /Weather location/);
  assert.match(manager, /name="latitude"/);
  assert.match(manager, /34\.7183/);
  assert.match(manager, /-111\.9086/);
  assert.match(manager, /wunderground\.com\/weather\/us\/az\/cornville/);
  const employee = renderApp(base({ route: "settings", role: "employee" }));
  assert.doesNotMatch(employee, /Weather location/);
  const developer = renderApp(base({ route: "settings", role: "developer" }));
  assert.doesNotMatch(developer, /Weather location/);
});

test("a block screen shows one sourced line for that variety", () => {
  const html = renderApp(base({ route: "block", param: "b1", quoteVisit: "visit" }));
  assert.match(html, /class="quote"/);
  assert.match(html, /Raspberry-perfumed/);
  assert.match(html, /Hugh Johnson/);
  assert.match(html, /Pocket Wine Book 2023/);
  const task = renderApp(base({ route: "task", param: "b1/t1", quoteVisit: "visit" }));
  assert.match(task, /Raspberry-perfumed/);
  const working = renderApp(base({
    route: "work",
    quoteVisit: "visit",
    flow: { step: "task", blockId: "b1", crew: {} },
  }));
  assert.match(working, /Raspberry-perfumed/);
});

test("managers edit quotes and the crew only reads them", () => {
  const manager = renderApp(base({
    route: "setup",
    role: "manager",
    data: { ...base().data, quotes: [{ id: "q1", variety: "Tannat", text: "A saved line for the test.", author: "Ada", source: "A notebook on the ranch." }] },
  }));
  assert.match(manager, /id="quote-form"/);
  assert.match(manager, /A saved line for the test/);
  assert.match(manager, /data-act="edit-quote"/);
  const employee = renderApp(base({ route: "setup", role: "employee" }));
  assert.doesNotMatch(employee, /quote-form/);
});

test("find parts is on More and on an equipment row", () => {
  const more = renderApp(base({ route: "more" }));
  assert.match(more, /#\/parts/);
  assert.match(more, /Find parts/);
  const maintenance = renderApp(base({
    route: "maintenance",
    data: {
      ...base().data,
      equipment: [{ id: "e1", name: "Vineyard tractor", make: "Kubota", model: "L3901", serial: "K-100", year: 2014 }],
    },
  }));
  assert.match(maintenance, /name="make"/);
  assert.match(maintenance, /#\/parts\/e1/);
  assert.match(maintenance, /Kubota/);
});

test("a machine without a model asks for one before the search links", () => {
  const html = renderApp(base({
    route: "parts",
    param: "e1",
    online: true,
    data: {
      ...base().data,
      equipment: [{ id: "e1", name: "Vineyard tractor", make: "Kubota", model: "", serial: "K-100", year: 2014 }],
    },
  }));
  assert.match(html, /id="equip-model"/);
  assert.match(html, /Add the model/);
  assert.doesNotMatch(html, /data-act="open-part"/);
});

test("find parts builds browser links and says so when offline", () => {
  const html = renderApp(base({
    route: "parts",
    param: "e1",
    online: true,
    partQuery: "Kubota L3901 2014 K-100",
    data: {
      ...base().data,
      equipment: [{ id: "e1", name: "Vineyard tractor", make: "Kubota", model: "L3901", serial: "K-100", year: 2014 }],
    },
  }));
  assert.match(html, /shop\.deere\.com\/us\/search\?text=Kubota/);
  assert.match(html, /site%3Ashop\.kubotausa\.com/);
  assert.match(html, /tractorsupply\.com\/tsc\/search\//);
  assert.match(html, /amazon\.com\/s\?k=/);
  assert.match(html, /ebay\.com\/sch\/i\.html\?_nkw=/);
  assert.match(html, /golfcartparts\.com\/search\?q=/);
  assert.match(html, /google\.com\/search\?q=/);
  assert.match(html, /Fencing/);
  const offline = renderApp(base({ route: "parts", online: false }));
  assert.match(offline, /Find parts needs a connection/);
  assert.doesNotMatch(offline, /data-act="open-part"/);
});
