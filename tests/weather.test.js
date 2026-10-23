import assert from "node:assert/strict";
import test from "node:test";
import { CORNVILLE_LAT, CORNVILLE_LON, DEFAULT_WEATHER_URL, NWS_USER_AGENT } from "../js/config.js";
import {
  buildWeatherSnapshot,
  compass,
  fetchNwsWeather,
  formatUpdatedAt,
  heatAlert,
  toFahrenheit,
  toMph,
  weatherLines,
} from "../js/weather.js";

const NOW = new Date("2026-07-15T18:00:00.000Z");

function period(start, end, temp, windDirection, windSpeed, rain, name, isDaytime, text) {
  return {
    startTime: start,
    endTime: end,
    temperature: temp,
    temperatureUnit: "F",
    windDirection,
    windSpeed,
    isDaytime,
    name,
    shortForecast: text,
    probabilityOfPrecipitation: { value: rain },
  };
}

function sample() {
  return buildWeatherSnapshot({
    now: NOW,
    fetchedAt: "2026-07-15T18:00:00.000Z",
    latitude: CORNVILLE_LAT,
    longitude: CORNVILLE_LON,
    stationName: "Cottonwood Airport",
    observation: {
      properties: {
        timestamp: "2026-07-15T17:55:00.000Z",
        textDescription: "Sunny",
        temperature: { unitCode: "wmoUnit:degC", value: 38 },
        windSpeed: { unitCode: "wmoUnit:km_h-1", value: 16.1 },
        windDirection: { value: 180 },
        stationName: "Cottonwood Airport",
      },
    },
    hourly: {
      properties: {
        periods: [
          period("2026-07-15T10:00:00-07:00", "2026-07-15T11:00:00-07:00", 99, "S", "8 mph", 20, "", false, "Hot"),
          period("2026-07-15T11:00:00-07:00", "2026-07-15T12:00:00-07:00", 101, "S", "10 mph", 10, "", false, "Hot"),
          period("2026-07-15T12:00:00-07:00", "2026-07-15T13:00:00-07:00", 103, "SW", "12 mph", 5, "", false, "Hot"),
          period("2026-07-15T13:00:00-07:00", "2026-07-15T14:00:00-07:00", 102, "SW", "10 mph", 0, "", false, "Hot"),
          period("2026-07-15T14:00:00-07:00", "2026-07-15T15:00:00-07:00", 100, "W", "8 mph", 0, "", false, "Hot"),
        ],
      },
    },
    forecast: {
      properties: {
        periods: [
          period("2026-07-15T06:00:00-07:00", "2026-07-15T18:00:00-07:00", 104, "S", "10 mph", 15, "Today", true, "Sunny"),
          period("2026-07-15T18:00:00-07:00", "2026-07-16T06:00:00-07:00", 90, "S", "5 mph", 10, "Tonight", false, "Clear"),
          period("2026-07-16T06:00:00-07:00", "2026-07-16T18:00:00-07:00", 98, "E", "5 mph", 40, "Thursday", true, "Breezy"),
          period("2026-07-16T18:00:00-07:00", "2026-07-17T06:00:00-07:00", 70, "E", "3 mph", 20, "Thursday Night", false, "Clear"),
          period("2026-07-17T06:00:00-07:00", "2026-07-17T18:00:00-07:00", 96, "W", "6 mph", 5, "Friday", true, "Sunny"),
          period("2026-07-18T06:00:00-07:00", "2026-07-18T18:00:00-07:00", 95, "W", "6 mph", 0, "Saturday", true, "Sunny"),
          period("2026-07-19T06:00:00-07:00", "2026-07-19T18:00:00-07:00", 94, "N", "4 mph", 0, "Sunday", true, "Sunny"),
          period("2026-07-20T06:00:00-07:00", "2026-07-20T18:00:00-07:00", 93, "N", "4 mph", 0, "Monday", true, "Sunny"),
          period("2026-07-21T06:00:00-07:00", "2026-07-21T18:00:00-07:00", 92, "N", "4 mph", 0, "Tuesday", true, "Sunny"),
        ],
      },
    },
  });
}

test("Cornville is the seeded map point and the station page is Wunderground", () => {
  assert.equal(CORNVILLE_LAT, 34.7183);
  assert.equal(CORNVILLE_LON, -111.9086);
  assert.equal(DEFAULT_WEATHER_URL, "https://www.wunderground.com/weather/us/az/cornville");
  assert.match(NWS_USER_AGENT, /DA Ranch Vineyard App/);
});

test("temperatures, wind, and the clock use the units the crew reads", () => {
  assert.equal(Math.round(toFahrenheit(19, "wmoUnit:degC")), 66);
  assert.equal(Math.round(toMph(7.416, "wmoUnit:km_h-1")), 5);
  assert.equal(compass(180), "S");
  assert.equal(compass(220), "SW");
  assert.equal(compass(0), "N");
  const calm = buildWeatherSnapshot({
    now: NOW,
    fetchedAt: "2026-07-15T18:00:00.000Z",
    observation: { properties: { temperature: { value: 20, unitCode: "wmoUnit:degC" }, windSpeed: { value: 0, unitCode: "wmoUnit:km_h-1" }, windDirection: { value: 10 } } },
  });
  assert.equal(calm.current.wind, "Calm");
  assert.equal(formatUpdatedAt("2026-07-15T18:00:00.000Z", NOW), "11:00 AM");
  assert.equal(formatUpdatedAt("2026-07-14T18:00:00.000Z", NOW), "Jul 14, 11:00 AM");
});

