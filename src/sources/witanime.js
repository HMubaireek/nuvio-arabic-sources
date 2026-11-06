// WitAnime (witanime.onl; .cyou/.xyz/.red now serve ISP block certs). Arabic-subbed anime.
//   search  : /?search_param=animes&s=Q -> a[href*=/anime/] (div.anime-card .info h3)
//   anime   : /anime/<slug>/ -> episode links /episode/<slug>-الحلقة-N-مترجمة/
//   episode : a.episode-server[data-url] -> embed hosts (uqload, mp4upload, ok.ru, dood, voe, ...)
const { mirrorSite, pathOf } = require("../lib/http");
const { anchors, attr, tags, decodeUri } = require("../lib/html");
const { episodeOf } = require("../lib/match");
const { uniqBy, pathKey } = require("../lib/common");
const { rankAnime, pickEntry, animeQueries } = require("../lib/anime");

module.exports = {
  id: "witanime",
  name: "WitAnime",
  types: ["movie", "tv"],
  bases: ["https://witanime.onl", "https://witanime.site", "https://witanime.com"],
  applies: (info) => info.isAnime,

  async links(ctx) {
    const site = mirrorSite({ name: "WitAnime", bases: this.bases, marker: /witanime/i, sameSite: /witanime/i, log: ctx.log });

    let pool = [];
    for (const q of animeQueries(ctx.info)) {
      const r = await site.get(`/?search_param=animes&s=${encodeURIComponent(q)}`);
      if (!r) continue;
      pool = uniqBy(pool.concat(anchors(r.text)
        .filter((a) => /\/anime\/[^\/]+\/?$/.test(a.href) && (a.text || a.title))
        .map((a) => ({ title: a.text || a.title, href: pathOf(a.href) }))), (x) => pathKey(x.href));
      if (pickEntry(rankAnime(pool, ctx.info).filter((c) => c.score >= 100), ctx)) break; // stop once the wanted season is in hand
    }
    const scored = rankAnime(pool, ctx.info);
    const pick = pickEntry(scored, ctx);
    ctx.log(`candidates: ${scored.slice(0, 4).map((c) => `${c.title}(${c.score})`).join(", ") || "none"} -> ${pick ? `${pick.entry.title} ep ${pick.episode}` : "-"}`);
    if (!pick) return [];

    const page = await site.get(pick.entry.href);
    if (!page) return [];
    const eps = uniqBy(anchors(page.text).filter((a) => /\/episode\//.test(a.href))
      .map((a) => ({ href: pathOf(a.href), n: episodeOf(a.text) || episodeOf(decodeUri(a.href)) })), (x) => pathKey(x.href));
    const ep = eps.find((x) => x.n === pick.episode) || (ctx.info.type === "movie" ? eps[0] : null);
    if (!ep) { ctx.log(`episode ${pick.episode} not among ${eps.length}`); return []; }

    const epPage = await site.get(ep.href);
    if (!epPage) return [];
    const referer = site.url(ep.href);
    return uniqBy(tags(epPage.text, "a").map((t) => t.tag).filter((t) => /episode-server/.test(t))
      .map((t) => ({ embed: attr(t, "data-url"), referer })).filter((x) => /^https?:/.test(x.embed)), (x) => x.embed);
  },
};
