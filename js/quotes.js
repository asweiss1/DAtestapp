// Short lines kept only when the words and the source were checked.
// A block with no matching variety uses the general lines (variety "").

const STEVENSON = "The Silverado Squatters (1883), chapter \"Napa Wine\". Public domain, Project Gutenberg ebook 516.";
const JEFFERSON = "Letter to Jean Guillaume, baron Hyde de Neuville, 13 December 1818, Monticello. Encyclopedia Virginia (modernized spelling).";
const PLINY = "Natural History, book 14, chapter 28. John Bostock and H. T. Riley translation, 1855. Pliny gives this as a common proverb.";
const POCKET = "Hugh Johnson's Pocket Wine Book 2023, Margaret Rand general editor, grape varieties.";
const JANCIS_CAB = "Jancis Robinson, \"Cabernet Sauvignon\", jancisrobinson.com/learn/grape-varieties/red/cabernet-sauvignon.";
const JANCIS_SYRAH = "Jancis Robinson, \"Syrah\", jancisrobinson.com/learn/grape-varieties/red/syrah.";

export const BUNDLED_QUOTES = [
  {
    id: "q-stevenson-retrospect",
    variety: "",
    text: "a bottle of good wine, like a good act, shines ever in the retrospect",
    author: "Robert Louis Stevenson",
    source: STEVENSON,
  },
  {
    id: "q-stevenson-poetry",
    variety: "",
    text: "the soil has sublimated under sun and stars to something finer, and the wine is bottled poetry",
    author: "Robert Louis Stevenson",
    source: STEVENSON,
  },
  {
    id: "q-jefferson-cheap",
    variety: "",
    text: "No nation is drunken where wine is cheap; and none sober, where the dearness of wine substitutes ardent spirits as the common beverage.",
    author: "Thomas Jefferson",
    source: JEFFERSON,
  },
  {
    id: "q-pliny-truth",
    variety: "",
    text: "in wine there is truth",
    author: "Pliny the Elder",
    source: PLINY,
  },
  {
    id: "q-hj-cabernet",
    variety: "Cabernet Sauvignon",
    text: "Characterful: slow-ripening, spicy, herby, tannic, with blackcurrant aroma.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-jr-cabernet-warm",
    variety: "Cabernet Sauvignon",
    text: "Cabernet is much more positively flavoured than Chardonnay, and ripens much later, so tends to be planted in rather warmer areas.",
    author: "Jancis Robinson",
    source: JANCIS_CAB,
  },
  {
    id: "q-jr-cabernet-purple",
    variety: "Cabernet Sauvignon",
    text: "Cabernet Sauvignon is also notable for being deep purple in youth and, while it is not especially alcoholic, it can be extremely long-lived.",
    author: "Jancis Robinson",
    source: JANCIS_CAB,
  },
  {
    id: "q-hj-grenache",
    variety: "Grenache",
    text: "Important pale, potent grape for warm climates, fashionable with terroiristes because it expresses its site.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-petite",
    variety: "Petite Sirah",
    text: "Nothing to do with SYRAH; gives rustic, tannic, dark wine.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-syrah",
    variety: "Syrah",
    text: "The great Rhône red grape: tannic, purple, peppery, matures superbly.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-jr-syrah",
    variety: "Syrah",
    text: "The trademark flavour of French Syrah is black pepper.",
    author: "Jancis Robinson",
    source: JANCIS_SYRAH,
  },
  {
    id: "q-hj-tannat",
    variety: "Tannat",
    text: "Raspberry-perfumed, highly tannic force behind Madiran, Tursan and other firm reds from SW France.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-tempranillo-climate",
    variety: "Tempranillo",
    text: "elegant in cool climates, beefy in warm.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-tempranillo-ripening",
    variety: "Tempranillo",
    text: "Early ripening, long maturing.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-teroldego",
    variety: "Teroldego",
    text: "Trentino's best indigenous variety; serious, full-flavoured, esp on the flat Campo Rotaliano.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-greco",
    variety: "Greco",
    text: "Brisk, peachy flavour, most famous as Greco di Tufo.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-malvasia",
    variety: "Malvasia",
    text: "Not a single variety but a whole stable, not necessarily related or even alike.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-seyval",
    variety: "Seyval Blanc",
    text: "French hybrid of French and American vines; v. hardy, attractively fruity.",
    author: "Hugh Johnson",
    source: POCKET,
  },
  {
    id: "q-hj-vermentino",
    variety: "Vermentino",
    text: "Italian, sprightly, satisfying texture; ageing capacity.",
    author: "Hugh Johnson",
    source: POCKET,
  },
];

const ALIASES = {
  cabernet: "cabernet sauvignon",
  "cabernet sauvignon": "cabernet sauvignon",
  grenach: "grenache",
  grenache: "grenache",
  garnacha: "grenache",
  "grecco de tuffo": "greco",
  "greco di tufo": "greco",
  greco: "greco",
  counois: "counoise",
  counoise: "counoise",
  toraldego: "teroldego",
  teroldego: "teroldego",
  "petit sirah": "petite sirah",
  "petite sirah": "petite sirah",
  "petite syrah": "petite sirah",
  seyval: "seyval blanc",
  "seyval blanc": "seyval blanc",
};

export function varietyKey(name) {
  let text = String(name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  text = text.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/ \d+$/, "");
  if (!text || text === "general" || text === "any") return "";
  return ALIASES[text] || text;
}

function mix(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function quoteVisitKey() {
  const key = "daranch-quote-visit";
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

export function quotesToShow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return BUNDLED_QUOTES;
  return rows.filter((row) => row && !row.deleted_at && !row.archived);
}

export function pickQuote(rows, variety, visitKey = "visit") {
  const alive = (rows || []).filter((row) => row?.text && row.author && row.source && !row.deleted_at && !row.archived);
  const key = varietyKey(variety);
  let pool = key ? alive.filter((row) => varietyKey(row.variety) === key) : [];
  if (!pool.length) pool = alive.filter((row) => varietyKey(row.variety) === "");
  if (!pool.length) return null;
  const ordered = pool.slice().sort((a, b) => String(a.text).localeCompare(String(b.text)) || String(a.author).localeCompare(String(b.author)));
  return ordered[mix(`${visitKey}|${key}`) % ordered.length];
}

export function quoteCounts(rows = BUNDLED_QUOTES) {
  const counts = {};
  for (const row of rows) {
    const label = String(row.variety || "").trim() || "Any block";
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}
