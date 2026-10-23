import { CORNVILLE_LAT, CORNVILLE_LON, DEFAULT_WEATHER_URL, NWS_USER_AGENT } from "./config.js";
import { addCalendarDays, isoDate, vineyardToday, zonedParts } from "./logic.js";

export const HEAT_F = 100;
export const PHOENIX = "America/Phoenix";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function vineyardPoint(vineyard) {
  const lat = Number(vineyard?.latitude);
  const lon = Number(vineyard?.longitude);
  return {
    lat: Number.isFinite(lat) ? lat : CORNVILLE_LAT,
    lon: Number.isFinite(lon) ? lon : CORNVILLE_LON,
  };
}

export function stationUrl(vineyard) {
  const url = String(vineyard?.weather_url || "").trim();
  if (/^https:\/\//i.test(url)) return url;
  return DEFAULT_WEATHER_URL;
}

export function toFahrenheit(value, unitCode) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const unit = String(unitCode || "");
  if (unit.includes("degC")) return Number(value) * 9 / 5 + 32;
  return Number(value);
}

export function toMph(value, unitCode) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const unit = String(unitCode || "");
  if (unit.includes("km_h")) return Number(value) * 0.621371;
  if (unit.includes("m_s")) return Number(value) * 2.23694;
  return Number(value);
}

export function compass(degrees) {
  if (degrees == null || !Number.isFinite(Number(degrees))) return "";
  const turn = ((Number(degrees) % 360) + 360) % 360;
  return COMPASS[Math.round(turn / 22.5) % 16];
}

function periodsOf(doc) {
  if (!doc) return [];
  if (Array.isArray(doc)) return doc;
  return doc.properties?.periods || [];
}

function rainPercent(period) {
  const value = period?.probabilityOfPrecipitation?.value;
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value));
}

function roundTemp(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value));
}

function hourLabel(iso, timeZone) {
  const parts = zonedParts(new Date(iso), timeZone);
  const hour = parts.hour % 12 || 12;
  const ampm = parts.hour < 12 ? "AM" : "PM";
  return `${hour} ${ampm}`;
}

function dayLabel(name, iso, timeZone) {
  const base = String(name || "").replace(/ Night$/, "");
  const known = {
    Today: "Today",
    "This Afternoon": "Today",
    "This Morning": "Today",
    Sunday: "Sun",
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
  };
  if (known[base]) return known[base];
  if (!iso) return base.slice(0, 3);
  const parts = zonedParts(new Date(iso), timeZone);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return WEEK[utc.getUTCDay()];
}

function windPhrase(dir, speed) {
  if (typeof speed === "number" && Math.round(speed) === 0) return "Calm";
  const direction = dir ? String(dir) : "";
  const howFast = speed == null || speed === ""
    ? ""
    : (typeof speed === "number" ? `${Math.round(speed)} mph` : String(speed));
  return [direction, howFast].filter(Boolean).join(" ");
}

export function formatUpdatedAt(iso, now = new Date(), timeZone = PHOENIX) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zonedParts(date, timeZone);
  const hour = parts.hour % 12 || 12;
  const ampm = parts.hour < 12 ? "AM" : "PM";
  const time = `${hour}:${String(parts.minute).padStart(2, "0")} ${ampm}`;
  const day = isoDate(parts.year, parts.month, parts.day);
  if (day === vineyardToday(timeZone, now)) return time;
  return `${MONTHS[parts.month - 1]} ${parts.day}, ${time}`;
}

function dateKey(iso, timeZone) {
  if (!iso) return "";
  return vineyardToday(timeZone, new Date(iso));
}

export function buildWeatherSnapshot({
  forecast,
  hourly,
  observation,
  stationName = "",
  fetchedAt,
  now = new Date(),
  timeZone = PHOENIX,
  latitude = null,
  longitude = null,
} = {}) {
  const forecastPeriods = periodsOf(forecast);
  const hourlyPeriods = periodsOf(hourly);
  const obs = observation?.properties || {};
  const observedTemp = toFahrenheit(obs.temperature?.value, obs.temperature?.unitCode);
  const observedWind = toMph(obs.windSpeed?.value, obs.windSpeed?.unitCode);
  const observedDir = compass(obs.windDirection?.value);
  const nowMs = now.getTime();
  const coming = hourlyPeriods.filter((period) => new Date(period.endTime || period.startTime).getTime() > nowMs);
  const currentHour = coming[0] || null;
  const hours = coming.slice(0, 4).map((period) => ({
    start: period.startTime,
    label: hourLabel(period.startTime, timeZone),
    tempF: roundTemp(period.temperature),
    wind: windPhrase(period.windDirection, period.windSpeed),
    rainPercent: rainPercent(period),
    text: period.shortForecast || "",
  }));
  const days = forecastPeriods.filter((period) => period.isDaytime).slice(0, 7).map((period) => ({
    start: period.startTime,
    name: dayLabel(period.name, period.startTime, timeZone),
    tempF: roundTemp(period.temperature),
    wind: windPhrase(period.windDirection, period.windSpeed),
    rainPercent: rainPercent(period),
    text: period.shortForecast || "",
  }));
  const todayParts = zonedParts(now, timeZone);
  const today = isoDate(todayParts.year, todayParts.month, todayParts.day);
  const tomorrowParts = addCalendarDays(todayParts.year, todayParts.month, todayParts.day, 1);
  const tomorrowKey = isoDate(tomorrowParts.y, tomorrowParts.m, tomorrowParts.d);
  const tomorrowDay = forecastPeriods.find((period) => period.isDaytime && dateKey(period.startTime, timeZone) === tomorrowKey) || null;
  const tomorrowNight = forecastPeriods.find((period) => !period.isDaytime && dateKey(period.startTime, timeZone) === tomorrowKey) || null;
  const nights = forecastPeriods.filter((period) => !period.isDaytime && dateKey(period.startTime, timeZone) === today).map((period) => ({
    start: period.startTime,
    tempF: roundTemp(period.temperature),
  }));
  const text = obs.textDescription || currentHour?.shortForecast || "";
  return {
    fetchedAt: fetchedAt || now.toISOString(),
    latitude,
    longitude,
    stationName: stationName || obs.stationName || "",
    current: {
      tempF: roundTemp(observedTemp != null ? observedTemp : currentHour?.temperature),
      wind: windPhrase(observedDir || currentHour?.windDirection, observedWind != null ? observedWind : currentHour?.windSpeed),
      rainPercent: rainPercent(currentHour),
      text,
      observedAt: obs.timestamp || null,
    },
    hourly: hours,
    tomorrow: tomorrowDay ? {
      start: tomorrowDay.startTime,
      tempF: roundTemp(tomorrowDay.temperature),
      nightTempF: tomorrowNight ? roundTemp(tomorrowNight.temperature) : null,
      wind: windPhrase(tomorrowDay.windDirection, tomorrowDay.windSpeed),
      rainPercent: rainPercent(tomorrowDay),
      text: tomorrowDay.shortForecast || "",
    } : null,
    daily: days,
    nights,
  };
}

