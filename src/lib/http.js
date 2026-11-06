// HTTP helpers that only rely on the global fetch Nuvio gives scrapers (no AbortController, no URL,
// no redirect:"manual" - React Native's fetch always follows redirects).

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Nuvio's plugin runtime has NO timers (`setTimeout is not defined`, seen in the TV's logcat). With
// timers, use them; without, delays are skipped (busy-waiting would freeze every parallel source) and
// time limits fall back to Nuvio's own fetch timeout plus the Date.now() deadline below.
const HAS_TIMERS = typeof setTimeout === "function";
const sleep = (ms) => (HAS_TIMERS ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

// request-wide deadline: once passed, no new HTTP request starts (works without timers)
let deadline = 0;
const setDeadline = (ms) => { deadline = ms ? Date.now() + ms : 0; };
const pastDeadline = () => deadline > 0 && Date.now() > deadline;

// Every finished request (ok or failed) "ticks". Without timers this is the only moment code gets to
// run, so the hub listens to ticks to stop waiting for hung requests once the deadline has passed.
const tickers = [];
const onTick = (fn) => { tickers.push(fn); return () => { const i = tickers.indexOf(fn); if (i >= 0) tickers.splice(i, 1); }; };
const tick = () => { for (const fn of tickers.slice()) { try { fn(); } catch (e) {} } };

function withTimeout(promise, ms, label) {
  if (!HAS_TIMERS) return promise;
  let t;
  const timer = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`timeout ${ms}ms${label ? " " + label : ""}`)), ms);
  });
  return Promise.race([promise, timer]).then(
    (v) => { clearTimeout(t); return v; },
    (e) => { clearTimeout(t); throw e; }
  );
}

const encChar = (c) => { try { return encodeURIComponent(c); } catch (e) { return ""; } };
// keep URLs ASCII (Arabic slugs, spaces) without double-encoding existing %XX
const safeUrl = (s) => String(s || "").replace(/[^\x21-\x7e]/g, encChar);

