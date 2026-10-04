/*
 * EXCEL QUEST OS — 記録（localStorage）・習得判定・KPI・効果音
 * 実測値（measured）と推定値（estimated）は別フィールドで保持し、混同しない。
 */
(function (EQ) {
  'use strict';
  const KEY = 'eqos.v1';
  const STATES = ['NEW', 'DISCOVERED', 'PRACTICED', 'INDEPENDENT'];
  const STATE_JA = { NEW: '未体験', DISCOVERED: '発見', PRACTICED: '練習済', INDEPENDENT: '自力' };
  const STATE_MARK = { NEW: '—', DISCOVERED: '×', PRACTICED: '△', INDEPENDENT: '○' };

  function blank() {
    return {
      v: 1,
      settings: { sound: false },
      dayOffset: 0,
      kpi: { ttfsuMs: null, ttfsuHistory: [] },
      check: null,
      aha: null,
      skills: {},
      attempts: [],
      today: null,
      final: null,
      cards: [],
      checkins: [],
      usage: [],
      week: { lastAt: null, added: [] },
      mySkills: [],
    };
  }

  let state;
  function load() {
    try {
      state = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || 'null') || {});
    } catch (e) {
      state = blank();
    }
    return state;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* プライベートモード等：保存できなくても動作は継続 */
    }
  }
  function reset() {
    state = blank();
    save();
  }

  // デモ用の日付オフセット（翌日・1週間後の体験確認用）
  function now() {
    return new Date(Date.now() + state.dayOffset * 86400000);
  }
  function today() {
    const d = now();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function skill(id) {
    if (!state.skills[id]) state.skills[id] = { state: 'NEW', missions: [], successes: 0, hintAnswers: 0, independentAt: null };
    return state.skills[id];
  }
  function upgrade(id, to) {
    const s = skill(id);
    if (STATES.indexOf(to) > STATES.indexOf(s.state)) s.state = to;
    if (to === 'INDEPENDENT' && !s.independentAt) s.independentAt = today();
    return s.state;
  }

  /**
   * 習得判定（要件12）
   *  表示した → DISCOVERED（×）
   *  一度成功 → PRACTICED（△）
   *  ヒントなしで「別MISSION」でも再現 → INDEPENDENT（○）
   *  ※答え（HINT 3）を見たことは習得扱いにしない
   */
  function recordAttempt(a) {
    a.date = today();
    state.attempts.push(a);
    if (a.mobile) {
      save();
      return null; // スマホでは PC ショートカット能力を評価しない
    }
    const s = skill(a.skill);
    const before = s.state;
    if (a.hint >= 3) s.hintAnswers++;
    if (a.discovered || a.hint >= 3) upgrade(a.skill, 'DISCOVERED');
    if (a.done && a.usedTarget) {
      s.successes++;
      const other = s.missions.some((m) => m !== a.id);
      if (a.hint === 0 && other) upgrade(a.skill, 'INDEPENDENT');
      else upgrade(a.skill, 'PRACTICED');
      if (s.missions.indexOf(a.id) < 0) s.missions.push(a.id);
    }
    save();
    return { before, after: s.state };
  }
  function markDiscovered(id) {
    upgrade(id, 'DISCOVERED');
    save();
  }

  function recordUsage(skillId, src) {
    state.usage.push({ date: today(), skill: skillId, src });
    save();
  }

  // ------------------------------------------------------------------ KPI
  function kpis() {
    const at = state.attempts.filter((a) => !a.mobile);
    const withHint = at.filter((a) => a.hint >= 3).length;
    const retries = at.filter((a) => a.variant && a.variant !== 'A');
    const indepRetry = retries.filter((a) => a.done && a.usedTarget && a.hint === 0).length;
    const firstCard = state.cards[0];
    const nextDay = state.checkins.filter((c) => Object.values(c.answers).some((v) => v === 'used')).length;
    const weekRet = Object.values(state.skills).filter((s) => s.independentAt).length;
    const todayPicks = (state.today && state.today.picks) || [];
    const fastDone = todayPicks.some((id) => ['PRACTICED', 'INDEPENDENT'].indexOf(skill(id).state) >= 0);
    const sum = (arr, k) => arr.reduce((t, a) => t + (a[k] || 0), 0);
    return {
      ttfsu: state.kpi.ttfsuMs,
      attempts: at.length,
      avgMs: at.length ? sum(at, 'ms') / at.length : null,
      mouse: sum(at, 'mouse'),
      kb: sum(at, 'kb'),
      sc: sum(at, 'scCount'),
      hintDependency: at.length ? withHint / at.length : null,
      independentRetry: retries.length ? indepRetry + ' / ' + retries.length : '—',
      fastCompletion: fastDone,
      nextDayUse: state.checkins.length ? nextDay + ' / ' + state.checkins.length : '—',
      weekRetention: weekRet,
      firstCard: firstCard ? firstCard.date : null,
    };
  }

  // ------------------------------------------------------------------ SOUND（初期 OFF・BGMなし）
  const SFX = ['ui-click', 'correct', 'speed-up', 'discovery', 'hint', 'warning', 'clear'];
  const cache = {};
  const Sound = {
    play(name) {
      if (!state.settings.sound) return;
      try {
        const a = cache[name] || (cache[name] = new Audio('assets/sfx/' + name + '.wav'));
        a.currentTime = 0;
        a.volume = 0.6;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* 音が鳴らなくても続行 */
      }
    },
    toggle() {
      state.settings.sound = !state.settings.sound;
      save();
      if (state.settings.sound) Sound.play('ui-click');
      return state.settings.sound;
    },
    names: SFX,
  };

  EQ.Store = { load, save, reset, get state() { return state; }, today, now, daysBetween, skill, upgrade, recordAttempt, markDiscovered, recordUsage, kpis, STATES, STATE_JA, STATE_MARK };
  EQ.Sound = Sound;
})(window.EQ);
