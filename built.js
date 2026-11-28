/* Sim Study: the clock over a study that study.builder built.
   Nothing is invented here. Every count is a row of the study, placed on the day its own date says.
   The monthly risk reviews are gsm's own results, read from the study's snapshot for that month. */
(function () {
  "use strict";

  function csv(text) {
    const rows = []; let row = [], f = "", q = false, wasQ = false;
    const push = () => { row.push(wasQ ? f : f === "" || f === "NA" ? null : isNaN(f) ? f : +f); f = ""; wasQ = false; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') { q = true; wasQ = true; } else if (ch === ",") push(); else if (ch === "\n") { push(); rows.push(row); row = []; } else if (ch !== "\r") f += ch;
    }
    if (f !== "" || row.length) { push(); rows.push(row); }
    const h = rows.shift() || [];
    return rows.filter((r) => r.length === h.length).map((r) => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; });
  }

  // the study file travels as a script (base64 of the gzipped file), so the page needs no fetch
  async function openFile(file) {
    const bin = atob(file.gz), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return window.StudyBuilder.openStudy(JSON.parse(text));
  }

  const DOMS = [
    ["ENROLL", "Screening and enrolment", "enroll_dt"], ["VISIT", "Visits", "visit_dt"], ["VS", "Vital signs", "vs_dt"], ["LB", "Laboratory", "lb_dt"],
    ["EG", "ECG", "eg_dt"], ["QS", "Questionnaires", "qs_dt"], ["AE", "Adverse events", "aest_dt"], ["PD", "Protocol deviations", "dvdtm"],
    ["STUDCOMP", "Study completion", "mincreated_dts"], ["SDRGCOMP", "Treatment completion", "mincreated_dts"],
    ["QUERY", "Queries", null], ["DATAENT", "Data entry", null], ["DATACHG", "Data changes", null],
  ];

  function fromBuilt(study, file) {
    const table = (l, id, s) => { try { const t = (s || study).table(l, id); return t ? csv(t.text) : []; } catch (e) { return []; } };
    const has = (l, id) => { const L = study.layers.find((x) => x.id === l); return !!(L && L.tables.some((t) => t.id === id)); };
    const STUDY = table("raw", "STUDY")[0] || {}, SITE = table("raw", "SITE"), SUBJ = table("raw", "SUBJ");
    const ms = (s) => (typeof s === "string" && /^\d{4}-\d\d-\d\d/.test(s) ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null);
    const lastMs = ms(study.snapshotDate);
    let t0 = Math.min.apply(null, SITE.map((r) => ms(r.site_active_dt)).filter(Boolean));
    const D = (s) => { const m = ms(s); return m === null ? null : Math.max(0, Math.round((m - t0) / 864e5)); };
    const last = D(study.snapshotDate);
    const clamp = (d) => (d === null ? last : Math.min(d, last));

    const S = {
      kind: "built", study, day: -1, phase: "start-up", done: false, unblinded: false, auto: false, last,
      sites: [], subjects: [], aes: [], cuts: [], snapshots: [], news: [], milestones: [], reviews: [], gsm: null,
      openQ: 0, pending: 0, nRand: 0, nScreened: 0, results: null, total: {}, forms: [], spent: 0,
      packages: study.packages || {}, key: (study.manifest && study.manifest.key) || file.key || "",
      visits: [], cfg: {
        id: STUDY.studyid || "study", nick: STUDY.nickname || "", phase: STUDY.phase || "", indication: STUDY.protocol_indication || "",
        title: (study.protocol && (study.protocol.name || study.protocol.title)) || STUDY.protocol_title || "", protocol: study.protocol ? study.protocol.name : null,
        target: +STUDY.num_plan_subj || SUBJ.length, planFrom: D(STUDY.est_fpfv || STUDY.act_fpfv) || 0, planTo: D(STUDY.est_lpfv) || last, qtl: 0.15,
      },
    };
    const say = (text, kind) => S.news.push({ day: S.day, text, kind: kind || "info" });
    const mile = (name) => { S.milestones.push({ name, day: S.day }); say(name + ".", "mile"); };

    const siteIx = {};
    SITE.slice().sort((a, b) => (D(a.site_active_dt) || 0) - (D(b.site_active_dt) || 0)).forEach((r, i) => {
      siteIx[r.invid] = i;
      S.sites.push({ i, id: r.invid, no: String(r.invid).replace(/^SITE/, ""), city: r.City || "", country: r.Country || "", pi: r.InvestigatorLastName || "",
        actDay: D(r.site_active_dt) || 0, active: false, screened: 0, rand: 0, completed: 0, dropped: 0, aeN: 0, pdN: 0, on: 0, flag: 0, kri: null, monitor: null, visitsBy: 0 });
    });
    const subjSite = {}, subjArm = {};
    SUBJ.forEach((r) => { subjSite[r.subjid] = siteIx[r.invid]; subjArm[r.subjid] = r.arm; });
    S.arms = Array.from(new Set(SUBJ.map((r) => r.arm).filter(Boolean))).sort((a, b) => (/placebo/i.test(a) ? -1 : /placebo/i.test(b) ? 1 : a < b ? -1 : 1));

    // every dated row, on its day
    const days = Array.from({ length: last + 1 }, () => ({ n: {}, senders: new Set(), ev: [] }));
    DOMS.forEach(([id, label, col]) => {
      if (!has("raw", id)) return;
      const rows = table("raw", id); if (!rows.length) return;
      const c = col && col in rows[0] ? col : Object.keys(rows[0]).find((k) => /(_dt|dtm|dts)$/i.test(k));
      if (!c) return;
      S.forms.push([id, label]); S.total[id] = 0;
      rows.forEach((r) => {
        const d = days[clamp(D(r[c]))], si = r.invid in siteIx ? siteIx[r.invid] : subjSite[r.subjid];
        d.n[id] = (d.n[id] || 0) + 1; if (si !== undefined) d.senders.add(si);
        if (id === "ENROLL") d.ev.push(["enroll", si, r.enrollyn === "Y", r.subjid]);
        if (id === "AE") d.ev.push(["ae", si, { id: r.subjid, arm: subjArm[r.subjid], ser: r.aeser === "Y", sev: +r.aetoxgr >= 3 ? 2 : +r.aetoxgr === 2 ? 1 : 0 }]);
        if (id === "PD") d.ev.push(["pd", si]);
        if (id === "STUDCOMP" && r.compyn) d.ev.push(["comp", si, r.compyn === "Y"]);
      });
    });
    S.hasQueries = has("raw", "QUERY");
    // what each count comes to by the end of the file, so a trend line can be drawn against it as the clock runs
    S.finals = { screened: 0, enrolled: 0, sites: S.sites.length, ae: 0, sae: 0, pd: 0, visits: 0, left: 0, stopped: 0 };
    days.forEach((d) => {
      S.finals.visits += d.n.VISIT || 0; S.finals.left += d.n.STUDCOMP || 0; S.finals.stopped += d.n.SDRGCOMP || 0;
      d.ev.forEach((e) => { if (e[0] === "enroll") { S.finals.screened++; if (e[2]) S.finals.enrolled++; } if (e[0] === "ae") { S.finals.ae++; if (e[2].ser) S.finals.sae++; } if (e[0] === "pd") S.finals.pd++; });
    });
    S.daily = [];
    const lastEnroll = days.reduce((a, d, i) => (d.ev.some((e) => e[0] === "enroll" && e[2]) ? i : a), 0);
    const history = (study.history || []).filter((h) => !h.problem).map((h) => ({ date: h.date, number: h.number, day: D(h.date) }));
    const lockDay = Math.max(D(STUDY.db_lock_dt) || 0, last + 7);

    const miss = (key, name, gap) => ({ key, name, status: "missing", day: null, count: 0, gap });
    const item = (key, name, status, day) => ({ key, name, status, day: day === undefined ? null : day, count: 0 });
    const adam = (study.layers.find((l) => l.id === "adam") || { tables: [] }).tables.map((t) => t.id).join(", ");
    S.deliverables = [
      S.cfg.protocol ? item("protocol", "Protocol schedule of activities, read from CDISC USDM by study.builder", "done", 0) : miss("protocol", "Protocol", "this study was built from a size and a phase, not a protocol"),
      item("cuts", "Daily raw data cuts: " + S.forms.length + " tables from gsm.datasim", "running"),
      item("snaps", "Weekly operational snapshots", "running"),
      item("reviews", "Monthly risk reviews: gsm's site metrics, run by workr", "running"),
      item("lock", "Database lock", "pending"),
      miss("sdtm", "SDTM datasets and define.xml", "study.builder has no SDTM layer yet"),
      item("adam", "ADaM datasets, light form: " + adam, "pending"),
      item("analysis", "Analysis results: adverse events by arm" + (has("analysis", "EfficacySummary") ? ", efficacy by arm" : ""), "pending"),
      miss("tlf", "Tables, listings and figures", "planned through pharmaverse and open.csr"),
      miss("csr", "Clinical study report", "planned through open.csr"),
      miss("package", "Submission package, module 5", "needs the four rows above"),
    ];
    const deliv = (k) => S.deliverables.find((x) => x.key === k);
    const finish = (k) => { const x = deliv(k); x.status = "done"; x.day = S.day; say(x.name + ": done.", "mile"); };
    const timers = [];

    function review(h) {
      const snap = study.at(h.date); if (!snap) return;
      const results = table("reporting", "Results", snap), metrics = table("reporting", "Metrics", snap);
      S.gsm = { date: h.date, number: h.number, day: h.day, snap, results, metrics };
      S.sites.forEach((s) => {
        const mine = results.filter((r) => r.GroupID === s.id && r.GroupLevel === "Site");
        if (!mine.length) { s.kri = null; s.flag = 0; return; }
        const was = s.flag; s.kri = {}; let worst = 0;
        mine.forEach((r) => { s.kri[r.MetricID] = { score: r.Score, flag: r.Flag, num: r.Numerator, den: r.Denominator }; worst = Math.max(worst, Math.abs(+r.Flag || 0)); });
        s.flag = Math.min(2, worst);
        if (s.flag === 2 && was < 2) say("Risk signal: site " + s.no + " (" + s.city + ") is red in gsm's review.", "rbqm");
      });
      const red = S.sites.filter((s) => s.flag === 2).length, amber = S.sites.filter((s) => s.flag === 1).length;
      S.reviews.push({ number: h.number, date: h.date, day: h.day, red, amber });
      deliv("reviews").count++;
      say("Risk review " + h.number + " (gsm, " + metrics.length + " metrics): " + red + " red, " + amber + " amber of " + S.sites.filter((s) => s.kri).length + " sites.", "rbqm");
    }

    function analyse() {
      const snap = study, adsl = table("adam", "ADSL", snap), adae = table("adam", "ADAE", snap), eff = table("analysis", "EfficacySummary", snap), top = table("analysis", "AESummaryByArm", snap);
      const comp = table("raw", "STUDCOMP"), out = {};
      const arms = S.arms.map((name) => {
        const mine = adsl.filter((r) => r.ARM === name), ids = new Set(mine.map((r) => r.USUBJID)), ae = adae.filter((r) => ids.has(r.USUBJID));
        const subj = (f) => new Set(ae.filter(f).map((r) => r.USUBJID)).size;
        return { name, n: mine.length, disc: comp.filter((r) => r.compyn === "N" && ids.has(r.subjid)).length, anyAE: subj(() => true), events: ae.length, sae: subj((r) => r.AESER === "Y"), severe: subj((r) => r.AESEV === "SEVERE") };
      });
      out.arms = arms;
      out.top = Array.from(new Set(top.slice().sort((a, b) => b.PARTICIPANTS - a.PARTICIPANTS).map((r) => r.AEDECOD))).slice(0, 6).map((term) => ({ term, by: S.arms.map((a) => top.find((r) => r.ARM === a && r.AEDECOD === term) || null) }));
      if (eff.length) {
        const visits = Array.from(new Set(eff.filter((r) => /Change/.test(r.ANALYSIS)).sort((a, b) => a.VISITNUM - b.VISITNUM).map((r) => r.VISIT)));
        const val = (an, arm, visit, stat) => { const r = eff.find((x) => an.test(x.ANALYSIS) && x.ARM === arm && (!visit || x.VISIT === visit) && x.STATISTIC === stat); return r ? +r.VALUE : null; };
        const lastV = visits[visits.length - 1];
        out.eff = { param: eff[0].PARAM, visits, lastV, ref: eff[0].REFARM,
          arms: S.arms.map((a) => ({ name: a, n: val(/Change/, a, lastV, "n"), mean: val(/Change/, a, lastV, "mean"), sd: val(/Change/, a, lastV, "sd"),
            diff: val(/covariance/, a, null, "adjusted difference"), lo: val(/covariance/, a, null, "lower 95% limit"), hi: val(/covariance/, a, null, "upper 95% limit"), p: val(/covariance/, a, null, "p-value"),
            curve: visits.map((v) => val(/Change/, a, v, "mean")) })) };
      }
      return out;
    }

    function step() {
      if (S.done) return null;
      S.day++;
      const d = S.day, src = d <= last ? days[d] : { n: {}, senders: new Set(), ev: [] };
      const cut = { day: d, n: 0, senders: Array.from(src.senders), qo: 0, qc: 0, open: 0, pd: 0 };
      S.forms.forEach(([id]) => { cut[id] = src.n[id] || 0; cut.n += cut[id]; S.total[id] += cut[id]; });
      S.sites.forEach((s) => { if (!s.active && d >= s.actDay) { s.active = true; say("Site " + s.no + " (" + s.city + ", " + s.country + ") is open.", "site"); if (S.phase === "start-up") S.phase = "enrolling"; } });
      src.ev.forEach((e) => {
        const s = S.sites[e[1]]; if (!s) return;
        if (e[0] === "enroll") { s.screened++; S.nScreened++; if (e[2]) { s.rand++; s.on++; S.nRand++; if (S.nRand === 1) mile("First participant enrolled"); } }
        if (e[0] === "ae") { S.aes.push(Object.assign({ day: d }, e[2])); s.aeN++; if (e[2].ser) say("Serious adverse event at site " + s.no + " (" + s.city + "). Treatment stays blinded.", "safety"); }
        if (e[0] === "pd") { s.pdN++; cut.pd++; }
        if (e[0] === "comp") { s.on = Math.max(0, s.on - 1); if (e[2]) s.completed++; else s.dropped++; }
      });
      // the counts as the clock stands today: every one is rows of the study dated up to now
      if (d <= last) S.daily.push({ day: d, screened: S.nScreened, enrolled: S.nRand, sites: S.sites.filter((x) => x.active).length, ae: S.aes.length, sae: S.aes.filter((x) => x.ser).length,
        pd: S.sites.reduce((n, x) => n + x.pdN, 0), visits: S.total.VISIT || 0, left: S.total.STUDCOMP || 0, stopped: S.total.SDRGCOMP || 0 });
      S.pending = d <= last ? cut.n : 0;
      if (d <= lockDay) {
        S.cuts.push(cut); deliv("cuts").count++;
        if (d > 0 && d % 7 === 0) {
          const plan = Math.round(S.cfg.target * Math.min(1, Math.max(0, (d - S.cfg.planFrom) / Math.max(1, S.cfg.planTo - S.cfg.planFrom))));
          const dropped = S.sites.reduce((a, s) => a + s.dropped, 0);
          S.snapshots.push({ n: S.snapshots.length + 1, day: d, rand: S.nRand, plan, screened: S.nScreened, aes: S.aes.length, sae: S.aes.filter((a) => a.ser).length, dropRate: S.nRand ? dropped / S.nRand : 0 });
          deliv("snaps").count++;
        }
      }
      history.forEach((h) => { if (h.day === d || (d === last && h.day > last && !h.seen)) { h.seen = true; review(h); } });
      if (S.phase === "enrolling" && d > lastEnroll) { S.phase = "treatment"; mile("Last participant enrolled (" + S.nRand + " of " + S.cfg.target + " planned)"); }
      if (d === last) { S.phase = "cleaning"; mile("Last data in this study file"); }
      if (d === lockDay) {
        S.phase = "analysis"; mile("Database lock"); const x = deliv("lock"); x.status = "done"; x.day = d;
        ["cuts", "snaps", "reviews"].forEach((k) => { deliv(k).status = "done"; deliv(k).day = d; });
        timers.push([d + 1, () => { S.unblinded = true; say("Treatment codes released to the statisticians.", "mile"); }], [d + 3, () => finish("adam")], [d + 7, () => finish("analysis")],
          [d + 9, () => { S.results = analyse(); mile("Analysis results"); S.done = true; S.phase = "analysed"; S.banner = "LOCKED AND ANALYSED"; }]);
      }
      for (let k = timers.length - 1; k >= 0; k--) if (d >= timers[k][0]) { const f = timers[k][1]; timers.splice(k, 1); f(); }
      return cut;
    }

    // rows for a chart, as the study stood at the latest monthly snapshot the clock has passed
    S.asOf = () => (S.gsm ? S.gsm.snap : null);
    S.rows = (layer, id) => { const snap = S.asOf(); if (!snap) return []; const rows = table(layer, id, snap); if (!S.unblinded) rows.forEach((r) => { if ("ARM" in r) r.ARM = "Blinded"; }); return rows; };
    S.step = step; S.dispatch = () => false;
    S.dateOf = (d) => new Date(t0 + d * 864e5);
    S.utc = true;
    return S;
  }

  window.SimStudy = window.SimStudy || {};
  window.SimStudy.csv = csv; window.SimStudy.openFile = openFile; window.SimStudy.fromBuilt = fromBuilt;
})();
