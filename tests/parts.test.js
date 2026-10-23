import assert from "node:assert/strict";
import test from "node:test";
import { machineQuery, needsModel, partSearchLinks, partSearchUrl, pushPartRecent } from "../js/parts.js";

const tractor = { make: "Kubota", model: "L3901", serial: "K-100", year: 2014 };

test("a machine search keeps make, model, year, and serial", () => {
  assert.equal(machineQuery(tractor), "Kubota L3901 2014 K-100");
  assert.equal(needsModel(tractor), false);
  assert.equal(needsModel({ ...tractor, model: "  " }), true);
  assert.equal(needsModel(null), false);
});

test("part links are ordinary browser searches", () => {
  const query = "Kubota L3901 filter";
  const links = Object.fromEntries(partSearchLinks(query).map((site) => [site.id, site.url]));
  assert.equal(links.web, partSearchUrl("web", query));
  assert.match(links.web, /^https:\/\/www\.google\.com\/search\?q=Kubota%20L3901%20filter$/);
  assert.match(links.tsc, /^https:\/\/www\.tractorsupply\.com\/tsc\/search\/Kubota%20L3901%20filter$/);
  assert.match(links.deere, /^https:\/\/shop\.deere\.com\/us\/search\?text=Kubota%20L3901%20filter$/);
  assert.match(links.kubota, /^https:\/\/www\.google\.com\/search\?q=site%3Ashop\.kubotausa\.com%20Kubota%20L3901%20filter$/);
  assert.match(links.amazon, /^https:\/\/www\.amazon\.com\/s\?k=Kubota%20L3901%20filter$/);
  assert.match(links.ebay, /^https:\/\/www\.ebay\.com\/sch\/i\.html\?_nkw=Kubota%20L3901%20filter$/);
  assert.match(links.cart, /^https:\/\/www\.golfcartparts\.com\/search\?q=Kubota%20L3901%20filter$/);
});

test("recent part numbers stay short and do not repeat", () => {
  let list = [];
  list = pushPartRecent(list, { query: "filter", partNumber: "HH164-32430" });
  list = pushPartRecent(list, { query: "filter", partNumber: "HH164-32430" });
  list = pushPartRecent(list, { query: "fence", partNumber: "" });
  assert.equal(list.length, 2);
  assert.equal(list[0].partNumber, "");
  assert.equal(list[1].partNumber, "HH164-32430");
  for (let i = 0; i < 20; i += 1) list = pushPartRecent(list, { query: `q${i}`, partNumber: String(i) });
  assert.equal(list.length, 8);
});