function rainText(value) {
  return value == null ? "" : `${value}% rain`;
}

export function weatherLines(snapshot, now = new Date(), timeZone = PHOENIX) {
  if (!snapshot?.fetchedAt) return null;
  const current = snapshot.current || {};
  const nowBits = [
    current.tempF == null ? "Now" : `Now ${current.tempF}°`,
    current.wind || "",
    rainText(current.rainPercent),
    current.text || "",
    snapshot.stationName || "",
  ].filter(Boolean);
  const hours = (snapshot.hourly || []).map((hour) => [
    hour.label,
    hour.tempF == null ? "" : `${hour.tempF}°`,
    hour.wind || "",
    rainText(hour.rainPercent),
  ].filter(Boolean).join(" ")).join(" · ");
  const tomorrow = snapshot.tomorrow;
  const tomorrowLine = tomorrow ? [
    `Tomorrow ${tomorrow.tempF}°`,
    tomorrow.nightTempF == null ? "" : `night ${tomorrow.nightTempF}°`,
    tomorrow.wind || "",
    rainText(tomorrow.rainPercent),
    tomorrow.text || "",
  ].filter(Boolean).join(" · ") : "";
  return {
    now: nowBits.join(" · "),
    hours: hours ? `Next hours: ${hours}` : "",
    tomorrow: tomorrowLine,
    days: snapshot.daily || [],
    updated: formatUpdatedAt(snapshot.fetchedAt, now, timeZone),
  };
}

export function heatAlert(snapshot, timeZone = PHOENIX, now = new Date()) {
  if (!snapshot) return null;
  const today = vineyardToday(timeZone, now);
  const temps = [];
  if (snapshot.current?.tempF != null) temps.push(Number(snapshot.current.tempF));
  for (const row of snapshot.hourly || []) {
    if (row.tempF != null && dateKey(row.start, timeZone) === today) temps.push(Number(row.tempF));
  }
  for (const row of snapshot.daily || []) {
    if (row.tempF != null && dateKey(row.start, timeZone) === today) temps.push(Number(row.tempF));
  }
  for (const row of snapshot.nights || []) {
    if (row.tempF != null && dateKey(row.start, timeZone) === today) temps.push(Number(row.tempF));
  }
  const max = temps.reduce((best, temp) => (Number.isFinite(temp) ? Math.max(best, temp) : best), -Infinity);
  if (!Number.isFinite(max) || max < HEAT_F) return null;
  return { tempF: Math.round(max) };
}

async function readJson(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`Weather ${response.status}`);
  return response.json();
}

export async function fetchNwsWeather(lat, lon, fetchImpl = globalThis.fetch, now = new Date()) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Weather needs a map point");
  const headers = {
    Accept: "application/geo+json",
    "User-Agent": NWS_USER_AGENT,
  };
  const point = await readJson(fetchImpl, `https://api.weather.gov/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`, headers);
  const props = point.properties || {};
  const [forecast, hourly, stations] = await Promise.all([
    readJson(fetchImpl, props.forecast, headers),
    readJson(fetchImpl, props.forecastHourly, headers),
    readJson(fetchImpl, props.observationStations, headers),
  ]);
  const nearest = (stations.features || [])[0] || null;
  const stationId = nearest?.properties?.stationIdentifier || "";
  let observation = null;
  if (stationId) {
    try {
      observation = await readJson(fetchImpl, `https://api.weather.gov/stations/${stationId}/observations/latest`, headers);
    } catch {
      observation = null;
    }
  }
  return buildWeatherSnapshot({
    forecast,
    hourly,
    observation,
    stationName: nearest?.properties?.name || "",
    fetchedAt: now.toISOString(),
    now,
    latitude,
    longitude,
  });
}
