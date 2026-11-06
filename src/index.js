// Arab Hub - one Nuvio scraper that queries every Arabic source in parallel.
//   getStreams(tmdbId, mediaType, season, episode) -> [{name, title, url, quality, headers, provider}]
const { tmdbInfo, absoluteEpisode } = require("./lib/tmdb");
const { resolve, qualityFrom, snapHeight } = require("./lib/hosts");
const { withTimeout, setDeadline, pastDeadline, onTick, HAS_TIMERS } = require("./lib/http");

const SOURCES = require("./sources/registry");

const SOURCE_BUDGET = 28000;   // search + page walking for one source
const EMBED_BUDGET = 14000;    // one embed host
const TOTAL_BUDGET = 40000;    // whole request; whatever resolved by then is returned
const MAX_EMBEDS_PER_SOURCE = 8;
// Nuvio (no timers, one fetch at a time): sources run one after another, best first for the title,
// and nothing new starts after this deadline; in-flight requests end at Nuvio's own fetch timeout
const NO_TIMER_DEADLINE = 35000;
const SERIAL_EMBEDS_PER_SOURCE = 5;

// 0 = site's own direct server, 1 = hosts that resolved in live tests, 3 = unknown, 5 = usually blocked,
// captcha-gated or dead on filtered networks
const GOOD_HOSTS = /okhd|okprime|vidmoly|vidtube|cdn-video|uqload|miravd|streamwish|updown|vtbe|vtube|mixdrop|mxdrop|faselhd|scdns|anime4up|gnli129|3ick|asd\.watch|arabseed/i;
const POOR_HOSTS = /voe\.|reviewrate|filemoon|dood|d0o0d|dsvplay|streamtape|mp4upload|vk\.com|earnvids|vidspeed|film77|vidoba|share4max|uptostream|ok\.ru|vadbam|anime7u/i;
function hostPreference(l) {
  if (/direct/i.test(l.label || "")) return 0;
  const h = String(l.embed || "");
  if (GOOD_HOSTS.test(h)) return 1;
  if (POOR_HOSTS.test(h)) return 5;
  return 3;
}

// which sources to try first when they have to run one by one
function serialOrder(active, info) {
  let first;
  if (info.isAnime) first = ["anime4up", "faselhd", "witanime"];
  else if (info.isTurkish) first = ["3isk", "laroza", "arabseed"];
  else if (info.isArabic) first = ["laroza", "arabseed", "akwam"];
  else first = ["faselhd", "topcinema", "arabseed", "laroza"];
  const rank = (s) => {
    const i = first.indexOf(s.id);
    if (i >= 0) return i;
    return s.id === "akwam" ? 99 : 50; // akwam is blocked on many networks: last
  };
  return active.slice().sort((a, b) => rank(a) - rank(b));
}

const pad2 = (n) => String(n).padStart(2, "0");
const logger = (tag) => (...a) => console.log(`[ArabHub:${tag}]`, ...a);

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = null; }
    }
  });
  await Promise.all(workers);
  return out;
}

