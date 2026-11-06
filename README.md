# Arab Hub — Nuvio local scraper

One Nuvio scraper (`providers/arabhub.js`) that queries several Arabic movie / series / anime sites
**in parallel**. It resolves their embed hosts to direct `m3u8` / `mp4` links and returns them in Nuvio's
format (`[{ name, title, url, quality, headers }]`).

## Install in Nuvio

Settings → Plugins / Local scrapers → add repository → paste

```
https://raw.githubusercontent.com/HMubaireek/nuvio-arabic-sources/refs/heads/main/manifest.json
```

then enable **Arab Hub**.

## Sources

Every site was probed from the development connection on 2026-11-06 (`npm run probe`, results in `domains.json`).
"Live test" is `npm run test:live`: real TMDB lookups and real sites. A case only passes when a returned
URL answers with HLS (`#EXTM3U`) or video bytes.

### Included

| Source | Live domain (2026-11-06) | Content | Live test | Notes |
|---|---|---|---|---|
| **FaselHD** | `web11612x.faselhdx.one` | foreign movies & series, anime, Asian | 7/7 pass | Its player builds the quality list with javascript-obfuscator'd JS. `src/lib/deobf.js` decodes that statically (string array, rotation, base64, wrapper offsets) without evaluating any site code, giving 1080p/720p/360p + auto HLS. The stream URLs are bound to the viewer's IP, which is fine because the plugin runs on the playing device. The site rate-limits bursts (HTTP 429), so the client backs off and retries. The domain rotates (`web<N>x.faselhdx.*`); update `bases` in `src/sources/faselhd.js` when it moves. |
| **Laroza** | `laroza1.lat` | Arabic & Turkish series, Arabic/foreign movies | 6/6 pass | `search.php` → `video.php` (season tabs + episodes) → `play.php` → `li[data-embed-url]`. Only okhd (480p) resolves here: vk / film77 / vidoba are SNI-blocked on this ISP and vidspeed's origin is down. On an unfiltered network more hosts will resolve. |
| **TopCinema** | `web6.topcinema.fan` (via topcinema.cam/.fan/.ink/.film, topcinemaa.co) | foreign movies & series | 3/5 pass | The 2 misses (The Dark Knight, The Last of Us) aren't in its catalogue. Hosts: vidtube 1080p, streamwish 720p, uqload, updown. |
| **ArabSeed** | `m.asd.watch` (via arabseed.top, guide page m10.arabseed.one) | Arabic + foreign + Turkish | 4/6 pass | The 2 "dead" cases come from ArabSeed's own CDN node `cdnpszna01.cdn.makeup`, which answers `400 Request Header Or Cookie Too Large` even to a bare request (broken upstream). The other nodes play. |
| **3isk** | `ww4.3ick.club` (via 3esk.onl) | Turkish series, subbed + dubbed | 3/3 pass | Kuruluş Osman S1E1 / S5E3, Diriliş Ertuğrul S1E2 |
| **Anime4up** | rotating, `4f.gnli129.shop` today (discovered from anime4up.bond) | anime | 4/5 pass | Its own 1080p HLS players. The miss: the site only has Solo Leveling Season 2. |
| **WitAnime** | `witanime.onl` | anime | 2/5 pass | Many older episodes' host files are deleted (uqload "file expired", ok.ru blocked), and Solo Leveling S1 isn't listed. Kept because what it returns plays. |
| **Akwam** (disabled) | `akwam.ss` (+ ak.sv, akwam.to/.it/.net) | Arabic + foreign | 0/9 now, offline test passes | **Disabled** (`enabled: false` in `src/sources/akwam.js`) because this ISP blocks it: DNS on the router resolver and TLS resets by SNI (1.1.1.1 resolves it). During one reachable window the full flow returned playable `downet.net` files (206 over http). `tests/akwam.offline.js` covers the direct and the `go.*` redirect paths. To re-enable, delete the `enabled: false` line and rebuild. `node tests/live.js akwam` still runs it. |

### Probed and left out

