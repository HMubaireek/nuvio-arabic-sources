// Probe candidate domains for every source from *this* connection.
//   node scripts/probe-domains.js [site ...]      -> prints a table, writes domains.json
// A domain counts as "live" when it answers 2xx with real site markup (not parked / not a CF challenge).
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CANDIDATES = require("./candidates.json");

const PARKED = /abovedomains|forsale|sedo\.com|parkingcrew|bodis\.com|domain is for sale|alliance4creativity|website has been stopped|CodeIgniter|junclikrmedi|toplakehorizon/i;
// hijacked mirrors: a near-empty page whose only content is an obfuscated base64 redirect (akwam.cx)
const HIJACKED = (body) => body.length < 4000 && /window\[[^\]]+\]\(_0x|atob|\\x61\\x74\\x6f\\x62/.test(body) && !/<a\s[^>]*href=["']https?:\/\/[^"']+\/(?:movie|series|watch|episode)/i.test(body);
const CF = /cf-chl|challenge-platform|Just a moment\.\.\./i;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

async function probe(site, host) {
  const url = /^https?:/.test(host) ? host : `https://${host}/`;
  try {
    const res = await withTimeout(fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ar,en;q=0.8" }, redirect: "follow" }), 15000);
    const body = await withTimeout(res.text(), 15000);
    const title = ((/<title[^>]*>([^<]*)/i.exec(body) || [])[1] || "").trim().slice(0, 60);
    let verdict = "live";
    if (CF.test(body)) verdict = "cloudflare";
    else if (PARKED.test(body) || PARKED.test(res.url)) verdict = "parked";
    else if (HIJACKED(body)) verdict = "hijacked";
    else if (res.status >= 400) verdict = `http-${res.status}`;
    else if (body.length < 1500) verdict = "tiny";
    return { site, host, status: res.status, final: res.url, size: body.length, title, verdict };
  } catch (e) {
    const code = (e && (e.code || e.message)) || "error";
    return { site, host, status: 0, final: "", size: 0, title: "", verdict: /RESET|ECONNRESET|socket hang up/i.test(code) ? "blocked(reset)" : code };
  }
}

(async () => {
  const only = process.argv.slice(2);
  const jobs = [];
  for (const [site, hosts] of Object.entries(CANDIDATES)) {
    if (only.length && !only.includes(site)) continue;
    for (const h of hosts) jobs.push(probe(site, h));
  }
  const rows = await Promise.all(jobs);
  const out = {};
  for (const r of rows) {
    console.log(`${r.site.padEnd(10)} ${r.host.padEnd(26)} ${String(r.status).padEnd(4)} ${r.verdict.padEnd(16)} ${r.final.slice(0, 50).padEnd(50)} ${r.title}`);
    if (r.verdict === "live") {
      const m = /^(https?:\/\/[^/]+)/.exec(r.final);
      (out[r.site] = out[r.site] || []);
      if (m && !out[r.site].includes(m[1])) out[r.site].push(m[1]);
    }
  }
  if (!only.length) {
    fs.writeFileSync(path.join(__dirname, "..", "domains.json"), JSON.stringify({ probedAt: new Date().toISOString(), live: out }, null, 2));
    console.log("\nwrote domains.json");
  }
})();
