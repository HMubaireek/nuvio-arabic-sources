// Ping every URL the scraper actually uses (each source's `bases` + landing pages) and the APIs.
//   npm run ping [source ...]
// Each URL is fetched twice with curl: once with the system (ISP) DNS and once over DNS-over-HTTPS (1.1.1.1),
// because the dev ISP DNS-blocks several sites that work fine on a device with Private/secure DNS.
// Disabled sources (enabled: false) are listed as DISABLED; one with no URLs says "no URLs - find new domains".
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SRC = path.join(__dirname, "..", "src", "sources");
const PARKED = /abovedomains|forsale|sedo\.com|parkingcrew|bodis\.com|domain is for sale|alliance4creativity|website has been stopped|CodeIgniter|junclikrmedi|junimedclk|plarclck|toplakehorizon/i;
const CF = /cf-chl|challenge-platform|Just a moment\.\.\./i;
const APIS = [
  ["TorBox API", "https://api.torbox.app/v1/api/user/me"],
  ["TMDB API", "https://api.themoviedb.org/3/configuration"],
];

function curl(url, doh) {
  const args = ["-s", "-L", "--max-redirs", "6", "-m", "20", "-A", UA, "-H", "Accept-Language: ar,en;q=0.8", "-w", "\n__CURL__%{http_code} %{url_effective}"];
  if (doh) args.push("--doh-url", "https://1.1.1.1/dns-query");
  args.push(url);
  return new Promise((resolve) => {
    execFile("curl", args, { maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }, (err, out) => {
      const i = (out || "").lastIndexOf("\n__CURL__");
      const body = i >= 0 ? out.slice(0, i) : "";
      const [code, final] = i >= 0 ? out.slice(i + 9).split(" ") : ["000", ""];
      resolve({ code: +code, final: final || "", body, err: err && +code === 0 ? `curl exit ${err.code}` : "" });
    });
  });
}

function verdict(r, api) {
  if (!r.code) return "dead";
  if (api) return r.code < 500 ? "ok" : `http-${r.code}`;
  if (CF.test(r.body)) return "cloudflare";
  if (PARKED.test(r.body) || PARKED.test(r.final)) return "hijacked";
  if (r.code >= 400) return `http-${r.code}`;
  if (r.body.length < 1500) return "tiny";
  return "ok";
}

async function check(url, api) {
  const [isp, doh] = await Promise.all([curl(url, false), curl(url, true)]);
  const best = verdict(isp, api) === "ok" ? isp : doh;
  return {
    isp: verdict(isp, api),
    doh: verdict(doh, api),
    final: best.final.replace(/\/$/, "") === url.replace(/\/$/, "") ? "" : best.final,
    title: ((/<title[^>]*>([^<]*)/i.exec(best.body) || [])[1] || "").trim().slice(0, 50),
  };
}

function sources(only) {
  const order = require(path.join(SRC, "registry.js")).map((m) => m.id);
  return order.filter((id) => !only.length || only.includes(id)).map((id) => {
    const file = fs.readdirSync(SRC).find((f) => require(path.join(SRC, f)).id === id);
    const mod = require(path.join(SRC, file));
    const text = fs.readFileSync(path.join(SRC, file), "utf8");
    const landings = [];
    const m = /LANDINGS\s*=\s*\[([^\]]*)\]/.exec(text);
    if (m) for (const u of m[1].matchAll(/"(https?:[^"]+)"/g)) landings.push(u[1]);
    return { id, name: mod.name, enabled: mod.enabled !== false, urls: landings.map((u) => [u, "landing"]).concat((mod.bases || []).map((u) => [u, "base"])) };
  });
}

const pad = (s, n) => String(s).padEnd(n);

(async () => {
  const only = process.argv.slice(2);
  const list = sources(only);
  const rows = await Promise.all(list.map(async (s) => ({ s, res: await Promise.all(s.urls.map(([u, kind]) => check(u, false).then((r) => Object.assign({ url: u, kind }, r)))) })));
  console.log(`${pad("SOURCE", 11)} ${pad("STATE", 9)} ${pad("URL", 34)} ${pad("ISP DNS", 11)} ${pad("SECURE DNS", 11)} FINAL / TITLE`);
  const summary = [];
  for (const { s, res } of rows) {
    const state = s.enabled ? "enabled" : "DISABLED";
    if (!res.length) console.log(`${pad(s.name, 11)} ${pad(state, 9)} (no URLs - find new domains)`);
    for (const r of res) console.log(`${pad(s.name, 11)} ${pad(state, 9)} ${pad(r.url.replace("https://", "") + (r.kind === "landing" ? " (landing)" : ""), 34)} ${pad(r.isp, 11)} ${pad(r.doh, 11)} ${r.final ? r.final + "  " : ""}${r.title}`);
    const working = res.filter((r) => r.isp === "ok" || r.doh === "ok").length;
    summary.push(`${pad(s.name, 11)} ${!s.enabled ? "DISABLED" : working === res.length ? "OK" : working ? "PARTIAL" : "BROKEN"} (${working}/${res.length} URLs work)`);
  }
  if (!only.length) {
    for (const [name, url] of APIS) {
      const r = await check(url, true);
      console.log(`${pad(name, 11)} ${pad("-", 9)} ${pad(url.replace("https://", "").slice(0, 34), 34)} ${pad(r.isp, 11)} ${r.doh}`);
    }
  }
  console.log("\n" + summary.join("\n"));
})();
