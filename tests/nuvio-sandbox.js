// Runs the BUILT bundle (providers/arabhub.js) the way Nuvio's plugin runtime does, as observed in the
// TV's logcat: a bare JS context with fetch + console only. No setTimeout/setInterval, no Buffer, no
// process, no require. Catches "X is not defined" bugs that Node tests can't see.
//   node tests/nuvio-sandbox.js [tmdbId type season episode]
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const nodeFetch = require("node-fetch");

const code = fs.readFileSync(path.join(__dirname, "..", "providers", "arabhub.js"), "utf8");

// Nuvio-like fetch, as seen in the TV's logcat:
//  - one request at a time per plugin (the next fetch starts only after the previous one finished)
//  - network errors (DNS, TLS reset) resolve with status 0 instead of rejecting
//  - plain response object (status, url, headers.get, text, json) - no headers.raw()
//  - its own 30 s timeout (requests here are capped at 30 s too)
let queue = Promise.resolve();
const stats = { requests: 0 };
function nuvioFetch(url, init) {
  const run = () => {
    stats.requests++;
    return nodeFetch(url, Object.assign({ timeout: 30000 }, init)).then(
      (res) => res.text().then((body) => ({
        status: res.status,
        ok: res.ok,
        url: res.url,
        headers: { get: (k) => res.headers.get(k) },
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(JSON.parse(body)),
      })),
      () => ({ status: 0, ok: false, url, headers: { get: () => null }, text: () => Promise.resolve(""), json: () => Promise.reject(new Error("no body")) })
    );
  };
  const p = queue.then(run, run);
  queue = p.then(() => {}, () => {});
  return p;
}

const logs = [];
const sandbox = {
  fetch: nuvioFetch,
  console: { log: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("ERR " + a.join(" ")), warn: (...a) => logs.push(a.join(" ")) },
  module: { exports: {} },
};
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "arabhub.js" });

const missing = ["setTimeout", "setInterval", "Buffer", "process", "require"].filter((g) => vm.runInContext(`typeof ${g} !== "undefined"`, sandbox));
if (missing.length) throw new Error(`sandbox leaks ${missing.join(", ")}`);

const [id, type, s, e] = process.argv.slice(2);
const cases = id ? [[id, type || "movie", s, e]] : [["274162", "tv", 1, 1], ["872585", "movie"]];

(async () => {
  let failed = 0;
  for (const [tid, t, sn, ep] of cases) {
    logs.length = 0;
    stats.requests = 0;
    const t0 = Date.now();
    let streams = [];
    try {
      streams = await sandbox.module.exports.getStreams(tid, t, sn, ep);
    } catch (err) {
      logs.push("THROWN " + err.message);
    }
    const errors = logs.filter((l) => /not defined|is not a function|THROWN|tmdb failed|TypeError|ReferenceError/.test(l));
    const ok = streams.length > 0 && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${t} ${tid}${sn ? ` S${sn}E${ep}` : ""}: ${streams.length} streams in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${stats.requests} requests (serial) ${streams.map((x) => x.name.split("| ")[1] + " " + x.quality).join(", ")}`);
    for (const l of errors) console.log("   " + l);
    if (process.env.VERBOSE) for (const l of logs) console.log("   · " + l.slice(0, 160));
  }
  process.exit(failed ? 1 : 0);
})();
