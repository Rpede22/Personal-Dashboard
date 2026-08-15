"use client";

/**
 * Which city the Weather widgets use. Persisted in localStorage so the
 * header WeatherLine and the /weather hub always agree. Same-tab writes
 * broadcast a CustomEvent (`weather-city-change`) so both listeners
 * re-fetch immediately after the picker changes.
 */

export interface City {
  name: string;
  lat: number;
  lon: number;
}

/** A handful of Danish cities the user might actually check. Aarhus C is
 *  the default because most of the app data is Aarhus-anchored (Cand pay
 *  cycle, university, run routes). Add more via `saveCities()`. */
export const DEFAULT_CITIES: City[] = [
  { name: "Aarhus C",   lat: 56.1572, lon: 10.2107 },
  { name: "Copenhagen", lat: 55.6761, lon: 12.5683 },
  { name: "Esbjerg",    lat: 55.4761, lon: 8.4592 },
  { name: "Odense",     lat: 55.4038, lon: 10.4024 },
  { name: "Aalborg",    lat: 57.0488, lon: 9.9217 },
];

const SELECTED_KEY = "dashboard.weather.city";
const CITIES_KEY = "dashboard.weather.cities";
const CHANGE_EVENT = "weather-city-change";

export function loadCities(): City[] {
  if (typeof window === "undefined") return DEFAULT_CITIES;
  try {
    const raw = localStorage.getItem(CITIES_KEY);
    if (!raw) return DEFAULT_CITIES;
    const parsed = JSON.parse(raw) as City[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CITIES;
    return parsed.filter((c) => typeof c.lat === "number" && typeof c.lon === "number" && typeof c.name === "string");
  } catch { return DEFAULT_CITIES; }
}

export function saveCities(cities: City[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CITIES_KEY, JSON.stringify(cities));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* ignore */ }
}

export function loadSelectedCity(): City {
  if (typeof window === "undefined") return DEFAULT_CITIES[0];
  try {
    const raw = localStorage.getItem(SELECTED_KEY);
    if (!raw) return DEFAULT_CITIES[0];
    const parsed = JSON.parse(raw) as City;
    if (typeof parsed?.lat === "number" && typeof parsed?.lon === "number" && typeof parsed?.name === "string") return parsed;
  } catch { /* fall through */ }
  return DEFAULT_CITIES[0];
}

export function saveSelectedCity(city: City): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(city));
    // Same-tab storage events don't fire, so emit a CustomEvent listeners
    // can subscribe to. Cross-tab still gets the built-in `storage` event.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* ignore */ }
}

/**
 * React hook: current selected city, auto-updates when it changes in any
 * open tab (same-tab CustomEvent or cross-tab `storage` event).
 */
import { useEffect, useState } from "react";
export function useSelectedCity(): City {
  const [city, setCity] = useState<City>(DEFAULT_CITIES[0]);
  useEffect(() => {
    setCity(loadSelectedCity());
    const onChange = () => setCity(loadSelectedCity());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return city;
}
