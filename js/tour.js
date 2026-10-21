import { TOUR_ELLIOTT_NUDGE } from "./config.js";

// Short field tour. The Elliott line is the only part behind TOUR_ELLIOTT_NUDGE.
export function tourSteps(role, { elliott = TOUR_ELLIOTT_NUDGE } = {}) {
  const steps = [
    {
      id: "hello",
      title: "A short tour",
      body: elliott
        ? "Elliott, this is shorter than a walk back to the truck. The vines will still be there when you finish."
        : "A few taps, then you are in the field. Skip any time.",
    },
    {
      id: "start",
      title: "Pick the block and the task",
      body: "Tap Start work. Pick the block, or Non-field work for a fence, planting, or tractor. Then pick the task.",
    },
    {
      id: "row",
      title: "Tap the row you are starting",
      body: "On a block, tap the row. That starts your clock.",
    },
    {
      id: "lunch",
      title: "Lunch",
      body: "Lunch out pauses your clock. Lunch in starts it again. Lunch does not count as hours.",
    },
    {
      id: "end",
      title: "Partial or Complete",
      body: "Tap Done, tap the last row, then Partial or Complete. Pale red is not started. Half green is partial. Green is done.",
    },
    {
      id: "crew",
      title: "Add someone, or check them off",
      body: "Tap a name under Add person. Their clock starts then. Tap Off when they leave. Done stops everyone still on the job.",
    },
    {
      id: "problem",
      title: "Report a problem",
      body: "Problem is at the top of every screen. Write what happened. It sends when the phone has Wi-Fi.",
    },
    {
      id: "color",
      title: "Pick a color",
      body: "More, then Color and settings. Vineyard, Sand, Night, or Grape. The row colors stay the same for everyone.",
    },
  ];
  if (role === "manager") {
    steps.push(
      {
        id: "wages",
        title: "Crew and wages",
        body: "Managers only. More, then Crew. You add people and set each wage. The crew sees hours, not pay.",
      },
      {
        id: "cost",
        title: "Labor cost, and fixing hours",
        body: "Managers only. Export shows labor cost as a total for a task or a pass. You can fix anyone's hours. A person can fix their own for a few days.",
      },
      {
        id: "setup",
        title: "End of day, passes, chemicals, export",
        body: "Managers only. The 2:25 stop is in Color and settings. Combined passes and the chemical list are under More. Export is the spreadsheet and the written report.",
      },
    );
  }
  if (role === "developer") {
    steps.push({
      id: "approve",
      title: "Manager requests and problem reports",
      body: "More, then Manager requests. You approve or turn down a manager. Until you approve, they stay an employee. Problem reports are under More too. This login does not show wages or labor cost.",
    });
  }
  return steps;
}
