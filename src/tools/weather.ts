import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

// Open-Meteo: free, no API key. https://open-meteo.com/en/docs

export const geocodeCity = defineTool({
  name: 'geocode_city',
  description:
    'Look up a city by name and return its latitude, longitude, country and timezone. Call this before get_forecast.',
  input: v.object({
    city: v.pipe(v.string(), v.minLength(2), v.description('City name only, e.g. "Lisbon"')),
  }),
  async run({ data, signal }) {
    // The geocoder matches names only, so "Lisbon, Portugal" -> "Lisbon".
    const name = data.city.split(',')[0].trim();
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Geocoding failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      results?: Array<{ name: string; country: string; latitude: number; longitude: number; timezone: string }>;
    };
    const place = body.results?.[0];
    // Throwing turns into a tool error the model can see and recover from.
    if (!place) throw new Error(`No city found named "${name}". Ask the user to check the spelling.`);
    return {
      output: {
        name: place.name,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: place.timezone,
      },
    };
  },
});

// WMO weather codes -> short descriptions, so the model doesn't have to guess.
const WEATHER: Record<number, string> = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'dense drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'heavy showers',
  82: 'violent showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};

const isoDate = v.pipe(v.string(), v.isoDate());

export const getForecast = defineTool({
  name: 'get_forecast',
  description:
    'Get the daily weather forecast (min/max °C, chance of rain, conditions) for a latitude/longitude between two dates (YYYY-MM-DD). Only works up to 16 days ahead. Get coordinates from geocode_city first.',
  input: v.object({
    latitude: v.number(),
    longitude: v.number(),
    startDate: isoDate,
    endDate: isoDate,
  }),
  async run({ data, signal }) {
    const params = new URLSearchParams({
      latitude: String(data.latitude),
      longitude: String(data.longitude),
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
      start_date: data.startDate,
      end_date: data.endDate,
      timezone: 'auto',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
    if (!res.ok) {
      const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason;
      const today = new Date().toISOString().slice(0, 10);
      throw new Error(
        `Forecast unavailable for ${data.startDate}..${data.endDate}: ${reason ?? `HTTP ${res.status}`}. ` +
          `Forecasts only cover today (${today}) up to 16 days ahead.`,
      );
    }
    const { daily } = (await res.json()) as {
      daily: {
        time: string[];
        temperature_2m_min: number[];
        temperature_2m_max: number[];
        precipitation_probability_max: number[];
        weather_code: number[];
      };
    };
    return {
      output: daily.time.map((date, i) => ({
        date,
        minC: daily.temperature_2m_min[i],
        maxC: daily.temperature_2m_max[i],
        rainChancePct: daily.precipitation_probability_max[i],
        conditions: WEATHER[daily.weather_code[i]] ?? `code ${daily.weather_code[i]}`,
      })),
    };
  },
});
