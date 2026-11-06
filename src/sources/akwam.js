// Akwam (akwam.ss; ak.sv / akwam.to / akwam.it rotate). Custom theme.
//   search : /search?q=Q -> h3.entry-title > a[href*=/movie/|/series/]
//   movie  : page -> a.link-show[href] ("مشاهدة"), one per quality
//   series : page per season; season buttons in div.widget-body a.btn; episodes in #series-episodes a[href*=/episode/]
//   watch  : link-show points either straight at /watch/<id>/<movieId>/<slug> (has <source src=...>) or at a
//            go.* / /link/<id> redirector whose page only carries the next hop (download-link / watch link)
//            -> follow up to 3 hops until a page has <source>.
// Files are on *.downet.net, which only answers over plain http from filtered networks; the `size`
// attribute is unreliable (1080p files tagged 720), so quality comes from the file name.
const { mirrorSite, pathOf, request, absUrl, hostOf, UA } = require("../lib/http");
const { anchors, attr, tags, stripTags, decodeUri } = require("../lib/html");
const { rank, queries, seasonOf, yearIn } = require("../lib/match");
const { pickSeason, pickEpisode, uniqBy, pathKey } = require("../lib/common");
const { qualityFrom } = require("../lib/hosts");

const FORCE_HTTP = true;
const MARKER = /entry-title|link-show|series-episodes|akwam/i;

function cards(html) {
  const out = [];
  const re = /<h3[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const type = /\/movie\//.test(href) ? "movie" : /\/series\//.test(href) ? "tv" : null;
    if (type) out.push({ title: stripTags(m[2]), href: pathOf(href), type });
  }
  return uniqBy(out, (c) => pathKey(c.href));
}

function pageYear(html) {
  const m = /href="[^"]*\/year\/(\d{4})"/.exec(html);
  return m ? +m[1] : yearIn(stripTags((/<h1[\s\S]*?<\/h1>/.exec(html) || [""])[0]));
}

function sourcesIn(html, pageUrl) {
  return tags(html, "source").map((t) => absUrl(attr(t.tag, "src"), pageUrl)).filter((u) => /^https?:/.test(u));
}

module.exports = {
  id: "akwam",
  name: "Akwam",
  // disabled 2026-11-06: DNS-blocked + SNI-reset on the user's network (works only intermittently).
  // Re-enable by deleting this line; `node tests/live.js akwam` still runs it on demand.
  enabled: false,
  types: ["movie", "tv"],
  bases: ["https://akwam.ss", "https://ak.sv", "https://akwam.to", "https://akwam.it", "https://akwam.net", "https://akw.to"],

  async links(ctx) {
    const site = mirrorSite({ name: "Akwam", bases: this.bases, marker: MARKER, sameSite: /akwam|ak\.sv|akw\./i, log: ctx.log });
    const { info } = ctx;
    const isMovie = info.type === "movie";

    let pool = [];
    for (const q of queries(info, 3)) {
      const r = await site.get(`/search?q=${encodeURIComponent(q)}`);
      if (!r) break; // every mirror unreachable - don't burn the budget on more queries
      pool = uniqBy(pool.concat(cards(r.text).filter((c) => c.type === info.type)), (c) => pathKey(c.href));
      if (rank(pool, info, { minScore: 100 }).length) break;
    }
    const ranked = rank(pool, info, { minScore: 75, yearSlack: isMovie ? 1 : 99 });
    ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);

    for (const c of ranked.slice(0, isMovie ? 3 : 2)) {
      const page = await site.get(c.href);
      if (!page) continue;
      if (isMovie) {
        const y = pageYear(page.text);
        if (y && info.year && Math.abs(y - info.year) > 1) { ctx.log(`skip ${c.title}: ${y} vs ${info.year}`); continue; }
        const out = await fromWatchButtons(site, page.text, site.url(c.href), ctx);
        if (out.length) return out;
        continue;
      }
      const epPath = await findEpisode(site, page.text, c.href, ctx);
      if (!epPath) continue;
      const ep = await site.get(epPath, { referer: site.url(c.href) });
      if (!ep) continue;
      const out = await fromWatchButtons(site, ep.text, site.url(epPath), ctx);
      if (out.length) return out;
    }
    return [];
  },
};

