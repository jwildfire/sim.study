/* Sim Study: the clock, the city and the panels.
   Two engines give it a study: built.js plays one that study.builder built; sim.js makes one up.
   One network call, for study.builder's list of ready-made studies and a study picked from it. One thing is stored in the browser: that the About panel has been seen. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const hash = (k, d) => { const m = new RegExp(k + "=([\\w-]+)").exec(location.hash); return m ? m[1] : d; };
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canBuild = !!(window.StudyBuilder && window.SIM_STUDY_FILE && window.DecompressionStream);

  let S, mode = "arcade", opened = null, speed = 7, playing = false, acc = 0, sel = null, tab = "over", vans = [], widget = null, lastT = 0, dirty = true, lastRender = 0, newsN = -1;
  const TABS = [["over", "Overview"], ["today", "Daily cut"], ["week", "Weekly"], ["safety", "Safety"], ["sub", "Submission"], ["csr", "Report"]];
  const FORMS = [["DM", "Demographics"], ["VS", "Vital signs"], ["LB", "Laboratory"], ["EX", "Dosing"], ["AE", "Adverse events"], ["DS", "Disposition"], ["DV", "Protocol deviations"]];
  const ARMC = ["#888888", "#d0661f", "#1f3a6e", "#4f9c94", "#8a6bb0"];
  const VIZ = [["aeExplorer", "ADAE", "Adverse Event Explorer"], ["aeTimelines", "ADAE", "Adverse Event Timelines"], ["hepExplorer", "ADLB", "Hepatic Safety Explorer"], ["resultsOverTime", "ADLB", "Results Over Time"], ["histogram", "ADLB", "Safety Histogram"]];

  const built = () => S.kind === "built";
  const date = (d, short) => S.dateOf(d).toLocaleDateString("en-GB", Object.assign({ timeZone: S.utc ? "UTC" : undefined }, short ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short", year: "numeric" }));
  const iso = (d) => S.dateOf(d + (S.utc ? 0 : 0.5)).toISOString().slice(0, 10);
  const n1 = (x, k) => (x === null || x === undefined || isNaN(x) ? "–" : (+x).toFixed(k === undefined ? 1 : k));
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "–");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = (s) => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const locked = () => S.phase === "analysis" || S.phase === "reporting" || S.done;

  // ---------- the city ----------
  const G = 18, RING = [[2, 2], [6, 1], [11, 1], [15, 2], [16, 6], [16, 11], [15, 15], [11, 16], [6, 16], [2, 15], [1, 11], [1, 6]];
  const CAMPUS = [
    { k: "hub", name: "Data hub", x: 8.25, y: 7.75, w: 1.5, d: 1.5, h: 64, col: "#5c7fb8" },
    { k: "dm", name: "Data cleaning", x: 6.4, y: 7.2, w: 1.2, d: 1.2, h: 24, col: "#b8865c" },
    { k: "rbqm", name: "Monitoring", x: 6.4, y: 9.3, w: 1.2, d: 1.2, h: 40, col: "#8a6bb0" },
    { k: "safety", name: "Safety", x: 10.4, y: 7.2, w: 1.2, d: 1.2, h: 44, col: "#b85c5c" },
    { k: "stats", name: "Statistics", x: 10.4, y: 9.3, w: 1.2, d: 1.2, h: 28, col: "#4f9c94" },
    { k: "reg", name: "Regulatory", x: 7.7, y: 9.8, w: 1.15, d: 1.1, h: 52, col: "#c9a23a" },
  ];
  const ROOF = ["#4fae49", "#e0a526", "#d2443a"];
  let SPOT = [], roads = new Set(), trees = [];
  function layout(n) {
    if (n <= 12) SPOT = Array.from({ length: n }, (_, i) => RING[Math.floor((i * 12) / n)]);
    else {
      const edge = [];
      for (let x = 1; x <= 16; x++) if (x < 8 || x > 10) edge.push([x, 1]);
      for (let y = 2; y <= 15; y++) if (y < 7 || y > 10) edge.push([16, y]);
      for (let x = 16; x >= 1; x--) if (x < 8 || x > 10) edge.push([x, 16]);
      for (let y = 15; y >= 2; y--) if (y < 7 || y > 10) edge.push([1, y]);
      SPOT = Array.from({ length: Math.min(n, edge.length) }, (_, i) => edge[Math.floor((i * edge.length) / Math.min(n, edge.length))]);
    }
    roads = new Set(); trees = [];
    SPOT.forEach(([sx, sy]) => {
      for (let x = Math.min(sx, 9); x <= Math.max(sx, 9); x++) roads.add(x + "," + sy);
      for (let y = Math.min(sy, 9); y <= Math.max(sy, 9); y++) roads.add("9," + y);
    });
    let a = 9; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) { const x = Math.floor(r() * G), y = Math.floor(r() * G);
      if (!roads.has(x + "," + y) && !(x > 5 && x < 12 && y > 5 && y < 12) && !SPOT.some((s) => s[0] === x && s[1] === y)) trees.push([x + 0.2 + r() * 0.6, y + 0.2 + r() * 0.6, 0.7 + r() * 0.6]); }
  }

  let TW = 40, TH = 20, ox = 0, oy = 0, c, placed = [];
  const P = (gx, gy, z) => [ox + ((gx - gy) * TW) / 2, oy + ((gx + gy) * TH) / 2 - (z || 0)];
  const shade = (hex, f) => "rgb(" + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(i, 2), 16) * f)))).join(",") + ")";
  function poly(pts, fill, stroke) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
  function box(x, y, w, d, h, col, roof) {
    const k = TW / 40; h *= k;
    const a = P(x, y, h), b = P(x + w, y, h), cc = P(x + w, y + d, h), dd = P(x, y + d, h), b0 = P(x + w, y), c0 = P(x + w, y + d), d0 = P(x, y + d);
    c.lineWidth = 1;
    poly([dd, cc, c0, d0], shade(col, 0.8), "rgba(0,0,0,.35)");
    poly([b, cc, c0, b0], shade(col, 0.58), "rgba(0,0,0,.35)");
    poly([a, b, cc, dd], roof || shade(col, 1.15), "rgba(0,0,0,.35)");
    c.strokeStyle = "rgba(0,0,0,.22)"; c.beginPath();
    for (let z = 8 * k; z < h - 2; z += 8 * k) { const l = P(x, y + d, z), m = P(x + w, y + d, z), r = P(x + w, y, z); c.moveTo(l[0], l[1]); c.lineTo(m[0], m[1]); c.lineTo(r[0], r[1]); }
    c.stroke();
    return h;
  }
  function label(p, text, bg, fg) {
    c.font = "600 " + Math.max(9, Math.round(TW * 0.27)) + "px ui-monospace,Menlo,monospace";
    const w = c.measureText(text).width + 8, h = Math.max(13, TW * 0.36), x = p[0] - w / 2; let y = p[1] - h;
    for (let n = 0; n < 6 && placed.some((q) => x < q[0] + q[2] && q[0] < x + w && y < q[1] + q[3] && q[1] < y + h); n++) y -= h + 1;
    placed.push([x, y, w, h]);
    c.fillStyle = bg || "rgba(21,23,26,.82)"; c.fillRect(x, y, w, h);
    c.fillStyle = fg || "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, p[0], y + h / 2 + 0.5);
  }
  const perFloor = () => Math.max(2, Math.ceil(S.cfg.target / S.sites.length / 4));
  const siteH = (s) => (s.active ? 12 + (1 + Math.floor(s.rand / perFloor())) * 8 : 0);
  function pathPoint(i, u) {
    const [sx, sy] = SPOT[i], l1 = Math.abs(9 - sx), l2 = Math.abs(8 - sy), at = u * (l1 + l2);
    if (at <= l1) return [sx + 0.5 + (9 - sx) * (l1 ? at / l1 : 1), sy + 0.5];
    return [9.5, sy + 0.5 + (8 - sy) * (l2 ? (at - l1) / l2 : 1)];
  }
  function campusOn(k) {
    const ph = S.phase, running = ph === "enrolling" || ph === "treatment" || ph === "cleaning";
    if (k === "hub") return ph !== "start-up";
    if (k === "dm") return running && (S.openQ > 0 || S.pending > 0);
    if (k === "rbqm") return running && (built() ? !!S.gsm : S.snapshots.length > 0);
    if (k === "safety") return running && S.aes.length > 0;
    if (k === "stats") return ph === "analysis" || ph === "reporting" || S.done;
    return built() ? false : ph === "reporting" || S.done;
  }

  function draw(t) {
    const cv = $("city"), r = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H || !S) return;
    if (cv.width !== Math.round(W * r) || cv.height !== Math.round(H * r)) { cv.width = Math.round(W * r); cv.height = Math.round(H * r); }
    c = cv.getContext("2d"); c.setTransform(r, 0, 0, r, 0, 0);
    c.fillStyle = "#3b5a3a"; c.fillRect(0, 0, W, H);
    TW = Math.min(W / (G + 1), (H - 60) / (G / 2 + 1.2)); TH = TW / 2; ox = W / 2; oy = (H - G * TH) / 2 + 22;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const road = roads.has(x + "," + y), plaza = x > 5 && x < 12 && y > 5 && y < 12;
      poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], road ? "#8b8f94" : plaza ? ((x + y) % 2 ? "#bdb8a8" : "#b5b0a0") : (x + y) % 2 ? "#5c9b4f" : "#569348");
    }
    const list = [], labels = [];
    trees.forEach(([x, y, s]) => list.push({ z: x + y, f: () => { const b = P(x, y), k = (TW / 40) * s; c.fillStyle = "#5b3d22"; c.fillRect(b[0] - k, b[1] - 5 * k, 2 * k, 5 * k); poly([[b[0] - 6 * k, b[1] - 4 * k], [b[0] + 6 * k, b[1] - 4 * k], [b[0], b[1] - 20 * k]], "#2f6d2c"); poly([[b[0] - 5 * k, b[1] - 10 * k], [b[0] + 5 * k, b[1] - 10 * k], [b[0], b[1] - 23 * k]], "#3a8136"); } }));
    CAMPUS.forEach((b) => list.push({ z: b.x + b.w / 2 + b.y + b.d / 2, f: () => {
      const on = campusOn(b.k), h = box(b.x, b.y, b.w, b.d, b.h, on ? b.col : "#8f949a");
      if (b.k === "hub") { const top = P(b.x + b.w / 2, b.y + b.d / 2, h); c.strokeStyle = "#222"; c.lineWidth = 2; c.beginPath(); c.moveTo(top[0], top[1]); c.lineTo(top[0], top[1] - TW * 0.5); c.stroke(); if (on && Math.floor(t / 500) % 2) { c.fillStyle = "#ff4b3e"; c.beginPath(); c.arc(top[0], top[1] - TW * 0.5, 2.5, 0, 7); c.fill(); } }
      let text = b.name;
      if (b.k === "dm" && S.openQ) text += " · " + S.openQ + " open";
      labels.push([P(b.x + b.w / 2, b.y + b.d / 2, h + TW * 0.12), text, on ? "rgba(31,58,110,.9)" : "rgba(60,62,66,.75)"]);
    } }));
    S.sites.forEach((s, i) => { if (!SPOT[i]) return; const [sx, sy] = SPOT[i]; list.push({ z: sx + sy + 1, f: () => {
      if (sel === i) { c.lineWidth = 3; poly([P(sx, sy), P(sx + 1, sy), P(sx + 1, sy + 1), P(sx, sy + 1)], "rgba(255,255,255,.25)", "#fff"); }
      if (!s.active) { poly([P(sx + 0.1, sy + 0.1), P(sx + 0.9, sy + 0.1), P(sx + 0.9, sy + 0.9), P(sx + 0.1, sy + 0.9)], "#a68a5b", "#6e5a38"); labels.push([P(sx + 0.5, sy + 0.5, TW * 0.1), s.no + " opens day " + s.actDay, "rgba(60,62,66,.7)"]); return; }
      const h = box(sx + 0.12, sy + 0.12, 0.76, 0.76, siteH(s), "#e6dfcb", s.kri ? ROOF[s.flag] : "#cfcfcf");
      const top = P(sx + 0.5, sy + 0.5, h);
      c.fillStyle = "#fff"; c.fillRect(top[0] - TW * 0.09, top[1] - TW * 0.03, TW * 0.18, TW * 0.06); c.fillRect(top[0] - TW * 0.03, top[1] - TW * 0.09, TW * 0.06, TW * 0.18);
      labels.push([P(sx + 0.5, sy + 0.5, h + TW * 0.14), s.no + " · " + s.rand, sel === i ? "#fff" : null, sel === i ? "#15171a" : null]);
      if (s.flag === 2 || s.monitor !== null) { const bob = still ? 0 : Math.sin(t / 220 + i) * 3; labels.push([P(sx + 0.5, sy + 0.5, h + TW * 0.55 + bob), s.monitor !== null ? "monitor on the way" : "!", s.monitor !== null ? "#1f3a6e" : "#c23b32"]); }
    } }); });
    vans = vans.filter((v) => t - v.t0 < v.dur && SPOT[v.site]);
    vans.forEach((v) => { const u = Math.max(0, (t - v.t0) / v.dur), [x, y] = pathPoint(v.site, v.mon ? 1 - u : u); list.push({ z: x + y + 0.3, f: () => box(x - 0.14, y - 0.09, 0.28, 0.18, 6, v.mon ? "#2f5fd0" : "#ffffff") }); });
    list.sort((a, b) => a.z - b.z).forEach((o) => o.f());
    placed = []; labels.forEach((l) => label(l[0], l[1], l[2], l[3]));
    if (S.done) { c.font = "700 " + Math.round(TW * 0.7) + "px ui-monospace,Menlo,monospace"; c.textAlign = "center"; c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(0, H - TW * 2.6, W, TW * 1.3); c.fillStyle = "#ffe36b"; c.textBaseline = "middle"; c.fillText(S.banner || "READY TO SUBMIT", W / 2, H - TW * 1.95); }
  }

  // ---------- small charts of the page's own ----------
  function chart(cv, o) {
    const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    cv.width = w * r; cv.height = h * r; const g = cv.getContext("2d"); g.scale(r, r);
    const L = 34, Rt = 8, T = 16, B = 18, x0 = o.xmin || 0, y0 = o.ymin || 0, x1 = Math.max(o.xmax, x0 + 1), y1 = Math.max(o.ymax, y0 + 1);
    const X = (x) => L + ((x - x0) / (x1 - x0)) * (w - L - Rt), Y = (y) => h - B - ((y - y0) / (y1 - y0)) * (h - T - B);
    g.font = "10px ui-monospace,Menlo,monospace"; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = y0 + ((y1 - y0) * i) / 4; g.strokeStyle = "#e7e3d7"; g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(w - Rt, Y(y)); g.stroke(); g.fillStyle = "#666"; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(Math.abs(y1 - y0) < 12 ? y.toFixed(1) : Math.round(y), L - 4, Y(y)); }
    g.textAlign = "center"; g.textBaseline = "top"; (o.xl || []).forEach(([x, t]) => g.fillText(t, X(x), h - B + 4));
    let lx = L;
    o.series.forEach((s) => {
      g.strokeStyle = g.fillStyle = s.color; g.lineWidth = s.width || 2; g.setLineDash(s.dash || []);
      if (s.bars) { const bw = Math.max(1, (w - L - Rt) / (x1 - x0) - 1); s.pts.forEach(([x, y]) => g.fillRect(X(x) - bw / 2, Y(y), bw, Y(y0) - Y(y))); }
      else { g.beginPath(); let pen = false; s.pts.forEach(([x, y]) => { if (y === null) { pen = false; return; } pen ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); pen = true; }); g.stroke(); if (s.dots) s.pts.forEach(([x, y]) => { if (y !== null) { g.beginPath(); g.arc(X(x), Y(y), 3, 0, 7); g.fill(); } }); }
      g.setLineDash([]); g.textAlign = "left"; g.textBaseline = "top"; g.fillRect(lx, 4, 10, 3); g.fillStyle = "#333"; g.fillText(s.name, lx + 14, 1); lx += 22 + g.measureText(s.name).width;
    });
  }
  const weekTicks = (maxDay) => { const out = [], step = maxDay > 200 ? 56 : maxDay > 90 ? 28 : 14; for (let d = 0; d <= maxDay; d += step) out.push([d, "wk " + d / 7]); return out; };

  // ---------- the other projects' charts, opened over the city ----------
  const SB_BASE = "https://jwildfire.github.io/study.builder/";
  function closeViz() { if (widget && widget.destroy) { try { widget.destroy(); } catch (e) { /* the widget is gone already */ } } widget = null; $("viz").hidden = true; $("vizBody").textContent = ""; }
  function overlay(title, sub, cls) { closeViz(); playing = false; const body = $("vizBody"); body.className = cls || ""; $("viz").hidden = false; $("vizTitle").textContent = title; $("vizSub").textContent = sub; return body; }

  // The studies to play, a line each: study.builder's picker over its studies feed.
  // Every study in the feed is listed. Only one with its data ready can be played; the others say so when picked.
  const PILOT = "preset:cdisc-pilot-protocol";
  const COPIED = { id: PILOT, kind: "settings", build: {}, name: "CDISC pilot protocol study", line: "Phase 2 · 120 participants · 12 sites · 7 months", mark: "Copied here" };
  const MADE_UP = { id: "sim:made-up", kind: "game", name: "Made-up trial", line: "Phase 3 · invented in this page · you can send monitors", mark: "Game" };
  async function openChooser() {
    const body = overlay("Choose a study", "Pick one to play it from day one", "sb");
    const note = document.createElement("p"); note.className = "soft ss"; body.appendChild(note);
    const host = document.createElement("div"); host.className = "pick-host"; body.appendChild(host);
    let listed = [];
    try { listed = await window.StudyBuilder.listStudies(SB_BASE + "studies/index.json"); }
    catch (e) { note.textContent = "The rest of study.builder's studies need the network, and this page cannot reach it from here. These two work without it."; }
    if (!listed.some((one) => one.id === PILOT)) listed = [COPIED].concat(listed);
    const waiting = listed.filter((one) => !one.build && one.id !== PILOT).length;
    if (waiting) note.textContent = (listed.length - waiting) + " of study.builder's " + listed.length + " studies have their data ready and can be played. The other " + waiting + " are listed with their plan; they play here once study.builder has built them.";
    const now = mode === "arcade" ? MADE_UP.id : (S && S.cfg && S.cfg.listed) || PILOT;
    widget = window.StudyBuilder.mountPicker(host, {
      studies: listed.concat([MADE_UP]), picked: now, theme: "light", label: "Studies to play",
      onPick: async (entry) => {
        if (entry.id === MADE_UP.id) return start("arcade");
        // The pilot is copied into this page: it opens with no fetch.
        if (entry.id === PILOT && canBuild) return start("built");
        if (!entry.build) { note.textContent = entry.name + ": study.builder has this study's plan but has not built its data yet, so there is nothing to play. Pick one marked Data ready, or the made-up trial."; return; }
        note.textContent = "Fetching " + entry.name + "…";
        try { const got = await window.StudyBuilder.openListed(entry); start("built", null, got.study, entry.id); }
        catch (e) { note.textContent = String(e && e.message ? e.message : e); }
      }
    });
  }
  // What the project is. Opens by itself on a first visit, and from the info button after that.
  const SEEN = "simstudy.about.seen";
  function openAbout() {
    const body = overlay("About Sim Study", "A clinical trial you can play, pause and speed up", "sb about");
    body.innerHTML =
      "<p><b>Sim Study puts a clock on a simulated clinical trial.</b> Press Play and the study runs a day at a time: sites open, participants enrol, data arrives, risk reviews flag sites, the database locks and the analysis comes out. The sites are drawn as a small city around the sponsor's campus.</p>" +
      "<h3>How to use it</h3><ul>" +
      "<li><b>Play</b> starts and stops the clock. The button beside it sets the speed: a day, a week or a month a second.</li>" +
      "<li><b>Study</b> lists the studies you can play.</li>" +
      "<li><b>Click a site</b> in the city to follow it. Its roof is its risk colour.</li>" +
      "<li><b>The tabs</b> on the right show the study as it stands today: the overview, the day's data, the week, safety, the road to submission and the report.</li></ul>" +
      "<h3>What is real</h3><ul>" +
      "<li>Every row is synthetic. A flag on a simulated site says nothing about any real one.</li>" +
      "<li>It is a prototype. Nothing here is qualified, and nothing here is a submission.</li></ul>" +
      "<h3>What it is built from</h3>" +
      "<p>Sim Study is a thin layer over open source projects: <a href='https://github.com/jwildfire/study.builder' target='_blank' rel='noopener'>study.builder</a> builds each study, <a href='https://github.com/Gilead-Public/gsm.core' target='_blank' rel='noopener'>Good Statistical Monitoring</a> simulates the data and scores the sites, and <a href='https://github.com/jwildfire/safety.viz' target='_blank' rel='noopener'>safety.viz</a> and <a href='https://github.com/Gilead-Public/gsm.viz' target='_blank' rel='noopener'>gsm.viz</a> draw the charts. The code and the full list are on <a href='https://github.com/jwildfire/sim.study' target='_blank' rel='noopener'>GitHub</a>.</p>" +
      "<p class='ss'><button id='aboutGo' class='primary'>Got it</button></p>";
    $("aboutGo").addEventListener("click", closeViz);
    try { localStorage.setItem(SEEN, "1"); } catch (e) { /* no storage here: the panel opens again next visit */ }
  }
  function firstVisit() { try { return !localStorage.getItem(SEEN); } catch (e) { return false; } }

  function openStudyView() {
    const body = overlay(S.cfg.id + " · study view", "study.builder " + window.StudyBuilder.version + " · the whole study, every layer and every snapshot · not limited to the clock's date", "sb");
    const host = document.createElement("div"); body.appendChild(host);
    try { widget = window.StudyBuilder.mountStudy(host, { study: S.study, theme: "light" }); } catch (e) { host.textContent = "The study view could not be drawn here: " + e.message; }
  }

  function openViz(kind, arg) {
    const body = overlay("", "");
    const head = (t, s) => { $("vizTitle").textContent = t; $("vizSub").textContent = s; };
    try {
      if (kind === "kri") {
        const csv = window.SimStudy.csv, snap = S.gsm.snap, m = S.gsm.metrics.find((x) => x.MetricID === arg);
        head(m.Metric + " by site", "gsm.viz 2.4.1 · gsm's risk review " + S.gsm.number + " of " + S.gsm.date + " · scores from gsm.kri, run by workr");
        const wrap = document.createElement("div"); wrap.style.cssText = "height:min(520px,70vh);position:relative"; const cv = document.createElement("canvas"); wrap.appendChild(cv); body.appendChild(wrap);
        window.gsmViz.default.scatterPlot(cv, S.gsm.results.filter((r) => r.MetricID === arg), m, csv(snap.table("reporting", "Bounds").text).filter((r) => r.MetricID === arg), csv(snap.table("reporting", "Groups").text));
      } else {
        const v = VIZ.find((x) => x[0] === kind), rows = S.rows("adam", v[1]);
        head(v[2], "safety.viz 1.12.0 · " + v[1] + " as the study stood on " + S.gsm.date + " · " + rows.length + " rows" + (S.unblinded ? "" : " · arms blinded"));
        const el = document.createElement("div"); body.appendChild(el);
        window.SafetyViz[kind](el, {}).init(rows);
      }
    } catch (e) { const p = document.createElement("p"); p.textContent = "This chart could not be drawn here: " + e.message; body.appendChild(p); }
    render();
  }

  // ---------- panels ----------
  const charts = [];
  const cv = (id, fn) => { charts.push([id, fn]); return '<canvas class="chart" id="' + id + '"></canvas>'; };
  const stat = (v, l) => '<div class="stat"><b>' + v + "</b><span>" + l + "</span></div>";
  const dayCharts = (withQ) => { const xm = Math.max(28, S.day);
    return (withQ ? cv("cq", (el) => chart(el, { xmax: xm, ymax: Math.max(10, ...S.cuts.map((x) => x.open)) * 1.1, xl: weekTicks(xm), series: [{ name: "open queries", color: "#b8865c", pts: S.cuts.map((x) => [x.day, x.open]) }] })) : "") +
      cv("cn", (el) => chart(el, { xmax: xm, ymax: Math.max(10, ...S.cuts.map((x) => x.n)) * 1.1, xl: weekTicks(xm), series: [{ name: "records per day", color: "#5c7fb8", bars: true, pts: S.cuts.map((x) => [x.day, x.n]) }] })); };

  function pOver() {
    if (!built()) {
      const C = S.cfg;
      return "<h2>" + esc(C.id) + " · made-up trial</h2><p>" + esc(C.title) + ".</p><div class='facts'><span>Phase 3</span><span>" + C.target + " patients</span><span>" + S.sites.length + " sites</span><span>2 arms</span><span>Seed " + S.seed + "</span></div>" +
        "<p><b>Primary endpoint.</b> " + esc(C.primary) + ".</p><h3>Visits</h3><table>" + S.visits.map((v) => "<tr><td>" + v.n + "</td><td>day " + v.d + "</td></tr>").join("") + "</table>" +
        "<div class='note'>Invented in this page. Three sites have a hidden problem: watch the Weekly tab, pick a site and send a monitor. Press <b>Study</b> to play a study from study.builder instead.</div>";
    }
    const snap = S.asOf(), O = window.StudyBuilder.overviewOf(snap || S.study), W = window.StudyBuilder.overviewOf(S.study);
    let h = "<h2>" + esc(O.id) + (S.cfg.nick ? " · " + esc(S.cfg.nick) : "") + "</h2><p>" + esc(S.cfg.title) + "</p>";
    h += "<div class='facts'>" + W.facts.filter((f) => !/^(Study|Snapshot|Status)$/.test(f.label)).map((f) => "<span>" + esc(f.label) + ": " + esc(f.value) + "</span>").join("") + "<span>" + S.cfg.target + " planned</span><span>" + S.arms.length + " arms</span></div>";
    h += "<p><button data-view='study'>Open the full study view</button></p>";
    if (snap) {
      h += "<h3>As of " + esc(S.gsm.date) + " · snapshot " + S.gsm.number + "</h3><div class='stats'>" + O.counts.slice(0, 8).map((c) => stat(esc(c.value), esc(c.label) + (c.note ? " · " + esc(c.note) : ""))).join("") + "</div>";
      h += "<h3>By country</h3><table><tr><th>Country</th><th>Sites</th><th>Participants</th></tr>" + O.countries.map((c) => "<tr><td>" + esc(c.country) + "</td><td>" + c.sites + "</td><td>" + c.participants + "</td></tr>").join("") + "</table>";
    } else h += "<h3>As the clock stands</h3><p class='soft'>Press Play. study.builder's counts appear at the first month's snapshot.</p>";
    if (S.arms.length) h += "<h3>Arms</h3><p>" + S.arms.map(esc).join(" · ") + (S.unblinded ? "" : " <span class='soft'>(blinded in the safety review until lock)</span>") + "</p>";
    h += "<h3>What the study holds, in all</h3><table><tr><th>Layer</th><th>Tables</th><th>Rows</th></tr>" + W.layers.map((l) => "<tr><td>" + esc(l.label) + "</td><td>" + l.tables + "</td><td>" + Number(l.rows).toLocaleString("en-GB") + "</td></tr>").join("") + "</table>";
    if (W.growth && W.growth.length > 1) h += "<h3>How it grows, snapshot by snapshot</h3><table><tr><th>Date</th><th>Participants</th><th>Sites</th><th>Visits</th><th>Events</th></tr>" + W.growth.map((g) => "<tr" + (S.gsm && g.number === S.gsm.number ? " class='sel'" : "") + "><td>" + esc(g.date) + "</td><td>" + g.participants + "</td><td>" + g.sites + "</td><td>" + g.visits + "</td><td>" + g.events + "</td></tr>").join("") + "</table>";
    else h += "<div class='note'>This study file keeps only its last snapshot, so there is one risk review, at the end. Studies built with every snapshot have one a month.</div>";
    h += "<p class='soft'>Facts and counts are study.builder's own overview of the study.</p>";
    return h;
  }

  function pToday() {
    const cut = S.cuts[S.cuts.length - 1];
    if (!cut) return "<h2>Daily raw data cut</h2><p class='soft'>Press Play. The first cut arrives when the first site opens.</p>";
    const forms = built() ? S.forms : FORMS;
    let h = "<h2>Daily raw data cut · " + date(cut.day) + "</h2><p class='soft'>" + (locked() ? "The database is locked. This was the last of " + S.cuts.length + " cuts." : "Cut " + S.cuts.length + ". " + (built() ? "Rows of the study's raw tables dated today." : "What reached the database today, by form.")) + "</p>";
    h += "<table><tr><th>" + (built() ? "Raw table" : "Form") + "</th><th>File</th><th>New today</th><th>To date</th></tr>" + forms.map(([k, n]) => "<tr><td>" + n + "</td><td class='soft'>" + (built() ? k : k.toLowerCase()) + ".csv</td><td>" + cut[k] + "</td><td>" + S.total[k] + "</td></tr>").join("") + "</table>";
    h += "<p class='soft'>Archived as raw/" + iso(cut.day) + "/ · " + cut.senders.length + " site" + (cut.senders.length === 1 ? "" : "s") + " sent data</p>";
    if (built()) {
      h += dayCharts(false) + "<div class='note'><b>Where this comes from.</b> gsm.datasim made every row, inside study.builder. Sim Study only places each row on its own date. Data cleaning is not shown: this study file was built without the query and data-entry tables, which gsm.datasim can make.</div>";
    } else {
      h += "<h3>Data cleaning</h3><div class='stats'>" + stat(cut.qo, "queries raised") + stat(cut.qc, "queries closed") + stat(S.openQ, "open now") + stat(S.pending, "records not yet entered") + "</div>" + dayCharts(true);
    }
    return h;
  }

  function siteCard(s) {
    const h = "<div class='note'><b>Site " + esc(s.no) + " · " + esc(s.city) + ", " + esc(s.country) + "</b> <span class='dot " + (s.kri ? "f" + s.flag : "fx") + "'></span><br>";
    if (!s.active) return h + "Opens on day " + s.actDay + "</div>";
    if (built()) return h + s.screened + " screened · " + s.rand + " enrolled · " + s.completed + " completed · " + s.dropped + " discontinued<br>" + s.aeN + " adverse events · " + s.pdN + " protocol deviations<br><span class='soft'>This study was simulated ahead of time, so a monitor cannot change it yet. The made-up trial lets you send one.</span></div>";
    const can = s.monitor === null && !locked();
    return h + s.screened + " screened · " + s.rand + " randomised · " + s.on + " on study · " + s.completed + " completed · " + s.dropped + " discontinued" +
      "<br>Monitoring visits: " + s.visitsBy + (s.found ? " · last finding: " + ({ underreport: "adverse events under-reported", slow: "slow data entry", sloppy: "careless data entry" })[s.found] : "") +
      "<br><button data-monitor='" + s.i + "'" + (can ? "" : " disabled") + " style='margin-top:6px'>" + (s.monitor !== null ? "Monitor on the way" : "Send a monitor · $15k") + "</button></div>";
  }

  function pWeek() {
    const sn = S.snapshots[S.snapshots.length - 1], word = built() ? "enrolled" : "randomised";
    let h = sel !== null && S.sites[sel] ? siteCard(S.sites[sel]) : "";
    if (!sn) return h + "<h2>Weekly operational snapshot</h2><p class='soft'>The first snapshot is taken on day 7.</p>";
    h += "<h2>Weekly snapshot " + sn.n + " · " + date(sn.day) + "</h2><p class='soft'>Enrolment against plan, and each site's risk indicators.</p>";
    h += "<div class='stats'>" + stat(sn.rand + "/" + S.cfg.target, word) + stat(sn.plan, "planned by now") + stat(sn.screened, "screened") + stat(Math.round(sn.dropRate * 100) + "%", "discontinued") + "</div>";
    if (sn.qtl) h += "<div class='note'>Quality tolerance limit crossed: more than " + S.cfg.qtl * 100 + "% of randomised patients have discontinued.</div>";
    const xm = Math.max(S.cfg.planTo, S.day);
    h += cv("ce", (el) => chart(el, { xmax: xm, ymax: S.cfg.target * 1.05, xl: weekTicks(xm), series: [{ name: "plan", color: "#888", dash: [4, 3], width: 1.5, pts: [[0, 0], [S.cfg.planFrom, 0], [S.cfg.planTo, S.cfg.target], [xm, S.cfg.target]] }, { name: word, color: "#1f3a6e", pts: S.snapshots.map((x) => [x.day, x.rand]) }] }));
    if (built()) {
      if (!S.gsm) return h + "<h3>Site risk</h3><p class='soft'>gsm reviews the sites at each month's end. The first review has not happened yet.</p>";
      const M = S.gsm.metrics;
      h += "<h3>Site risk · gsm's review " + S.gsm.number + ", " + esc(S.gsm.date) + "</h3><table class='kri'><tr><th>Site</th><th>Enr.</th>" + M.map((m) => "<th><button class='lnk' data-kri='" + esc(m.MetricID) + "' title='" + esc(m.Metric) + ": open gsm.viz chart'>" + esc(m.Abbreviation) + "</button></th>").join("") + "</tr>";
      S.sites.forEach((s) => { h += "<tr class='pick" + (sel === s.i ? " sel" : "") + "' data-site='" + s.i + "'><td><span class='dot " + (s.kri ? "f" + s.flag : "fx") + "'></span> " + esc(s.no) + "</td><td>" + s.rand + "</td>" + M.map((m) => { const k = s.kri && s.kri[m.MetricID]; return k ? "<td class='c" + Math.min(2, Math.abs(+k.flag || 0)) + "' title='" + esc(m.Metric) + ": " + k.num + " / " + k.den + "'>" + n1(k.score) + "</td>" : "<td>–</td>"; }).join("") + "</tr>"; });
      h += "</table><p class='soft'>Scores and flags are gsm's own: its " + M.length + " site metrics, worked out by gsm.kri workflows that workr runs inside study.builder, once a month. Press a column head for gsm.viz's chart of that metric.</p>";
      return h;
    }
    h += "<h3>Site risk · since each site's last monitoring visit</h3><table><tr><th>Site</th><th>Rand.</th><th title='Adverse events per patient-week'>AE /pt-wk</th><th title='Queries per 100 records'>Queries /100</th><th title='Days from visit to data entry'>Entry days</th><th></th></tr>";
    S.sites.forEach((s) => { const k = s.kri;
      h += "<tr class='pick" + (sel === s.i ? " sel" : "") + "' data-site='" + s.i + "'><td>" + s.no + " " + s.city + "</td><td>" + s.rand + "</td>" + (k ? "<td class='c" + k.fA + "'>" + n1(k.ae, 2) + "</td><td class='c" + k.fQ + "'>" + n1(k.q) + "</td><td class='c" + k.fL + "'>" + n1(k.lag) + "</td>" : "<td>–</td><td>–</td><td>–</td>") + "<td><span class='dot " + (k ? "f" + s.flag : "fx") + "'></span>" + (s.monitor !== null ? " M" : "") + "</td></tr>"; });
    h += "</table><p class='soft'>Amber: more than two standard errors from the study's own rate. Red: more than three, or entry slower than seven days. Click a row to pick a site.</p>";
    return h;
  }

  function pSafety() {
    const ids = new Set(S.aes.map((a) => a.id)), ub = S.unblinded;
    let h = "<h2>Safety review</h2>" + (ub ? "<p class='soft'>Unblinded after database lock.</p>" : "<div class='blind'>Blinded. The arms are pooled until the database is locked.</div>");
    h += "<div class='stats'>" + stat(S.aes.length, "adverse events") + stat(ids.size, built() ? "participants" : "patients with one") + stat(S.aes.filter((a) => a.ser).length, "serious") + stat(S.aes.filter((a) => a.sev === 2).length, built() ? "grade 3 or more" : "severe") + "</div>";
    const wk = []; S.aes.forEach((a) => { const w = Math.floor(a.day / 7); wk[w] = (wk[w] || 0) + 1; });
    const maxW = Math.max(8, Math.ceil(S.day / 7));
    h += cv("ca", (el) => chart(el, { xmax: maxW, ymax: Math.max(5, ...wk.filter(Boolean)) * 1.15, xl: weekTicks(maxW * 7).map(([d, t]) => [d / 7, t]), series: [{ name: "adverse events by week of onset", color: "#b85c5c", bars: true, pts: Array.from({ length: maxW + 1 }, (_, i) => [i, wk[i] || 0]) }] }));
    if (built()) {
      h += "<h3>Open in safety.viz</h3>" + (S.gsm ? "<p>" + VIZ.map((v) => "<button data-viz='" + v[0] + "' style='margin:0 4px 4px 0'>" + v[2] + "</button>").join("") + "</p><p class='soft'>Each opens over the city on the study's ADaM tables as they stood on " + esc(S.gsm.date) + ", the last month study.builder rebuilt every layer. " + (ub ? "" : "Arms show as Blinded until lock. ") + "The clock pauses while a chart is open.</p>" : "<p class='soft'>The charts open after the first month's snapshot.</p>");
      return h;
    }
    const liver = S.subjects.filter((p) => p.altMax > 3 * S.cfg.uln);
    h += "<h3>Liver signal · ALT above three times the upper limit</h3>" + (liver.length ? "<table><tr><th>Patient</th><th>Peak, × upper limit</th>" + (ub ? "<th>Arm</th>" : "") + "</tr>" + liver.map((p) => "<tr><td>" + p.id + "</td><td>" + n1(p.altMax / S.cfg.uln) + "</td>" + (ub ? "<td>" + (p.arm ? "Orangeril" : "Placebo") + "</td>" : "") + "</tr>").join("") + "</table>" : "<p class='soft'>None so far.</p>");
    const mean = (f) => S.visits.map((v, i) => { const xs = S.subjects.filter((p) => p.sbp[i] !== undefined && f(p)).map((p) => p.sbp[i]); return [v.d / 7, xs.length > 2 ? xs.reduce((a, b) => a + b, 0) / xs.length : null]; }).slice(1);
    h += "<h3>Mean systolic blood pressure by visit, mm Hg</h3>" + cv("cs", (el) => chart(el, { xmax: 14, ymin: 130, ymax: 165, xl: [[0, "base"], [2, "wk 2"], [4, "wk 4"], [8, "wk 8"], [12, "wk 12"], [14, "f/u"]], series: ub ? [{ name: "placebo", color: "#888", dots: true, pts: mean((p) => p.arm === 0) }, { name: "orangeril", color: "#d0661f", dots: true, pts: mean((p) => p.arm === 1) }] : [{ name: "all patients, pooled", color: "#555", dots: true, pts: mean((p) => p.arm !== null) }] }));
    return h;
  }

  function pSub() {
    const C = S.cfg;
    let h = "<h2>Road to submission</h2><p class='soft'>" + esc(C.id) + " · " + esc(C.title) + (built() ? " · " + esc(C.phase) + ", " + esc(C.indication) : "") + ".</p><h3>What a submission needs</h3>";
    h += S.deliverables.map((x) => "<div class='ck " + x.status + "'><i>" + ({ done: "✓", running: "…", missing: "✗" }[x.status] || "·") + "</i><span>" + esc(x.name) + (x.count ? " (" + x.count + ")" : "") + (x.gap ? "<br><small>Not built: " + esc(x.gap) + ".</small>" : "") + "</span><em>" + (x.status === "done" ? date(x.day, true) : x.status === "running" ? "running" : "") + "</em></div>").join("");
    h += "<h3>Milestones</h3>" + (S.milestones.length ? "<table>" + S.milestones.map((m) => "<tr><td>" + esc(m.name) + "</td><td>" + date(m.day, true) + "</td><td>day " + m.day + "</td></tr>").join("") + "</table>" : "<p class='soft'>None yet.</p>");
    if (built()) {
      const why = { "gsm.datasim": "simulated every raw row", "gsm.mapping": "mapped raw for monitoring", "gsm.core": "gsm's shared functions", "gsm.reporting": "shaped results for charts", workr: "ran every workflow", R: "in the browser, by webR" };
      const rows = [["study.builder", window.StudyBuilder.version, "built the study and every layer"]].concat(Object.keys(S.packages).map((k) => [k, S.packages[k], why[k] || ""]), [["safety.viz", "1.12.0", "safety charts"], ["gsm.viz", "2.4.1", "site risk charts"]]);
      h += "<h3>Building blocks in this run</h3><table>" + rows.map((r) => "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td><td style='text-align:left;white-space:normal'>" + esc(r[2]) + "</td></tr>").join("") + "</table>";
      h += "<p class='soft' style='word-break:break-all'>Study key " + esc(S.key) + "</p><div class='note'>Every row is synthetic. The rows marked ✗ are real gaps: nothing here is a submission yet.</div>";
    } else h += "<div class='note'>Made-up trial. Every number is invented in this page from seed " + S.seed + ", and the datasets, tables and report are ticked off on a timer, not built. Switch to the pilot study to see real building blocks at work.</div>";
    return h;
  }

  function pCsrBuilt() {
    const R = S.results;
    if (!R) return "<h2>Analysis results</h2><div class='blind'>Sealed until the database is locked and analysed. The study is in: " + esc(S.phase) + ".</div>";
    const short = (n) => esc(String(n).replace("Xanomeline", "Xan."));
    const hd = "<tr><th></th>" + R.arms.map((a) => "<th>" + short(a.name) + "</th>").join("") + "</tr>", row = (l, f) => "<tr><td>" + l + "</td>" + R.arms.map((a) => "<td>" + f(a) + "</td>").join("") + "</tr>";
    let h = "<div class='csr'><h2>" + esc(S.cfg.id) + " · Analysis results</h2><p><i>" + esc(S.cfg.title) + ".</i></p><p>From study.builder's ADaM and analysis layers, as the study stood at its last snapshot. The study file holds " + Math.round(S.last / 30.4) + " months, so late visits have few participants.</p>";
    h += "<b>Participants and adverse events, by arm</b><table>" + hd + row("Enrolled", (a) => a.n) + row("Discontinued", (a) => a.disc + " (" + pct(a.disc, a.n) + ")") + row("Any adverse event", (a) => a.anyAE + " (" + pct(a.anyAE, a.n) + ")") + row("Serious", (a) => a.sae + " (" + pct(a.sae, a.n) + ")") + row("Severe", (a) => a.severe + " (" + pct(a.severe, a.n) + ")") + row("Events", (a) => a.events) + "</table>";
    if (R.top.length) h += "<b>Commonest adverse events, participants</b><table>" + hd + R.top.map((t) => "<tr><td>" + esc(t.term) + "</td>" + t.by.map((x) => "<td>" + (x ? x.PARTICIPANTS + " (" + n1(x.PERCENT, 0) + "%)" : "0") + "</td>").join("") + "</tr>").join("") + "</table>";
    if (R.eff) { const E = R.eff, er = (l, f) => "<tr><td>" + l + "</td>" + E.arms.map((a) => "<td>" + f(a) + "</td>").join("") + "</tr>";
      h += "<b>" + esc(E.param) + ": change from baseline at " + esc(E.lastV) + "</b><table>" + hd + er("Participants", (a) => n1(a.n, 0)) + er("Mean change (SD)", (a) => n1(a.mean) + " (" + n1(a.sd) + ")") + er("Adjusted difference from " + esc(E.ref), (a) => (a.diff === null ? "" : n1(a.diff))) + er("95% interval", (a) => (a.lo === null ? "" : n1(a.lo) + ", " + n1(a.hi))) + er("p-value", (a) => (a.p === null ? "" : n1(a.p, 3))) + "</table>";
      const ys = [].concat.apply([], E.arms.map((a) => a.curve)).filter((y) => y !== null);
      h += cv("cf", (el) => chart(el, { xmax: E.visits.length - 1, ymin: Math.floor(Math.min(0, ...ys) - 1), ymax: Math.ceil(Math.max(1, ...ys) + 1), xl: E.visits.map((v, i) => [i, v]), series: E.arms.map((a, i) => ({ name: String(a.name).replace("Xanomeline", "Xan.").toLowerCase(), color: ARMC[i % ARMC.length], dots: true, pts: a.curve.map((y, j) => [j, y]) })) })); }
    h += "<p style='font-size:12px;color:#555'>The analysis of covariance is study.builder's analysis workflow, run in R. There is no study report here yet: tables, listings, figures and the report itself are the next blocks (pharmaverse and open.csr).</p></div>";
    return h;
  }

  function pCsr() {
    if (built()) return pCsrBuilt();
    const R = S.results;
    if (!R) return "<h2>Clinical study report</h2><div class='blind'>Sealed until topline. The study is in: " + S.phase + ".</div><h3>Planned tables and figures</h3><p>14.1.1 Patient disposition<br>14.2.1 Primary endpoint<br>14.3.1 Overview of adverse events<br>Figure 1 Mean systolic blood pressure by visit</p>";
    const [a, b] = R.arms, pv = R.p < 0.001 ? "&lt;0.001" : R.p.toFixed(3), win = R.hi < 0;
    let h = "<div class='csr'><h2>" + S.cfg.id + " · Clinical study report" + (S.done ? "" : " (draft)") + "</h2><p><i>" + S.cfg.title + ".</i></p>";
    h += "<p><b>Synopsis.</b> " + R.screened + " patients were screened at 12 sites and " + (a.n + b.n) + " were randomised. At week 12, systolic blood pressure had changed by " + n1(b.mean) + " mm Hg on orangeril and " + n1(a.mean) + " mm Hg on placebo: a difference of " + n1(R.diff) + " mm Hg (95% interval " + n1(R.lo) + " to " + n1(R.hi) + "; p " + pv + "). " + (win ? "The study met its primary endpoint." : "The study did not meet its primary endpoint.") + "</p>";
    const row = (l, f) => "<tr><td>" + l + "</td><td>" + f(a) + "</td><td>" + f(b) + "</td></tr>", hd = "<tr><th></th><th>Placebo</th><th>Orangeril</th></tr>";
    h += "<b>Table 14.1.1 Patient disposition</b><table>" + hd + row("Randomised", (x) => x.n) + row("Completed", (x) => x.completed + " (" + pct(x.completed, x.n) + ")") + row("Discontinued", (x) => x.dropped + " (" + pct(x.dropped, x.n) + ")") + "</table>";
    h += "<b>Table 14.2.1 " + S.cfg.primary + "</b><table>" + hd + row("Patients analysed", (x) => x.nPrim) + row("Baseline, mean", (x) => n1(x.base)) + row("Change, mean (SD)", (x) => n1(x.mean) + " (" + n1(x.sd) + ")") + "<tr><td>Difference (95% interval)</td><td colspan='2'>" + n1(R.diff) + " (" + n1(R.lo) + ", " + n1(R.hi) + ")</td></tr><tr><td>p-value</td><td colspan='2'>" + pv + "</td></tr></table>";
    h += "<b>Table 14.3.1 Overview of adverse events, patients (%)</b><table>" + hd + row("Any adverse event", (x) => x.anyAE + " (" + pct(x.anyAE, x.n) + ")") + row("Serious", (x) => x.sae + " (" + pct(x.sae, x.n) + ")") + row("Severe", (x) => x.severe + " (" + pct(x.severe, x.n) + ")") + row("ALT above 3 × upper limit", (x) => x.alt3 + " (" + pct(x.alt3, x.n) + ")") + row("Events", (x) => x.events) + "</table>";
    h += "<b>Figure 1 Mean systolic blood pressure by visit, mm Hg</b>" + cv("cf", (el) => chart(el, { xmax: 14, ymin: 130, ymax: 165, xl: [[0, "base"], [2, "wk 2"], [4, "wk 4"], [8, "wk 8"], [12, "wk 12"], [14, "f/u"]], series: R.arms.map((x, i) => ({ name: x.name.toLowerCase(), color: i ? "#d0661f" : "#888", dots: true, pts: x.curve.map((y, j) => [S.visits[j].d / 7, y]).slice(1) })) }));
    h += "<p style='font-size:12px;color:#555'>Method in the made-up trial: patients with a week 12 value, two-sample comparison of means, normal approximation.</p></div>";
    return h;
  }

  const PANELS = { over: pOver, today: pToday, week: pWeek, safety: pSafety, sub: pSub, csr: pCsr };
  function render() {
    dirty = false; if (!S) return;
    const d = Math.max(0, S.day);
    $("date").textContent = date(d) + " · day " + d + " · week " + (Math.floor(d / 7) + 1);
    $("money").textContent = built() ? S.cfg.id + " · " + S.nRand + "/" + S.cfg.target + " enrolled" : "$" + (S.spent / 1e6).toFixed(1) + "M spent";
    $("phase").textContent = cap(S.phase);
    $("play").textContent = S.done ? "■ Finished" : playing ? "❚❚ Pause" : "▶ Play"; $("play").disabled = S.done; $("stepBtn").disabled = S.done;
    document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", +b.dataset.speed === speed));
    $("play").classList.toggle("on", playing && !S.done);
    $("speedBtn").textContent = ({ 1: "1 day/s", 7: "1 wk/s", 30: "1 mo/s" })[speed] + ($("timeMore").hidden ? " ▸" : " ◂");
    $("pick").textContent = "Study: " + (built() ? S.cfg.id : "made-up trial") + " ▾";
    document.querySelectorAll(".arcade").forEach((el) => { el.hidden = built(); });
    $("tab-csr").textContent = built() ? "Results" : "Report";
    document.querySelectorAll("[data-tab]").forEach((b) => { b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
    const p = $("panel"), top = p.scrollTop;
    charts.length = 0; p.innerHTML = PANELS[tab](); p.scrollTop = top;
    charts.forEach(([id, fn]) => { const el = $(id); if (el) fn(el); });
    if (S.news.length !== newsN) { newsN = S.news.length; const ul = $("news"); ul.textContent = "";
      S.news.slice(-80).reverse().forEach((n) => { const li = document.createElement("li"), tm = document.createElement("time"); li.className = n.kind; tm.textContent = date(Math.max(0, n.day), true); li.appendChild(tm); li.appendChild(document.createTextNode(n.text)); ul.appendChild(li); }); }
  }

  // ---------- the clock ----------
  function tick() {
    const cut = S.step(); if (!cut) return;
    const now = performance.now();
    if (!still) {
      cut.senders.forEach((i) => { if (vans.length < 40) vans.push({ site: i, t0: now + Math.random() * 200, dur: 900 }); });
      S.sites.forEach((s) => { if (s.monitor !== null && !s._van) { s._van = true; vans.push({ site: s.i, t0: now, dur: 1800, mon: true }); } if (s.monitor === null) s._van = false; });
    }
    if (S.done) { playing = false; tab = "csr"; }
    dirty = true;
  }
  function frame(t) {
    const dt = Math.min(100, t - lastT); lastT = t;
    if (S && playing && !S.done) { acc += (dt / 1000) * speed; let n = 0; while (acc >= 1 && n < 4) { acc -= 1; tick(); n++; } if (acc > 3) acc = 0; }
    draw(t);
    if (dirty && t - lastRender > 220) { lastRender = t; render(); }
    requestAnimationFrame(frame);
  }
  async function start(m, seed, picked, listedId) {
    playing = false; closeViz(); let made = null, problem = null;
    if (m === "built" && picked) {
      try { made = window.SimStudy.fromBuilt(picked, {}); if (!made.sites.length) throw new Error("the study has no sites"); made.cfg.listed = listedId || null; made.news.push({ day: 0, kind: "info", text: "Opened " + made.cfg.id + " from study.builder's portfolio. Every row is synthetic." }); } catch (e) { problem = String(e); made = null; }
    } else if (m === "built" && canBuild) {
      try {
        if (!opened) { $("phase").textContent = "Opening the study…"; opened = await window.SimStudy.openFile(window.SIM_STUDY_FILE); }
        made = window.SimStudy.fromBuilt(opened, window.SIM_STUDY_FILE);
        made.news.push({ day: 0, kind: "info", text: "Opened " + made.cfg.id + " (" + (made.cfg.protocol || made.cfg.title) + "), built by study.builder " + window.StudyBuilder.version + " with gsm.datasim " + (made.packages["gsm.datasim"] || "") + ". Every row is synthetic." });
      } catch (e) { problem = String(e); made = null; }
    }
    if (made) mode = "built";
    else {
      mode = "arcade"; seed = seed || +hash("seed", 301);
      made = window.SimStudy.Sim(seed); made.auto = $("auto").checked;
      made.news.push({ day: 0, kind: "info", text: "Protocol " + made.cfg.id + " approved. Twelve sites are being set up. Seed " + seed + "." });
      if (problem) made.news.push({ day: 0, kind: "safety", text: "The study.builder study could not be opened here, so this is the made-up trial. " + problem });
    }
    S = made; layout(S.sites.length); sel = null; vans = []; acc = 0; newsN = -1; tab = "over"; dirty = true; render();
  }

  $("tabs").innerHTML = TABS.map(([k, n]) => "<button role='tab' id='tab-" + k + "' data-tab='" + k + "'>" + n + "</button>").join("");
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { tab = b.dataset.tab; $("panel").scrollTop = 0; render(); } });
  $("play").addEventListener("click", () => { playing = !playing; if (playing) closeViz(); render(); });
  $("speedBtn").addEventListener("click", () => { const m = $("timeMore"); m.hidden = !m.hidden; $("speedBtn").setAttribute("aria-expanded", String(!m.hidden)); render(); });
  $("pick").addEventListener("click", openChooser);
  $("info").addEventListener("click", openAbout);
  $("stepBtn").addEventListener("click", () => { playing = false; tick(); render(); });
  $("auto").addEventListener("change", (e) => { S.auto = e.target.checked; });
  $("fresh").addEventListener("click", () => start("arcade", 1 + Math.floor(Math.random() * 99999)));
  $("vizClose").addEventListener("click", closeViz);
  document.querySelectorAll("[data-speed]").forEach((b) => b.addEventListener("click", () => { speed = +b.dataset.speed; playing = true; closeViz(); render(); }));
  $("panel").addEventListener("click", (e) => {
    const m = e.target.closest("[data-monitor]"), k = e.target.closest("[data-kri]"), v = e.target.closest("[data-viz]"), r = e.target.closest("[data-site]");
    if (e.target.closest("[data-view]")) openStudyView(); else if (m) { S.dispatch(+m.dataset.monitor, "You"); render(); } else if (k) openViz("kri", k.dataset.kri); else if (v) openViz(v.dataset.viz); else if (r) { sel = +r.dataset.site; render(); }
  });
  $("city").addEventListener("click", (e) => {
    if (!S) return;
    const b = e.target.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = TW * 0.9;
    S.sites.forEach((s, i) => { if (!SPOT[i]) return; const p = P(SPOT[i][0] + 0.5, SPOT[i][1] + 0.5, (siteH(s) * TW) / 80), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
    sel = best; if (best !== null) tab = "week"; render();
  });
  document.addEventListener("keydown", (e) => { if (e.code === "Space" && e.target.tagName !== "BUTTON" && e.target.tagName !== "INPUT") { e.preventDefault(); playing = !playing; render(); } });
  window.addEventListener("resize", () => { dirty = true; });

  start(hash("study", "pilot") === "made-up" ? "arcade" : "built").then(() => { requestAnimationFrame(frame); if (firstVisit() && !/about=off/.test(location.hash)) openAbout(); });
  window.__sim = { get S() { return S; }, tick, render, openViz, openChooser, openAbout, openStudyView, start, set tab(v) { tab = v; }, set sel(v) { sel = v; } };
})();
