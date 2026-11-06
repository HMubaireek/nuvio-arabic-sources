var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var __mods = [
  /* 0: src/index.js */
  function(module2, exports2, __req2) {
    const { tmdbInfo, absoluteEpisode } = __req2(1);
    const { resolve, qualityFrom, snapHeight } = __req2(3);
    const { withTimeout, setDeadline, pastDeadline, onTick, HAS_TIMERS } = __req2(2);
    const SOURCES = __req2(6);
    const SOURCE_BUDGET = 28e3;
    const EMBED_BUDGET = 14e3;
    const TOTAL_BUDGET = 4e4;
    const MAX_EMBEDS_PER_SOURCE = 8;
    const NO_TIMER_DEADLINE = 35e3;
    const SERIAL_EMBEDS_PER_SOURCE = 5;
    const GOOD_HOSTS = /okhd|okprime|vidmoly|vidtube|cdn-video|uqload|miravd|streamwish|updown|vtbe|vtube|mixdrop|mxdrop|faselhd|scdns|anime4up|gnli129|3ick|asd\.watch|arabseed/i;
    const POOR_HOSTS = /voe\.|reviewrate|filemoon|dood|d0o0d|dsvplay|streamtape|mp4upload|vk\.com|earnvids|vidspeed|film77|vidoba|share4max|uptostream|ok\.ru|vadbam|anime7u/i;
    function hostPreference(l) {
      if (/direct/i.test(l.label || ""))
        return 0;
      const h = String(l.embed || "");
      if (GOOD_HOSTS.test(h))
        return 1;
      if (POOR_HOSTS.test(h))
        return 5;
      return 3;
    }
    function serialOrder(active, info) {
      let first;
      if (info.isAnime)
        first = ["anime4up", "faselhd", "witanime"];
      else if (info.isTurkish)
        first = ["3isk", "laroza", "arabseed"];
      else if (info.isArabic)
        first = ["laroza", "arabseed", "akwam"];
      else
        first = ["faselhd", "topcinema", "arabseed", "laroza"];
      const rank = (s) => {
        const i = first.indexOf(s.id);
        if (i >= 0)
          return i;
        return s.id === "akwam" ? 99 : 50;
      };
      return active.slice().sort((a, b) => rank(a) - rank(b));
    }
    const pad2 = (n) => String(n).padStart(2, "0");
    const logger = (tag) => (...a) => console.log(`[ArabHub:${tag}]`, ...a);
    function pool(items, limit, fn) {
      return __async(this, null, function* () {
        const out = [];
        let i = 0;
        const workers = new Array(Math.min(limit, items.length)).fill(0).map(() => __async(this, null, function* () {
          while (i < items.length) {
            const idx = i++;
            try {
              out[idx] = yield fn(items[idx], idx);
            } catch (e) {
              out[idx] = null;
            }
          }
        }));
        yield Promise.all(workers);
        return out;
      });
    }
    function runSource(src, base, sink) {
      return __async(this, null, function* () {
        const log = logger(src.id);
        const ctx = Object.assign({}, base, { log });
        const t0 = Date.now();
        let links = [];
        try {
          links = (yield withTimeout(src.links(ctx), SOURCE_BUDGET, src.id)) || [];
        } catch (e) {
          log(`failed: ${e && e.message}`);
          return [];
        }
        const direct = links.filter((l) => l.url);
        const embeds = links.filter((l) => l.embed).map((l, i) => ({ l, i, p: hostPreference(l) })).sort((a, b) => a.p - b.p || a.i - b.i).map((x) => x.l).slice(0, HAS_TIMERS ? MAX_EMBEDS_PER_SOURCE : SERIAL_EMBEDS_PER_SOURCE);
        const results = direct.map((l) => ({ url: l.url, q: snapHeight(l.q || qualityFrom(l.quality || l.url)), headers: l.headers || {}, host: l.host || src.name, label: l.label }));
        results.forEach((r) => sink && sink(src, r));
        yield pool(embeds, 4, (l) => __async(this, null, function* () {
          let got = [];
          try {
            got = yield withTimeout(resolve(l.embed, l.referer), EMBED_BUDGET, l.embed);
          } catch (e) {
            got = [];
          }
          for (const g of got) {
            const r = Object.assign({}, g, { q: g.q || snapHeight(l.q || 0), label: l.label, host: l.host || g.host });
            results.push(r);
            if (sink)
              sink(src, r);
          }
        }));
        log(`${links.length} links -> ${results.length} streams in ${Date.now() - t0}ms`);
        return results;
      });
    }
    function toStream(src, r, streamTitle) {
      const quality = r.q ? `${r.q}p` : "Auto";
      return {
        name: `Arab Hub | ${src.name}`,
        title: `${streamTitle}
${quality} \xB7 ${r.host || src.name}${r.label ? " \xB7 " + r.label : ""}`,
        url: r.url,
        quality,
        headers: r.headers || {},
        provider: "arabhub",
        source: src.id
      };
    }
    function getStreams2(tmdbId, mediaType, seasonNum, episodeNum, opts) {
      return __async(this, null, function* () {
        const o = opts || {};
        const type = /^(?:tv|series|show|tvshow|episode)$/i.test(String(mediaType || "")) ? "tv" : "movie";
        const season = type === "tv" ? +seasonNum || 1 : null;
        const episode = type === "tv" ? +episodeNum || 1 : null;
        const log = logger("hub");
        setDeadline(HAS_TIMERS ? o.budget || TOTAL_BUDGET : NO_TIMER_DEADLINE);
        if (!HAS_TIMERS)
          log("runtime has no timers: deadline-only mode");
        let info;
        try {
          info = yield tmdbInfo(tmdbId, type);
        } catch (e) {
          log(`tmdb failed: ${e && e.message}`);
          return [];
        }
        const streamTitle = type === "movie" ? `${info.title}${info.year ? ` (${info.year})` : ""}` : `${info.title} S${pad2(season)}E${pad2(episode)}`;
        const base = { info, season, episode, absolute: type === "tv" ? absoluteEpisode(info, season, episode) : null };
        const wanted = o.only ? SOURCES.filter((s) => o.only.indexOf(s.id) >= 0) : SOURCES.filter((s) => s.enabled !== false);
        const active = wanted.filter((s) => s.types.indexOf(type) >= 0 && (!s.applies || s.applies(info)));
        log(`${streamTitle}: ${active.map((s) => s.id).join(", ")}`);
        const collected = [];
        const sink = (src, r) => collected.push(toStream(src, r, streamTitle));
        if (!HAS_TIMERS) {
          for (const s of serialOrder(active, info)) {
            if (pastDeadline()) {
              log(`deadline reached before ${s.id}`);
              break;
            }
            yield runSource(s, base, sink);
          }
          return finish(collected, active);
        }
        const all = Promise.all(active.map((s) => runSource(s, base, sink)));
        let stopTicks = () => {
        };
        const cutoff = new Promise((res) => {
          stopTicks = onTick(() => {
            if (pastDeadline())
              res("deadline");
          });
        });
        try {
          const how = yield withTimeout(Promise.race([all.then(() => "done"), cutoff]), o.budget || TOTAL_BUDGET, "total");
          if (how === "deadline")
            log(`deadline reached, returning ${collected.length} streams so far`);
        } catch (e) {
          log(`budget reached, returning ${collected.length} streams so far`);
        } finally {
          stopTicks();
        }
        return finish(collected, active);
      });
    }
    function finish(collected, active) {
      const seen = {};
      const order = {};
      active.forEach((s, i) => {
        order[s.id] = i;
      });
      return collected.filter((s) => seen[s.url] ? false : seen[s.url] = true).sort((a, b) => (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0) || order[a.source] - order[b.source]);
    }
    module2.exports = { getStreams: getStreams2, runSource, SOURCES };
  },
  /* 1: src/lib/tmdb.js */
  function(module2, exports2, __req2) {
    const { getJson } = __req2(2);
    const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92";
    const TMDB = "https://api.themoviedb.org/3";
    const yearOf = (d) => parseInt(String(d || "").slice(0, 4), 10) || null;
    function tmdbInfo(tmdbId, mediaType) {
      return __async(this, null, function* () {
        const type = mediaType === "tv" ? "tv" : "movie";
        const d = yield getJson(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US&append_to_response=alternative_titles,translations,external_ids`, { timeout: 1e4, retries: 2 });
        if (!d || !d.title && !d.name)
          throw new Error("tmdb lookup failed");
        const tr = (d.translations || {}).translations || [];
        const arT = tr.find((t) => t.iso_639_1 === "ar" && t.data && (t.data.title || t.data.name));
        const titleAr = arT ? arT.data.title || arT.data.name : "";
        const alt = d.alternative_titles || {};
        const altList = alt.results || alt.titles || [];
        const latin = (t) => /^[\x20-\x7eÀ-ſ]+$/.test(t || "");
        const romaji = (altList.find((x) => /romaji/i.test(x.type || "") && latin(x.title)) || altList.find((x) => x.iso_3166_1 === "JP" && latin(x.title)) || {}).title || "";
        const alts = altList.slice().sort((a, b) => (latin(b.title) ? 1 : 0) - (latin(a.title) ? 1 : 0)).map((x) => x.title).filter(Boolean);
        const title = d.title || d.name;
        const original = d.original_title || d.original_name || "";
        const seen = {};
        const titles = [];
        for (const t of [title, titleAr, original, romaji].concat(alts)) {
          const v = String(t || "").trim();
          const k = v.toLowerCase();
          if (v && !seen[k]) {
            seen[k] = 1;
            titles.push(v);
          }
        }
        const seasons = (d.seasons || []).filter((s) => s.season_number > 0).map((s) => ({
          number: s.season_number,
          count: s.episode_count || 0,
          year: yearOf(s.air_date)
        }));
        const genres = (d.genres || []).map((g) => g.id);
        return {
          tmdbId: String(tmdbId),
          type,
          title,
          titleAr,
          original,
          romaji,
          titles,
          year: yearOf(d.release_date || d.first_air_date),
          seasons,
          imdbId: d.external_ids && d.external_ids.imdb_id || d.imdb_id || "",
          lang: d.original_language || "",
          isAnime: genres.indexOf(16) >= 0 && (d.original_language === "ja" || (d.origin_country || []).indexOf("JP") >= 0),
          isArabic: d.original_language === "ar",
          isTurkish: d.original_language === "tr"
        };
      });
    }
    function absoluteEpisode(info, season, episode) {
      let n = 0;
      for (const s of info.seasons)
        if (s.number < season)
          n += s.count;
      return n + episode;
    }
    module2.exports = { tmdbInfo, absoluteEpisode };
  },
  /* 2: src/lib/http.js */
  function(module2, exports2, __req2) {
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    const HAS_TIMERS = typeof setTimeout === "function";
    const sleep = (ms) => HAS_TIMERS ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
    let deadline = 0;
    let deadHosts = {};
    const setDeadline = (ms) => {
      deadline = ms ? Date.now() + ms : 0;
      deadHosts = {};
    };
    const pastDeadline = () => deadline > 0 && Date.now() > deadline;
    const tickers = [];
    const onTick = (fn) => {
      tickers.push(fn);
      return () => {
        const i = tickers.indexOf(fn);
        if (i >= 0)
          tickers.splice(i, 1);
      };
    };
    const tick = () => {
      for (const fn of tickers.slice()) {
        try {
          fn();
        } catch (e) {
        }
      }
    };
    function withTimeout(promise, ms, label) {
      if (!HAS_TIMERS)
        return promise;
      let t;
      const timer = new Promise((_, rej) => {
        t = setTimeout(() => rej(new Error(`timeout ${ms}ms${label ? " " + label : ""}`)), ms);
      });
      return Promise.race([promise, timer]).then(
        (v) => {
          clearTimeout(t);
          return v;
        },
        (e) => {
          clearTimeout(t);
          throw e;
        }
      );
    }
    const encChar = (c) => {
      try {
        return encodeURIComponent(c);
      } catch (e) {
        return "";
      }
    };
    const safeUrl = (s) => String(s || "").replace(/[^\x21-\x7e]/g, encChar);
    const ORIGIN_RE = /^(https?:)\/\/([^\/?#]+)/i;
    const originOf = (u) => {
      const m = ORIGIN_RE.exec(String(u || ""));
      return m ? `${m[1]}//${m[2]}` : "";
    };
    const hostOf = (u) => {
      const m = ORIGIN_RE.exec(String(u || ""));
      return m ? m[2].toLowerCase() : "";
    };
    function absUrl(src, base) {
      const s = String(src || "").trim().replace(/\\\//g, "/");
      if (!s)
        return "";
      if (/^https?:\/\//i.test(s))
        return s;
      if (s.slice(0, 2) === "//")
        return ((ORIGIN_RE.exec(base || "") || [])[1] || "https:") + s;
      const o = originOf(base);
      if (!o)
        return s;
      if (s.charAt(0) === "/")
        return o + s;
      const dir = String(base).replace(/[?#].*$/, "").replace(/[^\/]*$/, "");
      return dir + s;
    }
    function pathOf(u) {
      const s = String(u || "").trim();
      const m = /^(?:https?:)?\/\/[^\/?#]+([^#]*)/i.exec(s);
      if (m)
        return m[1] || "/";
      const p = s.replace(/#.*$/, "");
      return p.charAt(0) === "/" ? p : "/" + p;
    }
    function formBody(obj) {
      return Object.keys(obj).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k] == null ? "" : obj[k])}`).join("&");
    }
    function makeJar() {
      const store = {};
      return {
        take(res) {
          let raw = [];
          try {
            if (res.headers && typeof res.headers.raw === "function")
              raw = res.headers.raw()["set-cookie"] || [];
            else {
              const v = res.headers && res.headers.get && res.headers.get("set-cookie");
              if (v)
                raw = String(v).split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
            }
          } catch (e) {
          }
          for (const c of raw) {
            const m = /^\s*([^=;\s]+)=([^;]*)/.exec(c);
            if (m)
              store[m[1]] = m[2];
          }
        },
        header() {
          return Object.keys(store).map((k) => `${k}=${store[k]}`).join("; ");
        }
      };
    }
    function request(url, opts) {
      return __async(this, null, function* () {
        const o = opts || {};
        const headers = Object.assign({
          "User-Agent": UA,
          "Accept": o.json ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ar,en-US;q=0.8,en;q=0.6"
        }, o.headers || {});
        if (o.referer)
          headers.Referer = safeUrl(o.referer);
        let body = o.body;
        if (body && typeof body === "object") {
          body = formBody(body);
          headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded; charset=UTF-8";
        }
        if (o.jar) {
          const c = o.jar.header();
          if (c)
            headers.Cookie = c;
        }
        const tries = (HAS_TIMERS ? o.retries == null ? 1 : o.retries : 0) + 1;
        const host = hostOf(url);
        if (deadHosts[host])
          throw new Error(`${host} unreachable (earlier failure)`);
        let lastErr = null;
        for (let i = 0; i < tries; i++) {
          if (pastDeadline())
            throw lastErr || new Error("time budget used up");
          try {
            const res = yield withTimeout(fetch(safeUrl(url), { method: o.method || (body ? "POST" : "GET"), headers, body }), o.timeout || 12e3, host);
            if (!res || !res.status)
              throw new Error(`network error (status 0) ${host}`);
            if (o.jar)
              o.jar.take(res);
            if ((res.status === 429 || res.status === 503) && i + 1 < tries) {
              const ra = parseInt(res.headers && res.headers.get && res.headers.get("retry-after") || "", 10);
              yield sleep(Math.min(isNaN(ra) ? 1500 * (i + 1) : ra * 1e3, 4e3));
              continue;
            }
            const text = yield withTimeout(res.text(), o.timeout || 12e3, hostOf(url));
            tick();
            return { ok: res.status >= 200 && res.status < 400, status: res.status, url: res.url || url, text: String(text || ""), headers: res.headers };
          } catch (e) {
            lastErr = e;
            tick();
            if (i + 1 < tries)
              yield sleep(300 + 400 * i);
          }
        }
        if (lastErr && !pastDeadline())
          deadHosts[host] = true;
        throw lastErr || new Error("request failed");
      });
    }
    function getJson(url, opts) {
      return __async(this, null, function* () {
        const r = yield request(url, Object.assign({ json: true }, opts || {}));
        try {
          return JSON.parse(r.text);
        } catch (e) {
          return null;
        }
      });
    }
    function mirrorSite(cfg) {
      const name = cfg.name;
      const bases = cfg.bases.slice();
      const marker = cfg.marker;
      let active = null;
      const dead = {};
      function order() {
        const list = active ? [active].concat(bases.filter((b) => b !== active)) : bases.slice();
        return list.filter((b) => !dead[b]).concat(list.filter((b) => dead[b]));
      }
      function fetchPath(path, opts) {
        return __async(this, null, function* () {
          const o = opts || {};
          const mk = o.marker === void 0 ? marker : o.marker;
          const errors = [];
          for (const base of order()) {
            if (pastDeadline())
              break;
            try {
              const r = yield request(base + path, Object.assign({}, o, { referer: o.referer || base + "/" }));
              const real = !mk || mk.test(r.text);
              if (r.ok && real) {
                const fin = originOf(r.url);
                active = fin && (!cfg.sameSite || cfg.sameSite.test(fin)) ? fin : base;
                if (active !== base && bases.indexOf(active) < 0)
                  bases.unshift(active);
                return Object.assign(r, { base: active });
              }
              if (r.status === 404 && real)
                return null;
              errors.push(`${base} ${r.status}${real ? "" : " (not " + name + ")"}`);
              if (!real && o.marker === void 0)
                dead[base] = true;
            } catch (e) {
              dead[base] = true;
              errors.push(`${base} ${e && e.message}`);
            }
          }
          if (cfg.log)
            cfg.log(`unreachable ${String(path).slice(0, 60)}: ${errors.join("; ")}`);
          return null;
        });
      }
      return {
        name,
        get: (path, opts) => fetchPath(path, opts),
        post: (path, body, opts) => fetchPath(path, Object.assign({}, opts || {}, { method: "POST", body })),
        base: () => active || bases[0],
        url: (path) => (active || bases[0]) + path
      };
    }
    module2.exports = { UA, HAS_TIMERS, sleep, withTimeout, setDeadline, pastDeadline, onTick, request, getJson, mirrorSite, makeJar, absUrl, pathOf, originOf, hostOf, safeUrl, formBody };
  },
  /* 3: src/lib/hosts.js */
  function(module2, exports2, __req2) {
    const { request, absUrl, originOf, hostOf, UA } = __req2(2);
    const { unpackAll } = __req2(4);
    const { unesc } = __req2(5);
    const MEDIA_RE = /https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4|mkv)(?:\?[^"'\s<>\\]*)?/gi;
    const JUNK_MEDIA = /\/(?:thumb|thumbs|images?|sprite|preview|poster|ads?)\b|\.(?:jpg|png|vtt|srt)(?:\?|$)|get_slides|\/dl\?/i;
    const SKIP_HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|facebook\.com|drive\.google\.com|mega\.nz|1fichier\.com|frdl\.|katfile|rapidgator|nitroflare|ddownload|uptobox)/i;
    function qualityFrom(s) {
      const t = String(s || "");
      const m = /(?:^|[^\d])(2160|1440|1080|720|576|480|360|240)p?(?=[^\d]|$)/i.exec(t);
      if (m)
        return +m[1];
      if (/\b4k\b|uhd/i.test(t))
        return 2160;
      if (/fhd|full\s*hd/i.test(t))
        return 1080;
      return 0;
    }
    function snapHeight(h) {
      const n = +h || 0;
      if (!n)
        return 0;
      if (n >= 1800)
        return 2160;
      if (n >= 1300)
        return 1440;
      if (n >= 900)
        return 1080;
      if (n >= 640)
        return 720;
      if (n >= 440)
        return 480;
      if (n >= 300)
        return 360;
      return 240;
    }
    const qLabel = (n) => n ? `${snapHeight(n)}p` : "Auto";
    function playHeaders(embedUrl, extra) {
      const o = originOf(embedUrl);
      const h = { "User-Agent": UA };
      if (o) {
        h.Referer = o + "/";
        h.Origin = o;
      }
      return Object.assign(h, extra || {});
    }
    function findMedia(html, pageUrl) {
      const text = String(html || "");
      const js = unpackAll(text) + "\n" + text;
      const found = [];
      const push = (u, q, force) => {
        let url = unesc(String(u || "")).replace(/\\\//g, "/").trim();
        if (!url)
          return;
        if (url.slice(0, 2) === "//")
          url = "https:" + url;
        url = absUrl(url, pageUrl);
        if (!/^https?:\/\//i.test(url) || JUNK_MEDIA.test(url))
          return;
        if (!force && !/\.(?:m3u8|mp4|mkv|txt)(?:[?#]|$)|\/hls\d?\/|master|playlist|manifest|video\.mp4|\/stream\//i.test(url))
          return;
        if (found.some((f) => f.url === url))
          return;
        found.push({ url, q: q || qualityFrom(url), hls: force ? true : void 0 });
      };
      let m;
      const custom = /(?:let|var|const)\s+(?:streamUrl|videoSrc|hlsUrl|sourceUrl)\s*=\s*["'](https?:[^"']+)["']/g;
      while (m = custom.exec(js))
        push(m[1], 0, true);
      const hlsRe = /["']?(hls[234])["']?\s*:\s*["']([^"']+)["']/g;
      const hls = {};
      while (m = hlsRe.exec(js))
        hls[m[1]] = m[2];
      if (hls.hls4)
        push(hls.hls4);
      if (hls.hls2)
        push(hls.hls2);
      const fileRe = /(?:file|src|source|video_url|videoUrl|stream_url|streamUrl)\s*["']?\s*[:=]\s*["']([^"']+?\.(?:m3u8|mp4|mkv)[^"']*)["']/gi;
      while (m = fileRe.exec(js))
        push(m[1]);
      const labelled = /\{[^{}]*?(?:file|src)\s*["']?\s*:\s*["']([^"']+)["'][^{}]*?(?:label|res|quality)\s*["']?\s*:\s*["']?([^"',}]+)/gi;
      while (m = labelled.exec(js))
        push(m[1], qualityFrom(m[2]));
      const srcTag = /<source\b[^>]*?src=["']([^"']+)["'][^>]*>/gi;
      while (m = srcTag.exec(text))
        push(m[1], qualityFrom(m[0]) || 0);
      const wurl = /MDCore\.wurl\s*=\s*["']([^"']+)["']|wurl\s*=\s*["']([^"']+)["']/.exec(js);
      if (wurl) {
        found.length = 0;
        push(wurl[1] || wurl[2]);
        return found;
      }
      if (!found.length)
        for (const u of js.match(MEDIA_RE) || [])
          push(u);
      return found;
    }
    const iframeSrcs = (html, pageUrl) => {
      const out = [];
      const re = /<iframe\b[^>]*?\ssrc=["']([^"']+)["']/gi;
      let m;
      while (m = re.exec(html)) {
        const u = absUrl(unesc(m[1]), pageUrl);
        if (/^https?:/i.test(u) && out.indexOf(u) < 0)
          out.push(u);
      }
      return out;
    };
    function doodstream(url, referer) {
      return __async(this, null, function* () {
        const embed = url.replace(/\/[df]\//, "/e/");
        const r = yield request(embed, { referer, timeout: 1e4, retries: 1 });
        const m = /\/pass_md5\/[^'"]+/.exec(r.text);
        if (!m)
          return [];
        const origin = originOf(r.url) || originOf(embed);
        const base = yield request(origin + m[0], { referer: r.url, timeout: 1e4 });
        if (!/^https?:/.test(base.text.trim()))
          return [];
        const token = m[0].split("/").pop();
        let rnd = "";
        const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 10; i++)
          rnd += abc.charAt(Math.floor(Math.random() * abc.length));
        return [{ url: `${base.text.trim()}${rnd}?token=${token}&expiry=${Date.now()}`, q: qualityFrom(r.text.slice(0, 3e3)), headers: playHeaders(origin) }];
      });
    }
    function streamtape(url, referer) {
      return __async(this, null, function* () {
        const r = yield request(url.replace("/v/", "/e/"), { referer, timeout: 1e4, retries: 1 });
        const m = /getElementById\(['"](?:robotlink|ideoooolink|norobotlink)['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*\(?['"]([^'"]+)['"]\)?(?:\.substring\((\d+)\))?(?:\.substring\((\d+)\))?/.exec(r.text);
        if (!m)
          return [];
        let tail = m[2];
        if (m[3])
          tail = tail.substring(+m[3]);
        if (m[4])
          tail = tail.substring(+m[4]);
        const u = "https:" + (m[1] + tail).replace(/^https?:/, "").replace(/^\/*/, "//") + "&stream=1";
        return [{ url: u, q: 0, headers: playHeaders(r.url) }];
      });
    }
    function okru(url, referer) {
      return __async(this, null, function* () {
        const r = yield request(url.replace("/video/", "/videoembed/"), { referer, timeout: 1e4, retries: 1 });
        const m = /data-options=["']([^"']+)["']/.exec(r.text);
        if (!m)
          return [];
        try {
          const opts = JSON.parse(unesc(m[1]));
          const meta = JSON.parse(opts.flashvars.metadata);
          const out = [];
          if (meta.hlsManifestUrl)
            out.push({ url: meta.hlsManifestUrl, q: 0 });
          const order = { full: 1080, hd: 720, sd: 480, low: 360, lowest: 240, mobile: 144 };
          for (const v of meta.videos || [])
            if (order[v.name] >= 360)
              out.push({ url: v.url, q: order[v.name] });
          return out.map((x) => Object.assign(x, { headers: playHeaders("https://ok.ru/") }));
        } catch (e) {
          return [];
        }
      });
    }
    const SPECIAL = [
      [/(?:dood|d000d|d0o0d|ds2play|ds2video|dooood|doods|vide0|vidply|dsvplay|myvidplay)\./i, doodstream],
      [/(?:streamtape|strtape|stape|streamta\.pe|tapecontent|shavetape)\./i, streamtape],
      [/(?:^|\.)ok\.ru$|odnoklassniki/i, okru]
    ];
    function probeHls(url, headers) {
      return __async(this, null, function* () {
        try {
          const r = yield request(url, { headers, timeout: 6e3, retries: 0 });
          if (!/#EXTM3U/.test(r.text))
            return null;
          let best = 0;
          const re = /RESOLUTION=\d+x(\d+)/g;
          let m;
          while (m = re.exec(r.text))
            best = Math.max(best, +m[1]);
          return { height: best };
        } catch (e) {
          return null;
        }
      });
    }
    function resolve(embedUrl, referer, depth) {
      return __async(this, null, function* () {
        const d = depth || 0;
        const url = String(embedUrl || "").trim();
        const host = hostOf(url);
        if (!host || SKIP_HOSTS.test(host))
          return [];
        if (/\.(?:m3u8|mp4|mkv)(?:[?#]|$)/i.test(url) && !/\/(?:embed|e|v|iframe)\//i.test(url)) {
          return finalize([{ url, q: qualityFrom(url), headers: playHeaders(referer || url) }], host);
        }
        for (const [re, fn] of SPECIAL) {
          if (re.test(host)) {
            try {
              return finalize(yield fn(url, referer), host);
            } catch (e) {
              return [];
            }
          }
        }
        let r;
        try {
          r = yield request(url, { referer, timeout: 1e4, retries: 1 });
        } catch (e) {
          return [];
        }
        if (!r.ok && r.status !== 404)
          return [];
        let finalUrl = r.url || url;
        let page = r.text;
        const form = /<form[^>]*action=["']([^"']*\/dl)["'][^>]*>([\s\S]*?)<\/form>/i.exec(page);
        if (form && /name=["']op["'][^>]*value=["']embed/i.test(form[2]) && !findMedia(page, finalUrl).length) {
          const code = (/\/(?:e|embed-?)\/?([a-z0-9]{8,})/i.exec(finalUrl) || [])[1];
          if (code) {
            try {
              const p = yield request(absUrl(form[1], finalUrl), { method: "POST", body: { op: "embed", file_code: code, auto: "1", referer: referer || "" }, referer: finalUrl, timeout: 1e4 });
              page = p.text;
            } catch (e) {
            }
          }
        }
        const media = findMedia(page, finalUrl).map((x) => Object.assign(x, { headers: playHeaders(finalUrl) }));
        if (media.length)
          return finalize(media, hostOf(finalUrl) || host);
        if (d < 2) {
          for (const f of iframeSrcs(r.text, finalUrl).slice(0, 2)) {
            const sub = yield resolve(f, finalUrl, d + 1);
            if (sub.length)
              return sub;
          }
        }
        return [];
      });
    }
    function finalize(list, host) {
      return __async(this, null, function* () {
        const out = [];
        let haveHls = false;
        for (const x of list || []) {
          let q = x.q || 0;
          const isHls = x.hls || /\.m3u8|\/hls\d?\/|master|\.txt(?:\?|$)/i.test(x.url) && !/\.mp4(?:\?|$)/i.test(x.url);
          if (isHls) {
            if (haveHls)
              continue;
            const p = yield probeHls(x.url, x.headers);
            if (!p)
              continue;
            haveHls = true;
            q = q || p.height;
          }
          q = snapHeight(q);
          out.push({ url: x.url, q, quality: qLabel(q), headers: x.headers, host: shortHost(host) });
        }
        return out;
      });
    }
    function shortHost(h) {
      const parts = String(h || "").replace(/^www\./, "").split(".");
      return parts.length > 2 ? parts[parts.length - 2] : parts[0];
    }
    module2.exports = { resolve, findMedia, qualityFrom, qLabel, snapHeight, playHeaders, probeHls, shortHost };
  },
  /* 4: src/lib/unpack.js */
  function(module2, exports2, __req2) {
    const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    function unbase(str, base) {
      if (base <= 36)
        return parseInt(str, base);
      let n = 0;
      for (let i = 0; i < str.length; i++)
        n = n * base + ALPHA.indexOf(str.charAt(i));
      return n;
    }
    function readQuoted(s, i) {
      let out = "";
      for (let j = i + 1; j < s.length; j++) {
        const c = s.charAt(j);
        if (c === "\\") {
          out += s.charAt(j + 1);
          j++;
          continue;
        }
        if (c === "'")
          return [out, j + 1];
        out += c;
      }
      return null;
    }
    function unpackAt(s, start) {
      const head = s.indexOf("}(", start);
      if (head < 0)
        return null;
      let i = head + 2;
      while (/\s/.test(s.charAt(i)))
        i++;
      if (s.charAt(i) !== "'")
        return null;
      const p = readQuoted(s, i);
      if (!p)
        return null;
      const tail = /^\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'/.exec(s.slice(p[1], p[1] + 40));
      if (!tail)
        return null;
      const k = readQuoted(s, p[1] + tail[0].length - 1);
      if (!k)
        return null;
      const a = +tail[1];
      const c = +tail[2];
      const words = k[0].split("|");
      return p[0].replace(/\b\w+\b/g, (w) => {
        const n = unbase(w, a);
        return n < c && words[n] ? words[n] : w;
      });
    }
    function unpackAll(html) {
      const s = String(html || "");
      const out = [];
      const re = /eval\(function\(p,a,c,k,e,[dr]\)/g;
      let m;
      while (m = re.exec(s)) {
        try {
          const u = unpackAt(s, m.index);
          if (u)
            out.push(u);
        } catch (e) {
        }
      }
      return out.join("\n");
    }
    module2.exports = { unpackAll };
  },
  /* 5: src/lib/html.js */
  function(module2, exports2, __req2) {
    function unesc(s) {
      return String(s == null ? "" : s).replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
    }
    const stripTags = (s) => unesc(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    function attr(tag, name) {
      const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
      const m = re.exec(tag);
      return m ? unesc(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]) : "";
    }
    const hasClass = (tag, cls) => (" " + attr(tag, "class").replace(/\s+/g, " ") + " ").indexOf(" " + cls + " ") >= 0;
    function tags(html, name) {
      const re = new RegExp(`<${name}\\b(?:"[^"]*"|'[^']*'|[^'">])*>`, "gi");
      const out = [];
      let m;
      while (m = re.exec(html))
        out.push({ tag: m[0], index: m.index });
      return out;
    }
    function anchors(html) {
      const out = [];
      const re = /<a\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/a>/gi;
      let m;
      while (m = re.exec(html)) {
        const open = "<a" + m[1] + ">";
        const href = attr(open, "href");
        if (!href)
          continue;
        out.push({ href, title: attr(open, "title"), text: stripTags(m[2]), cls: attr(open, "class"), inner: m[2], tag: open, index: m.index });
      }
      return out;
    }
    function section(html, startRe, len) {
      const m = startRe.exec(html);
      return m ? html.slice(m.index, m.index + (len || 2e4)) : "";
    }
    const toLatinDigits = (s) => String(s || "").replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776);
    function decodeUri(s) {
      try {
        return decodeURIComponent(s);
      } catch (e) {
        return s;
      }
    }
    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function b64decode(input) {
      const s = String(input || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+\/]/g, "");
      let out = "";
      let buf = 0;
      let bits = 0;
      for (let i = 0; i < s.length; i++) {
        buf = buf << 6 | B64.indexOf(s.charAt(i));
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out += String.fromCharCode(buf >> bits & 255);
        }
      }
      try {
        return decodeURIComponent(escape(out));
      } catch (e) {
        return out;
      }
    }
    module2.exports = { unesc, stripTags, attr, hasClass, tags, anchors, section, toLatinDigits, decodeUri, b64decode };
  },
  /* 6: src/sources/registry.js */
  function(module2, exports2, __req2) {
    module2.exports = [
      __req2(7),
      __req2(10),
      __req2(12),
      __req2(13),
      __req2(14),
      __req2(15),
      __req2(16),
      __req2(18)
    ];
  },
  /* 7: src/sources/akwam.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf, request, absUrl, hostOf, UA } = __req2(2);
    const { anchors, attr, tags, stripTags, decodeUri } = __req2(5);
    const { rank, queries, seasonOf, yearIn } = __req2(8);
    const { pickSeason, pickEpisode, uniqBy, pathKey } = __req2(9);
    const { qualityFrom } = __req2(3);
    const FORCE_HTTP = true;
    const MARKER = /entry-title|link-show|series-episodes|akwam/i;
    function cards(html) {
      const out = [];
      const re = /<h3[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while (m = re.exec(html)) {
        const href = m[1];
        const type = /\/movie\//.test(href) ? "movie" : /\/series\//.test(href) ? "tv" : null;
        if (type)
          out.push({ title: stripTags(m[2]), href: pathOf(href), type });
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
    module2.exports = {
      id: "akwam",
      name: "Akwam",
      // disabled 2026-11-06: DNS-blocked + SNI-reset on the user's network (works only intermittently).
      // Re-enable by deleting this line; `node tests/live.js akwam` still runs it on demand.
      enabled: false,
      types: ["movie", "tv"],
      bases: ["https://akwam.ss", "https://ak.sv", "https://akwam.to", "https://akwam.it", "https://akwam.net", "https://akw.to"],
      links(ctx) {
        return __async(this, null, function* () {
          const site = mirrorSite({ name: "Akwam", bases: this.bases, marker: MARKER, sameSite: /akwam|ak\.sv|akw\./i, log: ctx.log });
          const { info } = ctx;
          const isMovie = info.type === "movie";
          let pool = [];
          for (const q of queries(info, 3)) {
            const r = yield site.get(`/search?q=${encodeURIComponent(q)}`);
            if (!r)
              break;
            pool = uniqBy(pool.concat(cards(r.text).filter((c) => c.type === info.type)), (c) => pathKey(c.href));
            if (rank(pool, info, { minScore: 100 }).length)
              break;
          }
          const ranked = rank(pool, info, { minScore: 75, yearSlack: isMovie ? 1 : 99 });
          ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
          for (const c of ranked.slice(0, isMovie ? 3 : 2)) {
            const page = yield site.get(c.href);
            if (!page)
              continue;
            if (isMovie) {
              const y = pageYear(page.text);
              if (y && info.year && Math.abs(y - info.year) > 1) {
                ctx.log(`skip ${c.title}: ${y} vs ${info.year}`);
                continue;
              }
              const out2 = yield fromWatchButtons(site, page.text, site.url(c.href), ctx);
              if (out2.length)
                return out2;
              continue;
            }
            const epPath = yield findEpisode(site, page.text, c.href, ctx);
            if (!epPath)
              continue;
            const ep = yield site.get(epPath, { referer: site.url(c.href) });
            if (!ep)
              continue;
            const out = yield fromWatchButtons(site, ep.text, site.url(epPath), ctx);
            if (out.length)
              return out;
          }
          return [];
        });
      }
    };
    function findEpisode(site, html, showPath, ctx) {
      return __async(this, null, function* () {
        const seasonLinks = [{ title: stripTags((/<h1[\s\S]*?<\/h1>/.exec(html) || [""])[0]), href: showPath }];
        const box = /<div[^>]*class="[^"]*widget-body[^"]*"[\s\S]*?<\/div>/gi;
        let m;
        while (m = box.exec(html)) {
          for (const a of anchors(m[0]))
            if (/\/series\//.test(a.href) && /\bbtn\b/.test(a.cls))
              seasonLinks.push({ title: a.text, href: pathOf(a.href) });
        }
        const seasons = uniqBy(seasonLinks, (x) => pathKey(x.href));
        let season = pickSeason(seasons, ctx.season);
        if (!season && seasons.length === 1)
          season = seasons[0];
        if (!season) {
          ctx.log(`no season ${ctx.season} among ${seasons.length}`);
          return null;
        }
        const page = pathKey(season.href) === pathKey(showPath) ? { text: html } : yield site.get(season.href);
        if (!page)
          return null;
        const eps = uniqBy(anchors(page.text).filter((a) => /\/episode\//.test(a.href)).map((a) => ({ title: a.text, href: pathOf(a.href) })).filter((x) => x.title), (x) => pathKey(x.href));
        const ep = pickEpisode(eps, ctx.episode, seasons.length === 1 ? ctx.absolute : null);
        if (!ep)
          ctx.log(`episode ${ctx.episode} not among ${eps.length}`);
        return ep ? ep.href : null;
      });
    }
    function fromWatchButtons(site, html, pageUrl, ctx) {
      return __async(this, null, function* () {
        const shows = uniqBy(tags(html, "a").map((t) => t.tag).filter((t) => /link-show/.test(t)).map((t) => attr(t, "href")).filter(Boolean), (h) => h);
        if (!shows.length) {
          ctx.log(`no watch buttons on ${decodeUri(pathOf(pageUrl)).slice(0, 60)}`);
          return [];
        }
        const files = [];
        yield Promise.all(shows.slice(0, 4).map((href) => __async(this, null, function* () {
          for (const f of yield followToSources(site, href, pageUrl, ctx))
            files.push(f);
        })));
        return uniqBy(files, (f) => f.url).map((f) => ({
          url: f.url,
          q: qualityFrom(decodeUri(f.url.split("/").pop())) || f.q,
          headers: { "User-Agent": UA, Referer: f.referer },
          host: "Akwam"
        }));
      });
    }
    function followToSources(site, href, referer, ctx) {
      return __async(this, null, function* () {
        let url = absUrl(href, referer);
        let ref = referer;
        for (let hop = 0; hop < 4 && url; hop++) {
          const own = /akwam|ak\.sv|akw\./i.test(hostOf(url)) && !/^go\./i.test(hostOf(url));
          let r = null;
          try {
            r = own ? yield site.get(pathOf(url), { referer: ref, marker: null }) : yield request(url, { referer: ref, timeout: 1e4, retries: 1 });
          } catch (e) {
            r = null;
          }
          if (!r)
            return [];
          const here = r.url || url;
          const src = sourcesIn(r.text, here);
          if (src.length) {
            return src.map((s) => ({ url: FORCE_HTTP ? s.replace(/^https:\/\/([^\/]*downet\.net)/i, "http://$1") : s, q: 0, referer: here }));
          }
          const links = anchors(r.text).map((a) => ({ href: absUrl(a.href, here), cls: a.cls }));
          const next = links.find((a) => /\/watch\/\d+/.test(a.href) && pathKey(a.href) !== pathKey(here)) || links.find((a) => /download-link|link-download|\blink\b/.test(a.cls) && /^https?:/.test(a.href) && pathKey(a.href) !== pathKey(here)) || (/(?:location\.href|window\.location)\s*=\s*["']([^"']+)["']|http-equiv=["']refresh["'][^>]*url=([^"'>]+)/i.exec(r.text) || []).slice(1).filter(Boolean).map((u) => ({ href: absUrl(u, here) }))[0];
          if (!next) {
            ctx.log(`dead end at ${decodeUri(pathOf(here)).slice(0, 60)}`);
            return [];
          }
          ref = here;
          url = next.href;
        }
        return [];
      });
    }
  },
  /* 8: src/lib/match.js */
  function(module2, exports2, __req2) {
    const { unesc, toLatinDigits } = __req2(5);
    function normAr(s) {
      let t = toLatinDigits(unesc(s));
      try {
        t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
      } catch (e) {
      }
      return t.replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ة/g, "\u0647").toLowerCase();
    }
    const ORD_WORDS = [
      ["\u0627\u0644\u0627\u0648\u0644", 1],
      ["\u0627\u0644\u062B\u0627\u0646\u064A", 2],
      ["\u0627\u0644\u062B\u0627\u0644\u062B", 3],
      ["\u0627\u0644\u0631\u0627\u0628\u0639", 4],
      ["\u0627\u0644\u062E\u0627\u0645\u0633", 5],
      ["\u0627\u0644\u0633\u0627\u062F\u0633", 6],
      ["\u0627\u0644\u0633\u0627\u0628\u0639", 7],
      ["\u0627\u0644\u062B\u0627\u0645\u0646", 8],
      ["\u0627\u0644\u062A\u0627\u0633\u0639", 9],
      ["\u0627\u0644\u0639\u0627\u0634\u0631", 10],
      ["\u0627\u0644\u062D\u0627\u062F\u064A \u0639\u0634\u0631", 11],
      ["\u0627\u0644\u062B\u0627\u0646\u064A \u0639\u0634\u0631", 12],
      ["\u0627\u0644\u062B\u0627\u0644\u062B \u0639\u0634\u0631", 13],
      ["\u0627\u0644\u0631\u0627\u0628\u0639 \u0639\u0634\u0631", 14],
      ["\u0627\u0644\u062E\u0627\u0645\u0633 \u0639\u0634\u0631", 15],
      ["\u0627\u0644\u0633\u0627\u062F\u0633 \u0639\u0634\u0631", 16],
      ["\u0627\u0644\u0633\u0627\u0628\u0639 \u0639\u0634\u0631", 17],
      ["\u0627\u0644\u062B\u0627\u0645\u0646 \u0639\u0634\u0631", 18],
      ["\u0627\u0644\u062A\u0627\u0633\u0639 \u0639\u0634\u0631", 19],
      ["\u0627\u0644\u0639\u0634\u0631\u0648\u0646", 20]
    ].map((x) => [normAr(x[0]), x[1]]).sort((a, b) => b[0].length - a[0].length);
    const ORD_ALT = ORD_WORDS.map((x) => x[0]).join("|");
    const SEASON_RE = new RegExp(`(?:\u0627\u0644\u0645\u0648\u0633\u0645|\u0627\u0644\u062C\u0632\u0621|\u0645\u0648\u0633\u0645|season|part|s)\\s*[:\\-]?\\s*(\\d{1,2}(?!\\d)|${ORD_ALT})`, "i");
    const EPISODE_RE = /(?:الحلقه|حلقه|episode|ep|e)\s*[:\-]?\s*(\d{1,4})(?!\d)/i;
    function ordValue(w) {
      if (/^\d+$/.test(w))
        return +w;
      const hit = ORD_WORDS.find((x) => x[0] === w);
      return hit ? hit[1] : null;
    }
    function seasonOf(text) {
      const t = normAr(text);
      const m = SEASON_RE.exec(t);
      return m ? ordValue(m[1]) : null;
    }
    function episodeOf(text) {
      const m = EPISODE_RE.exec(normAr(text));
      return m ? +m[1] : null;
    }
    const NOISE = /(?:^|\s)(?:فيلم|افلام|مسلسل|مسلسلات|انمي|برنامج|عرض|مترجم|مترجمه|مدبلج|مدبلجه|مدبلجة|كامل|كامله|اون\s*لاين|اونلاين|حصريا|بجوده|عاليه|مشاهده|تحميل|والاخيره|الاخيره|الاخير|و?الاخيرة|hd|fhd|full|online|web-dl|webrip|bluray|brrip|hdrip|hdcam|cam|1080p|720p|480p|360p|4k|uhd|arabic|subbed|dubbed)(?=\s|$)/g;
    function cleanTitle(t) {
      let s = normAr(t).replace(/[–—|_]+/g, " ").replace(new RegExp(`(?:\u0627\u0644\u0645\u0648\u0633\u0645|\u0627\u0644\u062C\u0632\u0621|season|part)\\s*[:\\-]?\\s*(?:\\d{1,2}(?!\\d)|${ORD_ALT})`, "g"), " ").replace(/(?:الحلقه|حلقه|episode|ep)\s*[:\-]?\s*\d{1,4}(?:\s*(?:و|-|to)\s*\d{1,4})?/g, " ").replace(/\b(?:s\d{1,2}e\d{1,4}|s\d{1,2}|e\d{1,4})\b/g, " ");
      for (const [w] of ORD_WORDS)
        s = s.split(w + "\u0647").join(" ").split(w).join(" ");
      s = s.replace(/(?:^|\s)(?:الحاديه|الحادي|عشر|عشره|والعشرون|العشرون)(?=\s|$)/g, " ");
      s = s.replace(/[^\w؀-ۿ\s]+/g, " ").replace(NOISE, " ").replace(NOISE, " ");
      return s.replace(/\s+/g, " ").trim();
    }
    const yearIn = (t) => {
      const all = toLatinDigits(t).match(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/g) || [];
      const y = all.length ? parseInt(all[all.length - 1].replace(/\D/g, ""), 10) : NaN;
      return y >= 1920 && y <= 2100 ? y : null;
    };
    const compact = (s) => s.replace(/\s+/g, "");
    const stripYear = (s) => s.replace(/\b(?:19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
    function prepWanted(titles) {
      const out = [];
      const seen = {};
      for (const t of titles) {
        const c = stripYear(cleanTitle(t));
        const k = compact(c);
        if (k.length < 2 || seen[k])
          continue;
        seen[k] = 1;
        out.push({ c, k, words: c.split(" ").filter(Boolean) });
      }
      return out;
    }
    function titleScore(candidate, wanted) {
      const raw = String(candidate || "");
      const parts = [raw];
      const paren = /\(([^()]{2,})\)/.exec(raw);
      if (paren && !/^\s*(?:19|20)\d{2}\s*$/.test(paren[1])) {
        parts.push(raw.replace(paren[0], " "));
        parts.push(raw.replace(/\([^()]*\)/, " ").replace(/^(\S*\s)?[\s\S]*$/, "$1") + paren[1]);
      }
      let best = 0;
      for (const p of parts)
        best = Math.max(best, titleScoreOne(p, wanted));
      return best;
    }
    function titleScoreOne(candidate, wanted) {
      const c = stripYear(cleanTitle(candidate));
      const ck = compact(c);
      if (!ck)
        return 0;
      const cw = c.split(" ").filter(Boolean);
      let best = 0;
      for (const w of wanted) {
        if (w.k === ck)
          return 100;
        const short = Math.min(ck.length, w.k.length);
        const long = Math.max(ck.length, w.k.length);
        if (short >= 4 && (ck.indexOf(w.k) >= 0 || w.k.indexOf(ck) >= 0))
          best = Math.max(best, Math.round(55 + 35 * short / long));
        if (w.words.length >= 2) {
          const hit = w.words.filter((x) => cw.indexOf(x) >= 0).length;
          const ratio = hit / Math.max(w.words.length, cw.length);
          if (ratio >= 0.6)
            best = Math.max(best, Math.round(40 + 50 * ratio));
        }
      }
      return best;
    }
    function rank(cands, info, opts) {
      const o = opts || {};
      const wanted = prepWanted(info.titles.slice(0, 30));
      const minScore = o.minScore || 70;
      const slack = o.yearSlack == null ? 1 : o.yearSlack;
      return cands.map((c) => {
        const score = titleScore(c.title, wanted);
        const y = c.year || yearIn(c.title);
        let s = score;
        if (s > 0 && info.isAnime != null) {
          const tagged = /(?:^|\s)انمي|\banime\b/i.test(normAr(c.title));
          if (info.isAnime && tagged)
            s += 6;
          if (!info.isAnime && tagged)
            s -= 30;
        }
        if (y && info.year) {
          const diff = Math.abs(y - info.year);
          if (info.type === "movie" && diff > slack)
            s = 0;
          else
            s += diff === 0 ? 5 : 0;
        }
        return Object.assign({}, c, { score: s, year: y || null });
      }).filter((c) => c.score >= minScore).sort((a, b) => b.score - a.score || cleanTitle(a.title).length - cleanTitle(b.title).length);
    }
    function queries(info, max) {
      const out = [];
      const add = (q) => {
        const v = String(q || "").replace(/[:\-–—!?.,'"()]+/g, " ").replace(/\s+/g, " ").trim();
        if (v.length >= 2 && out.indexOf(v) < 0)
          out.push(v);
      };
      add(info.title);
      if (info.isAnime && info.romaji)
        add(info.romaji);
      if (info.titleAr) {
        const folded = info.titleAr.replace(/[أإآ]/g, "\u0627");
        add(folded);
        add(info.titleAr);
      }
      if (/^[\x00-\x7f]+$/.test(info.original) || /[؀-ۿ]/.test(info.original))
        add(info.original);
      for (const t of info.titles.slice(3))
        if (/^[\x00-\x7f]+$/.test(t) || /[؀-ۿ]/.test(t))
          add(t);
      return out.slice(0, max || 3);
    }
    module2.exports = { normAr, cleanTitle, seasonOf, episodeOf, yearIn, titleScore, prepWanted, rank, queries };
  },
  /* 9: src/lib/common.js */
  function(module2, exports2, __req2) {
    const { seasonOf, episodeOf, normAr } = __req2(8);
    const { decodeUri } = __req2(5);
    const pathKey = (p) => decodeUri(String(p || "")).toLowerCase().replace(/^https?:\/\/[^\/]+/, "").replace(/\/+$/, "");
    function uniqBy(list, keyFn) {
      const seen = {};
      const out = [];
      for (const x of list) {
        const k = keyFn(x);
        if (!k || seen[k])
          continue;
        seen[k] = 1;
        out.push(x);
      }
      return out;
    }
    function pickSeason(list, s) {
      const tagged = list.map((x) => Object.assign({}, x, { n: x.n != null ? x.n : seasonOf(x.title + " " + decodeUri(x.href)) }));
      const exact = tagged.filter((x) => x.n === s);
      if (exact.length)
        return exact[0];
      const plain = tagged.filter((x) => x.n == null);
      if (s === 1 && plain.length)
        return plain[0];
      return null;
    }
    function pickEpisode(list, e, absolute) {
      const tagged = list.map((x) => Object.assign({}, x, { n: x.n != null ? x.n : episodeOf(x.title) || episodeOf(decodeUri(x.href)) }));
      let hit = tagged.find((x) => x.n === e);
      if (!hit && absolute && absolute !== e)
        hit = tagged.find((x) => x.n === absolute);
      return hit || null;
    }
    function seasonFits(title, s) {
      const n = seasonOf(title);
      return n == null ? s === 1 || true : n === s;
    }
    const isArabicText = (s) => /[؀-ۿ]/.test(String(s || ""));
    module2.exports = { pathKey, uniqBy, pickSeason, pickEpisode, seasonFits, isArabicText, normAr };
  },
  /* 10: src/sources/faselhd.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf, request, UA } = __req2(2);
    const { anchors, stripTags, unesc } = __req2(5);
    const { rank, queries } = __req2(8);
    const { pickSeason, pickEpisode, uniqBy, pathKey } = __req2(9);
    const { decodeScript, joinedStrings } = __req2(11);
    const { qualityFrom } = __req2(3);
    const MARKER = /faselhd/i;
    function cards(html) {
      const out = [];
      const re = /<div class="postDiv[^"]*">\s*<a href="([^"]+)"[\s\S]*?alt="([^"]*)"/g;
      let m;
      while (m = re.exec(html)) {
        const href = m[1];
        const type = /\/movies\/|\/anime-movies\/|\/dubbed-movies\/|\/hindi\/|\/asian-movies\//.test(href) ? "movie" : /\/seasons\/|\/series\/|\/anime\/|\/asian-series\//.test(href) ? "tv" : /\/episodes\//.test(href) ? "episode" : null;
        if (type)
          out.push({ title: unesc(m[2]), href: pathOf(href), type });
      }
      return uniqBy(out, (c) => pathKey(c.href));
    }
    module2.exports = {
      id: "faselhd",
      name: "FaselHD",
      types: ["movie", "tv"],
      bases: ["https://web11612x.faselhdx.one"],
      links(ctx) {
        return __async(this, null, function* () {
          const site = mirrorSite({ name: "FaselHD", bases: this.bases, marker: MARKER, sameSite: /fasel/i, log: ctx.log });
          const { info } = ctx;
          const isMovie = info.type === "movie";
          let pool = [];
          for (const q of queries(info, 3)) {
            const r = yield site.get(`/?s=${encodeURIComponent(q)}`);
            if (!r)
              break;
            pool = uniqBy(pool.concat(cards(r.text).filter((c) => c.type === info.type)), (c) => pathKey(c.href));
            if (rank(pool, info, { minScore: 100 }).length)
              break;
          }
          const ranked = rank(pool, info, { minScore: 75, yearSlack: isMovie ? 1 : 99 });
          ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
          for (const c of ranked.slice(0, 2)) {
            let page = yield site.get(c.href);
            if (!page)
              continue;
            let pagePath = c.href;
            if (!isMovie) {
              const seasons = [];
              const re = /<div class="seasonDiv[^"]*"\s+onclick="window\.location\.href\s*=\s*'([^']+)'"[\s\S]*?<div class="title">([\s\S]*?)<\/div>/g;
              let m;
              while (m = re.exec(page.text))
                seasons.push({ title: stripTags(m[2]), href: pathOf(m[1]), active: /seasonDiv active/.test(m[0]) });
              let season = seasons.length ? pickSeason(seasons, ctx.season) : null;
              if (!season && !seasons.length && ctx.season === 1)
                season = { href: c.href };
              if (!season) {
                ctx.log(`no season ${ctx.season} among ${seasons.length}`);
                continue;
              }
              if (!season.active && pathKey(season.href) !== pathKey(c.href)) {
                page = yield site.get(season.href);
                if (!page)
                  continue;
              }
              const box = /<div class="epAll"[\s\S]*?<\/div>/.exec(page.text);
              const eps = anchors(box ? box[0] : "").map((a) => ({ title: a.text, href: pathOf(a.href) }));
              const ep = pickEpisode(eps, ctx.episode, seasons.length <= 1 ? ctx.absolute : null);
              if (!ep) {
                ctx.log(`episode ${ctx.episode} not among ${eps.length}`);
                continue;
              }
              pagePath = ep.href;
              page = yield site.get(ep.href, { referer: site.url(season.href) });
              if (!page)
                continue;
            }
            const out = yield playerStreams(page.text, site.url(pagePath), ctx);
            if (out.length)
              return out;
          }
          return [];
        });
      }
    };
    function playerStreams(html, pageUrl, ctx) {
      return __async(this, null, function* () {
        const players = uniqBy(html.match(/https?:\/\/[^'"\s]+\/video_player\?player_token=[^'"\s]+/g) || [], (u) => u);
        if (!players.length) {
          ctx.log("no player tokens");
          return [];
        }
        const out = [];
        yield Promise.all(players.slice(0, 3).map((p, idx) => __async(this, null, function* () {
          let r;
          try {
            r = yield request(p, { referer: pageUrl, timeout: 12e3, retries: 1 });
          } catch (e) {
            return;
          }
          const scripts = (r.text.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || []).filter((s) => /_0x/.test(s) && !/\ssrc=/.test(s.slice(0, s.indexOf(">")))).map((s) => s.replace(/^<script\b[^>]*>/, "").replace(/<\/script>$/, ""));
          const text = scripts.map((s) => {
            try {
              return decodeScript(s);
            } catch (e) {
              return null;
            }
          }).filter(Boolean).map((d) => joinedStrings(d).join("\n")).join("\n");
          const btn = /data-url="([^"]+\.m3u8[^"]*)"[^>]*>([^<]*)</g;
          let m;
          let found = 0;
          while (m = btn.exec(text)) {
            const label = m[2].trim();
            out.push({ url: m[1], q: /auto/i.test(label) ? 0 : qualityFrom(label), headers: { "User-Agent": UA, Referer: pageUrl }, host: "FaselHD", label: `server ${idx + 1}${/auto/i.test(label) ? " auto" : ""}` });
            found++;
          }
          if (!found) {
            for (const u of text.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/g) || [])
              out.push({ url: u, q: 0, headers: { "User-Agent": UA, Referer: pageUrl }, host: "FaselHD", label: `server ${idx + 1}` });
          }
          if (!found && !text)
            ctx.log(`player ${idx + 1}: obfuscation not recognised`);
        })));
        return uniqBy(out, (x) => x.url);
      });
    }
  },
  /* 11: src/lib/deobf.js */
  function(module2, exports2, __req2) {
    const ID = "_0x[0-9a-fA-F]+";
    function readString(s, i) {
      const q = s.charAt(i);
      let out = "";
      for (let j = i + 1; j < s.length; j++) {
        const c = s.charAt(j);
        if (c === "\\") {
          const n = s.charAt(j + 1);
          if (n === "x") {
            out += String.fromCharCode(parseInt(s.substr(j + 2, 2), 16));
            j += 3;
            continue;
          }
          if (n === "u") {
            out += String.fromCharCode(parseInt(s.substr(j + 2, 4), 16));
            j += 5;
            continue;
          }
          out += n === "n" ? "\n" : n === "t" ? "	" : n === "r" ? "\r" : n;
          j++;
          continue;
        }
        if (c === q)
          return { value: out, end: j + 1 };
        out += c;
      }
      return null;
    }
    function evalExpr(src, callFn) {
      let i = 0;
      const s = String(src);
      const ws = () => {
        while (/\s/.test(s.charAt(i)))
          i++;
      };
      function primary() {
        ws();
        const c = s.charAt(i);
        if (c === "(") {
          i++;
          const v2 = expr();
          ws();
          if (s.charAt(i) !== ")")
            throw new Error("paren");
          i++;
          return v2;
        }
        if (c === "-") {
          i++;
          return -primary();
        }
        if (c === "+") {
          i++;
          return +primary();
        }
        if (c === "!") {
          i++;
          return !primary();
        }
        if (c === "'" || c === '"') {
          const r = readString(s, i);
          i = r.end;
          return r.value;
        }
        let m = /^(0x[0-9a-fA-F]+|\d*\.\d+|\d+)/.exec(s.slice(i));
        if (m) {
          i += m[0].length;
          return m[0].indexOf("0x") === 0 ? parseInt(m[0], 16) : parseFloat(m[0]);
        }
        m = /^parseInt\(/.exec(s.slice(i));
        if (m) {
          i += m[0].length;
          const v2 = expr();
          ws();
          i++;
          return parseInt(v2, 10);
        }
        m = new RegExp(`^(${ID})\\(`).exec(s.slice(i));
        if (m && callFn) {
          i += m[0].length;
          const args = [];
          for (; ; ) {
            ws();
            if (s.charAt(i) === ")") {
              i++;
              break;
            }
            args.push(expr());
            ws();
            if (s.charAt(i) === ",")
              i++;
          }
          return callFn(m[1], args);
        }
        if (/^!!\[\]/.test(s.slice(i))) {
          i += 4;
          return true;
        }
        if (/^!\[\]/.test(s.slice(i))) {
          i += 3;
          return false;
        }
        throw new Error(`unexpected ${s.slice(i, i + 12)}`);
      }
      function term() {
        let v2 = primary();
        for (; ; ) {
          ws();
          const c = s.charAt(i);
          if (c === "*") {
            i++;
            v2 = v2 * primary();
          } else if (c === "/") {
            i++;
            v2 = v2 / primary();
          } else
            return v2;
        }
      }
      function expr() {
        let v2 = term();
        for (; ; ) {
          ws();
          const c = s.charAt(i);
          if (c === "+") {
            i++;
            v2 = v2 + term();
          } else if (c === "-") {
            i++;
            v2 = v2 - term();
          } else
            return v2;
        }
      }
      const v = expr();
      ws();
      if (i < s.length)
        throw new Error(`trailing ${s.slice(i, i + 12)}`);
      return v;
    }
    function balanced(s, i) {
      let depth = 0;
      for (let j = i; j < s.length; j++) {
        const c = s.charAt(j);
        if (c === "'" || c === '"') {
          const r = readString(s, j);
          if (!r)
            return -1;
          j = r.end - 1;
          continue;
        }
        if (c === "(")
          depth++;
        else if (c === ")" && --depth === 0)
          return j;
      }
      return -1;
    }
    const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
    function b64(str) {
      let bits = 0, buf = 0, bytes = "";
      for (let k = 0; k < str.length; k++) {
        const v = ALPHA.indexOf(str.charAt(k));
        if (v < 0 || v === 64)
          continue;
        buf = buf << 6 | v;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          bytes += "%" + ("00" + (buf >> bits & 255).toString(16)).slice(-2);
        }
      }
      try {
        return decodeURIComponent(bytes);
      } catch (e) {
        return unescape(bytes);
      }
    }
    function decodeScript(js) {
      const s = String(js || "");
      const arrM = new RegExp(`function (${ID})\\(\\)\\{var ${ID}=\\[`).exec(s);
      if (!arrM)
        return null;
      const arrName = arrM[1];
      const arr = [];
      let i = arrM.index + arrM[0].length;
      for (; ; ) {
        while (/[\s,]/.test(s.charAt(i)))
          i++;
        if (s.charAt(i) === "]")
          break;
        const r = readString(s, i);
        if (!r)
          return null;
        arr.push(r.value);
        i = r.end;
      }
      const decM = new RegExp(`function (${ID})\\(${ID},${ID}\\)\\{var ${ID}=${arrName}\\(\\);return \\1=function\\((${ID}),${ID}\\)\\{\\2=\\2-\\(([^;]+?)\\);`).exec(s);
      if (!decM)
        return null;
      const decName = decM[1];
      const offset = evalExpr(decM[3]);
      const wrappers = {};
      const wre = new RegExp(`function (${ID})\\((${ID}(?:,${ID})*)\\)\\{return (${ID})\\((${ID})\\s*([-+])\\s*([^,]+?),(${ID})\\);\\}`, "g");
      let m;
      while (m = wre.exec(s)) {
        const params = m[2].split(",");
        let delta;
        try {
          delta = evalExpr(m[6]);
        } catch (e) {
          continue;
        }
        wrappers[m[1]] = { params, target: m[3], idx: params.indexOf(m[4]), sign: m[5], delta, keyIdx: params.indexOf(m[7]) };
      }
      const lookup = (n) => b64(arr[n - offset]);
      function call(name, args) {
        if (name === decName)
          return lookup(args[0]);
        const w = wrappers[name];
        if (!w)
          throw new Error(`unknown fn ${name}`);
        const v = w.sign === "-" ? args[w.idx] - w.delta : args[w.idx] + w.delta;
        return call(w.target, [v, args[w.keyIdx]]);
      }
      const rotM = new RegExp(`while\\(!!\\[\\]\\)\\{try\\{var ${ID}=([\\s\\S]+?);if\\(${ID}===${ID}\\)break;`).exec(s);
      const tgtM = new RegExp(`\\}\\(${arrName},([^)]+?)\\)\\);`).exec(s);
      if (!rotM || !tgtM)
        return null;
      const target = evalExpr(tgtM[1]);
      let ok = false;
      for (let n = 0; n <= arr.length; n++) {
        try {
          if (evalExpr(rotM[1], call) === target) {
            ok = true;
            break;
          }
        } catch (e) {
        }
        arr.push(arr.shift());
      }
      if (!ok)
        return null;
      const names = [decName].concat(Object.keys(wrappers));
      const callRe = new RegExp(`(${names.join("|")})\\(`, "g");
      let out = "";
      let last = 0;
      while (m = callRe.exec(s)) {
        if (/[\w$]/.test(s.charAt(m.index - 1)) || /function\s*$/.test(s.slice(Math.max(0, m.index - 9), m.index)))
          continue;
        const close = balanced(s, m.index + m[1].length);
        if (close < 0)
          continue;
        let v;
        try {
          v = evalExpr(s.slice(m.index, close + 1), call);
        } catch (e) {
          continue;
        }
        if (typeof v !== "string")
          continue;
        out += s.slice(last, m.index) + JSON.stringify(v);
        last = close + 1;
        callRe.lastIndex = close + 1;
      }
      return out + s.slice(last);
    }
    function joinedStrings(js) {
      const s = String(js || "");
      const out = [];
      let i = 0;
      while (i < s.length) {
        const c = s.charAt(i);
        if (c !== "'" && c !== '"') {
          i++;
          continue;
        }
        let r = readString(s, i);
        if (!r) {
          i++;
          continue;
        }
        let val = r.value;
        let j = r.end;
        for (; ; ) {
          const m = /^\s*\+\s*/.exec(s.slice(j, j + 8));
          if (!m)
            break;
          const k = j + m[0].length;
          const q = s.charAt(k);
          if (q !== "'" && q !== '"')
            break;
          const r2 = readString(s, k);
          if (!r2)
            break;
          val += r2.value;
          j = r2.end;
        }
        out.push(val);
        i = j;
      }
      return out;
    }
    module2.exports = { decodeScript, joinedStrings, evalExpr };
  },
  /* 12: src/sources/topcinema.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf } = __req2(2);
    const { anchors, attr, tags } = __req2(5);
    const { rank, queries, seasonOf } = __req2(8);
    const { pickSeason, pickEpisode, uniqBy, pathKey } = __req2(9);
    const AJAX = "/wp-content/themes/movies2023/Ajaxat";
    module2.exports = {
      id: "topcinema",
      name: "TopCinema",
      types: ["movie", "tv"],
      bases: ["https://web6.topcinema.fan", "https://topcinema.fan", "https://topcinema.cam", "https://topcinemaa.co", "https://topcinema.ink", "https://topcinema.film", "https://web.topcinemaa.live"],
      links(ctx) {
        return __async(this, null, function* () {
          const site = mirrorSite({ name: "TopCinema", bases: this.bases, marker: /movies2023|topcinema/i, sameSite: /topcinema/i, log: ctx.log });
          const { info } = ctx;
          const isMovie = info.type === "movie";
          let pool = [];
          for (const q of queries(info, 3)) {
            const r = yield site.post(`${AJAX}/Searching.php`, { search: q, type: "all" }, { marker: null, headers: { "X-Requested-With": "XMLHttpRequest" } });
            if (!r)
              continue;
            const cards = anchors(r.text).filter((a) => a.title).map((a) => ({ title: a.title, path: pathOf(a.href), series: /\/series\//.test(a.href) })).filter((c) => isMovie ? !c.series && /فيلم|film|movie/i.test(c.title) : c.series);
            pool = uniqBy(pool.concat(cards), (c) => pathKey(c.path));
            const ranked2 = rank(pool, info);
            if (ranked2.length && ranked2[0].score >= 100)
              break;
          }
          const ranked = rank(pool, info, { minScore: 75 });
          ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
          if (!ranked.length)
            return [];
          let target = null;
          if (isMovie) {
            target = ranked[0].path;
          } else {
            for (const show of ranked.slice(0, 2)) {
              const page = yield site.get(show.path);
              if (!page)
                continue;
              const seasons = uniqBy(anchors(page.text).filter((a) => /\/series\//.test(a.href) && /الموسم|season/i.test(a.text + " " + a.title)).map((a) => ({ title: a.text || a.title, href: pathOf(a.href) })), (x) => pathKey(x.href));
              let season = pickSeason(seasons, ctx.season);
              let seasonPage = null;
              if (season)
                seasonPage = pathKey(season.href) === pathKey(show.path) ? page : yield site.get(season.href);
              else if (ctx.season === 1 || seasonOf(show.title) === ctx.season)
                seasonPage = page;
              if (!seasonPage)
                continue;
              const eps = episodesOf(seasonPage.text);
              const ep = pickEpisode(eps, ctx.episode, ctx.absolute);
              if (ep) {
                target = ep.href;
                break;
              }
              ctx.log(`episode ${ctx.episode} not listed (${eps.length} eps)`);
            }
          }
          if (!target)
            return [];
          const watchPath = target.replace(/\/?$/, "/") + "watch/";
          const watch = yield site.get(watchPath, { referer: site.url(target) });
          if (!watch)
            return [];
          const servers = tags(watch.text, "li").map((t) => t.tag).filter((t) => /server--item/.test(t)).map((t) => ({ id: attr(t, "data-id"), i: attr(t, "data-server") })).filter((s) => s.id);
          const first = /<iframe[^>]+src=["']([^"']+)["']/i.exec(watch.text);
          const referer = site.url(watchPath);
          const out = first ? [{ embed: first[1], referer }] : [];
          const embeds = yield Promise.all(servers.slice(0, 10).map((s) => __async(this, null, function* () {
            const r = yield site.post(`${AJAX}/Single/Server.php`, { id: s.id, i: s.i }, { marker: null, referer, headers: { "X-Requested-With": "XMLHttpRequest" } });
            const m = r && /<iframe[^>]+src=["']([^"']+)["']/i.exec(r.text);
            return m ? { embed: m[1], referer } : null;
          })));
          return uniqBy(out.concat(embeds.filter(Boolean)), (x) => x.embed);
        });
      }
    };
    function episodesOf(html) {
      return uniqBy(anchors(html).filter((a) => a.title && /الحلقة|الحلقه|episode/i.test(a.title) && !/\/series\/|\/category\//.test(a.href)).map((a) => {
        const num = /<div class="epnum">[\s\S]*?<\/span>\s*(\d+)/i.exec(a.inner);
        return { title: a.title, href: pathOf(a.href), n: num ? +num[1] : null };
      }), (x) => pathKey(x.href));
    }
  },
  /* 13: src/sources/arabseed.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf } = __req2(2);
    const { anchors, attr, tags, decodeUri, b64decode } = __req2(5);
    const { rank, queries, seasonOf, episodeOf } = __req2(8);
    const { pickEpisode, uniqBy, pathKey } = __req2(9);
    const ORD = [
      "",
      "\u0627\u0644\u0627\u0648\u0644",
      "\u0627\u0644\u062B\u0627\u0646\u064A",
      "\u0627\u0644\u062B\u0627\u0644\u062B",
      "\u0627\u0644\u0631\u0627\u0628\u0639",
      "\u0627\u0644\u062E\u0627\u0645\u0633",
      "\u0627\u0644\u0633\u0627\u062F\u0633",
      "\u0627\u0644\u0633\u0627\u0628\u0639",
      "\u0627\u0644\u062B\u0627\u0645\u0646",
      "\u0627\u0644\u062A\u0627\u0633\u0639",
      "\u0627\u0644\u0639\u0627\u0634\u0631",
      "\u0627\u0644\u062D\u0627\u062F\u064A-\u0639\u0634\u0631",
      "\u0627\u0644\u062B\u0627\u0646\u064A-\u0639\u0634\u0631",
      "\u0627\u0644\u062B\u0627\u0644\u062B-\u0639\u0634\u0631",
      "\u0627\u0644\u0631\u0627\u0628\u0639-\u0639\u0634\u0631",
      "\u0627\u0644\u062E\u0627\u0645\u0633-\u0639\u0634\u0631"
    ];
    const ORD_SLUG_RE = /(الموسم-)(الحادي-عشر|الثاني-عشر|الثالث-عشر|الرابع-عشر|الخامس-عشر|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)/;
    function blocks(html) {
      return tags(html, "a").map((t) => t.tag).filter((t) => /movie__block/.test(t)).map((t) => ({ title: attr(t, "title"), href: pathOf(attr(t, "href")) })).filter((b) => b.title && b.href);
    }
    const b64 = (s) => b64decode(s);
    module2.exports = {
      id: "arabseed",
      name: "ArabSeed",
      types: ["movie", "tv"],
      bases: ["https://m.asd.watch", "https://arabseed.top", "https://m.arabseed.top", "https://m.myseed.tv", "https://asd.homes", "https://arabseed.show"],
      links(ctx) {
        return __async(this, null, function* () {
          const site = mirrorSite({ name: "ArabSeed", bases: this.bases, marker: /ArabSeed|عرب سيد/i, sameSite: /asd|seed/i, log: ctx.log });
          const { info } = ctx;
          const isMovie = info.type === "movie";
          let target = null;
          if (isMovie) {
            let pool = [];
            for (const q of queries(info, 3)) {
              const r = yield site.get(`/find/?word=${encodeURIComponent(q)}&type=movies`);
              if (r)
                pool = uniqBy(pool.concat(blocks(r.text).filter((b) => /فيلم|film/i.test(b.title))), (b) => pathKey(b.href));
              const best2 = rank(pool, info, { minScore: 75 });
              if (best2.length && best2[0].score >= 100)
                break;
            }
            const best = rank(pool, info, { minScore: 75 });
            ctx.log(`candidates: ${best.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
            if (best.length)
              target = best[0].href;
          } else {
            target = yield findEpisode(site, ctx);
          }
          if (!target)
            return [];
          ctx.log(`page ${decodeUri(target).slice(0, 80)}`);
          return watchLinks(site, target, ctx);
        });
      }
    };
    function findEpisode(site, ctx) {
      return __async(this, null, function* () {
        const { info, season, episode } = ctx;
        let pool = [];
        for (const q of queries(info, 2)) {
          for (const word of [q, `${q} \u0627\u0644\u0645\u0648\u0633\u0645 ${ORD[season] || season}`]) {
            const r = yield site.get(`/find/?word=${encodeURIComponent(word)}`);
            if (r)
              pool = uniqBy(pool.concat(blocks(r.text).filter((b) => /مسلسل|برنامج|انمي|series/i.test(b.title))), (b) => pathKey(b.href));
          }
          if (rank(pool, info, { minScore: 85 }).length)
            break;
        }
        const ranked = rank(pool, info, { minScore: 85 });
        const mine = ranked.filter((c) => c.score >= (ranked.length ? ranked[0].score : 0) - 3);
        ctx.log(`candidates: ${mine.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
        if (!mine.length)
          return null;
        const fits = (b) => (seasonOf(b.title) || 1) === season;
        const direct = mine.find((b) => fits(b) && episodeOf(b.title) === episode);
        if (direct)
          return direct.href;
        const anyEp = mine.find(fits) || mine[0];
        const epPage = yield site.get(anyEp.href);
        if (!epPage)
          return null;
        const selary = anchors(epPage.text).map((a) => a.href).find((h) => /\/selary\//.test(h));
        const tries = [];
        if (selary) {
          const p = decodeUri(pathOf(selary));
          const have = seasonOf(p.replace(/-/g, " "));
          if (have === season)
            tries.push(p);
          else if (ORD_SLUG_RE.test(p) && ORD[season])
            tries.push(p.replace(ORD_SLUG_RE, `$1${ORD[season]}`));
          else if (season === 1)
            tries.push(p);
          else
            tries.push(p.replace(/\/?$/, "") + `-\u0627\u0644\u0645\u0648\u0633\u0645-${ORD[season] || season}/`);
        }
        for (const sp of tries) {
          const page = yield site.get(sp);
          if (!page)
            continue;
          const list = /<ul class="episodes__list[\s\S]*?<\/ul>/.exec(page.text);
          if (!list)
            continue;
          const eps = anchors(list[0]).filter((a) => !/\/watch\/?$/.test(a.href)).map((a) => {
            const n = /epi__num[^>]*>[\s\S]*?<b>\s*(\d+)/.exec(a.inner);
            return { title: a.text || a.title, href: pathOf(a.href), n: n ? +n[1] : null };
          });
          const ep = pickEpisode(uniqBy(eps, (x) => pathKey(x.href)), episode, ctx.absolute);
          if (ep)
            return ep.href;
          ctx.log(`episode ${episode} not on ${sp} (${eps.length} eps)`);
        }
        return null;
      });
    }
    function watchLinks(site, target, ctx) {
      return __async(this, null, function* () {
        const watchPath = target.replace(/\/?$/, "/") + "watch/";
        const page = yield site.get(watchPath, { referer: site.url(target) });
        if (!page)
          return [];
        const html = page.text;
        const referer = site.url(watchPath);
        const csrf = (/csrf__token['"]?\s*:\s*['"]([^'"]+)/.exec(html) || [])[1] || "";
        const postId = (/psot_id['"]?\s*:\s*['"](\d+)/.exec(html) || [])[1] || (/data-post="(\d+)"/.exec(html) || [])[1];
        const qualities = tags(html, "li").map((t) => +attr(t.tag, "data-quality")).filter(Boolean);
        const out = [];
        const fromLi = (liHtml, q) => tags(liHtml, "li").map((t) => t.tag).filter((t) => /data-server=/.test(t)).map((t) => ({ server: attr(t, "data-server"), link: attr(t, "data-link"), q: +attr(t, "data-qu") || q, direct: attr(t, "data-direct-arabseed") === "1" }));
        const embedOf = (link) => {
          if (!link)
            return "";
          const vid = /\/vid\/\?id=([A-Za-z0-9+\/=_-]+)/.exec(link);
          if (vid)
            return b64(vid[1]);
          return link.charAt(0) === "/" ? site.url(link) : link;
        };
        const initial = fromLi(html, 0);
        const byQ = {};
        for (const s of initial)
          (byQ[s.q] = byQ[s.q] || []).push(s);
        const missing = qualities.filter((q) => !byQ[q]);
        yield Promise.all(missing.map((q) => __async(this, null, function* () {
          const r = yield site.post("/get__quality__servers/", { post_id: postId, quality: q, csrf_token: csrf }, { referer, marker: null, headers: { "X-Requested-With": "XMLHttpRequest" } });
          let j = null;
          try {
            j = r && JSON.parse(r.text);
          } catch (e) {
          }
          if (!j || j.type !== "success")
            return;
          byQ[q] = fromLi(j.html || "", q);
          if (j.server && byQ[q][0])
            byQ[q][0].link = j.server;
        })));
        const want = Object.keys(byQ).map(Number).sort((a, b) => b - a);
        const jobs = [];
        for (const q of want)
          for (const s of byQ[q].slice(0, 3))
            jobs.push(s);
        yield Promise.all(jobs.map((s) => __async(this, null, function* () {
          let link = s.link;
          if (!link) {
            const r = yield site.post("/get__watch__server/", { post_id: postId, quality: s.q, server: s.server, csrf_token: csrf }, { referer, marker: null, headers: { "X-Requested-With": "XMLHttpRequest" } });
            try {
              link = JSON.parse(r.text).server || "";
            } catch (e) {
              link = "";
            }
          }
          const embed = embedOf(link);
          if (embed)
            out.push({ embed, referer, q: s.q, label: s.direct ? "ArabSeed direct" : "" });
        })));
        out.sort((a, b) => b.q - a.q);
        return uniqBy(out, (x) => x.embed);
      });
    }
  },
  /* 14: src/sources/3isk.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf, makeJar } = __req2(2);
    const { anchors, attr, tags } = __req2(5);
    const { rank, queries, episodeOf, seasonOf } = __req2(8);
    const { uniqBy, pathKey } = __req2(9);
    module2.exports = {
      id: "3isk",
      name: "3isk",
      types: ["tv"],
      bases: ["https://ww4.3ick.club", "https://3esk.onl", "https://ww5.3ick.club", "https://3iskk.xyz", "https://esheaq.onl"],
      applies: (info) => info.isTurkish || info.lang === "ar" || info.lang === "tr",
      links(ctx) {
        return __async(this, null, function* () {
          const site = mirrorSite({ name: "3isk", bases: this.bases, marker: /قصة عشق|3isk|3ick|theme3sk/i, sameSite: /3ick|3esk|3isk|esheaq/i, log: ctx.log });
          const { info } = ctx;
          let pool = [];
          for (const q of queries(info, 3)) {
            const r = yield site.get(`/?s=${encodeURIComponent(q)}`);
            if (!r)
              continue;
            pool = uniqBy(pool.concat(anchors(r.text).filter((a) => /\/tvshows\//.test(a.href) && (a.title || a.text)).map((a) => ({ title: a.title || a.text, href: pathOf(a.href) }))), (x) => pathKey(x.href));
            if (rank(pool, info, { minScore: 90 }).length)
              break;
          }
          const shows = rank(pool, info, { minScore: 80 }).filter((s) => {
            const n = seasonOf(s.title);
            return n == null || n === ctx.season;
          }).sort((a, b) => (/مدبلج/.test(a.title) ? 1 : 0) - (/مدبلج/.test(b.title) ? 1 : 0) || b.score - a.score);
          ctx.log(`candidates: ${shows.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
          const out = [];
          for (const show of shows.slice(0, 2)) {
            const page = yield site.get(show.href);
            if (!page)
              continue;
            const eps = uniqBy(anchors(page.text).filter((a) => /\/watch\/episodes\//.test(a.href)).map((a) => ({ href: pathOf(a.href), n: episodeOf(a.title || a.text) })), (x) => pathKey(x.href)).filter((x) => x.n);
            const perSeason = seasonOf(show.title) != null;
            const want = perSeason ? [ctx.episode] : [ctx.absolute, ctx.episode];
            let ep = null;
            for (const n of want) {
              ep = eps.find((x) => x.n === n);
              if (ep)
                break;
            }
            if (!ep) {
              ctx.log(`episode ${want.join("/")} not in ${eps.length} eps of ${show.title}`);
              continue;
            }
            const label = /مدبلج/.test(show.title) ? "\u0645\u062F\u0628\u0644\u062C" : "\u0645\u062A\u0631\u062C\u0645";
            out.push.apply(out, yield episodeEmbeds(site, ep.href, label));
            if (out.length >= 4)
              break;
          }
          return out;
        });
      }
    };
    function episodeEmbeds(site, epPath, label) {
      return __async(this, null, function* () {
        const jar = makeJar();
        const ep = yield site.get(epPath, { jar });
        if (!ep)
          return [];
        const seePath = epPath.replace(/\/?$/, "/") + "see/";
        const see = yield site.get(seePath, { jar, referer: site.url(epPath) });
        if (!see)
          return [];
        const servers = tags(see.text, "li").map((t) => t.tag).filter((t) => /server_nth/.test(t)).map((t) => ({ post: attr(t, "data-post"), nume: attr(t, "data-nume") })).filter((s) => s.post);
        const frame = /<iframe[^>]+id=["']iframe_player["'][^>]+src=["']([^"']+)["']/i.exec(see.text) || /<iframe[^>]+src=["']([^"']*\/embed\/[^"']+)["']/i.exec(see.text);
        const tpl = frame ? pathOf(frame[1]) : "";
        const paths = servers.length && /\/embed\/\d+\/\d+\/\d+/.test(tpl) ? servers.map((s) => tpl.replace(/\/embed\/(\d+)\/\d+\/\d+/, `/embed/$1/${s.post}/${s.nume}`)) : tpl ? [tpl] : [];
        const referer = site.url(seePath);
        const embeds = yield Promise.all(paths.slice(0, 5).map((p) => __async(this, null, function* () {
          const r = yield site.get(p, { jar, referer, marker: null });
          const m = r && /<iframe[^>]+src=["']([^"']+)["']/i.exec(r.text);
          return m ? { embed: m[1], referer: site.url(p), label } : null;
        })));
        return uniqBy(embeds.filter(Boolean), (x) => x.embed);
      });
    }
  },
  /* 15: src/sources/laroza.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf } = __req2(2);
    const { anchors, attr, tags } = __req2(5);
    const { rank, queries, seasonOf, episodeOf } = __req2(8);
    const { pickEpisode, uniqBy, pathKey } = __req2(9);
    const vidOf = (href) => (/vid=([A-Za-z0-9_-]+)/.exec(href) || [])[1] || "";
    module2.exports = {
      id: "laroza",
      name: "Laroza",
      types: ["movie", "tv"],
      bases: ["https://laroza1.lat"],
      links(ctx) {
        return __async(this, null, function* () {
          const site = mirrorSite({ name: "Laroza", bases: this.bases, marker: /لاروزا|laroza/i, sameSite: /laroza/i, log: ctx.log });
          const { info } = ctx;
          const isMovie = info.type === "movie";
          let pool = [];
          for (const q of queries(info, 3)) {
            const r = yield site.get(`/search.php?keywords=${encodeURIComponent(q)}`);
            if (!r)
              break;
            pool = uniqBy(pool.concat(anchors(r.text).filter((a) => /video\.php\?vid=/.test(a.href) && a.title).map((a) => ({ title: a.title, vid: vidOf(a.href) })).filter((c) => isMovie ? /فيلم|film/i.test(c.title) : !/فيلم/.test(c.title))), (c) => c.vid);
            if (rank(pool, info, { minScore: 100 }).length)
              break;
          }
          const ranked = rank(pool, info, { minScore: 80, yearSlack: isMovie ? 1 : 99 });
          ctx.log(`candidates: ${ranked.slice(0, 3).map((c) => `${c.title}(${c.score})`).join(", ") || "none"}`);
          if (!ranked.length)
            return [];
          let vid = null;
          if (isMovie) {
            vid = ranked[0].vid;
          } else {
            const fits = (c) => (seasonOf(c.title) || 1) === ctx.season;
            const direct = ranked.find((c) => fits(c) && episodeOf(c.title) === ctx.episode);
            if (direct)
              vid = direct.vid;
            else {
              const any = ranked.find(fits) || ranked[0];
              const page = yield site.get(`/video.php?vid=${any.vid}`);
              if (!page)
                return [];
              const seasons = tags(page.text, "li").map((t) => t.tag).filter((t) => /data-serie=/.test(t)).map((t) => attr(t, "data-serie"));
              const key = seasons.length > 1 ? String(ctx.season) : seasons[0] || "1";
              const box = new RegExp(`<div class="SeasonsEpisodes"[^>]*data-serie="${key}"[^>]*>([\\s\\S]*?)</div>`).exec(page.text);
              const eps = anchors(box ? box[1] : "").map((a) => {
                const n = /<em>\s*(\d+)\s*<\/em>/.exec(a.inner);
                return { title: a.title || a.text, href: a.href, vid: vidOf(a.href), n: n ? +n[1] : null };
              });
              const ep = pickEpisode(eps, ctx.episode, seasons.length <= 1 ? ctx.absolute : null);
              if (!ep) {
                ctx.log(`episode ${ctx.episode} not in season tab ${key} (${eps.length} eps)`);
                return [];
              }
              vid = ep.vid;
            }
          }
          if (!vid)
            return [];
          const referer = site.url(`/video.php?vid=${vid}`);
          const play = yield site.get(`/play.php?vid=${vid}`, { referer });
          if (!play)
            return [];
          const embeds = tags(play.text, "li").map((t) => attr(t.tag, "data-embed-url")).filter((u) => /^https?:/.test(u));
          return uniqBy(embeds.map((e) => ({ embed: e, referer: site.url(`/play.php?vid=${vid}`) })), (x) => pathKey(x.embed) + x.embed);
        });
      }
    };
  },
  /* 16: src/sources/anime4up.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf, request, originOf } = __req2(2);
    const { anchors, attr, tags, decodeUri } = __req2(5);
    const { episodeOf } = __req2(8);
    const { uniqBy, pathKey } = __req2(9);
    const { rankAnime, pickEntry, animeQueries } = __req2(17);
    const LANDINGS = ["https://anime4up.bond"];
    function discover(log) {
      return __async(this, null, function* () {
        for (const l of LANDINGS) {
          try {
            const r = yield request(l + "/", { timeout: 8e3, retries: 1 });
            const hrefs = anchors(r.text).map((a) => a.href).filter((h) => /\/anime-type\/|%d9%82%d8%a7%d8%a6%d9%85%d8%a9|\/episode\//i.test(h));
            const o = hrefs.length ? originOf(hrefs[0]) : "";
            if (o)
              return o;
          } catch (e) {
            log(`landing ${l}: ${e.message}`);
          }
        }
        return null;
      });
    }
    module2.exports = {
      id: "anime4up",
      name: "Anime4up",
      types: ["movie", "tv"],
      bases: ["https://4f.gnli129.shop", "https://w1.anime4up.rest", "https://anime4up.cam"],
      applies: (info) => info.isAnime,
      links(ctx) {
        return __async(this, null, function* () {
          const found = yield discover(ctx.log);
          const bases = found ? [found].concat(this.bases.filter((b) => b !== found)) : this.bases;
          const site = mirrorSite({ name: "Anime4up", bases, marker: /anime4up|انمي فور اب/i, log: ctx.log });
          let pool = [];
          for (const q of animeQueries(ctx.info)) {
            const r = yield site.get(`/?search_param=animes&s=${encodeURIComponent(q)}`);
            if (!r)
              continue;
            pool = uniqBy(pool.concat(anchors(r.text).filter((a) => /\/anime\//.test(a.href) && a.text).map((a) => ({ title: a.text, href: pathOf(a.href) }))), (x) => pathKey(x.href));
            if (pickEntry(rankAnime(pool, ctx.info).filter((c) => c.score >= 100), ctx))
              break;
          }
          const scored = rankAnime(pool, ctx.info);
          const pick = pickEntry(scored, ctx);
          ctx.log(`candidates: ${scored.slice(0, 4).map((c) => `${c.title}(${c.score})`).join(", ") || "none"} -> ${pick ? `${pick.entry.title} ep ${pick.episode}` : "-"}`);
          if (!pick)
            return [];
          const ep = pick.episode;
          const page = yield site.get(pick.entry.href);
          if (!page)
            return [];
          const mal = (/myanimelist\.net\/anime\/(\d+)/.exec(page.text) || [])[1];
          const referer = site.url(pick.entry.href);
          const out = [];
          if (mal) {
            for (const s of ["S1", "S2"])
              out.push({ embed: site.url(`/Anime4up-${s}/mal/${mal}/${ep}/sub/`), referer, label: `server ${s}`, host: "Anime4up" });
          }
          const epLink = anchors(page.text).filter((a) => /\/episode\//.test(a.href)).map((a) => ({ href: pathOf(a.href), n: episodeOf(a.text) || episodeOf(decodeUri(a.href)) })).find((x) => x.n === ep);
          if (epLink) {
            const epPage = yield site.get(epLink.href);
            if (epPage) {
              for (const t of tags(epPage.text, "li")) {
                const w = attr(t.tag, "data-watch");
                if (w && !/\/Anime4up-S\d\//.test(w))
                  out.push({ embed: w, referer: site.url(epLink.href) });
              }
            }
          }
          return uniqBy(out, (x) => x.embed);
        });
      }
    };
  },
  /* 17: src/lib/anime.js */
  function(module2, exports2, __req2) {
    const { normAr, seasonOf, rank, queries } = __req2(8);
    const { uniqBy } = __req2(9);
    const ORD_EN = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
    function animeSeason(title) {
      const t = normAr(title);
      let m = /(\d+)(?:st|nd|rd|th)\s+season/.exec(t) || /season\s*(\d+)/.exec(t) || /\bs(\d+)\b/.exec(t);
      if (m)
        return +m[1];
      m = /(first|second|third|fourth|fifth|sixth)\s+season/.exec(t);
      if (m)
        return ORD_EN[m[1]];
      return seasonOf(title) || null;
    }
    const isExtra = (t) => /recap|special|\bova\b|\bona\b|movie|film|فيلم|\b0\b|picture drama|fanmeeting|- part/i.test(t);
    const SEASON_WORDS = /\b\d+(?:st|nd|rd|th)\s+season\b|\bseason\s*\d+\b|\((?:tv)\)/gi;
    function rankAnime(pool, info) {
      return rank(pool.map((p) => Object.assign({}, p, { raw: p.title, title: p.title.replace(SEASON_WORDS, " ") })), info, { minScore: 80, yearSlack: 99 }).map((p) => Object.assign(p, { title: p.raw, season: animeSeason(p.raw) }));
    }
    function pickEntry(scored, ctx) {
      const isMovie = ctx.info.type === "movie";
      if (isMovie) {
        const e = scored.find((c) => /movie|film|فيلم/i.test(c.title)) || scored[0];
        return e ? { entry: e, episode: 1 } : null;
      }
      const main = scored.filter((c) => !isExtra(c.title));
      let entry = main.find((c) => c.season === ctx.season) || (ctx.season === 1 ? main.find((c) => c.season == null) : null);
      if (entry)
        return { entry, episode: ctx.episode };
      entry = main.find((c) => c.season == null);
      return entry ? { entry, episode: ctx.absolute || ctx.episode } : null;
    }
    function animeQueries(info) {
      return uniqBy([info.romaji].concat(queries(info, 6)).filter((q) => q && /^[\x20-\x7e]+$/.test(q)), (q) => q.toLowerCase()).slice(0, 4);
    }
    module2.exports = { animeSeason, isExtra, rankAnime, pickEntry, animeQueries };
  },
  /* 18: src/sources/witanime.js */
  function(module2, exports2, __req2) {
    const { mirrorSite, pathOf } = __req2(2);
    const { anchors, attr, tags, decodeUri } = __req2(5);
    const { episodeOf } = __req2(8);
    const { uniqBy, pathKey } = __req2(9);
    const { rankAnime, pickEntry, animeQueries } = __req2(17);
    module2.exports = {
      id: "witanime",
      name: "WitAnime",
      types: ["movie", "tv"],
      bases: ["https://witanime.onl", "https://witanime.site", "https://witanime.com"],
      applies: (info) => info.isAnime,
      links(ctx) {
        return __async(this, null, function* () {
          const site = mirrorSite({ name: "WitAnime", bases: this.bases, marker: /witanime/i, sameSite: /witanime/i, log: ctx.log });
          let pool = [];
          for (const q of animeQueries(ctx.info)) {
            const r = yield site.get(`/?search_param=animes&s=${encodeURIComponent(q)}`);
            if (!r)
              continue;
            pool = uniqBy(pool.concat(anchors(r.text).filter((a) => /\/anime\/[^\/]+\/?$/.test(a.href) && (a.text || a.title)).map((a) => ({ title: a.text || a.title, href: pathOf(a.href) }))), (x) => pathKey(x.href));
            if (pickEntry(rankAnime(pool, ctx.info).filter((c) => c.score >= 100), ctx))
              break;
          }
          const scored = rankAnime(pool, ctx.info);
          const pick = pickEntry(scored, ctx);
          ctx.log(`candidates: ${scored.slice(0, 4).map((c) => `${c.title}(${c.score})`).join(", ") || "none"} -> ${pick ? `${pick.entry.title} ep ${pick.episode}` : "-"}`);
          if (!pick)
            return [];
          const page = yield site.get(pick.entry.href);
          if (!page)
            return [];
          const eps = uniqBy(anchors(page.text).filter((a) => /\/episode\//.test(a.href)).map((a) => ({ href: pathOf(a.href), n: episodeOf(a.text) || episodeOf(decodeUri(a.href)) })), (x) => pathKey(x.href));
          const ep = eps.find((x) => x.n === pick.episode) || (ctx.info.type === "movie" ? eps[0] : null);
          if (!ep) {
            ctx.log(`episode ${pick.episode} not among ${eps.length}`);
            return [];
          }
          const epPage = yield site.get(ep.href);
          if (!epPage)
            return [];
          const referer = site.url(ep.href);
          return uniqBy(tags(epPage.text, "a").map((t) => t.tag).filter((t) => /episode-server/.test(t)).map((t) => ({ embed: attr(t, "data-url"), referer })).filter((x) => /^https?:/.test(x.embed)), (x) => x.embed);
        });
      }
    };
  }
];
var __cache = {};
function __req(i) {
  if (__cache[i])
    return __cache[i].exports;
  var m = __cache[i] = { exports: {} };
  __mods[i](m, m.exports, __req);
  return m.exports;
}
var __hub = __req(0);
function getStreams(tmdbId, mediaType, season, episode) {
  return __hub.getStreams(tmdbId, mediaType, season, episode);
}
module.exports = { getStreams };