async function findEpisode(site, html, showPath, ctx) {
  // seasons: this page + buttons to sibling season pages
  const seasonLinks = [{ title: stripTags((/<h1[\s\S]*?<\/h1>/.exec(html) || [""])[0]), href: showPath }];
  const box = /<div[^>]*class="[^"]*widget-body[^"]*"[\s\S]*?<\/div>/gi;
  let m;
  while ((m = box.exec(html))) {
    for (const a of anchors(m[0])) if (/\/series\//.test(a.href) && /\bbtn\b/.test(a.cls)) seasonLinks.push({ title: a.text, href: pathOf(a.href) });
  }
  const seasons = uniqBy(seasonLinks, (x) => pathKey(x.href));
  let season = pickSeason(seasons, ctx.season);
  if (!season && seasons.length === 1) season = seasons[0]; // one page for the whole show -> absolute numbering
  if (!season) { ctx.log(`no season ${ctx.season} among ${seasons.length}`); return null; }
  const page = pathKey(season.href) === pathKey(showPath) ? { text: html } : await site.get(season.href);
  if (!page) return null;
  const eps = uniqBy(anchors(page.text).filter((a) => /\/episode\//.test(a.href))
    .map((a) => ({ title: a.text, href: pathOf(a.href) })).filter((x) => x.title), (x) => pathKey(x.href));
  const ep = pickEpisode(eps, ctx.episode, seasons.length === 1 ? ctx.absolute : null);
  if (!ep) ctx.log(`episode ${ctx.episode} not among ${eps.length}`);
  return ep ? ep.href : null;
}

async function fromWatchButtons(site, html, pageUrl, ctx) {
  const shows = uniqBy(tags(html, "a").map((t) => t.tag).filter((t) => /link-show/.test(t)).map((t) => attr(t, "href")).filter(Boolean), (h) => h);
  if (!shows.length) { ctx.log(`no watch buttons on ${decodeUri(pathOf(pageUrl)).slice(0, 60)}`); return []; }
  const files = [];
  await Promise.all(shows.slice(0, 4).map(async (href) => {
    for (const f of await followToSources(site, href, pageUrl, ctx)) files.push(f);
  }));
  return uniqBy(files, (f) => f.url).map((f) => ({
    url: f.url,
    q: qualityFrom(decodeUri(f.url.split("/").pop())) || f.q,
    headers: { "User-Agent": UA, Referer: f.referer },
    host: "Akwam",
  }));
}

// link-show -> (go./link/download redirector pages) -> watch page with <source>
async function followToSources(site, href, referer, ctx) {
  let url = absUrl(href, referer);
  let ref = referer;
  for (let hop = 0; hop < 4 && url; hop++) {
    // own-domain paths are re-based onto the live mirror; go.* redirectors are fetched as-is
    const own = /akwam|ak\.sv|akw\./i.test(hostOf(url)) && !/^go\./i.test(hostOf(url));
    let r = null;
    try {
      r = own ? await site.get(pathOf(url), { referer: ref, marker: null }) : await request(url, { referer: ref, timeout: 10000, retries: 1 });
    } catch (e) { r = null; }
    if (!r) return [];
    const here = r.url || url;
    const src = sourcesIn(r.text, here);
    if (src.length) {
      return src.map((s) => ({ url: FORCE_HTTP ? s.replace(/^https:\/\/([^\/]*downet\.net)/i, "http://$1") : s, q: 0, referer: here }));
    }
    // next hop: an explicit watch link, the redirector's download-link button, or a meta/JS redirect
    const links = anchors(r.text).map((a) => ({ href: absUrl(a.href, here), cls: a.cls }));
    const next = links.find((a) => /\/watch\/\d+/.test(a.href) && pathKey(a.href) !== pathKey(here))
      || links.find((a) => /download-link|link-download|\blink\b/.test(a.cls) && /^https?:/.test(a.href) && pathKey(a.href) !== pathKey(here))
      || ((/(?:location\.href|window\.location)\s*=\s*["']([^"']+)["']|http-equiv=["']refresh["'][^>]*url=([^"'>]+)/i.exec(r.text) || []).slice(1).filter(Boolean).map((u) => ({ href: absUrl(u, here) }))[0]);
    if (!next) { ctx.log(`dead end at ${decodeUri(pathOf(here)).slice(0, 60)}`); return []; }
    ref = here;
    url = next.href;
  }
  return [];
}
