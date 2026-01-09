(async function() {
  const LAT = 36.7538;
  const LON = 3.0588;
  const WEATHER_CACHE_KEY = 'om_weather_cache';
  const AQI_CACHE_KEY = 'om_aqi_cache';
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  const weatherEl = document.getElementById('weather-text');
  const weatherIconEl = document.getElementById('weather-text-icon');
  const aqiEl = document.getElementById('aqi-text');
  const aqiDot = document.getElementById('aqi-dot'); // optional in DOM

  function setWeatherDisplay(icon, text) {
    if (weatherIconEl) weatherIconEl.textContent = icon;
    if (weatherEl) weatherEl.textContent = text;
  }

  function setAqiDisplay(aqiValue, label, colorClass) {
    if (aqiEl) aqiEl.textContent = `AQI ${aqiValue} · ${label}`;
    if (aqiDot) {
      // aqiDot expected to be an element you style; you can map colorClass to tailwind classes
      aqiDot.className = `inline-flex h-2 w-2 rounded-full ${colorClass} shadow ${colorClass}/60`;
    }
  }

  function mapUSAQIToLabel(aqi) {
    if (aqi <= 50) return { label: 'جيد', color: 'bg-emerald-400' };
    if (aqi <= 100) return { label: 'متوسط', color: 'bg-amber-400' };
    if (aqi <= 150) return { label: 'غير صحي للحساسين', color: 'bg-rose-400' };
    if (aqi <= 200) return { label: 'غير صحي', color: 'bg-red-500' };
    if (aqi <= 300) return { label: 'سيء جداً', color: 'bg-violet-600' };
    return { label: 'خطر', color: 'bg-black' };
  }

  async function fetchJsonWithCache(url, cacheKey) {
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (Date.now() - (cached.ts || 0) < CACHE_TTL_MS) {
          return cached.data;
        }
      }
    } catch (e) {
      // ignore parse errors
    }
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error('Network ' + resp.status);
    const data = await resp.json();
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {}
    return data;
  }

  async function updateFromAPIs(force = false) {
    try {
      // Weather
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true&timezone=auto`;
      const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=pm10,pm2_5,us_aqi,european_aqi&timezone=auto`;

      const weatherData = await fetchJsonWithCache(weatherUrl, WEATHER_CACHE_KEY);
      const aqiData = await fetchJsonWithCache(aqiUrl, AQI_CACHE_KEY);

      // Weather current
      if (weatherData && weatherData.current_weather) {
        const t = weatherData.current_weather.temperature;
        const w = weatherData.current_weather.weathercode; // numeric weather code
        // map weathercode to emoji (simple)
        const codeMap = {
          0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
          51: '🌦️', 53: '🌧️', 55: '🌧️', 61: '🌧️', 63: '🌧️', 65: '🌧️',
          71: '❄️', 73: '❄️', 75: '❄️', 95: '⛈️', 96: '⛈️'
        };
        const ico = codeMap[w] || '🌤️';
        setWeatherDisplay(ico, `${t}°C · حالة الطقس حالياً`);
      }

      // AQI current (Open-Meteo returns current.us_aqi if requested)
      if (aqiData && aqiData.current) {
        const usAqi = aqiData.current.us_aqi ?? null;
        const pm25 = aqiData.current.pm2_5 ?? null;
        const pm10 = aqiData.current.pm10 ?? null;
        if (usAqi != null) {
          const mapped = mapUSAQIToLabel(usAqi);
          setAqiDisplay(usAqi, mapped.label, mapped.color);
        } else if (pm25 != null) {
          // fallback: show pm2.5 value when no AQI computed
          setAqiDisplay(Math.round(pm25), `PM2.5 ${pm25} µg/m³`, 'bg-amber-400');
        }
      }
    } catch (err) {
      console.error('Failed to update weather/aqi:', err);
      // fallback: show last cached or friendly message
      const cachedWeather = localStorage.getItem(WEATHER_CACHE_KEY);
      const cachedAqi = localStorage.getItem(AQI_CACHE_KEY);
      if (cachedWeather) {
        try {
          const w = JSON.parse(cachedWeather).data;
          if (w && w.current_weather) {
            setWeatherDisplay('🌤️', `${w.current_weather.temperature}°C · (مخزنة محلياً)`);
          }
        } catch (e) {}
      } else {
        setWeatherDisplay('❗', 'تعذر جلب بيانات الطقس');
      }
      if (cachedAqi) {
        try {
          const a = JSON.parse(cachedAqi).data;
          if (a && a.current && a.current.us_aqi != null) {
            const m = mapUSAQIToLabel(a.current.us_aqi);
            setAqiDisplay(a.current.us_aqi, m.label + ' (مخزنة محلياً)', m.color);
          }
        } catch (e) {}
      } else {
        if (aqiEl) aqiEl.textContent = 'تعذر جلب بيانات جودة الهواء';
      }
    }
  }

  // initial
  updateFromAPIs(false);
  // auto-refresh every 10 minutes
  setInterval(() => updateFromAPIs(false), CACHE_TTL_MS);

  // optionally connect refresh button if exists
  const refreshBtn = document.getElementById('holidays-refresh') || document.getElementById('weather-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => updateFromAPIs(true));
  }
})();