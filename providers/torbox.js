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
  /* 0: src/torbox/index.js */
  function(module2, exports2, __req2) {
    const { tmdbInfo, absoluteEpisode } = __req2(1);
    const { request } = __req2(2);
    const R = __req2(3);
    const API = "https://api.torbox.app/v1/api";
    const MAX_STREAMS = 12;
    const PRE_RESOLVE_LIMIT = 6;
    const log = (...a) => console.log("[TorBox]", ...a);
    const KINDS = [
      { kind: "torrents", label: "Torrent", idParam: "torrent_id" },
      { kind: "usenet", label: "Usenet", idParam: "usenet_id" },
      { kind: "webdl", label: "Web", idParam: "web_id" }
    ];
    function settings() {
      const g = typeof globalThis !== "undefined" ? globalThis : {};
      const embedded = g.TORBOX_EMBEDDED_SETTINGS && typeof g.TORBOX_EMBEDDED_SETTINGS === "object" ? g.TORBOX_EMBEDDED_SETTINGS : {};
      const s = g.SCRAPER_SETTINGS && typeof g.SCRAPER_SETTINGS === "object" ? g.SCRAPER_SETTINGS : {};
      const out = Object.assign({}, embedded);
      for (const k of Object.keys(s))
        if (s[k] !== "" && s[k] != null)
          out[k] = s[k];
      return out;
    }
    function onSettings2() {
      return [
        { type: "header", label: "TorBox" },
        {
          type: "text",
          key: "apiKey",
          label: "TorBox API key",
          isPassword: true,
          placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
          description: "torbox.app > Settings > Account > API key. Only files already in your TorBox library are listed."
        },
        {
          type: "select",
          key: "linkMode",
          label: "Link",
          defaultValue: "live",
          options: [
            { label: "Fresh at play time (never expires)", value: "live" },
            { label: "Fetched while searching (API key not in the stream URL)", value: "resolved" }
          ],
          description: "Fresh links can't go stale. Fetched links stay valid for a few hours."
        },
        { type: "info", label: "Add a release to TorBox first (dashboard search or a magnet), then open the title in Nuvio." }
      ];
    }
    const enc = (s) => encodeURIComponent(String(s));
    function apiJson(path, key) {
      return __async(this, null, function* () {
        const r = yield request(`${API}${path}`, { json: true, timeout: 2e4, retries: 1, headers: { Authorization: `Bearer ${key}` } });
        let d = null;
        try {
          d = JSON.parse(r.text);
        } catch (e) {
        }
        if (r.status === 401 || r.status === 403)
          throw new Error(`TorBox rejected the API key (${r.status})`);
        if (!d || d.success === false)
          throw new Error(`TorBox ${path.split("?")[0]}: ${d && (d.detail || d.error) || r.status}`);
        return d.data;
      });
    }
    function library(key) {
      return __async(this, null, function* () {
        const out = [];
        for (const k of KINDS) {
          try {
            const items = yield apiJson(`/${k.kind}/mylist?bypass_cache=true`, key);
            for (const it of Array.isArray(items) ? items : [])
              out.push({ k, it });
          } catch (e) {
            if (/API key/.test(e.message))
              throw e;
            log(`${k.kind}: ${e.message}`);
          }
        }
        return out;
      });
    }
    const ready = (it) => it.download_present === true || it.download_finished === true || it.cached === true && it.download_state === "cached";
    function matches(lib, info, type, season, episode) {
      const keys = R.wantedKeys(info);
      const abs = type === "tv" ? absoluteEpisode(info, season, episode) : null;
      const out = [];
      for (const { k, it } of lib) {
        if (!ready(it))
          continue;
        const pack = R.parseRelease(it.name);
        const packScore = R.titleMatch(pack, keys);
        for (const f of it.files || []) {
          const path = f.name || f.short_name || "";
          if (!R.VIDEO_EXT.test(path) && !/^video\//.test(f.mimetype || ""))
            continue;
          if (/(?:^|[\/._ -])sample(?:[\/._ -]|$)/i.test(path) || /(?:^|[\/._ -])(?:trailer|featurette|extras?)(?:[\/._ -]|$)/i.test(path))
            continue;
          const rel = R.parseRelease(path);
          const score = Math.max(packScore, R.titleMatch(rel, keys));
          if (!score)
            continue;
          const year = rel.year || pack.year;
          if (type === "movie") {
            if (R.looksLikeSeries(path, it.name))
              continue;
            if (year && info.year && Math.abs(year - info.year) > 1)
              continue;
            if (score === 1 && info.year && !year)
              continue;
          } else {
            const ep = R.episodeInfo(path, it.name);
            if (!ep)
              continue;
            const seasonOk = ep.season == null ? season === 1 || ep.episode === abs : ep.season === season;
            const epOk = episode >= ep.episode && episode <= ep.last || ep.season == null && ep.episode === abs;
            if (!seasonOk || !epOk)
              continue;
          }
          out.push({ k, it, f, path, score });
        }
      }
      return out;
    }
    function fmtSize(b) {
      if (!b)
        return "";
      return b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`;
    }
    function liveUrl(m, key) {
      return `${API}/${m.k.kind}/requestdl?token=${enc(key)}&${m.k.idParam}=${enc(m.it.id)}&file_id=${enc(m.f.id)}&redirect=true`;
    }
    function resolvedUrl(m, key) {
      return __async(this, null, function* () {
        return apiJson(`/${m.k.kind}/requestdl?token=${enc(key)}&${m.k.idParam}=${enc(m.it.id)}&file_id=${enc(m.f.id)}`, key);
      });
    }
    function getStreams2(tmdbId, mediaType, seasonNum, episodeNum) {
      return __async(this, null, function* () {
        const type = /^(?:tv|series|show|tvshow|episode)$/i.test(String(mediaType || "")) ? "tv" : "movie";
        const season = type === "tv" ? +seasonNum || 1 : null;
        const episode = type === "tv" ? +episodeNum || 1 : null;
        const st = settings();
        const key = String(st.apiKey || "").trim();
        if (!key) {
          log("no API key: open Nuvio > Settings > Plugins > TorBox settings");
          return [];
        }
        let info;
        try {
          info = yield tmdbInfo(tmdbId, type);
        } catch (e) {
          log(`tmdb failed: ${e && e.message}`);
          return [];
        }
        let lib;
        try {
          lib = yield library(key);
        } catch (e) {
          log(e.message);
          return [];
        }
        let raw = matches(lib, info, type, season, episode);
        if (!raw.length) {
          const bases = [];
          for (const t of info.titles || []) {
            const b = R.sequelBase(t);
            if (b && bases.indexOf(b) < 0)
              bases.push(b);
          }
          if (bases.length) {
            raw = matches(lib, Object.assign({}, info, { titles: bases }), type, season, episode).map((m) => Object.assign(m, { via: bases[0] }));
            if (raw.length)
              log(`no match for "${info.title}", using parent title ${bases.join(" / ")}`);
          }
        }
        const found = raw.map((m) => Object.assign(m, { q: R.qualityOf(m.path) || R.qualityOf(m.it.name), size: m.f.size || 0 })).sort((a, b) => b.score - a.score || b.q - a.q || b.size - a.size);
        const label = type === "movie" ? `${info.title}${info.year ? ` (${info.year})` : ""}` : `${info.title} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
        log(`${label}: ${lib.length} library items, ${found.length} matching files`);
        const seen = {};
        const streams = [];
        let resolvedCount = 0;
        for (const m of found) {
          const id = `${m.k.kind}:${m.it.id}:${m.f.id}`;
          if (seen[id])
            continue;
          seen[id] = 1;
          if (streams.length >= MAX_STREAMS)
            break;
          let url = liveUrl(m, key);
          if (st.linkMode === "resolved") {
            if (resolvedCount >= PRE_RESOLVE_LIMIT)
              break;
            try {
              url = yield resolvedUrl(m, key);
              resolvedCount++;
            } catch (e) {
              log(`link for ${m.path}: ${e.message}`);
              continue;
            }
          }
          const quality = m.q ? `${m.q}p` : "Auto";
          const tags = R.tagsOf(m.path + " " + m.it.name);
          const details = [quality, fmtSize(m.size), m.k.label].concat(tags).filter(Boolean).join(" \xB7 ");
          streams.push({
            name: "TorBox",
            title: `${R.baseName(m.path)}
${details}`,
            url,
            quality,
            // Nuvio's TV app shows `size` as the stream's description line (verbatim), so make it readable
            size: [fmtSize(m.size), m.k.label].concat(tags).filter(Boolean).join(" \xB7 ") + (m.via ? ` \xB7 matched as ${m.via}` : "") + `
${R.baseName(m.path)}`,
            headers: {},
            provider: "torbox"
          });
        }
        return streams;
      });
    }
    module2.exports = { getStreams: getStreams2, onSettings: onSettings2, matches };
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
  /* 3: src/torbox/release.js */
  function(module2, exports2, __req2) {
    const { normAr } = __req2(4);
    const { arabicSkeleton, latinSkeleton } = __req2(6);
    const VIDEO_EXT = /\.(?:mkv|mp4|m4v|avi|mov|wmv|ts|m2ts|webm|mpg|mpeg|flv)$/i;
    const STOP = /^(?:(?:19|20)\d{2}|s\d{1,2}(?:e\d{1,4})?|\d{1,2}x\d{1,3}|season|series|complete|ep?\d{1,4}|episode|part|\d{3,4}p|4k|uhd|hdr|web|webrip|web-?dl|bluray|blu-ray|bdrip|brrip|hdrip|dvdrip|hdtv|remux|x26[45]|h26[45]|hevc|avc|repack|proper|extended|uncut|imax|multi|dual|arabic|ar|الموسم|الحلقه|حلقه)$/i;
    function baseName(path) {
      return String(path || "").split("/").pop().replace(VIDEO_EXT, "");
    }
    function stripPrefix(name) {
      return String(name || "").replace(/^\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】)[\s._-]*/g, "").replace(/^\s*www\.[^\s]+\s*-\s*/i, "").trim();
    }
    function parseRelease(rawName) {
      const name = stripPrefix(baseName(rawName));
      const tokens = normAr(name).replace(/[()[\]{}]/g, " ").split(/[\s._]+|-(?=[a-z؀-ۿ])/i).filter(Boolean);
      const title = [];
      for (let i = 0; i < tokens.length; i++) {
        const yearInTitle = /^(?:19|20)\d{2}$/.test(tokens[i]) && /^(?:19|20)\d{2}$/.test(tokens[i + 1] || "");
        if (STOP.test(tokens[i]) && title.length && !yearInTitle)
          break;
        title.push(tokens[i]);
      }
      const plain = normAr(name).replace(/[._]/g, " ");
      const ym = /(?:^|[^\d])((?:19|20)\d{2})(?!\d)/.exec(plain.slice(title.join(" ").length));
      return { title: title.join(" ").replace(/[^\w؀-ۿ ]+/g, " ").replace(/\s+/g, " ").trim(), year: ym ? +ym[1] : null };
    }
    function episodeInfo(path, packName) {
      const s = normAr(String(path || "")).replace(/[._]/g, " ");
      let m = /\bs(\d{1,2})\s?e(\d{1,4})(?:-?e(\d{1,4})|-(\d{1,3})(?![\dp]))?/i.exec(s);
      if (m) {
        const last = +(m[3] || m[4] || m[2]);
        return { season: +m[1], episode: +m[2], last: last >= +m[2] && last - +m[2] < 10 ? last : +m[2] };
      }
      m = /\b(\d{1,2})x(\d{1,3})\b/.exec(s);
      if (m)
        return { season: +m[1], episode: +m[2], last: +m[2] };
      m = /season\s?(\d{1,2})\s?(?:episode|ep)\s?(\d{1,4})/i.exec(s);
      if (m)
        return { season: +m[1], episode: +m[2], last: +m[2] };
      const packSeason = (() => {
        const p = normAr(String(packName || "") + " " + s).replace(/[._]/g, " ");
        const k = /\bs(\d{1,2})\b|season\s?(\d{1,2})/i.exec(p);
        return k ? +(k[1] || k[2]) : null;
      })();
      m = /\b(?:episode|ep|e)\s?(\d{1,4})\b/i.exec(baseName(s)) || /(?:الحلقه|حلقه)\s?(\d{1,4})/.exec(baseName(s)) || /\s-\s(\d{1,4})(?:\s|$)/.exec(baseName(s));
      if (m)
        return { season: packSeason, episode: +m[1], last: +m[1] };
      return null;
    }
    function looksLikeSeries(path, packName) {
      const s = (String(packName || "") + " " + String(path || "")).replace(/[._]/g, " ");
      return /\bs\d{1,2}(?:e\d{1,4})?\b|\bseason\s?\d|\b\d{1,2}x\d{2}\b|\bcomplete series\b|الموسم|الحلقه|الحلقة/i.test(s);
    }
    const latinKey = (s) => normAr(s).replace(/&/g, " and ").replace(/[^a-z0-9؀-ۿ]+/g, " ").replace(/^(?:the|a)\s+/, "").trim();
    function wantedKeys(info) {
      const exact = {};
      const skel = {};
      for (const t of info.titles || []) {
        const k = latinKey(t);
        if (k)
          exact[k] = 1;
        const head = latinKey(String(t).split(/[:\-–]/)[0]);
        if (head && head.length >= 4 && head !== k)
          exact[head] = 1;
        const sk = /[؀-ۿ]/.test(t) ? arabicSkeleton(t) : latinSkeleton(t);
        if (sk && sk.replace(/ /g, "").length >= 2)
          skel[sk] = 1;
      }
      return { exact, skel };
    }
    function titleMatch(release, keys) {
      if (!release.title)
        return 0;
      if (keys.exact[latinKey(release.title)])
        return 2;
      const sk = /[؀-ۿ]/.test(release.title) ? arabicSkeleton(release.title) : latinSkeleton(release.title);
      return sk && keys.skel[sk] ? 1 : 0;
    }
    function sequelBase(title) {
      const t = String(title || "").trim();
      const ar = /^(.{2,}?)\s+(?:ال)?(?:تاني|تانى|ثاني|ثانى|٢)$/.exec(normAr(t));
      if (ar)
        return ar[1].trim();
      const la = /^(.{2,}?)\s+(?:(?:el|al)[\s-]+(?:tani|tany|thani|thany)|2|ii|part\s*(?:2|two|ii))$/i.exec(t);
      return la ? la[1].trim() : null;
    }
    function qualityOf(name) {
      const s = String(name || "");
      if (/\b(?:2160p|4k|uhd)\b/i.test(s))
        return 2160;
      if (/\b1440p\b/i.test(s))
        return 1440;
      if (/\b1080[pi]\b/i.test(s))
        return 1080;
      if (/\b720p\b/i.test(s))
        return 720;
      if (/\b576p\b/i.test(s))
        return 576;
      if (/\b480p\b/i.test(s))
        return 480;
      if (/\b360p\b/i.test(s))
        return 360;
      return 0;
    }
    function tagsOf(name) {
      const s = String(name || "");
      const tags = [];
      if (/\b(?:dv|dovi|dolby\s?vision)\b/i.test(s))
        tags.push("DV");
      if (/\bhdr10\+|\bhdr10plus\b/i.test(s))
        tags.push("HDR10+");
      else if (/\bhdr(?:10)?\b/i.test(s))
        tags.push("HDR");
      if (/\b(?:x265|h\.?265|hevc)\b/i.test(s))
        tags.push("HEVC");
      else if (/\bav1\b/i.test(s))
        tags.push("AV1");
      if (/\bremux\b/i.test(s))
        tags.push("REMUX");
      else if (/\bblu-?ray\b/i.test(s))
        tags.push("BluRay");
      else if (/\bweb-?dl\b/i.test(s))
        tags.push("WEB-DL");
      else if (/\bwebrip\b/i.test(s))
        tags.push("WEBRip");
      if (/\batmos\b/i.test(s))
        tags.push("Atmos");
      return tags;
    }
    module2.exports = { VIDEO_EXT, parseRelease, episodeInfo, looksLikeSeries, wantedKeys, titleMatch, sequelBase, qualityOf, tagsOf, baseName };
  },
  /* 4: src/lib/match.js */
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
      const all = [];
      for (const t of titles) {
        all.push(t);
        const head = String(t || "").split(/\s[-–—:]\s|:\s/)[0];
        if (head && head !== t)
          all.push(head);
      }
      for (const t of all) {
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
    function partOf(text) {
      const t = normAr(text);
      const m = new RegExp(`(?:\u0627\u0644\u062C\u0632\u0621|part)\\s*[:\\-]?\\s*(\\d{1,2}(?!\\d)|${ORD_ALT})`, "i").exec(t);
      if (m)
        return ordValue(m[1]) || 1;
      const tail = /(?:^|\s)([1-9])$/.exec(stripYear(cleanTitle(text)));
      return tail ? +tail[1] : 1;
    }
    function rank(cands, info, opts) {
      const o = opts || {};
      const wanted = prepWanted(info.titles.slice(0, 30));
      const minScore = o.minScore || 70;
      const slack = o.yearSlack == null ? 1 : o.yearSlack;
      const wantedPart = info.type === "movie" ? Math.max.apply(null, info.titles.slice(0, 3).map(partOf)) : null;
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
        if (s > 0 && wantedPart && partOf(c.title) !== wantedPart)
          s -= 25;
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
    module2.exports = { normAr, cleanTitle, seasonOf, episodeOf, yearIn, titleScore, prepWanted, rank, queries, partOf };
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
  /* 6: src/lib/translit.js */
  function(module2, exports2, __req2) {
    const { normAr } = __req2(4);
    const AR = {
      "\u0628": "b",
      "\u062A": "t",
      "\u062B": "t",
      "\u062C": "g",
      "\u062D": "h",
      "\u062E": "k",
      "\u062F": "d",
      "\u0630": "d",
      "\u0631": "r",
      "\u0632": "d",
      "\u0633": "s",
      "\u0634": "s",
      "\u0635": "s",
      "\u0636": "d",
      "\u0637": "t",
      "\u0638": "d",
      "\u063A": "g",
      "\u0641": "f",
      "\u0642": "k",
      "\u0643": "k",
      "\u0644": "l",
      "\u0645": "m",
      "\u0646": "n",
      "\u0647": "h",
      "\u067E": "b",
      "\u0686": "g",
      "\u06A4": "f",
      "\u06AF": "g"
    };
    const collapse = (s) => s.replace(/(.)\1+/g, "$1");
    function arabicSkeleton(text) {
      const words = normAr(text).split(/[^؀-ۿ]+/).filter(Boolean);
      return words.map((w) => {
        let x = w;
        if (x.length > 3 && x.slice(0, 2) === "\u0627\u0644")
          x = x.slice(2);
        else if (x.length > 4 && (x.slice(0, 3) === "\u0648\u0627\u0644" || x.slice(0, 3) === "\u0628\u0627\u0644"))
          x = x.slice(3);
        if (x.length > 2 && x.slice(-1) === "\u0647")
          x = x.slice(0, -1);
        return collapse(x.split("").map((c) => AR[c] || "").join(""));
      }).filter(Boolean).join(" ");
    }
    function latinSkeleton(text) {
      const words = String(text || "").toLowerCase().replace(/[`'’3]/g, "").split(/[^a-z]+/).filter(Boolean);
      return words.filter((w) => !/^(?:al|el|il|ul)$/.test(w)).map((w) => {
        let x = w.replace(/^(?:al|el)-/, "");
        x = x.replace(/kh/g, "k").replace(/sh/g, "s").replace(/ch/g, "s").replace(/th/g, "t").replace(/dh/g, "d").replace(/gh/g, "g");
        x = x.replace(/([aeiou])h$/, "$1");
        x = x.replace(/j/g, "g").replace(/[qc]/g, "k").replace(/z/g, "d").replace(/v/g, "f").replace(/p/g, "b").replace(/x/g, "ks");
        return collapse(x.replace(/[aeiouyw]/g, ""));
      }).filter(Boolean).join(" ");
    }
    module2.exports = { arabicSkeleton, latinSkeleton };
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
var __main = __req(0);
function getStreams(tmdbId, mediaType, season, episode) {
  return __main.getStreams(tmdbId, mediaType, season, episode);
}
var onSettings = __main.onSettings;
module.exports = onSettings ? { getStreams, onSettings } : { getStreams };
