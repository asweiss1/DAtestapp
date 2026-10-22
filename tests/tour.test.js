import assert from "node:assert/strict";
import test from "node:test";
import { tourSteps } from "../js/tour.js";
import { renderApp } from "../js/ui.js";

function names(role, elliott) {
  return tourSteps(role, { elliott }).map((step) => step.id);
}

test("the field tour is short and the Elliott line is one flag", () => {
  const on = tourSteps("employee", { elliott: true });
  const off = tourSteps("employee", { elliott: false });
  assert.ok(on.length <= 12);
  assert.equal(on.filter((step) => step.body.includes("Elliott")).length, 1);
  assert.equal(off.some((step) => step.body.includes("Elliott")), false);
  assert.deepEqual(names("employee", true).slice(1), names("employee", false).slice(1));
  for (const id of ["start", "row", "lunch", "end", "crew", "problem", "color"]) {
    assert.ok(names("employee", false).includes(id), id);
  }
  const text = on.map((step) => step.body).join(" ");
  assert.equal(text.includes("Managers only"), false);
  assert.equal(text.includes("Manager requests"), false);
  assert.match(text, /Partial or Complete/);
  assert.match(text, /Lunch out/);
  assert.match(text, /Add person/);
  assert.match(text, /Check off/);
  assert.equal(text.includes("Tap Off"), false);
});

test("managers and the developer get only their extra steps", () => {
  const manager = tourSteps("manager", { elliott: false }).map((step) => `${step.title} ${step.body}`).join("\n");
  assert.match(manager, /Managers only/);
  assert.match(manager, /Crew/);
  assert.match(manager, /wage/i);
  assert.match(manager, /labor cost/i);
  assert.match(manager, /anyone's hours/);
  assert.match(manager, /2:25/);
  assert.match(manager, /passes/i);
  assert.match(manager, /chemical/i);
  assert.match(manager, /Export/);
  assert.equal(manager.includes("Manager requests"), false);

  const developer = tourSteps("developer", { elliott: false }).map((step) => `${step.title} ${step.body}`).join("\n");
  assert.match(developer, /Manager requests/);
  assert.match(developer, /Problem reports/);
  assert.match(developer, /does not show wages or labor cost/);
  assert.equal(developer.includes("Managers only"), false);
  assert.equal(names("developer", false).includes("wages"), false);
  assert.equal(names("developer", false).includes("cost"), false);
});

function screen(overrides) {
  return renderApp({
    route: "home",
    param: "",
    session: { user: { id: "u1" } },
    userId: "u1",
    profile: { id: "u1", display_name: "Ada", theme: "sage" },
    vineyard: { id: "v", name: "DA Ranch", timezone: "America/Phoenix", eod_time: "14:25:00", edit_window_days: 3 },
    role: "employee",
    year: 2026,
    data: {
      blocks: [], tasks: [], passes: [], passTasks: [], areas: [], chemicals: [],
      labor: [], rows: [], sprays: [], watering: [], weeds: [], samples: [],
      equipment: [], serviceTypes: [], serviceLogs: [], contractors: [],
      members: [], profiles: [], invites: [], wages: [], bugs: [], seasons: [], managerRequests: [],
    },
    online: true,
    ...overrides,
  });
}

test("the tour can be skipped and replayed from settings", () => {
  const hidden = screen({});
  assert.equal(hidden.includes("data-act=\"tour-skip\""), false);
  const first = screen({ tour: { step: 0 } });
  assert.match(first, /Elliott/);
  assert.match(first, /Skip/);
  assert.match(first, /Next/);
  assert.match(first, /1 of /);
  const last = screen({ tour: { step: 99 } });
  assert.match(last, /Done/);
  assert.match(last, /Pick a color/);
  const settings = screen({ route: "settings" });
  assert.match(settings, /Show the tour again/);
  const manager = screen({ role: "manager", tour: { step: 8 } });
  assert.match(manager, /Managers only/);
  assert.doesNotMatch(manager, /Hourly wage/);
});
