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
