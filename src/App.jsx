import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Sun, Cloud, CloudRain, CloudLightning, CloudFog, Moon, CloudSun, CloudMoon,
  MapPin, Search, Bell, Settings, ChevronRight, ChevronLeft, X, Plus, Check,
  Globe, RefreshCw, AlertTriangle, Activity, Home as HomeIcon, Radio, Trash2,
  WifiOff, ShieldAlert, Info, ChevronDown, Star, ArrowUpRight, Waves,
} from "lucide-react";

/* ============================================================
   MALAYSIA WEATHER INTELLIGENCE
   Data: api.data.gov.my (MET Malaysia Open Data)
   ============================================================ */

// All requests go through our own same-origin /api proxy (see /api/weather/*
// and vite.config.js) instead of calling api.data.gov.my directly from the
// browser. That avoids CORS restrictions entirely, since the browser only
// ever talks to our own origin — the proxy talks to MET Malaysia server-side.
const API_BASE = "/api/weather";

/* ---------- Malay → English presentation layer ---------- */
const FORECAST_MAP = {
  "Berjerebu": "Hazy",
  "Tiada hujan": "No rain",
  "Hujan": "Rain",
  "Hujan di beberapa tempat": "Scattered rain",
  "Hujan di satu dua tempat": "Isolated rain",
  "Hujan di satu dua tempat di kawasan pantai": "Isolated rain (coastal)",
  "Hujan di satu dua tempat di kawasan pedalaman": "Isolated rain (inland)",
  "Ribut petir": "Thunderstorms",
  "Ribut petir di beberapa tempat": "Scattered thunderstorms",
  "Ribut petir di beberapa tempat di kawasan pedalaman": "Scattered thunderstorms (inland)",
  "Ribut petir di satu dua tempat": "Isolated thunderstorms",
  "Ribut petir di satu dua tempat di kawasan pantai": "Isolated thunderstorms (coastal)",
  "Ribut petir di satu dua tempat di kawasan pedalaman": "Isolated thunderstorms (inland)",
};
const WHEN_MAP = {
  "Pagi": "Morning",
  "Malam": "Night",
  "Petang": "Afternoon",
  "Pagi dan Petang": "Morning and Afternoon",
  "Pagi dan Malam": "Morning and Night",
  "Petang dan Malam": "Afternoon and Night",
  "Sepanjang Hari": "Throughout the Day",
};
const CATEGORY_MAP = { St: "State", Rc: "Recreation Centre", Ds: "District", Tn: "Town", Dv: "Division" };
const translate = (v, map) => (v && map[v]) || v || "—";
const categoryFromId = (id) => {
  const m = /^[A-Za-z]+/.exec(id || "");
  return m ? CATEGORY_MAP[m[0]] || m[0] : "";
};

/* ---------- condition → visual family ---------- */
function conditionFamily(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("thunderstorm")) return "storm";
  if (t.includes("rain")) return "rain";
  if (t.includes("hazy")) return "haze";
  if (t.includes("no rain")) return "clear";
  return "cloud";
}
function ConditionIcon({ text, period = "day", size = 28, strokeWidth = 1.5, style }) {
  const fam = conditionFamily(text);
  const night = period === "night";
  const props = { size, strokeWidth, style };
  if (fam === "storm") return <CloudLightning {...props} />;
  if (fam === "rain") return <CloudRain {...props} />;
  if (fam === "haze") return <CloudFog {...props} />;
  if (fam === "clear") return night ? <Moon {...props} /> : <Sun {...props} />;
  return night ? <CloudMoon {...props} /> : <CloudSun {...props} />;
}

/* ---------- tokens ---------- */
const TOKENS = {
  dark: {
    bg: "#0A0D14",
    bg2: "#0E1220",
    surface: "rgba(255,255,255,0.045)",
    surfaceStrong: "rgba(255,255,255,0.075)",
    border: "rgba(255,255,255,0.09)",
    text: "#EFF3FA",
    textDim: "#8892A6",
    textFaint: "#5A6478",
    accent: "#4C8DFF",
    accent2: "#7FDBFF",
    amber: "#FFA85C",
    red: "#FF6B6B",
    green: "#5CE0A0",
  },
  light: {
    bg: "#F3F5FA",
    bg2: "#EAEEF6",
    surface: "rgba(255,255,255,0.65)",
    surfaceStrong: "rgba(255,255,255,0.85)",
    border: "rgba(20,30,60,0.08)",
    text: "#151A26",
    textDim: "#5C6478",
    textFaint: "#8C93A6",
    accent: "#2F6FED",
    accent2: "#0EA5C4",
    amber: "#E5822A",
    red: "#E5484D",
    green: "#1C9A6C",
  },
};

/* ---------- API helpers ---------- */
async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.pathname + url.search);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  return Array.isArray(json) ? json : json.data || json.results || [];
}
const fetchForecast = (locationName) => apiGet("/forecast", { contains: `${locationName}@location__location_name`, limit: 40 });
const fetchWarnings = () => apiGet("/warning", { limit: 30 });
const fetchQuakes = () => apiGet("/warning/earthquake", { limit: 30 });

const todayStr = () => new Date().toISOString().slice(0, 10);
function upcomingDays(records) {
  const today = todayStr();
  const seen = new Map();
  records.forEach((r) => { if (r.date && r.date >= today && !seen.has(r.date)) seen.set(r.date, r); });
  return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
}
function dayLabel(dateStr, idx) {
  const d = new Date(dateStr + "T00:00:00");
  if (idx === 0) return "TODAY";
  return d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
}
function dateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
}
const toF = (c) => Math.round((c * 9) / 5 + 32);

const DEFAULT_LOCATIONS = [
  { name: "Kuala Lumpur", tag: "Home" },
  { name: "Petaling Jaya", tag: "Work" },
  { name: "Penang", tag: "" },
  { name: "Johor Bahru", tag: "" },
  { name: "Kota Kinabalu", tag: "" },
  { name: "Kuching", tag: "" },
  { name: "Langkawi", tag: "" },
];