// one source -> playable streams (embeds resolved through the shared host extractors)
async function runSource(src, base, sink) {
  const log = logger(src.id);
  const ctx = Object.assign({}, base, { log });
  const t0 = Date.now();
  let links = [];
  try {
    links = (await withTimeout(src.links(ctx), SOURCE_BUDGET, src.id)) || [];
  } catch (e) {
    log(`failed: ${e && e.message}`);
    return [];
  }
  const direct = links.filter((l) => l.url);
  // hosts that reliably resolve go first, so a capped embed list isn't spent on blocked/captcha hosts
  const embeds = links.filter((l) => l.embed)
    .map((l, i) => ({ l, i, p: hostPreference(l) }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.l)
    .slice(0, HAS_TIMERS ? MAX_EMBEDS_PER_SOURCE : SERIAL_EMBEDS_PER_SOURCE);
  const results = direct.map((l) => ({ url: l.url, q: snapHeight(l.q || qualityFrom(l.quality || l.url)), headers: l.headers || {}, host: l.host || src.name, label: l.label }));
  results.forEach((r) => sink && sink(src, r));
  await pool(embeds, 4, async (l) => {
    let got = [];
    try { got = await withTimeout(resolve(l.embed, l.referer), EMBED_BUDGET, l.embed); } catch (e) { got = []; }
    for (const g of got) {
      const r = Object.assign({}, g, { q: g.q || snapHeight(l.q || 0), label: l.label, host: l.host || g.host });
      results.push(r);
      if (sink) sink(src, r);
    }
  });
  log(`${links.length} links -> ${results.length} streams in ${Date.now() - t0}ms`);
  return results;
}

function toStream(src, r, streamTitle) {
  const quality = r.q ? `${r.q}p` : "Auto";
  return {
    name: `Arab Hub | ${src.name}`,
    title: `${streamTitle}\n${quality} · ${r.host || src.name}${r.label ? " · " + r.label : ""}`,
    url: r.url,
    quality,
    headers: r.headers || {},
    provider: "arabhub",
    source: src.id,
  };
}

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum, opts) {
  const o = opts || {};
  // Nuvio passes "tv"; accept the other spellings clients use for shows too
  const type = /^(?:tv|series|show|tvshow|episode)$/i.test(String(mediaType || "")) ? "tv" : "movie";
  const season = type === "tv" ? +seasonNum || 1 : null;
  const episode = type === "tv" ? +episodeNum || 1 : null;
  const log = logger("hub");
  setDeadline(HAS_TIMERS ? (o.budget || TOTAL_BUDGET) : NO_TIMER_DEADLINE);
  if (!HAS_TIMERS) log("runtime has no timers: deadline-only mode");

  let info;
  try {
    info = await tmdbInfo(tmdbId, type);
  } catch (e) {
    log(`tmdb failed: ${e && e.message}`);
    return [];
  }
  const streamTitle = type === "movie"
    ? `${info.title}${info.year ? ` (${info.year})` : ""}`
    : `${info.title} S${pad2(season)}E${pad2(episode)}`;
  const base = { info, season, episode, absolute: type === "tv" ? absoluteEpisode(info, season, episode) : null };

  const wanted = o.only ? SOURCES.filter((s) => o.only.indexOf(s.id) >= 0) : SOURCES.filter((s) => s.enabled !== false);
  const active = wanted.filter((s) => s.types.indexOf(type) >= 0 && (!s.applies || s.applies(info)));
  log(`${streamTitle}: ${active.map((s) => s.id).join(", ")}`);

  const collected = [];
  const sink = (src, r) => collected.push(toStream(src, r, streamTitle));

  if (!HAS_TIMERS) {
    // one source at a time; every resolved stream is kept, the deadline only stops new work
    for (const s of serialOrder(active, info)) {
      if (pastDeadline()) { log(`deadline reached before ${s.id}`); break; }
      await runSource(s, base, sink);
    }
    return finish(collected, active);
  }

  const all = Promise.all(active.map((s) => runSource(s, base, sink)));
  // finish when every source is done, or - checked on each finished request, which also works without
  // timers - once the deadline has passed (hung requests keep running in the background, ignored)
  let stopTicks = () => {};
  const cutoff = new Promise((res) => {
    stopTicks = onTick(() => { if (pastDeadline()) res("deadline"); });
  });
  try {
    const how = await withTimeout(Promise.race([all.then(() => "done"), cutoff]), o.budget || TOTAL_BUDGET, "total");
    if (how === "deadline") log(`deadline reached, returning ${collected.length} streams so far`);
  } catch (e) {
    log(`budget reached, returning ${collected.length} streams so far`);
  } finally {
    stopTicks();
  }
  return finish(collected, active);
}

// dedupe by URL, best quality first, source priority as tie-break
function finish(collected, active) {
  const seen = {};
  const order = {};
  active.forEach((s, i) => { order[s.id] = i; });
  return collected
    .filter((s) => (seen[s.url] ? false : (seen[s.url] = true)))
    .sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0) || order[a.source] - order[b.source]);
}

module.exports = { getStreams, runSource, SOURCES };
