/* Sim Study: the trial engine. No drawing here.
   One call to step() is one study day. Everything is made up from a seed; nothing is read or sent.
   The seam for later: step() is the clock. Today it invents the day's records itself. The plan is
   for the same clock to ask study.builder for the day's raw cut and study.viz for the weekly pictures. */
(function () {
  "use strict";

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const VISITS = [
    { n: "Screening", d: -14 }, { n: "Baseline", d: 0 }, { n: "Week 2", d: 14 }, { n: "Week 4", d: 28 },
    { n: "Week 8", d: 56 }, { n: "Week 12", d: 84 }, { n: "Follow-up", d: 98 },
  ];
  const SITE_NAMES = [
    ["Durham", "US"], ["Boston", "US"], ["San Diego", "US"], ["Toronto", "CA"], ["Leeds", "UK"], ["Cardiff", "UK"],
    ["Lyon", "FR"], ["Hamburg", "DE"], ["Krakow", "PL"], ["Valencia", "ES"], ["Osaka", "JP"], ["Melbourne", "AU"],
  ];
  const CFG = {
    id: "ORG-301", target: 240, uln: 40, start: new Date(2027, 0, 4),
    title: "A randomised, double-blind, placebo-controlled phase 3 study of orangeril in adults with hypertension",
    primary: "Change from baseline in seated systolic blood pressure at week 12",
    planFrom: 21, planTo: 180, qtl: 0.15,
  };
  const QUIRKS = {
    underreport: "adverse events were being left off the form; the backlog is now entered",
    slow: "one coordinator was entering three sites' worth of data; a second is now trained",
    sloppy: "units and dates were being typed by hand; the site has been retrained",
  };

  function Sim(seed) {
    const R = rng(seed);
    const norm = (m, s) => { let u = 0; while (!u) u = R(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
    const shuffle = (xs) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)), t = xs[i]; xs[i] = xs[j]; xs[j] = t; } return xs; };
    const pois = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };

    const S = {
      seed, cfg: CFG, visits: VISITS, day: -1, phase: "start-up", auto: true, unblinded: false, done: false,
      sites: [], subjects: [], aes: [], cuts: [], snapshots: [], news: [], monitors: [], milestones: [],
      openQ: 0, pending: 0, nRand: 0, nScreened: 0, spent: 2.4e6, results: null, recruitClosed: false,
      total: { DM: 0, VS: 0, LB: 0, EX: 0, AE: 0, DS: 0, DV: 0, q: 0 },
    };
    const pend = new Map(), qpend = new Map(), timers = [];
    const say = (text, kind) => S.news.push({ day: S.day, text, kind: kind || "info" });
    const mile = (name) => { S.milestones.push({ name, day: S.day }); say(name + ".", "mile"); };

    S.deliverables = [
      ["protocol", "Protocol and statistical analysis plan", "done", 0],
      ["plans", "Data management and risk-based monitoring plans", "done", 0],
      ["cuts", "Daily raw data cuts, archived", "running"],
      ["snaps", "Weekly operational snapshots", "running"],
      ["safety", "Weekly safety reviews, blinded", "running"],
      ["lock", "Database lock", "pending"],
      ["sdtm", "SDTM datasets and define.xml", "pending"],
      ["adam", "ADaM analysis datasets", "pending"],
      ["tlf", "Tables, listings and figures", "pending"],
      ["csr", "Clinical study report", "pending"],
      ["package", "Submission package, module 5", "pending"],
    ].map(([key, name, status, day]) => ({ key, name, status, day: day === undefined ? null : day, count: 0 }));
    const deliv = (key) => S.deliverables.find((x) => x.key === key);
    const finish = (key, note) => { const x = deliv(key); x.status = "done"; x.day = S.day; say(x.name + ": " + (note || "done") + ".", "mile"); };

    // twelve sites; three of them have a problem nobody has been told about
    const order = shuffle(SITE_NAMES.map((_, i) => i));
    const quirkOf = {}; ["underreport", "slow", "sloppy"].forEach((q, i) => { quirkOf[order[i]] = q; });
    SITE_NAMES.forEach(([city, country], i) => {
      const q = quirkOf[i] || null;
      S.sites.push({
        i, no: 101 + i, city, country, quirk: q, found: null, active: false,
        actDay: i === order[11] ? 0 : Math.floor(R() * 46), rate: 0.14 + R() * 0.2,
        lag: q === "slow" ? 9 : 1 + R() * 2, err: q === "sloppy" ? 0.17 : 0.03 + R() * 0.03,
        aeReport: q === "underreport" ? 0.3 : 1, dev: 0.01 + R() * 0.02, qDelay: 3 + R() * 4,
        hidden: [], block: [], screened: 0, rand: 0, on: 0, completed: 0, dropped: 0, sf: 0, devs: 0, aeN: 0,
        k: { ae: 0, pt: 0, q: 0, ent: 0, lag: 0 }, kri: null, flag: 0, redWeeks: 0, monitor: null, visitsBy: 0,
      });
    });

    function enter(site, dom, n) {
      for (let j = 0; j < (n || 1); j++) {
        const lag = Math.max(0, Math.round(site.lag + R() * 2));
        const d = S.day + lag;
        if (!pend.has(d)) pend.set(d, []);
        pend.get(d).push({ s: site.i, dom, lag, v: site.visitsBy });
        S.pending++;
      }
    }

    function newSubject(site) {
      site.screened++; S.nScreened++;
      const base = S.day + 14 + Math.floor(R() * 4);
      const due = VISITS.map((v, i) => (i === 0 ? S.day : i === 1 ? base : base + v.d + Math.round(norm(0, 1.2))));
      S.subjects.push({
        id: site.no + "-" + String(site.screened).padStart(3, "0"), site: site.i, arm: null, status: "screening",
        due, next: 0, sbp0: norm(156, 9), resp: 0, sbp: [], alt0: Math.max(9, norm(24, 6)), alt: [], liver: false, altMax: 0,
      });
    }

    function visit(p, i) {
      const site = S.sites[p.site];
      S.spent += 1300;
      if (i === 0) { enter(site, "DM"); enter(site, "VS"); enter(site, "LB"); return; }
      if (i === 1) {
        if (R() < 0.2) { p.status = "screenfail"; site.sf++; enter(site, "DS"); return; }
        if (!site.block.length) site.block = shuffle([0, 0, 1, 1]);
        p.arm = site.block.pop(); p.status = "active"; site.rand++; site.on++; S.nRand++;
        p.resp = norm(p.arm ? -12.5 : -4, 11);
        p.liver = R() < (p.arm ? 0.04 : 0.005);
        if (S.nRand === 1) mile("First patient randomised");
        if (S.nRand === CFG.target / 2) mile("Half of the patients randomised");
      } else if (i <= 5 && R() < (p.arm ? 0.022 : 0.016)) {
        p.status = "dropped"; site.on--; site.dropped++; enter(site, "DS"); return;
      }
      const d = VISITS[i].d, f = (1 - Math.exp(-d / 30)) / (1 - Math.exp(-84 / 30));
      p.sbp[i] = p.sbp0 + p.resp * Math.min(f, 1.02) + norm(0, 6);
      const bump = p.liver ? 1 + (2.6 + R() * 4) * Math.exp(-Math.pow((d - 56) / 30, 2)) : 0.8 + R() * 0.5;
      p.alt[i] = p.alt0 * bump; p.altMax = Math.max(p.altMax, p.alt[i]);
      if (p.alt[i] > 3 * CFG.uln && !p.altFlag) { p.altFlag = true; say("Lab alert: ALT above three times the upper limit, subject " + p.id + ".", "safety"); }
      enter(site, "VS"); enter(site, "LB"); if (i <= 5) enter(site, "EX");
      if (R() < site.dev) { site.devs++; enter(site, "DV"); }
      if (i === 6) { p.status = "completed"; site.on--; site.completed++; enter(site, "DS"); }
    }

    function dispatch(i, by) {
      const site = S.sites[i];
      if (!site || !site.active || site.monitor !== null || S.phase === "analysis" || S.phase === "reporting" || S.done) return false;
      site.monitor = S.day + 3; S.spent += 15000;
      say((by || "You") + " sent a monitor to site " + site.no + " (" + site.city + "). Arrives in three days.", "rbqm");
      return true;
    }

    function monitorArrives(site) {
      site.monitor = null; site.visitsBy++; site.redWeeks = 0; site.flag = 0;
      site.k = { ae: 0, pt: 0, q: 0, ent: 0, lag: 0 };
      if (site.quirk) {
        const q = site.quirk; site.found = q; site.quirk = null;
        if (q === "underreport") { site.aeReport = 1; site.hidden.forEach((ae) => { S.aes.push(ae); site.aeN++; enter(site, "AE"); }); site.hidden = []; }
        if (q === "slow") site.lag = 2;
        if (q === "sloppy") site.err = 0.04;
        say("Monitoring finding at site " + site.no + " (" + site.city + "): " + QUIRKS[q] + ".", "rbqm");
      } else say("Monitor at site " + site.no + " (" + site.city + ") found nothing wrong.", "rbqm");
    }

    function snapshot() {
      const act = S.sites.filter((s) => s.active);
      const T = act.reduce((a, s) => ({ ae: a.ae + s.k.ae, pt: a.pt + s.k.pt, q: a.q + s.k.q, ent: a.ent + s.k.ent }), { ae: 0, pt: 0, q: 0, ent: 0 });
      const aeRate = T.pt ? T.ae / T.pt : 0, qRate = T.ent ? T.q / T.ent : 0;
      const lvl = (z) => (Math.abs(z) > 3 ? 2 : Math.abs(z) > 2 ? 1 : 0);
      act.forEach((s) => {
        const eA = aeRate * s.k.pt, eQ = qRate * s.k.ent;
        const zA = eA >= 4 ? (s.k.ae - eA) / Math.sqrt(eA) : null, zQ = eQ >= 4 ? (s.k.q - eQ) / Math.sqrt(eQ) : null;
        const lag = s.k.ent >= 12 ? s.k.lag / s.k.ent : null;
        const fA = zA === null ? 0 : lvl(zA), fQ = zQ === null ? 0 : zQ > 3 ? 2 : zQ > 2 ? 1 : 0, fL = lag === null ? 0 : lag > 7 ? 2 : lag > 5 ? 1 : 0;
        s.kri = { ae: s.k.pt ? (s.k.ae / s.k.pt) * 7 : null, zA, fA, q: s.k.ent ? (s.k.q / s.k.ent) * 100 : null, zQ, fQ, lag, fL };
        s.flag = Math.max(fA, fQ, fL);
        s.redWeeks = s.flag === 2 ? s.redWeeks + 1 : 0;
        if (s.flag === 2 && s.redWeeks === 1) say("Risk signal: site " + s.no + " (" + s.city + ") is red on " + (fA === 2 ? "adverse event reporting" : fQ === 2 ? "query rate" : "data entry delay") + ".", "rbqm");
        if (S.auto && s.redWeeks >= 2) dispatch(s.i, "Autopilot");
      });
      const dropped = S.sites.reduce((a, s) => a + s.dropped, 0);
      const plan = Math.round(CFG.target * Math.min(1, Math.max(0, (S.day - CFG.planFrom) / (CFG.planTo - CFG.planFrom))));
      const snap = {
        n: S.snapshots.length + 1, day: S.day, rand: S.nRand, plan, screened: S.nScreened, openQ: S.openQ,
        aes: S.aes.length, sae: S.aes.filter((a) => a.ser).length, red: act.filter((s) => s.flag === 2).length,
        amber: act.filter((s) => s.flag === 1).length, dropRate: S.nRand ? dropped / S.nRand : 0,
      };
      snap.qtl = snap.dropRate > CFG.qtl && S.nRand > 40;
      S.snapshots.push(snap);
      deliv("snaps").count++; deliv("safety").count++;
    }

    function phi(z) { // normal distribution function
      const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
      const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
      return z > 0 ? 1 - p : p;
    }

    function analyse() {
      const arms = [0, 1].map((a) => {
        const all = S.subjects.filter((p) => p.arm === a);
        const ch = all.filter((p) => p.sbp[5] !== undefined && p.sbp[1] !== undefined).map((p) => p.sbp[5] - p.sbp[1]);
        const mean = ch.reduce((x, y) => x + y, 0) / ch.length;
        const sd = Math.sqrt(ch.reduce((x, y) => x + (y - mean) * (y - mean), 0) / (ch.length - 1));
        const ids = new Set(S.aes.filter((e) => e.arm === a).map((e) => e.id));
        const by = (f) => new Set(S.aes.filter((e) => e.arm === a && f(e)).map((e) => e.id)).size;
        return {
          name: a ? "Orangeril" : "Placebo", n: all.length, completed: all.filter((p) => p.status === "completed").length,
          dropped: all.filter((p) => p.status === "dropped").length, nPrim: ch.length, mean, sd,
          base: all.reduce((x, p) => x + (p.sbp[1] || p.sbp0), 0) / all.length,
          anyAE: ids.size, events: S.aes.filter((e) => e.arm === a).length, sae: by((e) => e.ser), severe: by((e) => e.sev === 2),
          alt3: all.filter((p) => p.altMax > 3 * CFG.uln).length,
          curve: VISITS.map((v, i) => { const xs = all.filter((p) => p.sbp[i] !== undefined).map((p) => p.sbp[i]); return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null; }),
        };
      });
      const diff = arms[1].mean - arms[0].mean;
      const se = Math.sqrt(arms[0].sd * arms[0].sd / arms[0].nPrim + arms[1].sd * arms[1].sd / arms[1].nPrim);
      const z = diff / se;
      return { arms, diff, se, lo: diff - 1.96 * se, hi: diff + 1.96 * se, p: 2 * (1 - phi(Math.abs(z))), screened: S.nScreened, sf: S.sites.reduce((a, s) => a + s.sf, 0) };
    }

    function step() {
      if (S.done) return null;
      S.day++;
      const d = S.day;
      const cut = { day: d, DM: 0, VS: 0, LB: 0, EX: 0, AE: 0, DS: 0, DV: 0, qo: 0, qc: 0, open: 0, senders: [] };
      S.spent += 9000;

      S.sites.forEach((s) => {
        if (s.monitor !== null && d >= s.monitor) monitorArrives(s);
        if (!s.active && d >= s.actDay && !S.recruitClosed) { s.active = true; S.spent += 45000; say("Site " + s.no + " (" + s.city + ", " + s.country + ") is open.", "site"); if (S.phase === "start-up") S.phase = "enrolling"; }
      });

      const inScreen = S.subjects.filter((p) => p.status === "screening").length;
      if (!S.recruitClosed && S.nRand + inScreen * 0.8 >= CFG.target) { S.recruitClosed = true; say("Enough patients are in screening. Screening is closed.", "mile"); }
      if (!S.recruitClosed) S.sites.forEach((s) => { if (s.active) for (let k = pois(s.rate); k > 0; k--) newSubject(s); });

      S.subjects.forEach((p) => {
        if (p.status !== "screening" && p.status !== "active") return;
        while (p.next < VISITS.length && d >= p.due[p.next] && (p.status === "screening" || p.status === "active")) visit(p, p.next++);
        if (p.status !== "active") return;
        const site = S.sites[p.site];
        site.k.pt++;
        if (R() < (p.arm ? 0.018 : 0.012)) {
          const r = R(), ae = { id: p.id, arm: p.arm, day: d, sev: r < 0.6 ? 0 : r < 0.92 ? 1 : 2, ser: R() < 0.05 };
          if (R() < site.aeReport) {
            S.aes.push(ae); site.aeN++; site.k.ae++; enter(site, "AE");
            if (ae.ser) say("Serious adverse event reported at site " + site.no + " (" + site.city + "). Treatment stays blinded.", "safety");
          } else site.hidden.push(ae);
        }
      });

      (pend.get(d) || []).forEach((r) => {
        const s = S.sites[r.s];
        cut[r.dom]++; S.total[r.dom]++; S.pending--; s.k.ent++; s.k.lag += r.v === s.visitsBy ? r.lag : Math.min(r.lag, 2);
        if (cut.senders.indexOf(r.s) < 0) cut.senders.push(r.s);
        if (R() < s.err) { S.openQ++; S.total.q++; s.k.q++; cut.qo++; const c = d + 2 + pois(s.qDelay); qpend.set(c, (qpend.get(c) || 0) + 1); }
      });
      pend.delete(d);
      cut.qc = qpend.get(d) || 0; S.openQ -= cut.qc; qpend.delete(d); cut.open = S.openQ;
      cut.n = cut.DM + cut.VS + cut.LB + cut.EX + cut.AE + cut.DS + cut.DV;

      const locked = S.phase === "analysis" || S.phase === "reporting";
      if (!locked) { S.cuts.push(cut); deliv("cuts").count++; if (d > 0 && d % 7 === 0) snapshot(); }

      const stillIn = S.subjects.some((p) => p.status === "screening"), active = S.subjects.some((p) => p.status === "active");
      if (S.phase === "enrolling" && S.recruitClosed && !stillIn) { S.phase = "treatment"; mile("Last patient randomised (" + S.nRand + " in all)"); }
      if (S.phase === "treatment" && !active) { S.phase = "cleaning"; S.lplv = d; mile("Last patient, last visit"); S.sites.forEach((s) => { s.qDelay = 1; s.lag = Math.min(s.lag, 2); }); }
      if (S.phase === "cleaning" && d >= S.lplv + 10 && S.pending === 0 && S.openQ === 0) {
        S.phase = "analysis"; mile("Database lock"); const x = deliv("lock"); x.status = "done"; x.day = d;
        ["cuts", "snaps", "safety"].forEach((k) => { deliv(k).status = "done"; deliv(k).day = d; });
        timers.push([d + 1, () => { S.unblinded = true; say("Treatment codes released to the statisticians.", "mile"); }],
          [d + 4, () => finish("sdtm", "built and checked")], [d + 8, () => finish("adam", "built and checked")],
          [d + 12, () => finish("tlf", "run from the analysis datasets")],
          [d + 14, () => { S.results = analyse(); S.phase = "reporting"; mile("Topline results"); }],
          [d + 42, () => finish("csr", "signed")], [d + 44, () => { finish("package", "assembled"); S.done = true; S.phase = "ready to submit"; mile("Ready to submit"); }]);
      }
      for (let k = timers.length - 1; k >= 0; k--) if (d >= timers[k][0]) { const f = timers[k][1]; timers.splice(k, 1); f(); }
      return cut;
    }

    S.step = step; S.dispatch = dispatch;
    S.dateOf = (d) => new Date(CFG.start.getTime() + d * 864e5);
    return S;
  }

  window.SimStudy = { Sim, VISITS, CFG };
})();
