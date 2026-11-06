// TopCinema (topcinema.* -> web6.topcinema.fan). WordPress "movies2023" theme:
//   search  : POST {Ajaxat}/Searching.php {search, type:"all"}  -> cards (a[title])
//   movie   : /<slug>/watch/  -> li.server--item[data-id][data-server]
//   series  : /series/<slug>/ season links -> episode cards -> /<ep-slug>/watch/
//   servers : POST {Ajaxat}/Single/Server.php {id, i} -> <iframe src=embed>
const { mirrorSite, pathOf } = require("../lib/http");
const { anchors, attr, tags } = require("../lib/html");
const { rank, queries, seasonOf } = require("../lib/match");
const { pickSeason, pickEpisode, uniqBy, pathKey } = require("../lib/common");

const AJAX = "/wp-content/themes/movies2023/Ajaxat";

module.exports = {
  id: "topcinema",
  name: "TopCinema",
  types: ["movie", "tv"],
  bases: ["https://web6.topcinema.fan", "https://topcinema.fan", "https://topcinema.cam", "https://topcinemaa.co", "https://topcinema.ink", "https://topcinema.film", "https://web.topcinemaa.live"],

  async links(ctx) {
    const site = mirrorSite({ name: "TopCinema", bases: this.bases, marker: /movies2023|topcinema/i, sameSite: /topcinema/i, log: ctx.log });
    const { info } = ctx;
    const isMovie = info.type === "movie";

    // 1. search
    let pool = [];
    for (const q of queries(info, 3)) {
      const r = await site.post(`${AJAX}/Searching.php`, { search: q, type: "all" }, { marker: null, headers: { "X-Requested-With": "XMLHttpRequest" } });
      if (!r) continue;
      const cards = anchors(r.text)
        .filter((a) => a.title)
        .map((a) => ({ title: a.title, path: pathOf(a.href), series: /\/series\//.test(a.href) }))
        .filter((c) => (isMovie ? !c.series && /فيلم|film|movie/i.test(c.title) : c.series));
      pool = uniqBy(pool.concat(cards), (c) => pathKey(c.path));
      const ranked = rank(pool, info);
      if (ranked.length && ranked[0].score >= 100) break;
    }
    const ranked = rank(pool, info, { minScore: 75 });
    ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
    if (!ranked.length) return [];

    // 2. page whose /watch/ we need
    let target = null;
    if (isMovie) {
      target = ranked[0].path;
    } else {
      for (const show of ranked.slice(0, 2)) {
        const page = await site.get(show.path);
        if (!page) continue;
        // season links live on the show page (and on every season page)
        const seasons = uniqBy(anchors(page.text)
          .filter((a) => /\/series\//.test(a.href) && /الموسم|season/i.test(a.text + " " + a.title))
          .map((a) => ({ title: a.text || a.title, href: pathOf(a.href) })), (x) => pathKey(x.href));
        let season = pickSeason(seasons, ctx.season);
        let seasonPage = null;
        if (season) seasonPage = pathKey(season.href) === pathKey(show.path) ? page : await site.get(season.href);
        else if (ctx.season === 1 || seasonOf(show.title) === ctx.season) seasonPage = page;
        if (!seasonPage) continue;
        const eps = episodesOf(seasonPage.text);
        const ep = pickEpisode(eps, ctx.episode, ctx.absolute);
        if (ep) { target = ep.href; break; }
        ctx.log(`episode ${ctx.episode} not listed (${eps.length} eps)`);
      }
    }
    if (!target) return [];

    // 3. watch page -> server list -> embeds
    const watchPath = target.replace(/\/?$/, "/") + "watch/";
    const watch = await site.get(watchPath, { referer: site.url(target) });
    if (!watch) return [];
    const servers = tags(watch.text, "li").map((t) => t.tag).filter((t) => /server--item/.test(t))
      .map((t) => ({ id: attr(t, "data-id"), i: attr(t, "data-server") })).filter((s) => s.id);
    const first = /<iframe[^>]+src=["']([^"']+)["']/i.exec(watch.text);
    const referer = site.url(watchPath);
    const out = first ? [{ embed: first[1], referer }] : [];
    const embeds = await Promise.all(servers.slice(0, 10).map(async (s) => {
      const r = await site.post(`${AJAX}/Single/Server.php`, { id: s.id, i: s.i }, { marker: null, referer, headers: { "X-Requested-With": "XMLHttpRequest" } });
      const m = r && /<iframe[^>]+src=["']([^"']+)["']/i.exec(r.text);
      return m ? { embed: m[1], referer } : null;
    }));
    return uniqBy(out.concat(embeds.filter(Boolean)), (x) => x.embed);
  },
};

function episodesOf(html) {
  return uniqBy(anchors(html)
    .filter((a) => a.title && /الحلقة|الحلقه|episode/i.test(a.title) && !/\/series\/|\/category\//.test(a.href))
    .map((a) => {
      const num = /<div class="epnum">[\s\S]*?<\/span>\s*(\d+)/i.exec(a.inner);
      return { title: a.title, href: pathOf(a.href), n: num ? +num[1] : null };
    }), (x) => pathKey(x.href));
}