/* ============================================================ */

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [units, setUnits] = useState("C");
  const [language, setLanguage] = useState("en");
  const [stage, setStage] = useState("splash"); // splash -> onboarding -> app
  const [tab, setTab] = useState("home");
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [current, setCurrent] = useState("Kuala Lumpur");
  const [forecastCache, setForecastCache] = useState({});
  const [warnings, setWarnings] = useState({ loading: true, error: null, data: [] });
  const [quakes, setQuakes] = useState({ loading: true, error: null, data: [] });
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedWarning, setSelectedWarning] = useState(null);
  const [selectedQuake, setSelectedQuake] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [readIds, setReadIds] = useState(new Set());
  const [online, setOnline] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const T = TOKENS[theme];

  /* splash timing */
  useEffect(() => {
    const t = setTimeout(() => setStage((s) => (s === "splash" ? "onboarding" : s)), 2200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onOff = () => setOnline(navigator.onLine);
    window.addEventListener("online", onOff);
    window.addEventListener("offline", onOff);
    setOnline(navigator.onLine);
    return () => { window.removeEventListener("online", onOff); window.removeEventListener("offline", onOff); };
  }, []);

  const loadForecast = useCallback(async (name) => {
    setForecastCache((c) => ({ ...c, [name]: { ...(c[name] || {}), loading: true, error: null } }));
    try {
      const raw = await fetchForecast(name);
      const days = upcomingDays(raw);
      setForecastCache((c) => ({ ...c, [name]: { loading: false, error: null, days, raw: raw[0] || null } }));
    } catch (e) {
      setForecastCache((c) => ({ ...c, [name]: { loading: false, error: "Weather data is temporarily unavailable.", days: [] } }));
    }
  }, []);

  const loadWarnings = useCallback(async () => {
    setWarnings((w) => ({ ...w, loading: true, error: null }));
    try {
      const data = await fetchWarnings();
      setWarnings({ loading: false, error: null, data });
      setLastUpdated(new Date());
    } catch (e) {
      setWarnings({ loading: false, error: "Warning data is temporarily unavailable.", data: [] });
    }
  }, []);
  const loadQuakes = useCallback(async () => {
    setQuakes((q) => ({ ...q, loading: true, error: null }));
    try {
      const data = await fetchQuakes();
      setQuakes({ loading: false, error: null, data });
    } catch (e) {
      setQuakes({ loading: false, error: "Earthquake data is temporarily unavailable.", data: [] });
    }
  }, []);

  useEffect(() => { if (stage === "app") { loadWarnings(); loadQuakes(); } }, [stage, loadWarnings, loadQuakes]);
  useEffect(() => { if (stage === "app" && !forecastCache[current]) loadForecast(current); }, [stage, current, forecastCache, loadForecast]);

  const activeForecast = forecastCache[current];
  const today = activeForecast?.days?.[0];

  const notifications = useMemo(() => {
    const w = warnings.data.map((x) => ({
      id: "w-" + (x.warning_issue?.issued || x.valid_from) + (x.heading_en || ""),
      kind: "warning",
      title: x.warning_issue?.title_en || x.heading_en || "Weather Warning",
      desc: x.heading_en || x.text_en || "",
      time: x.warning_issue?.issued || x.valid_from,
      raw: x,
    }));
    const q = quakes.data.map((x) => ({
      id: "q-" + x.utcdatetime + x.location_original,
      kind: "quake",
      title: `M${x.magdefault} — ${x.location_original || x.location || "Earthquake"}`,
      desc: x.n_distancemas || "",
      time: x.utcdatetime,
      raw: x,
    }));
    return [...w, ...q].sort((a, b) => (b.time || "").localeCompare(a.time || "")).slice(0, 25);
  }, [warnings.data, quakes.data]);
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const heroFam = today ? conditionFamily(today.summary_forecast) : "cloud";

  const ctx = { T, theme, setTheme, units, setUnits, language, setLanguage, tab, setTab,
    locations, setLocations, current, setCurrent, forecastCache, loadForecast,
    warnings, loadWarnings, quakes, loadQuakes, selectedDay, setSelectedDay,
    selectedWarning, setSelectedWarning, selectedQuake, setSelectedQuake,
    notifOpen, setNotifOpen, notifications, readIds, setReadIds, unreadCount, online, lastUpdated };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", width: "100%", fontFamily: "'Inter',system-ui,sans-serif", color: T.text, position: "relative", overflow: "hidden" }}>
      <GlobalStyle T={T} theme={theme} />
      {stage === "splash" && <Splash T={T} />}
      {stage === "onboarding" && <Onboarding T={T} onStart={() => setStage("app")} />}
      {stage === "app" && (
        <div style={{ maxWidth: 460, margin: "0 auto", position: "relative", minHeight: "100vh", paddingBottom: 100 }}>
          {!online && <OfflineBanner T={T} />}
          {tab === "home" && <HomeScreen ctx={ctx} heroFam={heroFam} />}
          {tab === "map" && <MapScreen ctx={ctx} />}
          {tab === "alerts" && <AlertsScreen ctx={ctx} />}
          {tab === "locations" && <LocationsScreen ctx={ctx} />}
          {tab === "more" && <MoreScreen ctx={ctx} />}
          <TabBar ctx={ctx} />
          {notifOpen && <NotificationPanel ctx={ctx} />}
          {selectedDay && <DayDetail ctx={ctx} />}
          {selectedWarning && <WarningDetail ctx={ctx} />}
          {selectedQuake && <QuakeDetail ctx={ctx} />}
        </div>
      )}
    </div>
  );
}

