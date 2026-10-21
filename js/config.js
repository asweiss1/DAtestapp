export const APP_NAME = "DA Ranch Vineyard App";
export const APP_VERSION = "1.0.0";

// Publishable key: it is meant to live in the browser. The secret key must never be added here.
export const SUPABASE_URL = "https://skpburnqszcrwuftizsw.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ngxd3dy5cuJlmISX1uKI0w_YnrPgtnT";

export const LEGACY_STORAGE_KEY = "vineyard-html-v3";
export const LEGACY_FLAG_KEY = "daranch-legacy-v1";
export const THEME_KEY = "daranch-theme";
export const TOUR_SEEN_PREFIX = "daranch-tour-seen:";

// First release only. Set this to false, or delete it, to drop the Elliott line from the tour.
export const TOUR_ELLIOTT_NUDGE = true;

export const THEMES = [
  { id: "sage", label: "Vineyard" },
  { id: "sand", label: "Sand" },
  { id: "night", label: "Night" },
  { id: "grape", label: "Grape" },
];

export const SW_CACHE = "daranch-app-v1";