test("a forecast keeps wind, rain, the next hours, tomorrow, and seven days", () => {
  const snapshot = sample();
  assert.equal(snapshot.current.tempF, 100);
  assert.equal(snapshot.current.wind, "S 10 mph");
  assert.equal(snapshot.current.rainPercent, 10);
  assert.equal(snapshot.current.text, "Sunny");
  assert.equal(snapshot.stationName, "Cottonwood Airport");
  assert.equal(snapshot.hourly.length, 4);
  assert.equal(snapshot.hourly[0].label, "11 AM");
  assert.equal(snapshot.hourly[0].tempF, 101);
  assert.equal(snapshot.hourly[3].label, "2 PM");
  assert.equal(snapshot.hourly[3].tempF, 100);
  assert.equal(snapshot.tomorrow.tempF, 98);
  assert.equal(snapshot.tomorrow.nightTempF, 70);
  assert.equal(snapshot.tomorrow.rainPercent, 40);
  assert.equal(snapshot.tomorrow.wind, "E 5 mph");
  assert.equal(snapshot.daily.length, 7);
  assert.equal(snapshot.daily[0].name, "Today");
  assert.equal(snapshot.daily[1].name, "Thu");
  const lines = weatherLines(snapshot, NOW);
  assert.match(lines.now, /Now 100°/);
  assert.match(lines.now, /S 10 mph/);
  assert.match(lines.now, /10% rain/);
  assert.match(lines.hours, /Next hours: 11 AM 101°/);
  assert.match(lines.tomorrow, /Tomorrow 98°/);
  assert.match(lines.tomorrow, /night 70°/);
  assert.match(lines.tomorrow, /40% rain/);
  assert.equal(lines.updated, "11:00 AM");
});

test("heat is 100 today from the current reading or today's forecast", () => {
  const snapshot = sample();
  assert.equal(heatAlert(snapshot, "America/Phoenix", NOW).tempF, 104);
  const coolNow = {
    ...snapshot,
    current: { tempF: 99 },
    hourly: [],
    daily: [{ start: "2026-07-15T06:00:00-07:00", tempF: 99 }],
    nights: [],
  };
  assert.equal(heatAlert(coolNow, "America/Phoenix", NOW), null);
  const laterToday = {
    ...coolNow,
    hourly: [{ start: "2026-07-15T20:00:00-07:00", tempF: 100 }],
  };
  assert.equal(heatAlert(laterToday, "America/Phoenix", NOW).tempF, 100);
  const tomorrowOnly = {
    ...coolNow,
    daily: [{ start: "2026-07-16T06:00:00-07:00", tempF: 110 }],
  };
  assert.equal(heatAlert(tomorrowOnly, "America/Phoenix", NOW), null);
  const hotNight = {
    ...coolNow,
    nights: [{ start: "2026-07-15T18:00:00-07:00", tempF: 100 }],
  };
  assert.equal(heatAlert(hotNight, "America/Phoenix", NOW).tempF, 100);
});

test("the weather request uses the National Weather Service and a User-Agent", async () => {
  const calls = [];
  const json = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    if (String(url).includes("/points/")) {
      return json({
        properties: {
          forecast: "https://api.weather.gov/forecast",
          forecastHourly: "https://api.weather.gov/hourly",
          observationStations: "https://api.weather.gov/stations",
        },
      });
    }
    if (String(url).endsWith("/forecast")) return json({ properties: { periods: [] } });
    if (String(url).endsWith("/hourly")) return json({ properties: { periods: [] } });
    if (String(url).endsWith("/stations")) {
      return json({ features: [{ properties: { stationIdentifier: "KP52", name: "Cottonwood Airport" } }] });
    }
    return json({
      properties: {
        temperature: { unitCode: "wmoUnit:degC", value: 40 },
        windSpeed: { unitCode: "wmoUnit:km_h-1", value: 16 },
        windDirection: { value: 220 },
        textDescription: "Hot",
        timestamp: "2026-07-15T18:00:00.000Z",
      },
    });
  };
  const snapshot = await fetchNwsWeather(CORNVILLE_LAT, CORNVILLE_LON, fetchImpl, NOW);
  assert.equal(calls[0].url, "https://api.weather.gov/points/34.7183,-111.9086");
  assert.equal(calls[0].headers.Accept, "application/geo+json");
  assert.equal(calls[0].headers["User-Agent"], NWS_USER_AGENT);
  assert.equal(calls.at(-1).url, "https://api.weather.gov/stations/KP52/observations/latest");
  assert.equal(snapshot.current.tempF, 104);
  assert.equal(snapshot.current.wind, "SW 10 mph");
  assert.equal(snapshot.stationName, "Cottonwood Airport");
  assert.equal(heatAlert(snapshot, "America/Phoenix", NOW).tempF, 104);
});
