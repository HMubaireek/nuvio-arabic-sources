// TorBox - Nuvio scraper that plays files already in the user's TorBox library (torrents, usenet,
// web downloads). Titles are matched in English, Arabic and loose Arabic transliteration
// ("Al.Sada.Al.Afadel" for السادة الأفاضل), and the link is fetched fresh when playback starts.
//   getStreams(tmdbId, mediaType, season, episode) -> [{name, title, url, quality, size, headers}]
//   onSettings() -> settings layout (API key) shown in Nuvio's plugin settings
const { tmdbInfo, absoluteEpisode } = require("../lib/tmdb");
const { request } = require("../lib/http");
const R = require("./release");

const API = "https://api.torbox.app/v1/api";
const MAX_STREAMS = 12;
const PRE_RESOLVE_LIMIT = 6;

const log = (...a) => console.log("[TorBox]", ...a);

// library kinds and how their files are requested
const KINDS = [
  { kind: "torrents", label: "Torrent", idParam: "torrent_id" },
  { kind: "usenet", label: "Usenet", idParam: "usenet_id" },
  { kind: "webdl", label: "Web", idParam: "web_id" },
];

// Settings come from Nuvio's plugin settings dialog (phone/tablet app). Nuvio's Android TV app runs
// plugins with SCRAPER_SETTINGS but has no screen to fill it in, so a personal build
// (scripts/build-personal.js) can embed defaults as TORBOX_EMBEDDED_SETTINGS. Values set in the dialog win.
function settings() {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const embedded = g.TORBOX_EMBEDDED_SETTINGS && typeof g.TORBOX_EMBEDDED_SETTINGS === "object" ? g.TORBOX_EMBEDDED_SETTINGS : {};
  const s = g.SCRAPER_SETTINGS && typeof g.SCRAPER_SETTINGS === "object" ? g.SCRAPER_SETTINGS : {};
  const out = Object.assign({}, embedded);
  for (const k of Object.keys(s)) if (s[k] !== "" && s[k] != null) out[k] = s[k];
  return out;
}

function onSettings() {
  return [
    { type: "header", label: "TorBox" },
    {
      type: "text",
      key: "apiKey",
      label: "TorBox API key",
      isPassword: true,
      placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      description: "torbox.app > Settings > Account > API key. Only files already in your TorBox library are listed.",
    },
    {
      type: "select",
      key: "linkMode",
      label: "Link",
      defaultValue: "live",
      options: [
        { label: "Fresh at play time (never expires)", value: "live" },
        { label: "Fetched while searching (API key not in the stream URL)", value: "resolved" },
      ],
      description: "Fresh links can't go stale. Fetched links stay valid for a few hours.",
    },
    { type: "info", label: "Add a release to TorBox first (dashboard search or a magnet), then open the title in Nuvio." },
  ];
}

const enc = (s) => encodeURIComponent(String(s));

async function apiJson(path, key) {
  const r = await request(`${API}${path}`, { json: true, timeout: 20000, retries: 1, headers: { Authorization: `Bearer ${key}` } });
  let d = null;
  try { d = JSON.parse(r.text); } catch (e) {}
  if (r.status === 401 || r.status === 403) throw new Error(`TorBox rejected the API key (${r.status})`);
  if (!d || d.success === false) throw new Error(`TorBox ${path.split("?")[0]}: ${(d && (d.detail || d.error)) || r.status}`);
  return d.data;
}

async function library(key) {
  const out = [];
  for (const k of KINDS) {
    try {
      const items = await apiJson(`/${k.kind}/mylist?bypass_cache=true`, key);
      for (const it of Array.isArray(items) ? items : []) out.push({ k, it });
    } catch (e) {
      if (/API key/.test(e.message)) throw e;
      log(`${k.kind}: ${e.message}`);
    }
  }
  return out;
}

const ready = (it) => it.download_present === true || it.download_finished === true || it.cached === true && it.download_state === "cached";

