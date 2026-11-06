// FaselHD (rotating web<NNNNN>x.faselhdx.<tld>; the old faselhd.* hubs sit behind a Cloudflare challenge).
//   search  : /?s=Q -> div.postDiv > a[href] (img alt = title); movies /movies/.., shows /seasons/..
//   series  : div.seasonDiv onclick="window.location.href = '/?p=<id>'" + div.title "موسم N"
//             -> season page #epAll a ("الحلقة N")
//   play    : movie/episode page -> player_iframe.location.href = '<host>/video_player?player_token=..' (one per server)
//             -> player page builds its quality buttons with javascript-obfuscator'd JS; we decode it
//                statically (src/lib/deobf.js, no eval) -> button.hd_btn[data-url=".m3u8"] + label
const { mirrorSite, pathOf, request, UA } = require("../lib/http");
const { anchors, stripTags, unesc } = require("../lib/html");
const { rank, queries } = require("../lib/match");
const { pickSeason, pickEpisode, uniqBy, pathKey } = require("../lib/common");
const { decodeScript, joinedStrings } = require("../lib/deobf");
const { qualityFrom } = require("../lib/hosts");

const MARKER = /faselhd/i;

function cards(html) {
  const out = [];
  const re = /<div class="postDiv[^"]*">\s*<a href="([^"]+)"[\s\S]*?alt="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const type = /\/movies\/|\/anime-movies\/|\/dubbed-movies\/|\/hindi\/|\/asian-movies\//.test(href) ? "movie" : /\/seasons\/|\/series\/|\/anime\/|\/asian-series\//.test(href) ? "tv" : /\/episodes\//.test(href) ? "episode" : null;
    if (type) out.push({ title: unesc(m[2]), href: pathOf(href), type });
  }
  return uniqBy(out, (c) => pathKey(c.href));
}

module.exports = {
  id: "faselhd",
  name: "FaselHD",
  types: ["movie", "tv"],
  bases: ["https://web11612x.faselhdx.one"],

  async links(ctx) {
    const site = mirrorSite({ name: "FaselHD", bases: this.bases, marker: MARKER, sameSite: /fasel/i, log: ctx.log });
    const { info } = ctx;
    const isMovie = info.type === "movie";

    let pool = [];
    for (const q of queries(info, 3)) {
      const r = await site.get(`/?s=${encodeURIComponent(q)}`);
      if (!r) break;
      pool = uniqBy(pool.concat(cards(r.text).filter((c) => c.type === info.type)), (c) => pathKey(c.href));
      if (rank(pool, info, { minScore: 100 }).length) break;
    }
    const ranked = rank(pool, info, { minScore: 75, yearSlack: isMovie ? 1 : 99 });
    ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);

    for (const c of ranked.slice(0, 2)) {
      let page = await site.get(c.href);
      if (!page) continue;
      let pagePath = c.href;
      if (!isMovie) {
        const seasons = [];
        const re = /<div class="seasonDiv[^"]*"\s+onclick="window\.location\.href\s*=\s*'([^']+)'"[\s\S]*?<div class="title">([\s\S]*?)<\/div>/g;
        let m;
        while ((m = re.exec(page.text))) seasons.push({ title: stripTags(m[2]), href: pathOf(m[1]), active: /seasonDiv active/.test(m[0]) });
        let season = seasons.length ? pickSeason(seasons, ctx.season) : null;
        if (!season && !seasons.length && ctx.season === 1) season = { href: c.href };
        if (!season) { ctx.log(`no season ${ctx.season} among ${seasons.length}`); continue; }
        if (!season.active && pathKey(season.href) !== pathKey(c.href)) {
          page = await site.get(season.href);
          if (!page) continue;
        }
        const box = /<div class="epAll"[\s\S]*?<\/div>/.exec(page.text);
        const eps = anchors(box ? box[0] : "").map((a) => ({ title: a.text, href: pathOf(a.href) }));
        const ep = pickEpisode(eps, ctx.episode, seasons.length <= 1 ? ctx.absolute : null);
        if (!ep) { ctx.log(`episode ${ctx.episode} not among ${eps.length}`); continue; }
        pagePath = ep.href;
        page = await site.get(ep.href, { referer: site.url(season.href) });
        if (!page) continue;
      }
      const out = await playerStreams(page.text, site.url(pagePath), ctx);
      if (out.length) return out;
    }
    return [];
  },
};

async function playerStreams(html, pageUrl, ctx) {
  const players = uniqBy((html.match(/https?:\/\/[^'"\s]+\/video_player\?player_token=[^'"\s]+/g) || []), (u) => u);
  if (!players.length) { ctx.log("no player tokens"); return []; }
  const out = [];
  await Promise.all(players.slice(0, 3).map(async (p, idx) => {
    let r;
    try { r = await request(p, { referer: pageUrl, timeout: 12000, retries: 1 }); } catch (e) { return; }
    const scripts = (r.text.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [])
      .filter((s) => /_0x/.test(s) && !/\ssrc=/.test(s.slice(0, s.indexOf(">"))))
      .map((s) => s.replace(/^<script\b[^>]*>/, "").replace(/<\/script>$/, ""));
    const text = scripts.map((s) => { try { return decodeScript(s); } catch (e) { return null; } }).filter(Boolean)
      .map((d) => joinedStrings(d).join("\n")).join("\n");
    const btn = /data-url="([^"]+\.m3u8[^"]*)"[^>]*>([^<]*)</g;
    let m;
    let found = 0;
    while ((m = btn.exec(text))) {
      const label = m[2].trim();
      out.push({ url: m[1], q: /auto/i.test(label) ? 0 : qualityFrom(label), headers: { "User-Agent": UA, Referer: pageUrl }, host: "FaselHD", label: `server ${idx + 1}${/auto/i.test(label) ? " auto" : ""}` });
      found++;
    }
    if (!found) {
      for (const u of text.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/g) || []) out.push({ url: u, q: 0, headers: { "User-Agent": UA, Referer: pageUrl }, host: "FaselHD", label: `server ${idx + 1}` });
    }
    if (!found && !text) ctx.log(`player ${idx + 1}: obfuscation not recognised`);
  }));
  return uniqBy(out, (x) => x.url);
}
