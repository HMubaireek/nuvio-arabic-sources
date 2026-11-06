// Laroza (laroza1.lat; older laroza.* domains are dead or blocked). Arabic + Turkish series, Arabic/foreign movies.
//   search  : /search.php?keywords=Q -> a[href*=video.php?vid=][title] (episodes are listed individually)
//   series  : any episode's video.php page has div.SeasonsBox: li[data-serie=N] "الموسم N" and
//             div.SeasonsEpisodes[data-serie=N] > a[title] (<em>N</em>)
//   play    : /play.php?vid=<id> -> li[data-embed-url] (okhd, vk, film77, vidoba, vidspeed, ...)
const { mirrorSite, pathOf } = require("../lib/http");
const { anchors, attr, tags } = require("../lib/html");
const { rank, queries, seasonOf, episodeOf } = require("../lib/match");
const { pickEpisode, uniqBy, pathKey } = require("../lib/common");

const vidOf = (href) => (/vid=([A-Za-z0-9_-]+)/.exec(href) || [])[1] || "";

module.exports = {
  id: "laroza",
  name: "Laroza",
  types: ["movie", "tv"],
  bases: ["https://laroza1.lat"],

  async links(ctx) {
    const site = mirrorSite({ name: "Laroza", bases: this.bases, marker: /لاروزا|laroza/i, sameSite: /laroza/i, log: ctx.log });
    const { info } = ctx;
    const isMovie = info.type === "movie";

    let pool = [];
    for (const q of queries(info, 3)) {
      const r = await site.get(`/search.php?keywords=${encodeURIComponent(q)}`);
      if (!r) break;
      pool = uniqBy(pool.concat(anchors(r.text)
        .filter((a) => /video\.php\?vid=/.test(a.href) && a.title)
        .map((a) => ({ title: a.title, vid: vidOf(a.href) }))
        .filter((c) => (isMovie ? /فيلم|film/i.test(c.title) : !/فيلم/.test(c.title)))), (c) => c.vid);
      if (rank(pool, info, { minScore: 100 }).length) break;
    }
    const ranked = rank(pool, info, { minScore: 80, yearSlack: isMovie ? 1 : 99 });
    ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
    if (!ranked.length) return [];

    let vid = null;
    if (isMovie) {
      vid = ranked[0].vid;
    } else {
      const fits = (c) => (seasonOf(c.title) || 1) === ctx.season;
      const direct = ranked.find((c) => fits(c) && episodeOf(c.title) === ctx.episode);
      if (direct) vid = direct.vid;
      else {
        const any = ranked.find(fits) || ranked[0];
        const page = await site.get(`/video.php?vid=${any.vid}`);
        if (!page) return [];
        const seasons = tags(page.text, "li").map((t) => t.tag).filter((t) => /data-serie=/.test(t)).map((t) => attr(t, "data-serie"));
        // the season tabs are numbered in order; a show split per season is a separate listing
        const key = seasons.length > 1 ? String(ctx.season) : seasons[0] || "1";
        const box = new RegExp(`<div class="SeasonsEpisodes"[^>]*data-serie="${key}"[^>]*>([\\s\\S]*?)</div>`).exec(page.text);
        const eps = anchors(box ? box[1] : "").map((a) => {
          const n = /<em>\s*(\d+)\s*<\/em>/.exec(a.inner);
          return { title: a.title || a.text, href: a.href, vid: vidOf(a.href), n: n ? +n[1] : null };
        });
        const ep = pickEpisode(eps, ctx.episode, seasons.length <= 1 ? ctx.absolute : null);
        if (!ep) { ctx.log(`episode ${ctx.episode} not in season tab ${key} (${eps.length} eps)`); return []; }
        vid = ep.vid;
      }
    }
    if (!vid) return [];

    const referer = site.url(`/video.php?vid=${vid}`);
    const play = await site.get(`/play.php?vid=${vid}`, { referer });
    if (!play) return [];
    const embeds = tags(play.text, "li").map((t) => attr(t.tag, "data-embed-url")).filter((u) => /^https?:/.test(u));
    return uniqBy(embeds.map((e) => ({ embed: e, referer: site.url(`/play.php?vid=${vid}`) })), (x) => pathKey(x.embed) + x.embed);
  },
};