/* ============================== GLOBAL STYLE ============================== */
function GlobalStyle({ T, theme }) {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      body { margin:0; }
      ::-webkit-scrollbar { display:none; }
      .mono { font-family:'JetBrains Mono',monospace; }
      .disp { font-family:'Space Grotesk',sans-serif; }
      .noscroll { -ms-overflow-style:none; scrollbar-width:none; }
      .glass {
        background:${T.surface};
        backdrop-filter: blur(18px) saturate(140%);
        -webkit-backdrop-filter: blur(18px) saturate(140%);
        border:1px solid ${T.border};
      }
      .press:active { transform: scale(0.97); }
      .fadein { animation: fadein .5s ease both; }
      @keyframes fadein { from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:translateY(0);} }
      @keyframes pulseGlow { 0%,100%{ opacity:.55; transform:scale(1);} 50%{ opacity:1; transform:scale(1.04);} }
      @keyframes drift { 0%{ transform:translateX(-6%);} 100%{ transform:translateX(6%);} }
      @keyframes rainFall { 0%{ background-position-y:0;} 100%{ background-position-y:120px;} }
      @keyframes lightning { 0%,92%,100%{ opacity:0;} 94%{opacity:.9;} 96%{opacity:.1;} 98%{opacity:.7;} }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes shimmer { 0%{ background-position:-200px 0;} 100%{ background-position:200px 0;} }
      @keyframes ripple { 0%{ transform:scale(0.3); opacity:.9;} 100%{ transform:scale(2.6); opacity:0;} }
      @keyframes floatY { 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-5px);} }
      .skeleton {
        background: linear-gradient(90deg, ${theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(20,30,60,0.05)"} 25%, ${theme === "dark" ? "rgba(255,255,255,0.09)" : "rgba(20,30,60,0.10)"} 37%, ${theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(20,30,60,0.05)"} 63%);
        background-size: 400px 100%;
        animation: shimmer 1.4s ease infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        *,*::before,*::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration:0.001ms !important; }
      }
      input::placeholder { color: ${T.textFaint}; }
    `}</style>
  );
}

/* ============================== SPLASH ============================== */
function Splash({ T }) {
  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `radial-gradient(120% 100% at 50% 20%, #101830 0%, ${T.bg} 60%)`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 70%, rgba(76,141,255,0.12), transparent 60%)", animation: "drift 6s ease-in-out infinite alternate" }} />
      <div style={{ position: "relative", width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid rgba(124,168,255,0.35)", animation: "pulseGlow 2.2s ease-in-out infinite" }} />
        <div style={{ position: "absolute", inset: -16, borderRadius: "50%", border: "1px solid rgba(124,168,255,0.15)", animation: "pulseGlow 2.2s ease-in-out infinite .3s" }} />
        <Logomark size={44} color="#7FB8FF" glow />
      </div>
      <div className="disp fadein" style={{ marginTop: 26, fontSize: 19, fontWeight: 600, letterSpacing: 0.3, color: T.text }}>Malaysia Weather Intelligence</div>
      <div className="fadein mono" style={{ marginTop: 8, fontSize: 11.5, letterSpacing: 1.5, color: T.textDim, textTransform: "uppercase" }}>Powered by MET Malaysia Open Data</div>
    </div>
  );
}
function Logomark({ size = 28, color = "currentColor", glow = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={glow ? { filter: `drop-shadow(0 0 10px ${color}99)` } : undefined}>
      <path d="M24 6C24 6 15 16.5 15 25a9 9 0 0018 0C33 16.5 24 6 24 6z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 33c3-2.2 6-2.2 9 0s6 2.2 9 0 6-2.2 9 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="24" r="2.1" fill={color} />
    </svg>
  );
}

/* ============================== ONBOARDING ============================== */
function Onboarding({ T, onStart }) {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: `linear-gradient(180deg, #0D1424 0%, ${T.bg} 55%)`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -60, left: -40, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(76,141,255,0.25), transparent 65%)" }} />
      <div style={{ position: "absolute", bottom: 120, right: -60, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(127,219,255,0.14), transparent 65%)" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", position: "relative" }}>
        <svg width="230" height="150" viewBox="0 0 230 150" style={{ marginBottom: 34 }}>
          <path d="M20 100 Q60 60 100 90 T200 80" stroke="#3E6FD9" strokeWidth="1.2" fill="none" opacity="0.55" />
          <path d="M10 120 Q70 90 130 115 T220 105" stroke="#7FDBFF" strokeWidth="1.2" fill="none" opacity="0.35" />
          {[[60,50],[120,40],[170,65],[95,75]].map(([x,y],i)=>(
            <g key={i}>
              <circle cx={x} cy={y} r="3" fill="#7FB8FF" style={{ animation: `pulseGlow 2.4s ease-in-out infinite ${i*0.4}s` }} />
              <circle cx={x} cy={y} r="9" fill="none" stroke="#7FB8FF" strokeWidth="0.7" opacity="0.4" />
            </g>
          ))}
          <ellipse cx="115" cy="95" rx="95" ry="34" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
        </svg>
        <div className="disp" style={{ fontSize: 30, fontWeight: 700, color: T.text, textAlign: "center", letterSpacing: 0.2 }}>Weather, understood.</div>
        <div style={{ marginTop: 12, fontSize: 14.5, color: T.textDim, textAlign: "center", lineHeight: 1.6, maxWidth: 300 }}>
          Real-time warnings and 7-day forecasts for Malaysia, straight from MET Malaysia.
        </div>
      </div>
      <div style={{ padding: "0 24px 44px", position: "relative" }}>
        <button className="press" onClick={onStart} style={{ width: "100%", padding: "16px 0", borderRadius: 18, border: "none", background: "linear-gradient(135deg,#4C8DFF,#2F6FED)", color: "#fff", fontSize: 15.5, fontWeight: 600, letterSpacing: 0.2, boxShadow: "0 10px 30px rgba(47,111,237,0.35)", cursor: "pointer" }}>
          Get Started
        </button>
        <button className="press" onClick={onStart} style={{ width: "100%", marginTop: 12, padding: "14px 0", borderRadius: 18, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: T.textDim, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          Explore without location
        </button>
        <div style={{ marginTop: 14, fontSize: 11.5, color: T.textFaint, textAlign: "center", lineHeight: 1.5 }}>
          We'll only ask for your location to personalize forecasts — you can decide when you're ready.
        </div>
      </div>
    </div>
  );
}

