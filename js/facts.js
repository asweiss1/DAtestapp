// Short chemistry notes for the home card. Each line was read from the cited page.
// The phone keeps this copy so the card still shows with no service.

const BC = "BC Wine Grape Council, Fruit Sampling and Maturity, bpg.bcwgc.org/harvest-quality/fruit-sampling-and-maturity/";
const POWDERY = "UC ANR, Powdery Mildew of Grape (Erysiphe necator), ucanr.edu/sites/default/files/2023-11/390126.pdf";
const WATER = "UC ANR, Terry Prichard, Winegrape Irrigation Management, ucanr.edu/sites/default/files/2010-07/35488.pdf";

export const BUNDLED_FACTS = [
  {
    id: "fact-sugar-path",
    text: "Leaves make sucrose by photosynthesis and send it to the berries in the phloem. In the berry it becomes glucose and fructose, the main sugars at harvest. Glucose leads at veraison. By harvest the two are about equal. Fructose is sweeter and can pass glucose when the fruit is overripe.",
    source: BC,
  },
  {
    id: "fact-brix",
    text: "One degree Brix is 1 gram of sugar in 100 grams of juice, which is 1 percent sugar. The same reading is also called soluble solids or Balling.",
    source: BC,
  },
  {
    id: "fact-brix-week",
    text: "In a normal year a vineyard gains about one degree Brix in a week. The vine stops adding sugar somewhere around 25 Brix. After that, a higher reading is water leaving the berry, not more sugar arriving.",
    source: BC,
  },
  {
    id: "fact-heat-sugar",
    text: "Too much heat or drought late in the season can delay true ripeness and shrivel berries, so Brix rises by concentration. Raisined berries can read low at first because the sugar is not fully extracted.",
    source: BC,
  },
  {
    id: "fact-acids",
    text: "Tartaric and malic acid are about 90 percent of the acids in wine grapes, and the berry makes them, not the vine. Both climb before veraison. After veraison, tartaric falls mostly because the berry grows, then holds fairly steady. Malic also falls as the berry grows, and it is used up faster in warm weather. The late drop in acidity is mostly malic. Acidity changes taste more than pH does.",
    source: BC,
  },
  {
    id: "fact-ph",
    text: "pH measures how strong the free acid is. Titratable acidity measures how much acid is there. One pH unit is a tenfold change: pH 3.0 has ten times the acid intensity of pH 4.0. The sampling guide's desired harvest pH is 3.10 to 3.50. Warmer sites and seasons give a higher pH.",
    source: BC,
  },
  {
    id: "fact-potassium",
    text: "pH is not a ripeness clock by itself. Overripe fruit or a warm season can show high pH and low acidity because the berry uses up organic acids. Potassium taken up after veraison also raises pH while those acids are respired.",
    source: BC,
  },
  {
    id: "fact-phenols",
    text: "Phenols sit in the skins, seeds, and stems. More light on the berries encourages them. As fruit ripens they shift from hard and bitter, to astringent, then softer. Color is in the skins. The pulp is normally uncolored. Sugar and flavor are made by different paths, so they can peak on different days. Flavor often keeps building after sugar slows.",
    source: BC,
  },
  {
    id: "fact-warm-season",
    text: "In a warm climate, fruit can ripen while the days are still hot: sugar climbs fast, acid falls fast, pH runs high, and flavor may not have had time to catch up. A warm year or a small crop pushes sugar ahead of tannin, acid, and pH. A cool year or a large crop delays sugar and the loss of malic acid: lower sugar, higher acidity, lower pH, and a greener flavor.",
    source: BC,
  },
  {
    id: "fact-sampling",
    text: "A crush that breaks seeds can raise the pH reading by 0.2 to 0.3. Take berries from the middle of the cluster, or rotate top, middle, and bottom. Shoulders read higher Brix than the block. Measure the same way every time. Cold juice can drop potassium bitartrate and change pH, acidity, and potassium.",
    source: BC,
  },
  {
    id: "fact-powdery",
    text: "Developing fruit under 8 Brix is highly susceptible to powdery mildew. Berries become resistant once they pass about 15 Brix. The fungus does best around 70 to 85°F. Temperatures above 91°F can kill it, especially in strong sun. A dense canopy favors it.",
    source: POWDERY,
  },
  {
    id: "fact-stomata",
    text: "Stomata are the leaf pores where carbon dioxide enters for photosynthesis. A severe water deficit closes them long enough to limit sugar and fruit quality. A mild deficit in midseason mainly slows shoot growth. A hard deficit from veraison to harvest can drop leaves, sunburn fruit, and raisin berries.",
    source: WATER,
  },
];

function mix(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function factVisitKey() {
  const key = "daranch-fact-visit";
  try {
    if (typeof sessionStorage === "undefined") return "visit";
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = String(Math.floor(Math.random() * 1e9));
      sessionStorage.setItem(key, value);
    }
    return value;
  } catch {
    return "visit";
  }
}

export function factsToShow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return BUNDLED_FACTS;
  return rows.filter((row) => row && !row.deleted_at && !row.archived);
}

export function pickFact(rows, visitKey = "visit") {
  const alive = (rows || []).filter((row) => row?.text && row.source && !row.deleted_at && !row.archived);
  if (!alive.length) return null;
  const ordered = alive.slice().sort((a, b) => String(a.text).localeCompare(String(b.text)));
  return ordered[mix(`${visitKey}|fact`) % ordered.length];
}
