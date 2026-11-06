// Embed-host extractors shared by every source: embed page URL -> playable m3u8/mp4 links.
// Most Arabic sites embed the same XFileSharing / JWPlayer family hosts (vidtube, updown, uqload,
// streamwish & clones, miravd, mixdrop, ...) whose pages expose the file in (packed) JS.
const { request, absUrl, originOf, hostOf, UA } = require("./http");
const { unpackAll } = require("./unpack");
const { unesc } = require("./html");

const MEDIA_RE = /https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4|mkv)(?:\?[^"'\s<>\\]*)?/gi;
const JUNK_MEDIA = /\/(?:thumb|thumbs|images?|sprite|preview|poster|ads?)\b|\.(?:jpg|png|vtt|srt)(?:\?|$)|get_slides|\/dl\?/i;

// hosts that never yield a playable link without a browser (captcha / DRM / dead)
const SKIP_HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|facebook\.com|drive\.google\.com|mega\.nz|1fichier\.com|frdl\.|katfile|rapidgator|nitroflare|ddownload|uptobox)/i;

function qualityFrom(s) {
  const t = String(s || "");
  const m = /(?:^|[^\d])(2160|1440|1080|720|576|480|360|240)p?(?=[^\d]|$)/i.exec(t);
  if (m) return +m[1];
  if (/\b4k\b|uhd/i.test(t)) return 2160;
  if (/fhd|full\s*hd/i.test(t)) return 1080;
  return 0;
}

// snap odd heights (1072, 864, 1440x1080 anamorphic...) onto the usual ladder
function snapHeight(h) {
  const n = +h || 0;
  if (!n) return 0;
  if (n >= 1800) return 2160;
  if (n >= 1300) return 1440;
  if (n >= 900) return 1080;
  if (n >= 640) return 720;
  if (n >= 440) return 480;
  if (n >= 300) return 360;
  return 240;
}

const qLabel = (n) => (n ? `${snapHeight(n)}p` : "Auto");

function playHeaders(embedUrl, extra) {
  const o = originOf(embedUrl);
  const h = { "User-Agent": UA };
  if (o) { h.Referer = o + "/"; h.Origin = o; }
  return Object.assign(h, extra || {});
}

// --- candidate file URLs from a host page (raw + unpacked JS) ---
function findMedia(html, pageUrl) {
  const text = String(html || "");
  const js = unpackAll(text) + "\n" + text;
  const found = [];
  const push = (u, q, force) => {
    let url = unesc(String(u || "")).replace(/\\\//g, "/").trim();
    if (!url) return;
    if (url.slice(0, 2) === "//") url = "https:" + url;
    url = absUrl(url, pageUrl);
    if (!/^https?:\/\//i.test(url) || JUNK_MEDIA.test(url)) return;
    if (!force && !/\.(?:m3u8|mp4|mkv|txt)(?:[?#]|$)|\/hls\d?\/|master|playlist|manifest|video\.mp4|\/stream\//i.test(url)) return;
    if (found.some((f) => f.url === url)) return;
    found.push({ url, q: q || qualityFrom(url), hls: force ? true : undefined });
  };

  let m;
  // custom players: `let streamUrl = "https://cdn/?token=..."` (extension-less HLS, probed later)
  const custom = /(?:let|var|const)\s+(?:streamUrl|videoSrc|hlsUrl|sourceUrl)\s*=\s*["'](https?:[^"']+)["']/g;
  while ((m = custom.exec(js))) push(m[1], 0, true);
  // streamwish & clones: links:{"hls4":"/stream/..","hls2":"https://..m3u8"} - hls2 is the stable one
  const hlsRe = /["']?(hls[234])["']?\s*:\s*["']([^"']+)["']/g;
  const hls = {};
  while ((m = hlsRe.exec(js))) hls[m[1]] = m[2];
  if (hls.hls2) push(hls.hls2);
  if (hls.hls4) push(hls.hls4);
  // jwplayer / clappr / plyr configs
  const fileRe = /(?:file|src|source|video_url|videoUrl|stream_url|streamUrl)\s*["']?\s*[:=]\s*["']([^"']+?\.(?:m3u8|mp4|mkv)[^"']*)["']/gi;
  while ((m = fileRe.exec(js))) push(m[1]);
  // sources:[{file:"..",label:"720p"}]
  const labelled = /\{[^{}]*?(?:file|src)\s*["']?\s*:\s*["']([^"']+)["'][^{}]*?(?:label|res|quality)\s*["']?\s*:\s*["']?([^"',}]+)/gi;
  while ((m = labelled.exec(js))) push(m[1], qualityFrom(m[2]));
  // <source src="..." size="720">
  const srcTag = /<source\b[^>]*?src=["']([^"']+)["'][^>]*>/gi;
  while ((m = srcTag.exec(text))) push(m[1], qualityFrom(m[0]) || 0);
  // mixdrop: wurl is the only real file; its other "file=" values are relative junk
  const wurl = /MDCore\.wurl\s*=\s*["']([^"']+)["']|wurl\s*=\s*["']([^"']+)["']/.exec(js);
  if (wurl) {
    found.length = 0;
    push(wurl[1] || wurl[2]);
    return found;
  }
  // anything else that looks like a media URL
  if (!found.length) for (const u of js.match(MEDIA_RE) || []) push(u);
  return found;
}

const iframeSrcs = (html, pageUrl) => {
  const out = [];
  const re = /<iframe\b[^>]*?\ssrc=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = absUrl(unesc(m[1]), pageUrl);
    if (/^https?:/i.test(u) && out.indexOf(u) < 0) out.push(u);
  }
  return out;
};

// --- special hosts ---
async function doodstream(url, referer) {
  const embed = url.replace(/\/[df]\//, "/e/");
  const r = await request(embed, { referer, timeout: 10000, retries: 1 });
  const m = /\/pass_md5\/[^'"]+/.exec(r.text);
  if (!m) return [];
  const origin = originOf(r.url) || originOf(embed);
  const base = await request(origin + m[0], { referer: r.url, timeout: 10000 });
  if (!/^https?:/.test(base.text.trim())) return [];
  const token = m[0].split("/").pop();
  let rnd = "";
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 10; i++) rnd += abc.charAt(Math.floor(Math.random() * abc.length));
  return [{ url: `${base.text.trim()}${rnd}?token=${token}&expiry=${Date.now()}`, q: qualityFrom(r.text.slice(0, 3000)), headers: playHeaders(origin) }];
}

async function streamtape(url, referer) {
  const r = await request(url.replace("/v/", "/e/"), { referer, timeout: 10000, retries: 1 });
  const m = /getElementById\(['"](?:robotlink|ideoooolink|norobotlink)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\(?['"]([^'"]+)['"]\)?(?:\.substring\((\d+)\))?(?:\.substring\((\d+)\))?/.exec(r.text);
  if (!m) return [];
  let tail = m[2];
  if (m[3]) tail = tail.substring(+m[3]);
  if (m[4]) tail = tail.substring(+m[4]);
  const u = "https:" + (m[1] + tail).replace(/^https?:/, "").replace(/^\/*/, "//") + "&stream=1";
  return [{ url: u, q: 0, headers: playHeaders(r.url) }];
}

async function okru(url, referer) {
  const r = await request(url.replace("/video/", "/videoembed/"), { referer, timeout: 10000, retries: 1 });
  const m = /data-options=["']([^"']+)["']/.exec(r.text);
  if (!m) return [];
  try {
    const opts = JSON.parse(unesc(m[1]));
    const meta = JSON.parse(opts.flashvars.metadata);
    const out = [];
    if (meta.hlsManifestUrl) out.push({ url: meta.hlsManifestUrl, q: 0 });
    const order = { full: 1080, hd: 720, sd: 480, low: 360, lowest: 240, mobile: 144 };
    for (const v of meta.videos || []) if (order[v.name] >= 360) out.push({ url: v.url, q: order[v.name] });
    return out.map((x) => Object.assign(x, { headers: playHeaders("https://ok.ru/") }));
  } catch (e) {
    return [];
  }
}

const SPECIAL = [
  [/(?:dood|d000d|d0o0d|ds2play|ds2video|dooood|doods|vide0|vidply|dsvplay|myvidplay)\./i, doodstream],
  [/(?:streamtape|strtape|stape|streamta\.pe|tapecontent|shavetape)\./i, streamtape],
  [/(?:^|\.)ok\.ru$|odnoklassniki/i, okru],
];

// read master playlist -> best height (also proves the link is alive)
async function probeHls(url, headers) {
  try {
    const r = await request(url, { headers, timeout: 6000, retries: 0 });
    if (!/#EXTM3U/.test(r.text)) return null;
    let best = 0;
    const re = /RESOLUTION=\d+x(\d+)/g;
    let m;
    while ((m = re.exec(r.text))) best = Math.max(best, +m[1]);
    return { height: best };
  } catch (e) {
    return null;
  }
}

/**
 * resolve(embedUrl, referer, depth) -> [{url, quality:"720p", q:720, headers, host}]
 * Unknown hosts go through the generic page scan; iframes are followed up to 2 levels.
 */
async function resolve(embedUrl, referer, depth) {
  const d = depth || 0;
  const url = String(embedUrl || "").trim();
  const host = hostOf(url);
  if (!host || SKIP_HOSTS.test(host)) return [];

  // already a media file
  if (/\.(?:m3u8|mp4|mkv)(?:[?#]|$)/i.test(url) && !/\/(?:embed|e|v|iframe)\//i.test(url)) {
    return finalize([{ url, q: qualityFrom(url), headers: playHeaders(referer || url) }], host);
  }

  for (const [re, fn] of SPECIAL) {
    if (re.test(host)) {
      try { return finalize(await fn(url, referer), host); } catch (e) { return []; }
    }
  }

  let r;
  try {
    r = await request(url, { referer, timeout: 10000, retries: 1 });
  } catch (e) {
    return [];
  }
  if (!r.ok && r.status !== 404) return [];
  let finalUrl = r.url || url;
  let page = r.text;
  // XFileSharing "click to play" form (uqload /e/ links): POST it to get the real player page
  const form = /<form[^>]*action=["']([^"']*\/dl)["'][^>]*>([\s\S]*?)<\/form>/i.exec(page);
  if (form && /name=["']op["'][^>]*value=["']embed/i.test(form[2]) && !findMedia(page, finalUrl).length) {
    const code = (/\/(?:e|embed-?)\/?([a-z0-9]{8,})/i.exec(finalUrl) || [])[1];
    if (code) {
      try {
        const p = await request(absUrl(form[1], finalUrl), { method: "POST", body: { op: "embed", file_code: code, auto: "1", referer: referer || "" }, referer: finalUrl, timeout: 10000 });
        page = p.text;
      } catch (e) {}
    }
  }
  const media = findMedia(page, finalUrl).map((x) => Object.assign(x, { headers: playHeaders(finalUrl) }));
  if (media.length) return finalize(media, hostOf(finalUrl) || host);
  if (d < 2) {
    for (const f of iframeSrcs(r.text, finalUrl).slice(0, 2)) {
      const sub = await resolve(f, finalUrl, d + 1);
      if (sub.length) return sub;
    }
  }
  return [];
}

async function finalize(list, host) {
  const out = [];
  await Promise.all((list || []).map(async (x) => {
    let q = x.q || 0;
    if (x.hls || (/\.m3u8|\/hls\d?\/|master|\.txt(?:\?|$)/i.test(x.url) && !/\.mp4(?:\?|$)/i.test(x.url))) {
      const p = await probeHls(x.url, x.headers);
      if (!p) return; // dead / blocked playlist
      q = q || p.height;
    }
    q = snapHeight(q);
    out.push({ url: x.url, q, quality: qLabel(q), headers: x.headers, host: shortHost(host) });
  }));
  return out;
}

function shortHost(h) {
  const parts = String(h || "").replace(/^www\./, "").split(".");
  return parts.length > 2 ? parts[parts.length - 2] : parts[0];
}

module.exports = { resolve, findMedia, qualityFrom, qLabel, snapHeight, playHeaders, probeHls, shortHost };
