// Search links only. No parts catalog is called from the app.
// Each URL was checked as a public search page, except Tractor Supply,
// whose /tsc/search/{term} results path is the one the site itself uses,
// and Amazon /s?k=, which is Amazon's public search.

export const PART_TOPICS = [
  ["Fencing", "fencing"],
  ["Plumbing / irrigation", "irrigation plumbing"],
  ["Tractor parts", "tractor parts"],
  ["Golf cart", "golf cart parts"],
  ["Gator / UTV", "Gator UTV parts"],
];

export const PART_SITES = [
  { id: "web", label: "Web search" },
  { id: "tsc", label: "Tractor Supply" },
  { id: "deere", label: "John Deere parts" },
  { id: "kubota", label: "Kubota parts" },
  { id: "amazon", label: "Amazon" },
  { id: "ebay", label: "eBay" },
  { id: "cart", label: "Golf cart parts" },
];

export function machineQuery(equipment) {
  if (!equipment) return "";
  return [equipment.make, equipment.model, equipment.year, equipment.serial]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function needsModel(equipment) {
  return Boolean(equipment) && !String(equipment.model || "").trim();
}

export function partSearchUrl(siteId, query) {
  const q = String(query || "").trim();
  const enc = encodeURIComponent(q);
  if (siteId === "web") return `https://www.google.com/search?q=${enc}`;
  if (siteId === "tsc") return `https://www.tractorsupply.com/tsc/search/${enc}`;
  if (siteId === "deere") return `https://shop.deere.com/us/search?text=${enc}`;
  if (siteId === "kubota") return `https://www.google.com/search?q=${encodeURIComponent(`site:shop.kubotausa.com ${q}`.trim())}`;
  if (siteId === "amazon") return `https://www.amazon.com/s?k=${enc}`;
  if (siteId === "ebay") return `https://www.ebay.com/sch/i.html?_nkw=${enc}`;
  if (siteId === "cart") return `https://www.golfcartparts.com/search?q=${enc}`;
  return "";
}

export function partSearchLinks(query) {
  return PART_SITES.map((site) => ({ ...site, url: partSearchUrl(site.id, query) }));
}

export function pushPartRecent(list, entry, limit = 8) {
  const query = String(entry?.query || "").trim();
  const partNumber = String(entry?.partNumber || "").trim();
  if (!query && !partNumber) return (list || []).slice(0, limit);
  const next = {
    query,
    partNumber,
    at: entry.at || new Date().toISOString(),
  };
  const kept = (list || []).filter((row) => row.query !== next.query || row.partNumber !== next.partNumber);
  return [next, ...kept].slice(0, limit);
}