| Source | What happened from this connection |
|---|---|
| Movizland | `www.moviz.land` (and movizland.com) is blocked by SAIP, the Saudi IP-enforcement filter: https resets on the site name, and http returns the SAIP block page. The built-in browser can't open it either. It opens in a desktop browser that uses Encrypted Client Hello or a VPN, but Nuvio's HTTP client won't get through the filter, so it isn't included. |
| WeCima | wecima.show / .video were seized (redirect to alliance4creativity.com). The other candidates are DNS-blocked or TLS-reset. |
| EgyDead | All domains (egydead.space/.live/.media, tv10.egydead.live, a1.egydead.media from its Telegram) are TLS-reset. |
| Shahid4u, Cima4u, CimaNow, Cimaclub | Every known domain is DNS-blocked, TLS-reset or times out. cima4u.vip redirects to an ad network. |
| Anime3rb | anime3rb.com is TLS-reset (SNI filtering). |
| Cima Cloud | `cloud-day.online` / `1654865.xyz` answer, but the API requires the Android app's RSA-signed attestation token. |
| CinemaBox | `cinema.albox.co` serves its "service unavailable" page, and every `/api/v4/*` path returns 404. |

Re-run `npm run probe` on a different network (or with a VPN). Many of the excluded sites are blocked at the ISP rather than dead.

### How a request flows

1. **TMDB once** (`src/lib/tmdb.js`): English, Arabic, original, romaji and alternative titles, year, season
   episode counts (for absolute numbering) and flags (anime / Arabic / Turkish).
2. **Every applicable source in parallel** (`src/index.js`). Each source has a 28 s budget, and the whole request
   is capped at 40 s; whatever has resolved by then is returned.
3. **Search → match → page walk** per source. Matching (`src/lib/match.js`) normalises Arabic (alef/yaa/taa-marbuta,
   harakat, hamza seats, Eastern-Arabic digits). It strips listing noise (`فيلم … مترجم اون لاين`,
   `الموسم الخامس الحلقة 16`) and scores each listing against all TMDB titles. A movie also has to match
   the year within ±1.
4. **Embed hosts** (`src/lib/hosts.js`) are shared by all sources: a p.a.c.k.e.r unpacker plus JWPlayer / streamwish
   (`hls2`) / mixdrop (`wurl`) / XFileSharing "click to play" forms / doodstream / streamtape / ok.ru. Iframes are
   followed two levels deep. Every HLS master is fetched once, which proves it is alive and reads the real
   resolution. Dead playlists are dropped.
5. **Domain fallback** (`mirrorSite` in `src/lib/http.js`): each source lists its mirrors. A mirror only counts when the
   body carries the site's own markup, which rejects parked domains, hijacked ones like `akwam.cx` and ISP block pages.
   Redirects to a newer mirror are followed and remembered. Absolute links that point at dead sibling mirrors are re-based.
   Network errors are retried, because TLS resets from ISP filtering come and go.

The old faselhd.center/.cafe/.club/.pro hubs still redirect to `www.fasel-hd.co`, which serves a Cloudflare challenge. Only the rotating `web<N>x.faselhdx.*` domain is used.

### Per-source notes

| Source | Flow |
|---|---|
| **Akwam** | `/search?q=` → movie or season page → episode → `a.link-show`. That link either points straight at `/watch/<id>/<movie>/<slug>` (whose `<source>` tags hold the files) or at a `go.*` / `/link/<id>` redirector whose page only carries the next hop. The scraper follows up to 4 hops until a page has `<source>`. Files on `*.downet.net` are forced to **http**: https times out on filtered networks while http serves `206`. Quality comes from the **file name**, because the `size` attribute is wrong (1080p files are tagged 720). |
| **TopCinema** | AJAX search `POST …/Ajaxat/Searching.php` → `/series/` season links → episode cards → `<post>/watch/` → `POST …/Single/Server.php {id, i}` per server → embed. |
| **ArabSeed** | `/find/?word=` → movie, or any episode of the show → its `/selary/<show>-الموسم-<ordinal>/` season page. Other seasons are reached by swapping the ordinal in that slug. Then `<post>/watch/` → `csrf__token` → `POST /get__quality__servers/` + `/get__watch__server/` for 480/720/1080. The "direct" server goes through `vids.php` → `player-gateway.php` → `<source>` mp4. |
| **3isk** | `/?s=` → show page (all episodes, continuous numbering → absolute episode) → episode page (sets `PHPSESSID`) → `/see/` (redirects back without that cookie) → `/embed/<n>/<post>/<nume>/` → host iframe. Subbed and dubbed versions are both returned, labelled `مترجم` / `مدبلج`. |
| **Anime4up** | The landing page (`anime4up.bond`) links the current rotating domain. Search → anime entry (each season is its own entry). The entry's MyAnimeList id leads to the site's own players `/Anime4up-S1|S2/mal/<id>/<ep>/sub/` (`let streamUrl = …` HLS, 1080p), plus the episode page's `li[data-watch]` mirrors. |
| **WitAnime** | `witanime.onl` (the old `.cyou/.xyz/.red` hosts now get ISP block certificates). Search → anime → episode → `a.episode-server[data-url]` embeds. Many old episodes' host files are deleted upstream. |