/* ============================== TOP BAR ============================== */
function TopBar({ ctx, title }) {
  const { T, unreadCount, setNotifOpen } = ctx;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div style={{ padding: "20px 20px 6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="disp" style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{title || greeting}</div>
          {!title && <div style={{ fontSize: 13, color: T.textDim, marginTop: 2 }}>What's happening around you?</div>}
        </div>
        <button className="press" onClick={() => setNotifOpen(true)} style={{ position: "relative", width: 40, height: 40, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Bell size={17} color={T.textDim} strokeWidth={1.7} />
          {unreadCount > 0 && <span style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: "50%", background: T.accent2, boxShadow: `0 0 6px ${T.accent2}` }} />}
        </button>
      </div>
    </div>
  );
}

/* ============================== HOME ============================== */
function HomeScreen({ ctx, heroFam }) {
  const { T, current, forecastCache, setSelectedDay, locations, setCurrent, units, warnings, loadForecast, lastUpdated } = ctx;
  const fc = forecastCache[current];
  const days = fc?.days || [];
  const today = days[0];

  const bgByFam = {
    storm: "radial-gradient(120% 90% at 50% -10%, #1B2340 0%, #0A0D14 60%)",
    rain: "radial-gradient(120% 90% at 50% -10%, #142238 0%, #0A0D14 60%)",
    haze: "radial-gradient(120% 90% at 50% -10%, #241F1A 0%, #0A0D14 60%)",
    clear: "radial-gradient(120% 90% at 50% -10%, #1E2A44 0%, #0A0D14 60%)",
    cloud: "radial-gradient(120% 90% at 50% -10%, #182236 0%, #0A0D14 60%)",
  };

  return (
    <div className="noscroll" style={{ overflowY: "auto", height: "100vh" }}>
      <TopBar ctx={ctx} />

      <div style={{ padding: "10px 20px 0" }}>
        <div className="glass press" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px 7px 10px", borderRadius: 999, cursor: "pointer" }} onClick={() => ctx.setTab("locations")}>
          <MapPin size={14} color={T.accent2} strokeWidth={1.8} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{current}</span>
          <ChevronDown size={13} color={T.textFaint} />
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 10, fontSize: 11, color: T.textFaint }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} />
          Updated {lastUpdated ? "recently" : "—"}
        </div>
      </div>

      {/* HERO CARD */}
      <div style={{ margin: "16px 20px 0", borderRadius: 28, overflow: "hidden", position: "relative", background: theme_bg(heroFam, bgByFam), border: `1px solid ${T.border}`, minHeight: 250 }}>
        <WeatherFX fam={heroFam} />
        <div style={{ position: "relative", padding: "24px 22px 22px" }}>
          {fc?.loading && <HeroSkeleton />}
          {fc?.error && <ErrorState T={T} text={fc.error} onRetry={() => loadForecast(current)} />}
          {!fc?.loading && !fc?.error && today && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{current}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{new Date(today.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
                </div>
                <ConditionIcon text={today.summary_forecast} size={30} style={{ color: "rgba(255,255,255,0.85)", animation: "floatY 4s ease-in-out infinite" }} />
              </div>

              <div className="mono" style={{ marginTop: 18, fontSize: 62, lineHeight: 1, fontWeight: 600, color: "#fff", letterSpacing: -1 }}>
                {units === "C" ? today.max_temp : toF(today.max_temp)}°
                <span style={{ fontSize: 20, color: "rgba(255,255,255,0.45)", marginLeft: 4 }}>peak</span>
              </div>
              <div className="mono" style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                {units === "C" ? today.min_temp : toF(today.min_temp)}° – {units === "C" ? today.max_temp : toF(today.max_temp)}°
              </div>

              <div style={{ marginTop: 16, display: "inline-block", padding: "8px 14px", borderRadius: 14, background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: "#fff" }}>{translate(today.summary_forecast, FORECAST_MAP)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>{translate(today.summary_when, WHEN_MAP)} · 7-day forecast</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* WARNING STRIP */}
      {warnings.data.length > 0 && (
        <div className="press" onClick={() => ctx.setTab("alerts")} style={{ margin: "14px 20px 0", padding: "12px 14px", borderRadius: 16, background: "rgba(255,168,92,0.1)", border: "1px solid rgba(255,168,92,0.25)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <AlertTriangle size={16} color={T.amber} strokeWidth={1.8} />
          <div style={{ flex: 1, fontSize: 12.5, color: T.text, fontWeight: 500 }}>
            {warnings.data.length} active weather {warnings.data.length === 1 ? "warning" : "warnings"} nearby
          </div>
          <ChevronRight size={15} color={T.textFaint} />
        </div>
      )}

      {/* 7 DAY */}
      <div style={{ marginTop: 24 }}>
        <div style={{ padding: "0 20px", fontSize: 13, fontWeight: 600, color: T.textDim, letterSpacing: 0.3 }}>7-DAY FORECAST</div>
        <div className="noscroll" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "12px 20px 4px" }}>
          {fc?.loading && Array.from({ length: 5 }).map((_, i) => <DaySkeleton key={i} T={T} />)}
          {!fc?.loading && days.map((d, i) => (
            <div key={d.date} className="glass press" onClick={() => setSelectedDay({ ...d, locationName: current })}
              style={{ minWidth: 92, borderRadius: 20, padding: "14px 10px", textAlign: "center", cursor: "pointer", flexShrink: 0 }}>
              <div className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: i === 0 ? T.accent2 : T.textFaint, letterSpacing: 0.5 }}>{dayLabel(d.date, i)}</div>
              <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{dateLabel(d.date)}</div>
              <div style={{ margin: "10px 0" }}><ConditionIcon text={d.summary_forecast} size={22} style={{ color: T.text, margin: "0 auto" }} /></div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{units === "C" ? d.max_temp : toF(d.max_temp)}°</div>
              <div className="mono" style={{ fontSize: 11, color: T.textFaint }}>{units === "C" ? d.min_temp : toF(d.min_temp)}°</div>
            </div>
          ))}
        </div>
      </div>

      {/* SAVED LOCATIONS PREVIEW */}
      <div style={{ marginTop: 22, padding: "0 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textDim, letterSpacing: 0.3 }}>YOUR LOCATIONS</div>
          <div className="press" onClick={() => ctx.setTab("locations")} style={{ fontSize: 12, color: T.accent2, cursor: "pointer" }}>See all</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {locations.slice(0, 3).map((loc) => (
            <div key={loc.name} className="glass press" onClick={() => { setCurrent(loc.name); }} style={{ borderRadius: 16, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <MapPin size={15} color={loc.name === current ? T.accent2 : T.textFaint} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{loc.name}{loc.tag ? ` · ${loc.tag}` : ""}</div>
              </div>
              <ChevronRight size={14} color={T.textFaint} />
            </div>
          ))}
        </div>
      </div>

      <SourceBadge T={T} />
    </div>
  );
}
function theme_bg(fam, map) { return map[fam] || map.cloud; }

function WeatherFX({ fam }) {
  if (fam === "rain") return (
    <div style={{ position: "absolute", inset: 0, opacity: 0.35, backgroundImage: "repeating-linear-gradient(115deg, rgba(160,200,255,0.5) 0px, rgba(160,200,255,0.5) 1px, transparent 1px, transparent 14px)", backgroundSize: "100% 120px", animation: "rainFall 1.1s linear infinite" }} />
  );
  if (fam === "storm") return (
    <>
      <div style={{ position: "absolute", inset: 0, opacity: 0.28, backgroundImage: "repeating-linear-gradient(115deg, rgba(160,200,255,0.5) 0px, rgba(160,200,255,0.5) 1px, transparent 1px, transparent 16px)", backgroundSize: "100% 120px", animation: "rainFall 1.3s linear infinite" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 70% 20%, rgba(220,230,255,0.5), transparent 45%)", animation: "lightning 4.5s ease-in-out infinite" }} />
    </>
  );
  if (fam === "haze") return <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(230,200,150,0.12), transparent 60%)" }} />;
  if (fam === "clear") return <div style={{ position: "absolute", top: -40, right: -30, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,220,150,0.22), transparent 70%)" }} />;
  return <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 0%, rgba(150,180,255,0.1), transparent 55%)" }} />;
}

function HeroSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ width: 140, height: 12, borderRadius: 6 }} />
      <div className="skeleton" style={{ width: 100, height: 60, borderRadius: 10, marginTop: 18 }} />
      <div className="skeleton" style={{ width: 160, height: 30, borderRadius: 10, marginTop: 14 }} />
    </div>
  );
}
function DaySkeleton({ T }) {
  return <div className="glass" style={{ minWidth: 92, borderRadius: 20, padding: "14px 10px", flexShrink: 0 }}>
    <div className="skeleton" style={{ height: 60, borderRadius: 10 }} />
  </div>;
}
function ErrorState({ T, text, onRetry, light }) {
  return (
    <div style={{ textAlign: "center", padding: "18px 6px", color: light ? T.text : "rgba(255,255,255,0.85)" }}>
      <AlertTriangle size={22} style={{ opacity: 0.6, marginBottom: 8 }} />
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{text}</div>
      {onRetry && <button className="press" onClick={onRetry} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", color: "inherit", fontSize: 12.5, cursor: "pointer" }}>Try again</button>}
    </div>
  );
}
function OfflineBanner({ T }) {
  return (
    <div style={{ background: T.amber, color: "#1A1200", fontSize: 12, fontWeight: 600, textAlign: "center", padding: "7px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <WifiOff size={13} /> You're offline — showing the latest available data
    </div>
  );
}
function SourceBadge({ T }) {
  return (
    <div style={{ textAlign: "center", fontSize: 10.5, color: T.textFaint, margin: "26px 0 4px", letterSpacing: 0.3 }}>
      Weather data by MET Malaysia
    </div>
  );
}

/* ============================== DAY DETAIL ============================== */
function DayDetail({ ctx }) {
  const { T, selectedDay, setSelectedDay, units } = ctx;
  const d = selectedDay;
  const periods = [
    { key: "morning_forecast", label: "MORNING", period: "day" },
    { key: "afternoon_forecast", label: "AFTERNOON", period: "day" },
    { key: "night_forecast", label: "NIGHT", period: "night" },
  ];
  return (
    <Sheet T={T} onClose={() => setSelectedDay(null)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="disp" style={{ fontSize: 19, fontWeight: 700, color: T.text }}>{new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" })}</div>
          <div style={{ fontSize: 12.5, color: T.textDim }}>{d.locationName} · {dateLabel(d.date)}</div>
        </div>
        <CloseBtn T={T} onClick={() => setSelectedDay(null)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {periods.map((p) => (
          <div key={p.key} className="glass" style={{ borderRadius: 18, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
            <ConditionIcon text={d[p.key]} period={p.period} size={26} style={{ color: T.accent2, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 10.5, letterSpacing: 1, color: T.textFaint, fontWeight: 600 }}>{p.label}</div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text, marginTop: 2 }}>{translate(d[p.key], FORECAST_MAP)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: "16px 18px", borderRadius: 18, background: T.surfaceStrong, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, color: T.textDim, fontWeight: 600, letterSpacing: 0.3 }}>DAILY SUMMARY</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 6 }}>{translate(d.summary_forecast, FORECAST_MAP)}</div>
        <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 2 }}>{translate(d.summary_when, WHEN_MAP)}</div>

        <div style={{ marginTop: 16 }}>
          <TempBar T={T} min={d.min_temp} max={d.max_temp} units={units} />
        </div>
      </div>
    </Sheet>
  );
}
function TempBar({ T, min, max, units }) {
  const lo = units === "C" ? min : toF(min);
  const hi = units === "C" ? max : toF(max);
  const pct = Math.min(100, Math.max(0, ((max - 20) / (36 - 20)) * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textFaint, marginBottom: 6 }}>
        <span>{lo}°</span><span>{hi}°</span>
      </div>
      <div style={{ height: 8, borderRadius: 8, background: T.border, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, borderRadius: 8, background: `linear-gradient(90deg, ${T.accent2}, ${T.amber})` }} />
      </div>
    </div>
  );
}

/* ============================== ALERTS ============================== */
function AlertsScreen({ ctx }) {
  const { T, warnings, quakes, loadWarnings, loadQuakes, setSelectedWarning, setSelectedQuake } = ctx;
  const [sub, setSub] = useState("warnings");
  return (
    <div className="noscroll" style={{ overflowY: "auto", height: "100vh" }}>
      <TopBar ctx={ctx} title="Alerts" />
      <div style={{ padding: "6px 20px 0", display: "flex", gap: 8 }}>
        <SegBtn T={T} active={sub === "warnings"} onClick={() => setSub("warnings")} label={`Warnings (${warnings.data.length})`} />
        <SegBtn T={T} active={sub === "quakes"} onClick={() => setSub("quakes")} label={`Earthquakes (${quakes.data.length})`} />
      </div>

      {sub === "warnings" && (
        <div style={{ padding: "16px 20px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {warnings.loading && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} T={T} />)}
          {warnings.error && <div className="glass" style={{ borderRadius: 18, padding: 20 }}><ErrorState T={T} light text={warnings.error} onRetry={loadWarnings} /></div>}
          {!warnings.loading && !warnings.error && warnings.data.length === 0 && <EmptyState T={T} icon={<ShieldAlert size={26} />} text="No active warnings" />}
          {warnings.data.map((w, i) => <WarningCard key={i} T={T} w={w} onClick={() => setSelectedWarning(w)} />)}
        </div>
      )}
      {sub === "quakes" && (
        <div style={{ padding: "16px 20px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {quakes.loading && Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} T={T} />)}
          {quakes.error && <div className="glass" style={{ borderRadius: 18, padding: 20 }}><ErrorState T={T} light text={quakes.error} onRetry={loadQuakes} /></div>}
          {!quakes.loading && !quakes.error && quakes.data.length === 0 && <EmptyState T={T} icon={<Activity size={26} />} text="No recent seismic activity" />}
          {quakes.data.map((q, i) => <QuakeCard key={i} T={T} q={q} onClick={() => setSelectedQuake(q)} />)}
        </div>
      )}
    </div>
  );
}
function SegBtn({ T, active, onClick, label }) {
  return (
    <button className="press" onClick={onClick} style={{ padding: "9px 14px", borderRadius: 12, border: `1px solid ${active ? T.accent : T.border}`, background: active ? "rgba(76,141,255,0.15)" : T.surface, color: active ? T.accent2 : T.textDim, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{label}</button>
  );
}
function severityOf(w) {
  const t = ((w.warning_issue?.title_en || "") + " " + (w.heading_en || "")).toLowerCase();
  if (t.includes("severe") || t.includes("red") || t.includes("critical") || t.includes("bahaya")) return { label: "CRITICAL", color: "#FF6B6B" };
  if (t.includes("warning") || t.includes("amaran")) return { label: "WARNING", color: "#FFA85C" };
  return { label: "ADVISORY", color: "#7FDBFF" };
}
function WarningCard({ T, w, onClick }) {
  const sev = severityOf(w);
  return (
    <div className="glass press" onClick={onClick} style={{ borderRadius: 18, padding: "14px 16px", cursor: "pointer", borderLeft: `3px solid ${sev.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: sev.color, letterSpacing: 0.8 }}>{sev.label}</span>
        <ChevronRight size={14} color={T.textFaint} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, marginTop: 6 }}>{w.warning_issue?.title_en || "Weather Warning"}</div>
      <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 3 }}>{w.heading_en}</div>
      <div style={{ fontSize: 11, color: T.textFaint, marginTop: 8 }}>Valid {fmtDT(w.valid_from)} – {fmtDT(w.valid_to)}</div>
    </div>
  );
}
function QuakeCard({ T, q, onClick }) {
  return (
    <div className="glass press" onClick={onClick} style={{ borderRadius: 18, padding: "14px 16px", cursor: "pointer", display: "flex", gap: 14, alignItems: "center" }}>
      <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1px solid ${T.accent2}55` }} />
        <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{q.magdefault}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{q.location_original || q.location}</div>
        <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 2 }}>{q.n_distancemas}</div>
        <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 3 }}>{fmtDT(q.localdatetime)} MYT · depth {q.depth}km</div>
      </div>
      <ChevronRight size={14} color={T.textFaint} />
    </div>
  );
}
function fmtDT(s) {
  if (!s) return "—";
  try { const d = new Date(s); return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return s; }
}
function CardSkeleton({ T }) { return <div className="glass" style={{ borderRadius: 18, padding: 16 }}><div className="skeleton" style={{ height: 54, borderRadius: 10 }} /></div>; }
function EmptyState({ T, icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "50px 20px", color: T.textFaint }}>
      <div style={{ marginBottom: 10, opacity: 0.6 }}>{icon}</div>
      <div style={{ fontSize: 13.5 }}>{text}</div>
    </div>
  );
}

/* ---- Warning Detail (full screen) ---- */
function WarningDetail({ ctx }) {
  const { T, selectedWarning: w, setSelectedWarning, language } = ctx;
  const sev = severityOf(w);
  const en = language === "en";
  return (
    <FullScreen T={T} onClose={() => setSelectedWarning(null)}>
      <div style={{ padding: "20px 22px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color={sev.color} />
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: sev.color, letterSpacing: 1 }}>WEATHER WARNING · {sev.label}</span>
          </div>
          <CloseBtn T={T} onClick={() => setSelectedWarning(null)} />
        </div>
        <div className="disp" style={{ fontSize: 22, fontWeight: 700, color: T.text, marginTop: 16 }}>{en ? w.warning_issue?.title_en : w.warning_issue?.title_bm}</div>
        <div style={{ fontSize: 14.5, color: T.textDim, marginTop: 6 }}>{en ? w.heading_en : w.heading_bm}</div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <div className="glass" style={{ flex: 1, borderRadius: 14, padding: "12px 14px" }}>
            <div className="mono" style={{ fontSize: 10, color: T.textFaint, fontWeight: 700, letterSpacing: 0.8 }}>VALID FROM</div>
            <div style={{ fontSize: 12.5, color: T.text, marginTop: 4, fontWeight: 600 }}>{fmtDT(w.valid_from)}</div>
          </div>
          <div className="glass" style={{ flex: 1, borderRadius: 14, padding: "12px 14px" }}>
            <div className="mono" style={{ fontSize: 10, color: T.textFaint, fontWeight: 700, letterSpacing: 0.8 }}>VALID UNTIL</div>
            <div style={{ fontSize: 12.5, color: T.text, marginTop: 4, fontWeight: 600 }}>{fmtDT(w.valid_to)}</div>
          </div>
        </div>

        <div style={{ marginTop: 20, padding: "16px 18px", borderRadius: 18, background: T.surface, border: `1px solid ${T.border}`, fontSize: 14, lineHeight: 1.7, color: T.text }}>
          {en ? w.text_en : w.text_bm}
        </div>

        <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 18, background: `${sev.color}18`, border: `1px solid ${sev.color}40`, display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldAlert size={18} color={sev.color} />
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{en ? (w.instruction_en || "Stay safe!") : (w.instruction_bm || "Jaga diri!")}</div>
        </div>

        <div style={{ marginTop: 22, fontSize: 11, color: T.textFaint, textAlign: "center" }}>Official source: MET Malaysia</div>
      </div>
    </FullScreen>
  );
}

/* ---- Earthquake Detail ---- */
function QuakeDetail({ ctx }) {
  const { T, selectedQuake: q, setSelectedQuake } = ctx;
  return (
    <FullScreen T={T} onClose={() => setSelectedQuake(null)}>
      <div style={{ padding: "20px 22px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={18} color={T.accent2} />
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: T.accent2, letterSpacing: 1 }}>EARTHQUAKE</span>
          </div>
          <CloseBtn T={T} onClick={() => setSelectedQuake(null)} />
        </div>

        <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
          <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ position: "absolute", width: 60, height: 60, borderRadius: "50%", border: `1px solid ${T.accent2}`, animation: `ripple 2.4s ease-out infinite ${i * 0.8}s` }} />
            ))}
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: `radial-gradient(circle, ${T.accent2}33, transparent 70%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: T.text }}>{q.magdefault}</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 11, color: T.textFaint, marginTop: -18, marginBottom: 20 }}>Magnitude ({q.magtypedefault})</div>

        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, textAlign: "center" }}>{q.n_distancemas}</div>
        <div style={{ fontSize: 12.5, color: T.textDim, textAlign: "center", marginTop: 4 }}>{q.location_original || q.location}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
          <Stat T={T} label="DEPTH" value={`${q.depth} km`} />
          <Stat T={T} label="STATUS" value={q.status || "—"} />
          <Stat T={T} label="LOCAL TIME (MYT)" value={fmtDT(q.localdatetime)} />
          <Stat T={T} label="UTC TIME" value={fmtDT(q.utcdatetime)} />
          <Stat T={T} label="LATITUDE" value={q.lat_vector || q.lat} />
          <Stat T={T} label="LONGITUDE" value={q.lon_vector || q.lon} />
        </div>

        <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`, fontSize: 12, color: T.textDim, textAlign: "center" }}>
          Distances and impact are relative to Malaysia only — this does not indicate the earthquake occurred within Malaysia unless stated above.
        </div>
        <div style={{ marginTop: 18, fontSize: 11, color: T.textFaint, textAlign: "center" }}>Official source: MET Malaysia</div>
      </div>
    </FullScreen>
  );
}
function Stat({ T, label, value }) {
  return (
    <div className="glass" style={{ borderRadius: 14, padding: "12px 14px" }}>
      <div className="mono" style={{ fontSize: 9.5, color: T.textFaint, fontWeight: 700, letterSpacing: 0.6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13.5, color: T.text, marginTop: 4, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/* ============================== MAP (signal grid) ============================== */
function MapScreen({ ctx }) {
  const { T, quakes, warnings, locations, current } = ctx;
  return (
    <div className="noscroll" style={{ overflowY: "auto", height: "100vh" }}>
      <TopBar ctx={ctx} title="Signal Map" />
      <div style={{ margin: "10px 20px 0", fontSize: 12.5, color: T.textDim }}>A geographic-relative view of live warnings and seismic signals. Full radar/marine layers aren't provided by the MET Malaysia API.</div>

      <div className="glass" style={{ margin: "16px 20px 0", borderRadius: 24, padding: 20, position: "relative", minHeight: 260, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${T.border} 1px, transparent 1px)`, backgroundSize: "18px 18px", opacity: 0.5 }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: "50%", background: T.accent2, boxShadow: `0 0 12px ${T.accent2}` }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: "50%", border: `1px solid ${T.accent2}`, animation: "ripple 2.6s ease-out infinite" }} />
        <div style={{ position: "relative", textAlign: "center", marginTop: 210, fontSize: 11, color: T.textFaint }}>{current} · reference point</div>

        {quakes.data.slice(0, 6).map((q, i) => {
          const angle = (i / 6) * Math.PI * 2;
          const r = 78 + (i % 3) * 20;
          const x = 50 + Math.cos(angle) * (r / 3);
          const y = 46 + Math.sin(angle) * (r / 6);
          return (
            <div key={i} className="press" onClick={() => ctx.setSelectedQuake(q)} style={{ position: "absolute", top: `${y}%`, left: `${x}%`, cursor: "pointer" }} title={q.location_original}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.amber, boxShadow: `0 0 8px ${T.amber}` }} />
            </div>
          );
        })}
      </div>

      <div style={{ padding: "18px 20px 40px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textDim, letterSpacing: 0.3, marginBottom: 10 }}>NEARBY SIGNALS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {warnings.data.slice(0, 3).map((w, i) => <WarningCard key={"w" + i} T={T} w={w} onClick={() => ctx.setSelectedWarning(w)} />)}
          {quakes.data.slice(0, 3).map((q, i) => <QuakeCard key={"q" + i} T={T} q={q} onClick={() => ctx.setSelectedQuake(q)} />)}
          {warnings.data.length === 0 && quakes.data.length === 0 && <EmptyState T={T} icon={<Radio size={26} />} text="No active signals right now" />}
        </div>
      </div>
    </div>
  );
}

/* ============================== LOCATIONS ============================== */
function LocationsScreen({ ctx }) {
  const { T, locations, setLocations, current, setCurrent, forecastCache, loadForecast, units } = ctx;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debRef = useRef(null);

  useEffect(() => {
    locations.forEach((l) => { if (!forecastCache[l.name]) loadForecast(l.name); });
    // eslint-disable-next-line
  }, [locations]);

  useEffect(() => {
    clearTimeout(debRef.current);
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    debRef.current = setTimeout(async () => {
      try {
        const raw = await apiGet("/forecast", { contains: `${query}@location__location_name`, limit: 12 });
        const uniq = [];
        const seen = new Set();
        raw.forEach((r) => {
          const name = r.location?.location_name;
          if (name && !seen.has(name)) { seen.add(name); uniq.push({ name, id: r.location?.location_id }); }
        });
        setResults(uniq);
      } catch { setResults([]); }
      setSearching(false);
    }, 400);
    return () => clearTimeout(debRef.current);
  }, [query]);

  const addLocation = (name) => {
    if (!locations.find((l) => l.name === name)) setLocations((ls) => [...ls, { name, tag: "" }]);
    setCurrent(name);
    setQuery("");
    ctx.setTab("home");
  };
  const removeLocation = (name) => setLocations((ls) => ls.filter((l) => l.name !== name));

  return (
    <div className="noscroll" style={{ overflowY: "auto", height: "100vh" }}>
      <TopBar ctx={ctx} title="Locations" />

      <div style={{ padding: "8px 20px 0" }}>
        <div className="glass" style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 16, padding: "12px 14px" }}>
          <Search size={16} color={T.textFaint} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Malaysia" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 14 }} />
          {query && <X size={15} color={T.textFaint} className="press" style={{ cursor: "pointer" }} onClick={() => setQuery("")} />}
        </div>
      </div>

      {query && (
        <div style={{ padding: "10px 20px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {searching && <div style={{ fontSize: 12.5, color: T.textFaint, padding: "8px 4px" }}>Searching…</div>}
          {!searching && results.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint, padding: "8px 4px" }}>No matching locations.</div>}
          {results.map((r) => (
            <div key={r.name} className="glass press" onClick={() => addLocation(r.name)} style={{ borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <MapPin size={15} color={T.accent2} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{r.name}</div>
                {r.id && <span className="mono" style={{ fontSize: 9.5, color: T.textFaint, letterSpacing: 0.5, textTransform: "uppercase" }}>{categoryFromId(r.id)}</span>}
              </div>
              <Plus size={15} color={T.accent} />
            </div>
          ))}
        </div>
      )}

      {!query && (
        <div style={{ padding: "18px 20px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {locations.map((loc) => {
            const fc = forecastCache[loc.name];
            const d = fc?.days?.[0];
            const active = loc.name === current;
            return (
              <div key={loc.name} className="glass press" onClick={() => setCurrent(loc.name)} style={{ borderRadius: 20, padding: "16px 18px", cursor: "pointer", border: `1px solid ${active ? T.accent : T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {active && <Star size={13} color={T.accent2} fill={T.accent2} />}
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{loc.name}</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {fc?.error ? <AlertTriangle size={14} color={T.amber} /> : d && <ConditionIcon text={d.summary_forecast} size={20} style={{ color: T.textDim }} />}
                    <Trash2 size={14} color={T.textFaint} onClick={(e) => { e.stopPropagation(); removeLocation(loc.name); }} />
                  </div>
                </div>
                {loc.tag && <div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>{loc.tag}</div>}
                <div style={{ marginTop: 10 }}>
                  {fc?.loading && <div className="skeleton" style={{ height: 16, width: 140, borderRadius: 6 }} />}
                  {fc?.error && <div style={{ fontSize: 12, color: T.amber }}>Forecast unavailable</div>}
                  {d && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{units === "C" ? d.min_temp : toF(d.min_temp)}° – {units === "C" ? d.max_temp : toF(d.max_temp)}°</span>
                      <span style={{ fontSize: 12, color: T.textDim }}>{translate(d.summary_forecast, FORECAST_MAP)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================== MORE / SETTINGS ============================== */
function MoreScreen({ ctx }) {
  const { T, theme, setTheme, units, setUnits, language, setLanguage, lastUpdated, warnings } = ctx;
  return (
    <div className="noscroll" style={{ overflowY: "auto", height: "100vh" }}>
      <TopBar ctx={ctx} title="More" />
      <div style={{ padding: "10px 20px 40px", display: "flex", flexDirection: "column", gap: 18 }}>

        <SettingsGroup T={T} title="Appearance">
          <div style={{ display: "flex", gap: 8, padding: "12px 14px" }}>
            {["light", "dark", "system"].map((opt) => (
              <button key={opt} className="press" onClick={() => setTheme(opt === "system" ? "dark" : opt)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `1px solid ${(theme === opt || (opt === "system")) ? T.border : T.border}`, background: theme === opt ? "rgba(76,141,255,0.15)" : "transparent", color: theme === opt ? T.accent2 : T.textDim, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>{opt}</button>
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup T={T} title="Units">
          <SettingsRow T={T} label="Temperature">
            <Toggle2 T={T} value={units} options={["C", "F"]} onChange={setUnits} />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup T={T} title="Language">
          <SettingsRow T={T} label="Warning language">
            <Toggle2 T={T} value={language} options={["en", "bm"]} labels={["EN", "BM"]} onChange={setLanguage} />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup T={T} title="Data">
          <SettingsRow T={T} label="API status">
            <span style={{ fontSize: 12.5, color: warnings.error ? T.red : T.green, fontWeight: 600 }}>{warnings.error ? "Offline" : "Connected"}</span>
          </SettingsRow>
          <SettingsRow T={T} label="Last updated">
            <span style={{ fontSize: 12.5, color: T.textDim }}>{lastUpdated ? lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
          </SettingsRow>
          <SettingsRow T={T} label="Data source">
            <span style={{ fontSize: 12.5, color: T.textDim }}>api.data.gov.my</span>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup T={T} title="About">
          <div style={{ padding: "18px 16px", textAlign: "center" }}>
            <Logomark size={30} color={T.accent2} />
            <div className="disp" style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 10 }}>Built with data that matters.</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 10, lineHeight: 1.7 }}>
              Weather Data — MET Malaysia<br />
              Data Platform — Malaysia Open Data<br />
              API — data.gov.my
            </div>
            <div style={{ fontSize: 11, color: T.textFaint, marginTop: 12 }}>Designed &amp; engineered with care · v1.0.0</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12, fontSize: 11, color: T.textFaint }}>
              <span>Terms</span><span>·</span><span>Privacy</span><span>·</span><span>Data source</span>
            </div>
          </div>
        </SettingsGroup>
      </div>
    </div>
  );
}
function SettingsGroup({ T, title, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.textFaint, letterSpacing: 0.4, marginBottom: 8, paddingLeft: 4 }}>{title.toUpperCase()}</div>
      <div className="glass" style={{ borderRadius: 18, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
function SettingsRow({ T, label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 13.5, color: T.text, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}
function Toggle2({ T, value, options, labels, onChange }) {
  return (
    <div style={{ display: "flex", background: T.border, borderRadius: 10, padding: 3 }}>
      {options.map((o, i) => (
        <button key={o} className="press" onClick={() => onChange(o)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: value === o ? T.accent : "transparent", color: value === o ? "#fff" : T.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{labels ? labels[i] : o}</button>
      ))}
    </div>
  );
}

/* ============================== NOTIFICATIONS PANEL ============================== */
function NotificationPanel({ ctx }) {
  const { T, notifications, setNotifOpen, readIds, setReadIds, setSelectedWarning, setSelectedQuake } = ctx;
  const markRead = (id) => setReadIds((s) => new Set([...s, id]));
  return (
    <FullScreen T={T} onClose={() => setNotifOpen(false)}>
      <div style={{ padding: "20px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="disp" style={{ fontSize: 19, fontWeight: 700, color: T.text }}>Notifications</div>
          <CloseBtn T={T} onClick={() => setNotifOpen(false)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {notifications.length === 0 && <EmptyState T={T} icon={<Bell size={26} />} text="You're all caught up" />}
          {notifications.map((n) => {
            const unread = !readIds.has(n.id);
            return (
              <div key={n.id} className="glass press" onClick={() => { markRead(n.id); if (n.kind === "warning") setSelectedWarning(n.raw); else setSelectedQuake(n.raw); }} style={{ borderRadius: 16, padding: "13px 15px", display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                <div style={{ marginTop: 2 }}>
                  {n.kind === "warning" ? <AlertTriangle size={16} color={T.amber} /> : <Activity size={16} color={T.accent2} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{n.title}</div>
                  <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 2 }}>{n.desc}</div>
                  <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 4 }}>{fmtDT(n.time)}</div>
                </div>
                {unread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent2, marginTop: 4, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>
    </FullScreen>
  );
}

/* ============================== SHARED CHROME ============================== */
function CloseBtn({ T, onClick }) {
  return <button className="press" onClick={onClick} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={15} color={T.textDim} /></button>;
}
function Sheet({ T, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", maxWidth: 460, margin: "0 auto" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
      <div className="fadein glass" style={{ position: "relative", width: "100%", maxHeight: "82vh", overflowY: "auto", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "18px 20px 30px", background: T.bg2 }}>
        <div style={{ width: 36, height: 4, borderRadius: 4, background: T.border, margin: "0 auto 14px" }} />
        {children}
      </div>
    </div>
  );
}
function FullScreen({ T, onClose, children }) {
  return (
    <div className="fadein noscroll" style={{ position: "fixed", inset: 0, zIndex: 70, background: T.bg, maxWidth: 460, margin: "0 auto", overflowY: "auto" }}>
      {children}
    </div>
  );
}

/* ============================== TAB BAR ============================== */
function TabBar({ ctx }) {
  const { T, tab, setTab } = ctx;
  const items = [
    { key: "home", label: "Home", icon: HomeIcon },
    { key: "map", label: "Map", icon: Globe },
    { key: "alerts", label: "Alerts", icon: AlertTriangle },
    { key: "locations", label: "Locations", icon: MapPin },
    { key: "more", label: "More", icon: Settings },
  ];
  return (
    <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 40px)", maxWidth: 420, zIndex: 50 }}>
      <div className="glass" style={{ display: "flex", borderRadius: 24, padding: 6, boxShadow: "0 12px 34px rgba(0,0,0,0.35)" }}>
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.key;
          return (
            <button key={it.key} className="press" onClick={() => setTab(it.key)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "9px 0", borderRadius: 18, border: "none", background: active ? "rgba(76,141,255,0.16)" : "transparent", cursor: "pointer" }}>
              <Icon size={17} strokeWidth={active ? 2 : 1.6} color={active ? T.accent2 : T.textFaint} />
              <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500, color: active ? T.accent2 : T.textFaint }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