const ORIGIN_RE = /^(https?:)\/\/([^\/?#]+)/i;
const originOf = (u) => { const m = ORIGIN_RE.exec(String(u || "")); return m ? `${m[1]}//${m[2]}` : ""; };
const hostOf = (u) => { const m = ORIGIN_RE.exec(String(u || "")); return m ? m[2].toLowerCase() : ""; };

function absUrl(src, base) {
  const s = String(src || "").trim().replace(/\\\//g, "/");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.slice(0, 2) === "//") return ((ORIGIN_RE.exec(base || "") || [])[1] || "https:") + s;
  const o = originOf(base);
  if (!o) return s;
  if (s.charAt(0) === "/") return o + s;
  const dir = String(base).replace(/[?#].*$/, "").replace(/[^\/]*$/, "");
  return dir + s;
}

// "https://x.y/a/b?c=1#h" -> "/a/b?c=1" (relative hrefs pass through)
function pathOf(u) {
  const s = String(u || "").trim();
  const m = /^(?:https?:)?\/\/[^\/?#]+([^#]*)/i.exec(s);
  if (m) return m[1] || "/";
  const p = s.replace(/#.*$/, "");
  return p.charAt(0) === "/" ? p : "/" + p;
}

function formBody(obj) {
  return Object.keys(obj).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k] == null ? "" : obj[k])}`).join("&");
}

// Minimal cookie jar (RN's native jar usually does this already; being explicit keeps Node tests honest)
function makeJar() {
  const store = {};
  return {
    take(res) {
      let raw = [];
      try {
        if (res.headers && typeof res.headers.raw === "function") raw = res.headers.raw()["set-cookie"] || [];
        else {
          const v = res.headers && res.headers.get && res.headers.get("set-cookie");
          if (v) raw = String(v).split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
        }
      } catch (e) {}
      for (const c of raw) {
        const m = /^\s*([^=;\s]+)=([^;]*)/.exec(c);
        if (m) store[m[1]] = m[2];
      }
    },
    header() {
      return Object.keys(store).map((k) => `${k}=${store[k]}`).join("; ");
    },
  };
}

/**
 * request(url, opts) -> { ok, status, url, text, headers }
 * opts: method, body (string|object -> form), headers, referer, timeout (ms), retries, jar, json
 * Network errors (TLS resets from ISP filtering are common and intermittent) are retried.
 */
async function request(url, opts) {
  const o = opts || {};
  const headers = Object.assign({
    "User-Agent": UA,
    "Accept": o.json ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.8,en;q=0.6",
  }, o.headers || {});
  if (o.referer) headers.Referer = safeUrl(o.referer);
  let body = o.body;
  if (body && typeof body === "object") {
    body = formBody(body);
    headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded; charset=UTF-8";
  }
  if (o.jar) {
    const c = o.jar.header();
    if (c) headers.Cookie = c;
  }
  const tries = (o.retries == null ? 1 : o.retries) + 1;
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    if (pastDeadline()) throw lastErr || new Error("time budget used up");
    try {
      const res = await withTimeout(fetch(safeUrl(url), { method: o.method || (body ? "POST" : "GET"), headers, body }), o.timeout || 12000, hostOf(url));
      if (o.jar) o.jar.take(res);
      // rate limited (FaselHD answers 429 after a burst): wait as told (capped) and try again
      if ((res.status === 429 || res.status === 503) && i + 1 < tries) {
        const ra = parseInt((res.headers && res.headers.get && res.headers.get("retry-after")) || "", 10);
        await sleep(Math.min(isNaN(ra) ? 1500 * (i + 1) : ra * 1000, 4000));
        continue;
      }
      const text = await withTimeout(res.text(), o.timeout || 12000, hostOf(url));
      tick();
      return { ok: res.status >= 200 && res.status < 400, status: res.status, url: res.url || url, text: String(text || ""), headers: res.headers };
    } catch (e) {
      lastErr = e;
      tick();
      if (i + 1 < tries) await sleep(300 + 400 * i);
    }
  }
  throw lastErr || new Error("request failed");
}

async function getJson(url, opts) {
  const r = await request(url, Object.assign({ json: true }, opts || {}));
  try { return JSON.parse(r.text); } catch (e) { return null; }
}

/**
 * A site with several mirror domains. Tries the last domain that worked first; a domain only counts
 * as working when the body matches `marker` (rejects parked pages, hijacked domains, ISP block pages).
 * Absolute links on a page may point at a dead mirror, so callers pass paths (pathOf) and we re-base.
 */
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

  // opts.marker: override the page marker (null = accept any 2xx body, e.g. AJAX fragments / JSON)
  async function fetchPath(path, opts) {
    const o = opts || {};
    const mk = o.marker === undefined ? marker : o.marker;
    const errors = [];
    for (const base of order()) {
      try {
        const r = await request(base + path, Object.assign({}, o, { referer: o.referer || base + "/" }));
        const real = !mk || mk.test(r.text);
        if (r.ok && real) {
          const fin = originOf(r.url);
          // follow a domain move (old mirror 301 -> new one), but never onto an ad / parking host
          active = fin && (!cfg.sameSite || cfg.sameSite.test(fin)) ? fin : base;
          if (active !== base && bases.indexOf(active) < 0) bases.unshift(active);
          return Object.assign(r, { base: active });
        }
        if (r.status === 404 && real) return null; // site answered: page genuinely missing
        errors.push(`${base} ${r.status}${real ? "" : " (not " + name + ")"}`);
        if (!real && o.marker === undefined) dead[base] = true;      } catch (e) {
        dead[base] = true;
        errors.push(`${base} ${e && e.message}`);
      }
    }
    if (cfg.log) cfg.log(`unreachable ${String(path).slice(0, 60)}: ${errors.join("; ")}`);
    return null;
  }

  return {
    name,
    get: (path, opts) => fetchPath(path, opts),
    post: (path, body, opts) => fetchPath(path, Object.assign({}, opts || {}, { method: "POST", body })),
    base: () => active || bases[0],
    url: (path) => (active || bases[0]) + path,
  };
}

module.exports = { UA, HAS_TIMERS, sleep, withTimeout, setDeadline, pastDeadline, onTick, request, getJson, mirrorSite, makeJar, absUrl, pathOf, originOf, hostOf, safeUrl, formBody };