Anime handling (`src/lib/anime.js`) applies to both anime sites. It searches the romaji title first ("Kimi no Na wa."
rather than "Your Name."). It maps TMDB season N to the site's "Nth Season" entry, and falls back to absolute
numbering for single-entry long runners such as One Piece, whose TMDB "seasons" are arcs.

## Nuvio's plugin runtime (verified on a Sony BRAVIA over adb)

The plugin runs in Nuvio's own JS runtime, which differs from Node in ways that broke the first versions:

| Behaviour | Seen in logcat | How the code copes |
|---|---|---|
| No `async/await` in dynamically loaded code | Nuvio's docs | `npm run build` lowers the bundle to ES2016 with esbuild, as Nuvio's own build does, and fails if `async`/`await` survive |
| **No timers**: no `setTimeout` / `setInterval` | `setTimeout is not defined` | Delays and retries are skipped without timers. Time limits come from a `Date.now()` deadline: no new request starts after it, and every finished request checks it. |
| **One fetch at a time per plugin** | the next fetch starts only after the previous one finished | Sources run one after another, best first for the title (Arabic: Laroza, ArabSeed; Turkish: 3isk; anime: Anime4up; foreign: FaselHD, TopCinema). At most 5 embeds per source, hosts that resolve reliably first, and only the first working playlist per embed is probed. |
| Network errors resolve with **status 0** instead of throwing | `akwam.ss 0` | Status 0 counts as a network failure, and that host is skipped for the rest of the request |
| ~30 s fetch timeout | `failed to connect ... after 30000ms` | A host that hangs costs at most one timeout |

`npm run test:nuvio` (`tests/nuvio-sandbox.js`) runs the **built** bundle inside a bare `vm` context that mimics
all of this: fetch + console only, fetches serialised, status 0 on errors. Run it before pushing.

## Development

```
npm install              # node-fetch, only for running tests on Node < 18
npm run probe            # re-probe every candidate domain -> domains.json
npm test                 # offline: unit checks + Akwam fixture test (direct and go.* redirect paths)
npm run test:nuvio       # the built bundle in a Nuvio-like sandbox (no timers, serial fetch), live sites
npm run test:live        # live, every source on its own title set (node tests/live.js akwam topcinema ...)
npm run test:hub         # live, the full aggregator on a few titles
npm run build            # bundle src/ -> providers/arabhub.js (the file Nuvio loads)
```

`providers/arabhub.js` is generated. Edit `src/`, then rebuild. The bundle has no dependencies. It needs only the
`fetch` that Nuvio provides, and avoids `URL`, `AbortController`, `atob`/`Buffer` and `redirect: "manual"`.

### Adding / re-enabling a source

Create `src/sources/<id>.js` exporting `{ id, name, types, bases, applies?(info), links(ctx) }`, where `links` returns
`[{ embed, referer, label? }]` (resolved through the host extractors) or `[{ url, headers, q }]` (already playable).
Add it to `src/sources/registry.js`, add test titles to `tests/cases.js`, then run `node tests/live.js <id>`.
Candidate domains live in `scripts/candidates.json`.
