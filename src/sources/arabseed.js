// ArabSeed (arabseed.* -> m.asd.watch). Custom "ArabSeed 2026" theme.
//   search : /find/?word=Q[&type=movies]  -> a.movie__block[title]
//   series : every episode page links /selary/<show>-الموسم-<ordinal>/ (season page with all episodes);
//            other seasons are reached by swapping the ordinal in that slug
//   watch  : <post>/watch/ -> main__obj.csrf__token + li[data-quality] + li[data-post][data-server][data-link]
//            POST /get__quality__servers/ {post_id, quality, csrf_token} -> {html (li list), server}
//            POST /get__watch__server/   {post_id, quality, server, csrf_token} -> {server: embed url}
const { mirrorSite, pathOf } = require("../lib/http");
const { anchors, attr, tags, decodeUri, b64decode } = require("../lib/html");
const { rank, queries, seasonOf, episodeOf } = require("../lib/match");
const { pickEpisode, uniqBy, pathKey } = require("../lib/common");

const ORD = ["", "الاول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي-عشر", "الثاني-عشر", "الثالث-عشر", "الرابع-عشر", "الخامس-عشر"];
const ORD_SLUG_RE = /(الموسم-)(الحادي-عشر|الثاني-عشر|الثالث-عشر|الرابع-عشر|الخامس-عشر|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/;

function blocks(html) {
  return tags(html, "a").map((t) => t.tag).filter((t) => /movie__block/.test(t))
    .map((t) => ({ title: attr(t, "title"), href: pathOf(attr(t, "href")) }))
    .filter((b) => b.title && b.href);
}

const b64 = (s) => b64decode(s);

module.exports = {
  id: "arabseed",
  name: "ArabSeed",
  types: ["movie", "tv"],
  bases: ["https://m.asd.watch", "https://arabseed.top", "https://m.arabseed.top", "https://m.myseed.tv", "https://asd.homes", "https://arabseed.show"],

  async links(ctx) {
    const site = mirrorSite({ name: "ArabSeed", bases: this.bases, marker: /ArabSeed|عرب سيد/i, sameSite: /asd|seed/i, log: ctx.log });
    const { info } = ctx;
    const isMovie = info.type === "movie";

    let target = null;
    if (isMovie) {
      let pool = [];
      for (const q of queries(info, 3)) {
        const r = await site.get(`/find/?word=${encodeURIComponent(q)}&type=movies`);
        if (r) pool = uniqBy(pool.concat(blocks(r.text).filter((b) => /فيلم|film/i.test(b.title))), (b) => pathKey(b.href));
        const best = rank(pool, info, { minScore: 75 });
        if (best.length && best[0].score >= 100) break;
      }
      const best = rank(pool, info, { minScore: 75 });
      ctx.log(`candidates: ${best.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
      if (best.length) target = best[0].href;
    } else {
      target = await findEpisode(site, ctx);
    }
    if (!target) return [];
    ctx.log(`page ${decodeUri(target).slice(0, 80)}`);
    return watchLinks(site, target, ctx);
  },
};

async function findEpisode(site, ctx) {
  const { info, season, episode } = ctx;
  // episode titles look like "مسلسل Breaking Bad الموسم الخامس الحلقة 16 ..." ; ranking strips season/episode words
  let pool = [];
  for (const q of queries(info, 2)) {
    for (const word of [q, `${q} الموسم ${ORD[season] || season}`]) {
      const r = await site.get(`/find/?word=${encodeURIComponent(word)}`);
      if (r) pool = uniqBy(pool.concat(blocks(r.text).filter((b) => /مسلسل|برنامج|انمي|series/i.test(b.title))), (b) => pathKey(b.href));
    }
    if (rank(pool, info, { minScore: 85 }).length) break;
  }
  const ranked = rank(pool, info, { minScore: 85 });
  // same-name shows (anime vs live action) differ only by the label bonus: keep the top tier
  const mine = ranked.filter((c) => c.score >= (ranked.length ? ranked[0].score : 0) - 3);
  ctx.log(`candidates: ${mine.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
  if (!mine.length) return null;

  const fits = (b) => (seasonOf(b.title) || 1) === season;
  const direct = mine.find((b) => fits(b) && episodeOf(b.title) === episode);
  if (direct) return direct.href;

  // open one episode, find its season page, then hop to the wanted season by slug
  const anyEp = mine.find(fits) || mine[0];
  const epPage = await site.get(anyEp.href);
  if (!epPage) return null;
  const selary = anchors(epPage.text).map((a) => a.href).find((h) => /\/selary\//.test(h));
  const tries = [];
  if (selary) {
    const p = decodeUri(pathOf(selary));
    const have = seasonOf(p.replace(/-/g, " "));
    if (have === season) tries.push(p);
    else if (ORD_SLUG_RE.test(p) && ORD[season]) tries.push(p.replace(ORD_SLUG_RE, `$1${ORD[season]}`));
    else if (season === 1) tries.push(p);
    else tries.push(p.replace(/\/?$/, "") + `-الموسم-${ORD[season] || season}/`);
  }
  for (const sp of tries) {
    const page = await site.get(sp);
    if (!page) continue;
    // only the season's own list (the page also carries "latest episodes" of other shows)
    const list = /<ul class="episodes__list[\s\S]*?<\/ul>/.exec(page.text);
    if (!list) continue;
    const eps = anchors(list[0])
      .filter((a) => !/\/watch\/?$/.test(a.href))
      .map((a) => {
        const n = /epi__num[^>]*>[\s\S]*?<b>\s*(\d+)/.exec(a.inner);
        return { title: a.text || a.title, href: pathOf(a.href), n: n ? +n[1] : null };
      });
    const ep = pickEpisode(uniqBy(eps, (x) => pathKey(x.href)), episode, ctx.absolute);
    if (ep) return ep.href;
    ctx.log(`episode ${episode} not on ${sp} (${eps.length} eps)`);
  }
  return null;
}

async function watchLinks(site, target, ctx) {
  const watchPath = target.replace(/\/?$/, "/") + "watch/";
  const page = await site.get(watchPath, { referer: site.url(target) });
  if (!page) return [];
  const html = page.text;
  const referer = site.url(watchPath);
  const csrf = (/csrf__token['"]?\s*:\s*['"]([^'"]+)/.exec(html) || [])[1] || "";
  const postId = (/psot_id['"]?\s*:\s*['"](\d+)/.exec(html) || [])[1] || (/data-post="(\d+)"/.exec(html) || [])[1];
  const qualities = tags(html, "li").map((t) => +attr(t.tag, "data-quality")).filter(Boolean);
  const out = [];

  const fromLi = (liHtml, q) => tags(liHtml, "li").map((t) => t.tag).filter((t) => /data-server=/.test(t))
    .map((t) => ({ server: attr(t, "data-server"), link: attr(t, "data-link"), q: +attr(t, "data-qu") || q, direct: attr(t, "data-direct-arabseed") === "1" }));

  const embedOf = (link) => {
    if (!link) return "";
    const vid = /\/vid\/\?id=([A-Za-z0-9+\/=_-]+)/.exec(link);
    if (vid) return b64(vid[1]);
    return link.charAt(0) === "/" ? site.url(link) : link;
  };

  // default quality's servers are in the page already
  const initial = fromLi(html, 0);
  const byQ = {};
  for (const s of initial) (byQ[s.q] = byQ[s.q] || []).push(s);
  const missing = qualities.filter((q) => !byQ[q]);
  await Promise.all(missing.map(async (q) => {
    const r = await site.post("/get__quality__servers/", { post_id: postId, quality: q, csrf_token: csrf }, { referer, marker: null, headers: { "X-Requested-With": "XMLHttpRequest" } });
    let j = null;
    try { j = r && JSON.parse(r.text); } catch (e) {}
    if (!j || j.type !== "success") return;
    byQ[q] = fromLi(j.html || "", q);
    if (j.server && byQ[q][0]) byQ[q][0].link = j.server; // first server already resolved
  }));

  // best qualities first, first two servers each (direct ArabSeed server + one mirror)
  const want = Object.keys(byQ).map(Number).sort((a, b) => b - a);
  const jobs = [];
  for (const q of want) for (const s of byQ[q].slice(0, 3)) jobs.push(s);
  await Promise.all(jobs.map(async (s) => {
    let link = s.link;
    if (!link) {
      const r = await site.post("/get__watch__server/", { post_id: postId, quality: s.q, server: s.server, csrf_token: csrf }, { referer, marker: null, headers: { "X-Requested-With": "XMLHttpRequest" } });
      try { link = JSON.parse(r.text).server || ""; } catch (e) { link = ""; }
    }
    const embed = embedOf(link);
    if (embed) out.push({ embed, referer, q: s.q, label: s.direct ? "ArabSeed direct" : "" });
  }));
  out.sort((a, b) => b.q - a.q);
  return uniqBy(out, (x) => x.embed);
}
