// Anime4up (landing anime4up.bond -> rotating domain, e.g. 4f.gnli129.shop). Arabic-subbed anime.
//   search : /?search_param=animes&s=Q -> /anime/<slug>/ cards
//   anime  : page links myanimelist.net/anime/<malId>; each season is its own entry ("2nd Season")
//   play   : own players at /Anime4up-S1|S2/mal/<malId>/<ep>/sub/ -> `let streamUrl = "<hls>"` + Arabic VTT
//            episode pages (/episode/...) add li[data-watch] mirrors (uqload, mp4upload, ...)
const { mirrorSite, pathOf, request, originOf } = require("../lib/http");
const { anchors, attr, tags, decodeUri } = require("../lib/html");
const { episodeOf } = require("../lib/match");
const { uniqBy, pathKey } = require("../lib/common");
const { rankAnime, pickEntry, animeQueries } = require("../lib/anime");

const LANDINGS = ["https://anime4up.bond"];

// the landing page links the current domain
async function discover(log) {
  for (const l of LANDINGS) {
    try {
      const r = await request(l + "/", { timeout: 8000, retries: 1 });
      const hrefs = anchors(r.text).map((a) => a.href).filter((h) => /\/anime-type\/|%d9%82%d8%a7%d8%a6%d9%85%d8%a9|\/episode\//i.test(h));
      const o = hrefs.length ? originOf(hrefs[0]) : "";
      if (o) return o;
    } catch (e) {
      log(`landing ${l}: ${e.message}`);
    }
  }
  return null;
}

module.exports = {
  id: "anime4up",
  name: "Anime4up",
  types: ["movie", "tv"],
  bases: ["https://4f.gnli129.shop", "https://w1.anime4up.rest", "https://anime4up.cam"],
  applies: (info) => info.isAnime,

  async links(ctx) {
    const found = await discover(ctx.log);
    const bases = found ? [found].concat(this.bases.filter((b) => b !== found)) : this.bases;
    const site = mirrorSite({ name: "Anime4up", bases, marker: /anime4up|انمي فور اب/i, log: ctx.log });

    let pool = [];
    for (const q of animeQueries(ctx.info)) {
      const r = await site.get(`/?search_param=animes&s=${encodeURIComponent(q)}`);
      if (!r) continue;
      pool = uniqBy(pool.concat(anchors(r.text)
        .filter((a) => /\/anime\//.test(a.href) && a.text)
        .map((a) => ({ title: a.text, href: pathOf(a.href) }))), (x) => pathKey(x.href));
      if (pickEntry(rankAnime(pool, ctx.info).filter((c) => c.score >= 100), ctx)) break; // stop once the wanted season is in hand
    }
    const scored = rankAnime(pool, ctx.info);
    const pick = pickEntry(scored, ctx);
    ctx.log(`candidates: ${scored.slice(0, 4).map((c) => `${c.title}(${c.score})`).join(", ") || "none"} -> ${pick ? `${pick.entry.title} ep ${pick.episode}` : "-"}`);
    if (!pick) return [];
    const ep = pick.episode;

    const page = await site.get(pick.entry.href);
    if (!page) return [];
    const mal = (/myanimelist\.net\/anime\/(\d+)/.exec(page.text) || [])[1];
    const referer = site.url(pick.entry.href);
    const out = [];
    if (mal) {
      for (const s of ["S1", "S2"]) out.push({ embed: site.url(`/Anime4up-${s}/mal/${mal}/${ep}/sub/`), referer, label: `server ${s}`, host: "Anime4up" });
    }
    // mirrors from the episode page, when the listing shows it
    const epLink = anchors(page.text).filter((a) => /\/episode\//.test(a.href))
      .map((a) => ({ href: pathOf(a.href), n: episodeOf(a.text) || episodeOf(decodeUri(a.href)) }))
      .find((x) => x.n === ep);
    if (epLink) {
      const epPage = await site.get(epLink.href);
      if (epPage) {
        for (const t of tags(epPage.text, "li")) {
          const w = attr(t.tag, "data-watch");
          if (w && !/\/Anime4up-S\d\//.test(w)) out.push({ embed: w, referer: site.url(epLink.href) });
        }
      }
    }
    return uniqBy(out, (x) => x.embed);
  },
};
