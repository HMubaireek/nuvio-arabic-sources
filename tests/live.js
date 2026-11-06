// Live test: real TMDB + real sites, from this machine's connection.
//   node tests/live.js                 -> every source, its own title set
//   node tests/live.js topcinema akwam -> only those sources
//   node tests/live.js --hub           -> full aggregator on a few titles
// A case passes when at least one returned URL actually answers (m3u8 -> #EXTM3U, mp4 -> video bytes).
if (typeof fetch === "undefined") global.fetch = require("node-fetch");
const { getStreams, SOURCES } = require("../src/index");
const CASES = require("./cases");

const QUIET = !process.env.VERBOSE;
const realLog = console.log;

async function playable(stream) {
  const headers = Object.assign({}, stream.headers || {}, { Range: "bytes=0-2047" });
  try {
    const res = await Promise.race([
      fetch(stream.url, { headers }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
    const buf = await new Promise((resolve) => {
      const chunks = [];
      let n = 0;
      if (!res.body || !res.body.on) return res.text().then((t) => resolve(Buffer.from(t.slice(0, 2048))));
      res.body.on("data", (c) => { chunks.push(c); n += c.length; if (n >= 2048) { res.body.destroy(); resolve(Buffer.concat(chunks)); } });
      res.body.on("end", () => resolve(Buffer.concat(chunks)));
      res.body.on("error", () => resolve(Buffer.concat(chunks)));
      setTimeout(() => resolve(Buffer.concat(chunks)), 12000);
    });
    const head = buf.slice(0, 64).toString("latin1");
    const ct = res.headers.get("content-type") || "";
    const ok = res.status < 400 && (/#EXTM3U/.test(head) || /ftyp|moov|\x1aE\xdf\xa3/.test(head) || (/video|octet-stream|mp2t/.test(ct) && buf.length > 512) || buf[0] === 0x47);
    return { ok, why: `${res.status} ${ct.split(";")[0]} ${JSON.stringify(head.slice(0, 12))}` };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

async function runCase(srcIds, c) {
  const t0 = Date.now();
  if (QUIET) console.log = () => {};
  let streams = [];
  try {
    streams = await getStreams(c.id, c.type, c.s, c.e, { only: srcIds, budget: 60000 });
  } finally {
    console.log = realLog;
  }
  const checks = await Promise.all(streams.slice(0, 6).map(async (s) => Object.assign({ s }, await playable(s))));
  const good = checks.filter((x) => x.ok);
  const label = `${c.label}${c.type === "tv" ? ` S${c.s}E${c.e}` : ""}`;
  const status = good.length ? "PASS" : streams.length ? "DEAD" : "NONE";
  realLog(`  ${status} ${label.padEnd(34)} ${streams.length} streams, ${good.length}/${checks.length} playable  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const x of checks) realLog(`       ${x.ok ? "ok " : "bad"} ${x.s.quality.padEnd(6)} ${x.s.title.split("\n")[1].padEnd(28)} ${x.s.url.slice(0, 90)}  [${x.why}]`);
  return status === "PASS";
}

(async () => {
  const args = process.argv.slice(2);
  const results = {};
  if (args[0] === "--hub") {
    realLog("== Arab Hub (all sources)");
    for (const c of CASES.hub) await runCase(null, c);
    return;
  }
  const ids = args.length ? args : SOURCES.map((s) => s.id);
  for (const id of ids) {
    const src = SOURCES.find((s) => s.id === id);
    if (!src) { realLog(`unknown source ${id}`); continue; }
    const cases = (CASES[id] || CASES.default).filter((c) => src.types.indexOf(c.type) >= 0);
    realLog(`== ${src.name} (${id})`);
    let pass = 0;
    for (const c of cases) if (await runCase([id], c)) pass++;
    results[id] = `${pass}/${cases.length}`;
  }
  realLog("\nsummary: " + Object.keys(results).map((k) => `${k} ${results[k]}`).join(" | "));
})();