// every playable file in the library that is the wanted movie / episode
function matches(lib, info, type, season, episode) {
  const keys = R.wantedKeys(info);
  const abs = type === "tv" ? absoluteEpisode(info, season, episode) : null;
  const out = [];
  for (const { k, it } of lib) {
    if (!ready(it)) continue;
    const pack = R.parseRelease(it.name);
    const packScore = R.titleMatch(pack, keys);
    for (const f of it.files || []) {
      const path = f.name || f.short_name || "";
      if (!R.VIDEO_EXT.test(path) && !/^video\//.test(f.mimetype || "")) continue;
      if (/(?:^|[\/._ -])sample(?:[\/._ -]|$)/i.test(path) || /(?:^|[\/._ -])(?:trailer|featurette|extras?)(?:[\/._ -]|$)/i.test(path)) continue;
      const rel = R.parseRelease(path);
      const score = Math.max(packScore, R.titleMatch(rel, keys));
      if (!score) continue;
      const year = rel.year || pack.year;

      if (type === "movie") {
        if (R.looksLikeSeries(path, it.name)) continue;
        if (year && info.year && Math.abs(year - info.year) > 1) continue;
        // a transliteration-only match needs the year to back it up
        if (score === 1 && info.year && !year) continue;
      } else {
        const ep = R.episodeInfo(path, it.name);
        if (!ep) continue;
        const seasonOk = ep.season == null ? season === 1 || ep.episode === abs : ep.season === season;
        const epOk = (episode >= ep.episode && episode <= ep.last) || (ep.season == null && ep.episode === abs);
        if (!seasonOk || !epOk) continue;
      }
      out.push({ k, it, f, path, score });
    }
  }
  return out;
}

function fmtSize(b) {
  if (!b) return "";
  return b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`;
}

function liveUrl(m, key) {
  return `${API}/${m.k.kind}/requestdl?token=${enc(key)}&${m.k.idParam}=${enc(m.it.id)}&file_id=${enc(m.f.id)}&redirect=true`;
}

async function resolvedUrl(m, key) {
  return apiJson(`/${m.k.kind}/requestdl?token=${enc(key)}&${m.k.idParam}=${enc(m.it.id)}&file_id=${enc(m.f.id)}`, key);
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  const type = /^(?:tv|series|show|tvshow|episode)$/i.test(String(mediaType || "")) ? "tv" : "movie";
  const season = type === "tv" ? +seasonNum || 1 : null;
  const episode = type === "tv" ? +episodeNum || 1 : null;
  const st = settings();
  const key = String(st.apiKey || "").trim();
  if (!key) {
    log("no API key: open Nuvio > Settings > Plugins > TorBox settings");
    return [];
  }

  let info;
  try {
    info = await tmdbInfo(tmdbId, type);
  } catch (e) {
    log(`tmdb failed: ${e && e.message}`);
    return [];
  }

  let lib;
  try {
    lib = await library(key);
  } catch (e) {
    log(e.message);
    return [];
  }

  let raw = matches(lib, info, type, season, episode);
  if (!raw.length) {
    // sequel listed under its parent's numbering (see sequelBase): retry with the parent title
    const bases = [];
    for (const t of info.titles || []) { const b = R.sequelBase(t); if (b && bases.indexOf(b) < 0) bases.push(b); }
    if (bases.length) {
      raw = matches(lib, Object.assign({}, info, { titles: bases }), type, season, episode).map((m) => Object.assign(m, { via: bases[0] }));
      if (raw.length) log(`no match for "${info.title}", using parent title ${bases.join(" / ")}`);
    }
  }
  const found = raw
    .map((m) => Object.assign(m, { q: R.qualityOf(m.path) || R.qualityOf(m.it.name), size: m.f.size || 0 }))
    .sort((a, b) => b.score - a.score || b.q - a.q || b.size - a.size);
  const label = type === "movie" ? `${info.title}${info.year ? ` (${info.year})` : ""}` : `${info.title} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
  log(`${label}: ${lib.length} library items, ${found.length} matching files`);

  const seen = {};
  const streams = [];
  let resolvedCount = 0;
  for (const m of found) {
    const id = `${m.k.kind}:${m.it.id}:${m.f.id}`;
    if (seen[id]) continue;
    seen[id] = 1;
    if (streams.length >= MAX_STREAMS) break;
    let url = liveUrl(m, key);
    if (st.linkMode === "resolved") {
      if (resolvedCount >= PRE_RESOLVE_LIMIT) break;
      try {
        url = await resolvedUrl(m, key);
        resolvedCount++;
      } catch (e) {
        log(`link for ${m.path}: ${e.message}`);
        continue;
      }
    }
    const quality = m.q ? `${m.q}p` : "Auto";
    const tags = R.tagsOf(m.path + " " + m.it.name);
    const details = [quality, fmtSize(m.size), m.k.label].concat(tags).filter(Boolean).join(" · ");
    streams.push({
      name: "TorBox",
      title: `${R.baseName(m.path)}\n${details}`,
      url,
      quality,
      // Nuvio's TV app shows `size` as the stream's description line (verbatim), so make it readable
      size: [fmtSize(m.size), m.k.label].concat(tags).filter(Boolean).join(" · ") + (m.via ? ` · matched as ${m.via}` : "") + `\n${R.baseName(m.path)}`,
      headers: {},
      provider: "torbox",
    });
  }
  return streams;
}

module.exports = { getStreams, onSettings, matches };
