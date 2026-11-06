// 3isk / Qissat Eshq (3esk.onl -> ww4.3ick.club). Turkish series, subbed (مترجم) and dubbed (مدبلج).
//   search  : /?s=Q -> a.type_item[title] -> /watch/tvshows/<slug>/
//   show    : every episode on one page, numbered continuously ("الحلقة 190") -> absolute numbering
//   episode : GET episode (sets PHPSESSID) -> GET <episode>/see/ (302s back without the cookie)
//             -> li.server_nth[data-post][data-nume] + iframe /embed/<n>/<post>/<nume>/ -> host iframe
// Episode links on pages point at sibling mirrors (ww5...) that may not resolve, so paths are re-based.
const { mirrorSite, pathOf, makeJar } = require("../lib/http");
const { anchors, attr, tags } = require("../lib/html");
const { rank, queries, episodeOf, seasonOf } = require("../lib/match");
const { uniqBy, pathKey } = require("../lib/common");

module.exports = {
  id: "3isk",
  name: "3isk",
  types: ["tv"],
  bases: ["https://ww4.3ick.club", "https://3esk.onl", "https://ww5.3ick.club", "https://3iskk.xyz", "https://esheaq.onl"],
  applies: (info) => info.isTurkish || info.lang === "ar" || info.lang === "tr",

  async links(ctx) {
    const site = mirrorSite({ name: "3isk", bases: this.bases, marker: /قصة عشق|3isk|3ick|theme3sk/i, sameSite: /3ick|3esk|3isk|esheaq/i, log: ctx.log });
    const { info } = ctx;

    let pool = [];
    for (const q of queries(info, 3)) {
      const r = await site.get(`/?s=${encodeURIComponent(q)}`);
      if (!r) continue;
      pool = uniqBy(pool.concat(anchors(r.text)
        .filter((a) => /\/tvshows\//.test(a.href) && (a.title || a.text))
        .map((a) => ({ title: a.title || a.text, href: pathOf(a.href) }))), (x) => pathKey(x.href));
      if (rank(pool, info, { minScore: 90 }).length) break;
    }
    // subbed first, dubbed after; a show split per season carries "الموسم N" in its title
    const shows = rank(pool, info, { minScore: 80 })
      .filter((s) => { const n = seasonOf(s.title); return n == null || n === ctx.season; })
      .sort((a, b) => (/مدبلج/.test(a.title) ? 1 : 0) - (/مدبلج/.test(b.title) ? 1 : 0) || b.score - a.score);
    ctx.log(`candidates: ${shows.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);

    const out = [];
    for (const show of shows.slice(0, 2)) {
      const page = await site.get(show.href);
      if (!page) continue;
      const eps = uniqBy(anchors(page.text)
        .filter((a) => /\/watch\/episodes\//.test(a.href))
        .map((a) => ({ href: pathOf(a.href), n: episodeOf(a.title || a.text) })), (x) => pathKey(x.href))
        .filter((x) => x.n);
      const perSeason = seasonOf(show.title) != null;
      const want = perSeason ? [ctx.episode] : [ctx.absolute, ctx.episode];
      let ep = null;
      for (const n of want) { ep = eps.find((x) => x.n === n); if (ep) break; }
      if (!ep) { ctx.log(`episode ${want.join("/")} not in ${eps.length} eps of ${show.title}`); continue; }
      const label = /مدبلج/.test(show.title) ? "مدبلج" : "مترجم";
      out.push.apply(out, await episodeEmbeds(site, ep.href, label));
      if (out.length >= 4) break;
    }
    return out;
  },
};

async function episodeEmbeds(site, epPath, label) {
  const jar = makeJar();
  const ep = await site.get(epPath, { jar });
  if (!ep) return [];
  const seePath = epPath.replace(/\/?$/, "/") + "see/";
  const see = await site.get(seePath, { jar, referer: site.url(epPath) });
  if (!see) return [];
  const servers = tags(see.text, "li").map((t) => t.tag).filter((t) => /server_nth/.test(t))
    .map((t) => ({ post: attr(t, "data-post"), nume: attr(t, "data-nume") })).filter((s) => s.post);
  const frame = /<iframe[^>]+id=["']iframe_player["'][^>]+src=["']([^"']+)["']/i.exec(see.text) || /<iframe[^>]+src=["']([^"']*\/embed\/[^"']+)["']/i.exec(see.text);
  const tpl = frame ? pathOf(frame[1]) : "";
  const paths = servers.length && /\/embed\/\d+\/\d+\/\d+/.test(tpl)
    ? servers.map((s) => tpl.replace(/\/embed\/(\d+)\/\d+\/\d+/, `/embed/$1/${s.post}/${s.nume}`))
    : tpl ? [tpl] : [];
  const referer = site.url(seePath);
  const embeds = await Promise.all(paths.slice(0, 5).map(async (p) => {
    const r = await site.get(p, { jar, referer, marker: null });
    const m = r && /<iframe[^>]+src=["']([^"']+)["']/i.exec(r.text);
    return m ? { embed: m[1], referer: site.url(p), label } : null;
  }));
  return uniqBy(embeds.filter(Boolean), (x) => x.embed);
}
