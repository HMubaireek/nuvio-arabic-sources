// Arab Hub - one Nuvio scraper that queries every Arabic source in parallel.
//   getStreams(tmdbId, mediaType, season, episode) -> [{name, title, url, quality, headers, provider}]
const { tmdbInfo, absoluteEpisode } = require("./lib/tmdb");
const { resolve, qualityFrom, snapHeight } = require("./lib/hosts");
const { withTimeout } = require("./lib/http");

const SOURCES = require("./sources/registry");

const SOURCE_BUDGET = 28000;   // search + page walking for one source
const EMBED_BUDGET = 14000;    // one embed host
const TOTAL_BUDGET = 40000;    // whole request; whatever resolved by then is returned
const MAX_EMBEDS_PER_SOURCE = 8;

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
  const embeds = links.filter((l) => l.embed).slice(0, MAX_EMBEDS_PER_SOURCE);
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
  const type = mediaType === "tv" ? "tv" : "movie";
  const season = type === "tv" ? +seasonNum || 1 : null;
  const episode = type === "tv" ? +episodeNum || 1 : null;
  const log = logger("hub");

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
  const all = Promise.all(active.map((s) => runSource(s, base, sink)));
  try {
    await withTimeout(all, o.budget || TOTAL_BUDGET, "total");
  } catch (e) {
    log(`budget reached, returning ${collected.length} streams so far`);
  }

  const seen = {};
  const order = {};
  active.forEach((s, i) => { order[s.id] = i; });
  return collected
    .filter((s) => (seen[s.url] ? false : (seen[s.url] = true)))
    .sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0) || order[a.source] - order[b.source]);
}

module.exports = { getStreams, runSource, SOURCES };
