/*
 * EXCEL QUEST OS — アプリ本体（画面遷移・MISSION ENGINE・Journey）
 * DIAGNOSE → EXPERIENCE → DISCOVER → USE → RETRY → APPLY → RETAIN
 */
(function (EQ) {
  'use strict';
  const S = EQ.Store;
  const Sound = EQ.Sound;
  const { SKILLS, CATS, CAT_SKILL, CAT_JA, HINTS, TRAPS } = EQ;
  S.load();

  const app = document.getElementById('app');
  const IS_MOBILE = (() => {
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    return coarse || window.innerWidth < 760;
  })();
  document.documentElement.classList.toggle('is-mobile', IS_MOBILE);

  // ================================================================== helpers
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const keys = (arr, big) => `<span class="keys${big ? ' keys-big' : ''}">${arr.map((k) => `<kbd>${esc(k)}</kbd>`).join('<span class="plus">+</span>')}</span>`;
  const skKeys = (id, big) => keys(SKILLS[id].keys, big);
  const sec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + '秒');
  const clock = (ms) => {
    const t = Math.max(0, Math.round(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };
  const dur = (ms) => (ms < 60000 ? sec(ms) : clock(ms));
  const diff = (b, a) => (Math.abs(b - a) < 50 ? '±0' : (a < b ? '−' : '+') + dur(Math.abs(b - a)));
  const img = (name, alt, cls) => `<img src="assets/img/${name}" alt="${esc(alt || '')}" class="${cls || ''}" ${alt ? '' : 'aria-hidden="true"'}>`;
  function navi(expr, html, who) {
    const face = who === 'bot' ? img('bot.png', 'エクセルボット', 'nv-face nv-bot') : img(`navi-${expr || 'normal'}.png`, 'ナビゲーター', 'nv-face');
    return `<div class="nv${who === 'bot' ? ' nv-is-bot' : ''}">${face}<div class="nv-bubble">${html}</div></div>`;
  }
  function overlay(html, actions, cls) {
    const el = document.createElement('div');
    el.className = 'ov';
    el.innerHTML = `<div class="ov-card ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ov]');
      if (!b) return;
      Sound.play('ui-click');
      const fn = actions && actions[b.dataset.ov];
      close();
      if (fn) fn();
    });
    el.addEventListener('keydown', (e) => e.stopPropagation());
    setTimeout(() => {
      const p = el.querySelector('.primary') || el.querySelector('button');
      if (p) p.focus({ preventScroll: true });
    }, 30);
    return { el, close };
  }
  function seed() {
    return (Date.now() % 100000) + Math.floor(Math.random() * 1000);
  }

  // ================================================================== router
  let cleanup = null;
  let current = null;
  const SCREENS = {};
  function go(name, params) {
    if (cleanup) {
      try {
        cleanup();
      } catch (e) {
        console.error(e);
      }
    }
    cleanup = null;
    document.querySelectorAll('.ov').forEach((o) => o.remove());
    current = name;
    app.innerHTML = '';
    app.className = 'scr-' + name;
    window.scrollTo(0, 0);
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name));
    const top = ['home', 'rescue', 'card', 'records'];
    if (top.indexOf(name) >= 0 && location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    try {
      cleanup = SCREENS[name](params || {}) || null;
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="page"><p>表示中に問題が起きました。<button class="btn" onclick="location.hash='#home';location.reload()">ホームへ</button></p></div>`;
    }
  }
  EQ.go = go;

  // ================================================================== Tracker（実測）
  class Tracker {
    constructor(skill) {
      this.skill = skill;
      this.alts = skill === 'ctrlArrow' ? ['ctrlEnd'] : [];
      this.mouse = 0;
      this.kb = 0;
      this.sc = {};
      this.scCount = 0;
      this.usedTarget = false;
      this.usedAlt = false;
      this.hint = 0;
      this.traps = [];
      this.t0 = performance.now();
      this.paused = 0;
      this.pauseAt = null;
      this.end = null;
    }
    handle(e) {
      if (this.end) return;
      if (e.kind === 'key') {
        this.kb++;
        if (e.shortcut) {
          this.sc[e.shortcut] = (this.sc[e.shortcut] || 0) + 1;
          this.scCount++;
          if (e.shortcut === this.skill) this.usedTarget = true;
          if (this.alts.indexOf(e.shortcut) >= 0) this.usedAlt = true;
        }
      } else if (e.kind === 'mouse') this.mouse++;
      else if (e.kind === 'typing') this.kb++;
    }
    pause() {
      if (!this.pauseAt && !this.end) this.pauseAt = performance.now();
    }
    resume() {
      if (this.pauseAt) {
        this.paused += performance.now() - this.pauseAt;
        this.pauseAt = null;
      }
    }
    ms() {
      const t = this.end || this.pauseAt || performance.now();
      return Math.max(0, t - this.t0 - this.paused);
    }
    stop() {
      this.resume();
      if (!this.end) this.end = performance.now();
    }
    result(extra) {
      return Object.assign(
        { skill: this.skill, ms: Math.round(this.ms()), mouse: this.mouse, kb: this.kb, sc: this.sc, scCount: this.scCount, usedTarget: this.usedTarget, usedAlt: this.usedAlt, hint: this.hint, traps: this.traps.slice(), mobile: IS_MOBILE },
        extra || {}
      );
    }
  }

  // ================================================================== mission layout
  function layout(root, o) {
    root.innerHTML = `
      <section class="mission ${o.cls || ''}">
        ${IS_MOBILE ? '<div class="m-mobile">この練習は <b>PC＋物理キーボード推奨</b>。スマホの結果はスキル判定に使いません。</div>' : ''}
        <header class="m-head">
          <div class="m-badge">${o.badge || 'MISSION'}</div>
          <div class="m-jobwrap"><div class="m-story"></div><h2 class="m-job"></h2><div class="m-detail"></div></div>
          <div class="m-timer"><span class="m-timer-label">${o.timerLabel || 'TIME（実測）'}</span><span class="m-timer-val">0.0</span></div>
        </header>
        <div class="m-main">
          <div class="m-simwrap"><div class="m-sim"></div></div>
          <aside class="m-side">
            <div class="m-progress"></div>
            <div class="m-bubble"></div>
            ${o.hints === false ? '' : '<div class="m-hint"><button type="button" class="btn btn-hint">' + img('icon-hint.png', '', 'ico') + 'ヒント <small>1/3</small></button><div class="m-hintbox" aria-live="polite"></div></div>'}
            <div class="m-actions"><button type="button" class="btn btn-ghost m-skip">${o.skipLabel || 'スキップ（あとで）'}</button></div>
            <div class="m-hist"><h3>操作履歴</h3><ul></ul></div>
          </aside>
        </div>
        <div class="m-safety">間違えてOK。マウスでもOK。</div>
      </section>`;
    const q = (s) => root.querySelector(s);
    return {
      story: q('.m-story'),
      job: q('.m-job'),
      detail: q('.m-detail'),
      timer: q('.m-timer-val'),
      timerBox: q('.m-timer'),
      progress: q('.m-progress'),
      bubble: q('.m-bubble'),
      hintBtn: q('.btn-hint'),
      hintBox: q('.m-hintbox'),
      skip: q('.m-skip'),
      simHost: q('.m-sim'),
      history: q('.m-hist ul'),
      badge: q('.m-badge'),
    };
  }

  // 段階ヒント（考え方 → 方向 → ANSWER）
  function hintController(L, getTracker, getSkill) {
    if (!L.hintBtn) return { reset() {} };
    const labels = ['HINT 1｜考え方', 'HINT 2｜方向', 'HINT 3｜ANSWER'];
    function render() {
      const t = getTracker();
      const sk = getSkill();
      const lv = t ? t.hint : 0;
      L.hintBox.innerHTML = HINTS[sk]
        .slice(0, lv)
        .map((h, i) => `<div class="hint hint-${i + 1}"><span class="hint-l">${labels[i]}</span>${i === 2 ? skKeys(sk) + '<div class="hint-a">' + esc(h) + '</div>' : esc(h)}</div>`)
        .join('');
      L.hintBtn.innerHTML = img('icon-hint.png', '', 'ico') + (lv >= 3 ? 'ヒントは以上' : `ヒント <small>${lv + 1}/3</small>`);
      L.hintBtn.disabled = lv >= 3;
    }
    L.hintBtn.addEventListener('click', () => {
      const t = getTracker();
      if (!t || t.hint >= 3) return;
      t.hint++;
      Sound.play('hint');
      if (t.hint >= 3) S.markDiscovered(getSkill());
      render();
      if (EQ._sim) EQ._sim.focus();
    });
    L.hintBtn.addEventListener('mousedown', (e) => e.preventDefault());
    return { reset: render };
  }

  function trapCard(id) {
    const t = TRAPS[id];
    return `
      <div class="trap">
        <div class="trap-tag">${img('icon-discovery.png', '', 'ico')} DISCOVERY｜REAL EXCEL TRAP</div>
        ${navi('', `<b>😳 ${esc(t.title)}</b><br>${esc(t.cause)}`, 'bot')}
        <p>${esc(t.body)}</p>
        <p class="trap-tip">💡 ${esc(t.tip)}</p>
        <p class="note">Shortcut ≠ 万能。これは失敗ではなく、Excel の仕組みの発見です（減点なし・タイマー停止中）。</p>
        <div class="ov-btns"><button type="button" class="btn primary" data-ov="ok">OK、続ける ▶</button></div>
      </div>`;
  }

  // ================================================================== 10秒デモ
  function demo(host, skillId) {
    const d = EQ.DEMOS[skillId];
    if (!d) return () => {};
    let f = 0;
    host.classList.add('demo');
    function draw() {
      const fr = d.frames[f];
      const set = fr.set || {};
      const hl = fr.hl || [];
      const hide = fr.hide || [];
      const rows = d.rows
        .map((row, i) => {
          if (row.gap) return `<tr class="dm-gap"><th>⋮</th><td colspan="${d.cols.length}">⋮</td></tr>`;
          if (hide.indexOf(i) >= 0) return '';
          const tds = row.v
            .map((v, c) => {
              const k = i + ',' + c;
              let cls = '';
              if (fr.act && fr.act[0] === i && fr.act[1] === c) cls += ' act';
              if (fr.sel && i >= fr.sel[0] && i <= fr.sel[1] && c === fr.act[1]) cls += ' sel';
              if (fr.ref && i >= fr.ref[0] && i <= fr.ref[1] && c === fr.act[1]) cls += ' ref';
              if (hl.indexOf(k) >= 0) cls += ' hl';
              if (i === 0) cls += ' hd';
              const val = set[k] !== undefined ? set[k] : v;
              const fb = fr.filter && i === 0 ? '<span class="dm-fb">▾</span>' : '';
              return `<td class="${cls}">${esc(val)}${fb}</td>`;
            })
            .join('');
          return `<tr><th>${row.n}</th>${tds}</tr>`;
        })
        .join('');
      const dlg = fr.dialog
        ? `<div class="dm-dlg"><b>${esc(fr.dialog.title)}</b><div>検索：<span class="dm-in">${esc(fr.dialog.q)}</span></div>${fr.dialog.rep ? `<div>置換後：<span class="dm-in">${esc(fr.dialog.rep)}</span></div>` : ''}${fr.dialog.exact ? '<div class="dm-chk">☑ 完全に同一</div>' : ''}</div>`
        : '';
      const list = fr.list ? `<div class="dm-dlg dm-list">${fr.list.map((x) => `<div>${x.endsWith('✓') ? '☑ ' + esc(x.slice(0, -1)) : '☐ ' + esc(x)}</div>`).join('')}</div>` : '';
      host.innerHTML = `
        <div class="dm-stage${fr.jump ? ' jump' : ''}">
          <table class="dm-grid"><thead><tr><th></th>${d.cols.map((c, i) => `<th>${String.fromCharCode(65 + i)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
          ${dlg}${list}
          ${fr.keys ? `<div class="dm-keys">${keys(fr.keys, true)}</div>` : ''}
        </div>
        <div class="dm-cap"><span class="dm-step">${f + 1}/${d.frames.length}</span>${esc(fr.cap)}</div>`;
    }
    draw();
    const t = setInterval(() => {
      f = (f + 1) % d.frames.length;
      draw();
    }, 2200);
    return () => clearInterval(t);
  }

  // ================================================================== HOME / ENTRY
  SCREENS.home = function () {
    const st = S.state;
    const today = S.today();
    const lastCard = st.cards[st.cards.length - 1];
    const nextDayDue = lastCard && lastCard.date < today && !st.checkins.some((c) => c.cardDate === lastCard.date);
    const weekAnchor = st.week.lastAt || (st.cards[0] && st.cards[0].date);
    const weekDue = !!weekAnchor && S.daysBetween(weekAnchor, today) >= 7;
    const hasToday = st.today && st.today.date === today;
    const prompts = [];
    if (weekDue)
      prompts.push(`<button type="button" class="prompt prompt-week" data-go="week">${img('icon-trophy.png', '', 'ico')}<span><b>1 WEEK</b>今週使った技能をふり返って、次の1技を追加しよう（約30秒）</span><span class="arr">▶</span></button>`);
    if (nextDayDue)
      prompts.push(`<button type="button" class="prompt prompt-day" data-go="nextday">${img('icon-correct.png', '', 'ico')}<span><b>NEXT DAY</b>昨日の3技、1つ使えた？（10秒）</span><span class="arr">▶</span></button>`);

    app.innerHTML = `
      <div class="page home">
        ${prompts.join('')}
        <section class="hero">
          <div class="hero-art">${img('hero.jpg', 'EXCEL QUEST OS メインビジュアル：製造現場のナビゲーターとエクセルボット', 'hero-img')}</div>
          <div class="hero-copy">
            <p class="hero-kicker">仕事を解決していたら、Excelが速くなっていた。</p>
            <h1>あなたのExcel、<br><span class="hl">何秒</span>速くできる？</h1>
            <p class="hero-sub"><b>60 SECOND SPEED CHECK</b><br>知識テストではありません。いつものやり方でOK。</p>
            ${
              IS_MOBILE
                ? `<p class="mobile-note">📱 スマホでは <b>30秒RESCUE・SPEED CARD・復習・操作デモ</b> が使えます。<br>スピードチェックは PC＋キーボードで。</p>
                   <div class="hero-btns"><button type="button" class="btn btn-start primary" data-go="rescue">30秒RESCUE ▶</button>
                   ${lastCard ? '<button type="button" class="btn" data-go="card">SPEED CARD</button>' : ''}</div>`
                : `<div class="hero-btns"><button type="button" class="btn btn-start primary" data-go="speedcheck">▶ 60秒でチェックする</button></div>
                   <p class="hero-meta">${img('icon-timer.png', '', 'ico')} 約60秒 ・ マウスでもOK ・ 押した瞬間に始まります</p>`
            }
          </div>
        </section>
        <section class="home-tiles">
          ${hasToday ? `<button type="button" class="tile" data-go="hub">${img('icon-mission.png', '', 'ico')}<b>今日のミッションの続き</b><span>今日の3技：${st.today.picks.map((p) => esc(SKILLS[p].name)).join('・')}</span></button>` : ''}
          <button type="button" class="tile" data-go="rescue">${img('icon-warning.png', '', 'ico')}<b>今、Excelで困ってる？</b><span>30 SECOND RESCUE ── 困った瞬間に30秒で</span></button>
          ${lastCard ? `<button type="button" class="tile" data-go="card">${img('icon-clear.png', '', 'ico')}<b>YOUR SPEED CARD</b><span>明日使う3技：${lastCard.three.map((k) => SKILLS[k].keys.join('+')).join(' / ')}</span></button>` : ''}
          ${!IS_MOBILE && st.check ? `<button type="button" class="tile" data-go="final">${img('icon-trophy.png', '', 'ico')}<b>FINAL｜16:00 DEADLINE</b><span>総合実務MISSION（約5分）</span></button>` : ''}
        </section>
        <section class="home-why">
          <div><b>JOB FIRST</b><span>キー暗記ではなく、仕事から入る</span></div>
          <div><b>今日は3つだけ</b><span>20個覚えなくていい</span></div>
          <div><b>競争相手は少し前の自分</b><span>ランキングなし・実測で比較</span></div>
        </section>
      </div>`;
    app.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        Sound.play('ui-click');
        if (b.dataset.go === 'speedcheck') EQ._startClick = performance.now();
        go(b.dataset.go);
      })
    );
  };

  // ================================================================== LEVEL 0：SPEED CHECK
  SCREENS.speedcheck = function () {
    const steps = EQ.stepSet(seed());
    const results = [];
    const CAP = [20000, 15000, 15000, 15000, 15000, 15000];
    let i = 0, tracker = null, finished = false, timerT = null, phase = 'check';
    const L = layout(app, { badge: 'SPEED CHECK', hints: false, skipLabel: 'スキップ（次へ）', timerLabel: 'TIME（実測）' });
    const sim = new EQ.Simulator(L.simHost, { historyEl: L.history, onEvent });
    EQ._sim = sim;
    const startClick = EQ._startClick || performance.now();

    function progress() {
      L.progress.innerHTML = `<div class="steps">${steps.map((s, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}">${s.cat}</span>`).join('')}</div>`;
    }
    function begin(k, retryAha) {
      i = k;
      const st = steps[i];
      finished = false;
      phase = retryAha ? 'aha' : 'check';
      sim.load(st.rows, st.start);
      sim.clearHistory();
      tracker = new Tracker(st.skill);
      L.badge.textContent = retryAha ? 'TRY FASTER' : `SPEED CHECK ${i + 1}/6`;
      L.story.textContent = retryAha ? 'さっきと同じ仕事。今度はこのキーで。' : st.story;
      L.job.textContent = st.job;
      L.detail.innerHTML = retryAha ? `${skKeys('ctrlArrow', true)} <span>を押してみて</span>` : esc(st.detail);
      L.bubble.innerHTML = retryAha
        ? navi('smile', 'A1 に戻しました。<b>Ctrl を押したまま ↓</b>。')
        : navi(i === 0 ? 'normal' : 'smile', i === 0 ? 'ミッション開始。<b>いつものやり方で大丈夫</b>です。' : 'いつものやり方でOK。わからなければスキップでOK。');
      progress();
      sim.focus();
      clearInterval(timerT);
      timerT = setInterval(() => {
        const ms = tracker.ms();
        L.timer.textContent = (ms / 1000).toFixed(1);
        if (!retryAha && ms > CAP[i] && !finished) finish(false, true);
      }, 100);
    }
    function onEvent(e) {
      if (!tracker || finished) return;
      tracker.handle(e);
      if (e.kind === 'change' && steps[i].check({ sim })) finish(true);
    }
    function finish(done, timedOut) {
      if (finished) return;
      finished = true;
      tracker.stop();
      clearInterval(timerT);
      sim.setEnabled(false);
      const r = tracker.result({ key: steps[i].key, cat: steps[i].cat, done, timedOut: !!timedOut });
      L.timer.textContent = (r.ms / 1000).toFixed(1);
      if (phase === 'aha') return ahaResult(r);
      results[i] = r;
      if (done) Sound.play('correct');
      if (i === 0) return ahaOffer(r);
      if (timedOut) {
        const o = overlay(`${navi('smile', 'OK！ここは<b>伸びしろ</b>。次へ進みます。')}<div class="ov-btns"><button class="btn primary" data-ov="next">次へ ▶</button></div>`, { next: next }, 'ov-mini');
        setTimeout(() => {
          if (document.body.contains(o.el)) {
            o.close();
            next();
          }
        }, 1400);
        return;
      }
      setTimeout(next, done ? 450 : 0);
    }
    function next() {
      sim.setEnabled(true);
      if (i + 1 < steps.length) begin(i + 1);
      else complete();
    }
    // 最初の AHA MOMENT（開始30〜60秒以内）
    function ahaOffer(r) {
      if (r.usedTarget || r.usedAlt) {
        recordSpeedUp(r.ms, r.ms);
        Sound.play('speed-up');
        overlay(
          `<div class="aha"><div class="aha-tag">⚡ SPEED UP</div>${navi('surprise', `<b>${sec(r.ms)}</b>（実測）。もう速いルートを使っていますね！`)}
           <div class="ov-btns"><button class="btn primary" data-ov="next">残り5問 ▶</button></div></div>`,
          { next }
        );
        return;
      }
      overlay(
        `<div class="aha">
          <div class="aha-tag">😮 ${r.done ? 'TASK COMPLETE' : 'ここに時間を使っていたのか'}</div>
          <div class="big-time"><span class="lbl">今回（実測）</span>${r.done ? sec(r.ms) : r.timedOut ? sec(r.ms) + '+' : 'スキップ'}</div>
          ${navi('think', `マウス操作 ${r.mouse} 回。<br><b>スクロールしなくても、データの端へ一気に行く方法</b>があります。`)}
          <div class="aha-key">${skKeys('ctrlArrow', true)}</div>
          <div class="ov-btns"><button class="btn primary" data-ov="try">試してみる ▶</button><button class="btn btn-ghost" data-ov="skip">あとで</button></div>
        </div>`,
        {
          try: () => {
            S.markDiscovered('ctrlArrow');
            sim.setEnabled(true);
            EQ._ahaBefore = r;
            begin(0, true);
          },
          skip: next,
        }
      );
    }
    function ahaResult(r) {
      const before = EQ._ahaBefore;
      if (r.done) {
        recordSpeedUp(before.ms, r.ms, before.done);
        Sound.play('speed-up');
        S.recordAttempt({ id: 'speedcheck:aha', skill: 'ctrlArrow', variant: 'AHA', ms: r.ms, done: true, usedTarget: r.usedTarget, hint: 3, mouse: r.mouse, kb: r.kb, scCount: r.scCount, mobile: IS_MOBILE });
      }
      overlay(
        `<div class="aha">
          <div class="aha-tag">⚡ SPEED UP</div>
          <div class="speedup"><div><span class="lbl">いつもの方法（実測）</span><b>${before.done || before.timedOut ? sec(before.ms) + (before.done ? '' : '+') : '—'}</b></div><div class="arr">→</div><div class="after"><span class="lbl">今回（実測）</span><b>${sec(r.ms)}</b></div></div>
          ${navi('smile', '「キーを覚えた」より、<b>「大量データの移動が速くなった」</b>。<br>残り5問は、またいつものやり方でOK。')}
          <div class="ov-btns"><button class="btn primary" data-ov="next">残り5問 ▶</button></div>
        </div>`,
        { next }
      );
    }
    function recordSpeedUp(beforeMs, afterMs) {
      const t = Math.round(performance.now() - startClick);
      S.state.kpi.ttfsuHistory.push({ date: S.today(), ms: t });
      if (S.state.kpi.ttfsuMs == null) S.state.kpi.ttfsuMs = t;
      S.state.aha = { before: beforeMs, after: afterMs, date: S.today() };
      S.save();
    }
    function complete() {
      clearInterval(timerT);
      S.state.check = { date: S.today(), rows: EQ.CHECK_ROWS, steps: results.map((r) => ({ key: r.key, cat: r.cat, ms: r.ms, done: r.done, timedOut: r.timedOut, mouse: r.mouse, kb: r.kb, scCount: r.scCount, usedTarget: r.usedTarget || r.usedAlt })) };
      S.save();
      Sound.play('clear');
      go('bottleneck');
    }
    L.skip.addEventListener('click', () => finish(false));
    begin(0);
    return () => {
      clearInterval(timerT);
      sim.destroy();
    };
  };

  // ================================================================== BOTTLENECK → 今日は3つだけ
  function rate(r) {
    if (!r || !r.done) return 'r';
    if (r.usedTarget || r.ms < 6000) return 'g';
    return 'y';
  }
  SCREENS.bottleneck = function () {
    const chk = S.state.check;
    if (!chk) return go('home');
    const byCat = {};
    chk.steps.forEach((s) => (byCat[s.cat] = s));
    const sev = { r: 2, y: 1, g: 0 };
    const order = CATS.slice().sort((a, b) => sev[rate(byCat[b])] - sev[rate(byCat[a])] || (byCat[b] ? byCat[b].ms : 0) - (byCat[a] ? byCat[a].ms : 0));
    const picks = order.slice(0, 3).map((c) => CAT_SKILL[c]);
    S.state.today = { date: S.today(), picks };
    S.save();
    const tot = (k) => chk.steps.reduce((t, s) => t + (s[k] || 0), 0);
    const label = { g: '速い', y: '伸びしろ', r: '大きな伸びしろ' };
    app.innerHTML = `
      <div class="page bottleneck">
        <h1 class="ttl">YOUR EXCEL BOTTLENECK</h1>
        <p class="sub">SPEED CHECK の結果（すべて実測）。遅い・止まったところが、今日いちばん伸びるところです。</p>
        <div class="bn">
          ${CATS.map((c) => {
            const s = byCat[c];
            const r = rate(s);
            const w = s && s.done ? Math.max(18, 100 - (s.ms / 15000) * 80) : 14;
            return `<div class="bn-row bn-${r}"><span class="bn-cat">${c}<small>${CAT_JA[c]}</small></span><span class="bn-bar"><i style="width:${w}%"></i></span><span class="bn-dot" aria-label="${label[r]}"></span><span class="bn-val">${s && s.done ? sec(s.ms) : '未完了'}<small>${label[r]}</small></span></div>`;
          }).join('')}
        </div>
        <div class="bn-ops">マウス操作 <b>${tot('mouse')}</b> 回 ／ キーボード操作 <b>${tot('kb')}</b> 回 ／ ショートカット <b>${tot('scCount')}</b> 回 <small>（実測）</small></div>
        <div class="today3">
          ${navi('smile', '<b>今日は3つだけ。</b>あなたの仕事でいちばん時間を取っているところから。')}
          <div class="picks">${picks.map((p, k) => `<div class="pick"><span class="pick-n">${k + 1}</span><b>${esc(SKILLS[p].name)}</b><small>${SKILLS[p].cat}</small></div>`).join('')}</div>
        </div>
        <div class="layers">
          <button type="button" class="layer primary" data-act="fast"><b>⚡ FAST</b><span>約3分 ── この3つだけ</span></button>
          <button type="button" class="layer" data-act="hub"><b>🎮 PRACTICE</b><span>5〜8分 ── 再挑戦＋落とし穴</span></button>
          <button type="button" class="layer" data-act="final"><b>🏆 CHALLENGE</b><span>約10分 ── 16:00 DEADLINE</span></button>
        </div>
      </div>`;
    app.querySelector('[data-act="fast"]').addEventListener('click', () => go('mission', { skill: picks[0], variant: 'A', queue: picks.slice(1) }));
    app.querySelector('[data-act="hub"]').addEventListener('click', () => go('hub'));
    app.querySelector('[data-act="final"]').addEventListener('click', () => go('final'));
    setTimeout(() => app.querySelector('.layer.primary').focus({ preventScroll: true }), 50);
  };

  // ================================================================== HUB（3層学習）
  SCREENS.hub = function () {
    const st = S.state;
    const picks = (st.today && st.today.picks) || ['ctrlArrow', 'ctrlShiftArrow', 'ctrlH'];
    if (!st.today) {
      st.today = { date: S.today(), picks };
      S.save();
    }
    const others = Object.keys(SKILLS).filter((k) => SKILLS[k].mvp && picks.indexOf(k) < 0);
    const card = (id) => {
      const s = S.skill(id);
      return `<button type="button" class="mcard st-${s.state}" data-skill="${id}">
        <span class="mc-cat">${SKILLS[id].cat}</span><b>${esc(SKILLS[id].name)}</b>
        <span class="mc-state"><i>${S.STATE_MARK[s.state]}</i>${S.STATE_JA[s.state]}</span>
        ${s.state !== 'NEW' ? `<span class="mc-keys">${skKeys(id)}</span>` : '<span class="mc-keys mc-hidden">？</span>'}
      </button>`;
    };
    const anyDone = st.attempts.length > 0;
    app.innerHTML = `
      <div class="page hub">
        <h1 class="ttl">TODAY'S MISSIONS</h1>
        <p class="sub">すべてを完走しなくてOK。FAST だけでも 1 技能を持ち帰れます。</p>
        <section class="layer-sec"><h2>⚡ FAST <small>約3分 ── 今日の3技</small></h2><div class="mcards">${picks.map(card).join('')}</div></section>
        <section class="layer-sec"><h2>🎮 PRACTICE <small>5〜8分 ── 他の技能・再挑戦（REAL EXCEL TRAP あり）</small></h2><div class="mcards">${others.map(card).join('')}</div></section>
        <section class="layer-sec"><h2>🏆 CHALLENGE <small>約10分</small></h2>
          <button type="button" class="final-card" data-go="final">${img('bg-control.jpg', '', 'fc-bg')}<span class="fc-in"><b>🚨 FINAL｜16:00 DEADLINE</b><span>上司「16時の会議までに、この生産実績をまとめて！」</span></span></button>
          ${st.final ? '<button type="button" class="btn" data-go="beforeafter">BEFORE / AFTER を見る</button>' : ''}
        </section>
        <div class="hub-end">
          <button type="button" class="btn ${anyDone ? 'primary' : ''}" data-go="card" ${anyDone ? '' : 'disabled'}>ここで終える → SPEED CARD を作る</button>
        </div>
      </div>`;
    app.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => go('mission', { skill: b.dataset.skill, variant: 'A' })));
    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  };

  // ================================================================== SKILL MISSION（JOB → FREE ACTION → FEEDBACK → DISCOVERY → RETRY → SELF SUCCESS）
  SCREENS.mission = function (p) {
    const skill = p.skill;
    let variant = p.variant || 'A';
    let step = null, tracker = null, finished = false, timerT = null, prevResult = p.prev || null;
    const shownTraps = new Set();
    const L = layout(app, { badge: 'MISSION' });
    const sim = new EQ.Simulator(L.simHost, { historyEl: L.history, onEvent });
    EQ._sim = sim;
    const hc = hintController(L, () => tracker, () => skill);

    function begin(v) {
      variant = v;
      step = EQ.skillMission(skill, v, seed());
      finished = false;
      shownTraps.clear();
      sim.load(step.rows, step.start);
      sim.clearHistory();
      sim.setEnabled(true);
      tracker = new Tracker(skill);
      L.badge.innerHTML = `${img('icon-mission.png', '', 'ico')}MISSION <small>${SKILLS[skill].cat}${v === 'A' ? '' : '・RETRY'}</small>`;
      L.story.textContent = step.story;
      L.job.textContent = step.job;
      L.detail.textContent = step.detail;
      L.progress.innerHTML = `<div class="steps"><span class="${v === 'A' ? 'now' : 'done'}">1回目</span><span class="${v === 'A' ? '' : 'now'}">別データで再現</span></div>`;
      L.bubble.innerHTML =
        v === 'A'
          ? navi('normal', 'いつものやり方でOK。<br>困ったら<b>ヒント</b>をどうぞ（答えは最後に）。')
          : navi('smile', '<b>別のデータ</b>で、もう一度。<br>今度は自分の手で。' + (step.trap ? '<br><small>（実務っぽいクセのあるデータです）</small>' : ''));
      hc.reset();
      sim.focus();
      clearInterval(timerT);
      timerT = setInterval(() => (L.timer.textContent = (tracker.ms() / 1000).toFixed(1)), 100);
    }
    function onEvent(e) {
      if (!tracker || finished) return;
      tracker.handle(e);
      if (e.kind === 'trap') showTrap(e.id);
      if (e.kind === 'commit' && step.trap === 'autosumBlank' && e.r === step.meta.cell.r && e.c === step.meta.cell.c && String(e.raw)[0] === '=' && !step.check({ sim })) showTrap('autosumBlank');
      if (e.kind === 'change' && step.check({ sim })) finish(true);
    }
    function showTrap(id) {
      if (shownTraps.has(id) || !TRAPS[id]) return;
      if (id === 'partial' && step.trap !== 'partial') return;
      shownTraps.add(id);
      tracker.traps.push(id);
      tracker.pause();
      sim.setEnabled(false);
      Sound.play('discovery');
      overlay(trapCard(id), {
        ok: () => {
          tracker.resume();
          sim.setEnabled(true);
          sim.focus();
        },
      }, 'ov-trap');
    }
    function finish(done) {
      if (finished) return;
      finished = true;
      tracker.stop();
      clearInterval(timerT);
      sim.setEnabled(false);
      const r = tracker.result({ id: step.id, variant, done });
      const fast = r.usedTarget || r.usedAlt;
      const mastery = S.recordAttempt({ id: step.id, skill, variant, ms: r.ms, done, usedTarget: r.usedTarget, discovered: done && !fast, hint: r.hint, mouse: r.mouse, kb: r.kb, scCount: r.scCount, traps: r.traps, mobile: IS_MOBILE });
      if (done) Sound.play(fast ? 'speed-up' : 'correct');
      feedback(r, mastery);
      prevResult = r;
    }
    function feedback(r, mastery) {
      const sk = SKILLS[skill];
      const fast = r.usedTarget || r.usedAlt;
      const st = S.skill(skill).state;
      const prev = variant !== 'A' && p.prevForCompare ? p.prevForCompare : null;
      const compare = prev && r.done && prev.done
        ? `<div class="cmp"><div><span class="lbl">1回目（実測）</span><b>${sec(prev.ms)}</b></div><div class="arr">→</div><div class="after"><span class="lbl">今回・別データ（実測）</span><b>${sec(r.ms)}</b></div></div>
           <p class="note">${r.traps.length ? '※今回は REAL EXCEL TRAP 入りのデータ（発見の時間は除外）。条件が異なるため参考値です。' : '同じ仕事・同規模の別データでの比較です。'}</p>`
        : '';
      const head = !r.done
        ? `<div class="fb-top fb-skip">OK！ここは<b>伸びしろ</b>。</div>`
        : fast
          ? `<div class="fb-top fb-fast">${img('icon-correct.png', '', 'ico')}✓ TASK COMPLETE <span class="su">⚡ SPEED UP</span></div>`
          : `<div class="fb-top">${img('icon-correct.png', '', 'ico')}✓ TASK COMPLETE <span class="other">OTHER ROUTE</span></div>`;
      const times = r.done
        ? `<div class="fb-times"><div><span class="lbl">今回（実測）</span><b>${sec(r.ms)}</b><small>マウス ${r.mouse} 回 / キー ${r.kb} 回</small></div>
           ${fast ? '' : `<div class="est"><span class="lbl">ショートカットなら（推定※）</span><b>約${sk.est}秒相当</b><small>※慣れた場合の目安。実測ではありません</small></div>`}</div>`
        : '';
      const discovery = !fast
        ? `<div class="disc">
            <div class="disc-tag">${img('icon-discovery.png', '', 'ico')}DISCOVERY｜この仕事なら、この操作</div>
            <div class="disc-flow"><div><span class="lbl">JOB</span><b>${esc(sk.name)}</b></div><div class="arr">→</div><div><span class="lbl">KEY</span>${skKeys(skill, true)}</div></div>
            <div class="disc-demo"></div>
          </div>`
        : '';
      const mText = IS_MOBILE
        ? '<p class="note">スマホのため、スキル判定は行いません。</p>'
        : `<div class="mastery st-${st}"><span class="m-i">${S.STATE_MARK[st]}</span><b>${esc(sk.name)}</b>：${S.STATE_JA[st]}${
            st === 'INDEPENDENT' ? '（ヒントなし・別データで再現できました）' : st === 'PRACTICED' ? (r.hint ? '（ヒントを見たので、次はヒントなしで → ○）' : '（別のデータでも再現できたら → ○）') : st === 'DISCOVERED' ? '（次は自分の手で試そう）' : ''
          }</div>`;
      const btns = [];
      if (variant === 'A') btns.push(`<button class="btn primary" data-ov="retry">${fast ? '別データで再現 ▶' : 'TRY FASTER：別データでもう一度 ▶'}</button>`);
      else if (st !== 'INDEPENDENT' && !IS_MOBILE) btns.push(`<button class="btn primary" data-ov="again">もう一度（別データ）▶</button>`);
      if (variant !== 'A' && p.queue && p.queue.length) btns.push(`<button class="btn ${st === 'INDEPENDENT' || IS_MOBILE ? 'primary' : ''}" data-ov="nextq">次の技へ ▶</button>`);
      if (variant !== 'A' && (!p.queue || !p.queue.length)) btns.push(`<button class="btn ${st === 'INDEPENDENT' || IS_MOBILE ? 'primary' : ''}" data-ov="hub">ミッション一覧へ</button>`);
      if (variant === 'A') btns.push('<button class="btn btn-ghost" data-ov="hub">一覧へ戻る</button>');
      const o = overlay(
        `<div class="fb">${head}${times}${compare}${discovery}${mText}<div class="ov-btns">${btns.join('')}</div></div>`,
        {
          retry: () => go('mission', { skill, variant: 'B', queue: p.queue, prevForCompare: r }),
          again: () => go('mission', { skill, variant: 'C', queue: p.queue, prevForCompare: r }),
          nextq: () => go('mission', { skill: p.queue[0], variant: 'A', queue: p.queue.slice(1) }),
          hub: () => go('hub'),
        },
        'ov-fb'
      );
      const dh = o.el.querySelector('.disc-demo');
      if (dh) {
        Sound.play('discovery');
        const stop = demo(dh, skill);
        const obs = new MutationObserver(() => {
          if (!document.body.contains(o.el)) {
            stop();
            obs.disconnect();
          }
        });
        obs.observe(document.body, { childList: true });
      }
    }
    L.skip.addEventListener('click', () => finish(false));
    begin(variant);
    return () => {
      clearInterval(timerT);
      sim.destroy();
    };
  };

  // ================================================================== FINAL｜16:00 DEADLINE
  SCREENS.final = function () {
    if (IS_MOBILE) {
      app.innerHTML = `<div class="page"><h1 class="ttl">FINAL｜16:00 DEADLINE</h1><p>FINAL は PC＋物理キーボードで挑戦してください。</p><button class="btn" data-go="home">ホームへ</button></div>`;
      app.querySelector('[data-go]').addEventListener('click', () => go('home'));
      return;
    }
    app.innerHTML = `
      <div class="page final-intro">
        <div class="fi-bg">${img('bg-control.jpg', '')}</div>
        <div class="fi-card">
          <div class="fi-clock">🚨 15:55</div>
          ${navi('surprise', '上司「<b>16時の会議までに、この生産実績をまとめて！</b>」')}
          <ul class="fi-list"><li>5,000行の生産実績</li><li>やることは画面右に1つずつ出ます</li><li>どの操作を使うかは、あなたの判断</li><li>16:00を過ぎても最後までやってOK</li></ul>
          <div class="fi-timer">05:00</div>
          <button type="button" class="btn btn-start primary">START ▶</button>
        </div>
      </div>`;
    const b = app.querySelector('.btn-start');
    b.focus();
    b.addEventListener('click', () => go('finalrun'));
  };

  SCREENS.finalrun = function () {
    const fm = EQ.finalMission(seed());
    const LIMIT = 5 * 60 * 1000;
    let k = 0, tracker = null, finished = false, timerT;
    const results = [];
    const tStart = performance.now();
    let pausedTotal = 0, pauseAt = null;
    const L = layout(app, { badge: '🚨 FINAL', timerLabel: '会議まで', cls: 'is-final' });
    const sim = new EQ.Simulator(L.simHost, { historyEl: L.history, onEvent, rows: fm.rows, start: { r: 0, c: 0 } });
    EQ._sim = sim;
    const hc = hintController(L, () => tracker, () => fm.steps[Math.min(k, fm.steps.length - 1)].skill);
    const shownTraps = new Set();
    L.story.textContent = '上司「16時の会議までに、この生産実績をまとめて！」';

    function elapsed() {
      return performance.now() - tStart - pausedTotal - (pauseAt ? performance.now() - pauseAt : 0);
    }
    function list() {
      L.progress.innerHTML = `<ol class="flist">${fm.steps
        .map((s, j) => `<li class="${j < k ? 'done' : j === k ? 'now' : ''}"><span class="fl-i">${j < k ? (results[j] && results[j].done ? '✓' : '–') : j + 1}</span>${esc(s.job)}${j < k && results[j] ? `<small>${sec(results[j].ms)}</small>` : ''}</li>`)
        .join('')}<li class="${k >= fm.steps.length ? 'now' : ''}"><span class="fl-i">${fm.steps.length + 1}</span>最終確認して報告</li></ol>`;
    }
    function begin(j) {
      k = j;
      const s = fm.steps[k];
      finished = false;
      sim.setEnabled(true);
      sim.setActive(s.start.r, s.start.c);
      tracker = new Tracker(s.skill);
      L.job.textContent = s.job;
      L.detail.textContent = `工程 ${k + 1} / ${fm.steps.length}`;
      L.bubble.innerHTML = navi(k === 0 ? 'normal' : 'smile', k === 0 ? 'ショートカット名は出しません。<b>どの操作を使うかも、腕の見せどころ。</b>' : 'いいペース。次へ。');
      hc.reset();
      list();
      sim.focus();
      if (s.check({ sim })) finishStep(true);
    }
    function onEvent(e) {
      if (!tracker || finished) return;
      tracker.handle(e);
      if (e.kind === 'trap' && !shownTraps.has(e.id) && (e.id === 'blank' || e.id === 'findScope' || e.id === 'sheetEnd')) {
        shownTraps.add(e.id);
        tracker.pause();
        pauseAt = performance.now();
        sim.setEnabled(false);
        Sound.play('discovery');
        overlay(trapCard(e.id), {
          ok: () => {
            tracker.resume();
            pausedTotal += performance.now() - pauseAt;
            pauseAt = null;
            sim.setEnabled(true);
            sim.focus();
          },
        }, 'ov-trap');
      }
      if (e.kind === 'change' && fm.steps[k].check({ sim })) finishStep(true);
    }
    function finishStep(done) {
      if (finished) return;
      finished = true;
      tracker.stop();
      const s = fm.steps[k];
      const r = tracker.result({ key: s.key, cat: s.cat, done });
      results[k] = r;
      S.recordAttempt({ id: 'final:' + s.key, skill: s.skill, variant: 'FINAL', ms: r.ms, done, usedTarget: r.usedTarget, hint: r.hint, mouse: r.mouse, kb: r.kb, scCount: r.scCount, mobile: IS_MOBILE });
      if (done) Sound.play('correct');
      if (k + 1 < fm.steps.length) setTimeout(() => begin(k + 1), 350);
      else report();
    }
    function report() {
      k = fm.steps.length;
      list();
      sim.setEnabled(false);
      L.job.textContent = '最終確認して、上司に報告';
      L.detail.textContent = '';
      L.bubble.innerHTML = navi('smile', '表を最終確認。OKなら<b>報告する</b>。') + '<button type="button" class="btn primary btn-report">報告する ▶</button>';
      const b = L.bubble.querySelector('.btn-report');
      b.focus();
      b.addEventListener('click', done);
    }
    function done() {
      clearInterval(timerT);
      const total = elapsed();
      S.state.final = { date: S.today(), rows: fm.n, totalMs: Math.round(total), overtime: total > LIMIT, steps: results.map((r) => ({ key: r.key, cat: r.cat, ms: r.ms, done: r.done, mouse: r.mouse, kb: r.kb, scCount: r.scCount, usedTarget: r.usedTarget || r.usedAlt, hint: r.hint })) };
      S.save();
      Sound.play('clear');
      go('beforeafter');
    }
    timerT = setInterval(() => {
      const left = LIMIT - elapsed();
      L.timer.textContent = left >= 0 ? clock(left) : '+' + clock(-left);
      L.timerBox.classList.toggle('over', left < 0);
      L.timerBox.classList.toggle('warn', left >= 0 && left < 60000);
      const lbl = L.timerBox.querySelector('.m-timer-label');
      lbl.textContent = left >= 0 ? '会議まで' : '16:00 過ぎ ── 最後までOK';
    }, 200);
    L.skip.textContent = 'この工程をスキップ';
    L.skip.addEventListener('click', () => finishStep(false));
    begin(0);
    return () => {
      clearInterval(timerT);
      sim.destroy();
    };
  };

  // ================================================================== BEFORE / AFTER
  SCREENS.beforeafter = function () {
    const chk = S.state.check, fin = S.state.final;
    if (!fin) return go('hub');
    const name = { move: '最終行へ移動', select: '範囲選択', find: '検索', replace: '一括修正', sum: '合計', filter: '絞り込み' };
    let rowsHtml = '', bMs = 0, aMs = 0, bMouse = 0, aMouse = 0, bSc = 0, aSc = 0, n = 0;
    const sameRows = chk && chk.rows === fin.rows;
    fin.steps.forEach((a) => {
      const b = chk && chk.steps.find((x) => x.key === a.key);
      const ok = sameRows && b && b.done && a.done;
      if (ok) {
        n++;
        bMs += b.ms;
        aMs += a.ms;
        bMouse += b.mouse;
        aMouse += a.mouse;
        bSc += b.scCount;
        aSc += a.scCount;
      }
      rowsHtml += `<tr class="${ok ? '' : 'na'}"><td>${name[a.key]}</td><td>${b ? (b.done ? sec(b.ms) : '未完了') : '—'}</td><td>${a.done ? sec(a.ms) : '未完了'}</td><td>${ok ? (a.ms < b.ms - 50 ? '<b class="dn">' + diff(b.ms, a.ms) + '</b>' : diff(b.ms, a.ms)) : '比較対象外'}</td></tr>`;
    });
    const can = n > 0;
    app.innerHTML = `
      <div class="page ba">
        <div class="ba-bg">${img('bg-ending.jpg', '')}</div>
        <h1 class="ttl">🏁 MISSION COMPLETE</h1>
        <p class="sub">${fin.overtime ? '16:00 は過ぎたけど、最後までやり切りました。' : '16:00 の会議に間に合いました！'} FINAL 合計 ${clock(fin.totalMs)}（実測）</p>
        ${
          can
            ? `<div class="ba-main">
                <div class="ba-col before"><span>BEFORE</span><b>${dur(bMs)}</b><small>SPEED CHECK</small></div>
                <div class="ba-arr">→</div>
                <div class="ba-col after"><span>AFTER</span><b>${dur(aMs)}</b><small>FINAL</small></div>
              </div>
              <div class="ba-diff ${aMs < bMs - 50 ? 'good' : ''}">${diff(bMs, aMs)}</div>
              <div class="ba-stats">
                <div><span>Mouse Actions</span><b>${bMouse} → ${aMouse}</b></div>
                <div><span>Shortcut Usage</span><b>${bSc} → ${aSc}</b></div>
              </div>
              <p class="note">同等条件：同じ6工程・同じ ${fin.rows.toLocaleString('ja-JP')} 行・値だけ違う別データ。比較は両方完了した <b>${n}/6 工程</b>のみ。すべて実測値です。${n < 6 ? '未完了の工程は比較から除外しています。' : ''}</p>`
            : `<p class="note warn">${chk ? 'BEFORE と AFTER で両方完了した工程がないため、' : 'SPEED CHECK（BEFORE）が未実施のため、'}比較しません（条件が異なる結果で「速くなった」とは言えないため）。</p>`
        }
        <table class="ba-table"><thead><tr><th>工程</th><th>BEFORE</th><th>AFTER</th><th>差</th></tr></thead><tbody>${rowsHtml}</tbody></table>
        <div class="ov-btns"><button type="button" class="btn primary" data-go="card">📌 SPEED CARD を作る ▶</button></div>
      </div>`;
    const b = app.querySelector('[data-go]');
    b.addEventListener('click', () => go('card'));
    b.focus({ preventScroll: true });
  };

  // ================================================================== SPEED CARD
  function buildCard() {
    const st = S.state;
    const chk = st.check;
    const rank = { INDEPENDENT: 3, PRACTICED: 2, DISCOVERED: 1, NEW: 0 };
    const picks = (st.today && st.today.picks) || [];
    const catScore = {};
    CATS.forEach((c) => {
      const sk = S.skill(CAT_SKILL[c]).state;
      const s = chk && chk.steps.find((x) => x.cat === c);
      catScore[c] = (sk === 'INDEPENDENT' ? 3 : 0) + (s ? { g: 2, y: 1, r: 0 }[rate(s)] : 0) + (sk === 'PRACTICED' ? 1 : 0);
    });
    const sorted = CATS.slice().sort((a, b) => catScore[b] - catScore[a]);
    const strengths = sorted.filter((c) => catScore[c] >= 2).slice(0, 2);
    const next = sorted.reverse().filter((c) => strengths.indexOf(c) < 0).slice(0, 2);
    const cand = Object.keys(SKILLS)
      .filter((k) => SKILLS[k].mvp)
      .sort((a, b) => (picks.indexOf(b) >= 0) - (picks.indexOf(a) >= 0) || rank[S.skill(b).state] - rank[S.skill(a).state]);
    const used = cand.filter((k) => rank[S.skill(k).state] >= 1);
    const three = used.concat(picks.filter((p) => used.indexOf(p) < 0)).concat(cand).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
    const card = { date: S.today(), strengths, next, three };
    st.cards = st.cards.filter((c) => c.date !== card.date);
    st.cards.push(card);
    if (!st.mySkills.length || st.mySkills.join() !== three.join()) {
      if (!st.week.added.length) st.mySkills = three.slice();
    }
    S.save();
    return card;
  }
  SCREENS.card = function () {
    const st = S.state;
    let card;
    const today = S.today();
    if (st.attempts.some((a) => a.date === today) || st.check) card = buildCard();
    else card = st.cards[st.cards.length - 1];
    if (!card) {
      app.innerHTML = `<div class="page"><h1 class="ttl">YOUR EXCEL SPEED CARD</h1><p class="sub">まだカードがありません。60秒チェックから始めよう。</p><button class="btn primary" data-go="home">ホームへ</button></div>`;
      app.querySelector('[data-go]').addEventListener('click', () => go('home'));
      return;
    }
    const txt = `YOUR EXCEL SPEED CARD（${card.date}）\n得意：${card.strengths.join(' / ') || '—'}\n次に伸ばす：${card.next.join(' / ') || '—'}\n明日使う3技：\n${card.three.map((k) => '・' + SKILLS[k].keys.join(' + ') + '　' + SKILLS[k].name).join('\n')}\n20個覚えなくていい。明日、この3つを使ってみよう。`;
    app.innerHTML = `
      <div class="page card-page">
        <article class="scard" id="speedcard">
          <header><h1>YOUR EXCEL SPEED CARD</h1><span class="sc-date">${esc(card.date)}</span></header>
          <div class="sc-cols">
            <div class="sc-col good"><h2>得意</h2>${(card.strengths.length ? card.strengths : ['これから']).map((c) => `<div>${c}</div>`).join('')}</div>
            <div class="sc-col next"><h2>次に伸ばす</h2>${card.next.map((c) => `<div>${c}</div>`).join('')}</div>
          </div>
          <h2 class="sc-three">📌 明日使う3技</h2>
          <ul class="sc-list">${card.three.map((k) => `<li>${skKeys(k)}<span>${esc(SKILLS[k].name)}</span><i class="mk">${S.STATE_MARK[S.skill(k).state]}</i></li>`).join('')}</ul>
          <p class="sc-msg">20個覚えなくていい。<br><b>明日、この3つを使ってみよう。</b></p>
          ${img('navi.png', '', 'sc-navi')}
        </article>
        <div class="ov-btns noprint">
          <button type="button" class="btn" data-act="print">🖨 印刷 / PDF保存</button>
          <button type="button" class="btn" data-act="copy">📋 テキストをコピー</button>
          <button type="button" class="btn primary" data-act="rescue">困ったら 30秒RESCUE ▶</button>
        </div>
        <p class="note noprint">明日またここを開くと「昨日の3技、1つ使えた？」が出ます。スマホでも見られます（このページをブックマーク）。</p>
      </div>`;
    app.querySelector('[data-act="print"]').addEventListener('click', () => window.print());
    app.querySelector('[data-act="copy"]').addEventListener('click', (e) => {
      const b = e.currentTarget;
      const done = () => (b.textContent = '✓ コピーしました');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => prompt('コピーしてください', txt));
      else prompt('コピーしてください', txt);
    });
    app.querySelector('[data-act="rescue"]').addEventListener('click', () => go('rescue'));
  };

  // ================================================================== NEXT DAY
  SCREENS.nextday = function () {
    const st = S.state;
    const card = st.cards.filter((c) => c.date < S.today()).slice(-1)[0];
    if (!card) return go('home');
    const ans = {};
    app.innerHTML = `
      <div class="page nextday">
        ${navi('smile', '<b>昨日の3技、1つ使えた？</b><br>使わなかった日があっても大丈夫。')}
        <div class="nd-list">${card.three
          .map(
            (k) => `<div class="nd-row" data-k="${k}"><div class="nd-skill">${skKeys(k)}<span>${esc(SKILLS[k].name)}</span></div>
            <div class="nd-btns" role="group"><button type="button" data-a="used">✓ 使った</button><button type="button" data-a="nochance">△ チャンスがなかった</button><button type="button" data-a="forgot">? 忘れた</button></div></div>`
          )
          .join('')}</div>
        <div class="ov-btns"><button type="button" class="btn primary" data-act="save" disabled>記録する</button></div>
        <div class="nd-after"></div>
      </div>`;
    const saveBtn = app.querySelector('[data-act="save"]');
    app.querySelectorAll('.nd-row').forEach((row) =>
      row.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        ans[row.dataset.k] = b.dataset.a;
        row.querySelectorAll('[data-a]').forEach((x) => x.classList.toggle('on', x === b));
        saveBtn.disabled = Object.keys(ans).length < card.three.length;
      })
    );
    saveBtn.addEventListener('click', () => {
      st.checkins.push({ date: S.today(), cardDate: card.date, answers: ans });
      Object.keys(ans).forEach((k) => ans[k] === 'used' && S.recordUsage(k, 'nextday'));
      S.save();
      Sound.play('correct');
      const forgot = Object.keys(ans).filter((k) => ans[k] !== 'used');
      const used = Object.keys(ans).filter((k) => ans[k] === 'used').length;
      app.querySelector('.nd-after').innerHTML = `
        <p class="nd-msg">${used ? `✓ ${used}つ使えました。それが一番の成果です。` : '今日チャンスがあったら、1つだけ試してみよう。'}</p>
        ${forgot.length ? `<p>30秒で復習する：</p><div class="ov-btns">${forgot.map((k) => `<button type="button" class="btn" data-r="${k}">${skKeys(k)} ${esc(SKILLS[k].name)}</button>`).join('')}</div>` : ''}
        <div class="ov-btns"><button type="button" class="btn primary" data-go="home">ホームへ</button></div>`;
      saveBtn.disabled = true;
      app.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => go('rescuecard', { id: EQ.RESCUE.find((x) => x.skill === b.dataset.r).id })));
      app.querySelector('[data-go]').addEventListener('click', () => go('home'));
    });
  };

  // ================================================================== 1 WEEK LOOP
  SCREENS.week = function () {
    const st = S.state;
    const card = st.cards.slice(-1)[0];
    if (!card) return go('home');
    const mine = st.mySkills.length ? st.mySkills : card.three;
    const from = st.week.lastAt || st.cards[0].date;
    const counts = {};
    st.usage.filter((u) => u.date >= from).forEach((u) => (counts[u.skill] = (counts[u.skill] || 0) + 1));
    const nextSkill = EQ.PROGRESSION.find((k) => mine.indexOf(k) < 0);
    app.innerHTML = `
      <div class="page week">
        <h1 class="ttl">1 WEEK</h1>
        <h2>今週使った技能</h2>
        <ul class="wk-list">${mine.map((k) => `<li>${skKeys(k)}<span>${esc(SKILLS[k].name)}</span><b class="ticks">${counts[k] ? '✓'.repeat(Math.min(counts[k], 7)) : '<small>まだ</small>'}</b></li>`).join('')}</ul>
        <p class="note">「✓」は翌日チェックと 30秒RESCUE で「使えた」と記録した回数です（自己申告）。</p>
        ${
          nextSkill
            ? `<div class="wk-next">${navi('smile', '次の1技を追加しますか？<br><small>3 → 定着 → +1 → 定着 → +1</small>')}
                <div class="wk-cand">${skKeys(nextSkill, true)}<b>${esc(SKILLS[nextSkill].name)}</b><small>約30秒</small></div>
                <div class="ov-btns"><button type="button" class="btn primary" data-act="add">追加して30秒で見る ▶</button><button type="button" class="btn btn-ghost" data-act="later">今週は今の技を続ける</button></div></div>`
            : '<p>MVP の技能はすべて追加済みです。</p>'
        }
      </div>`;
    const mark = () => {
      st.week.lastAt = S.today();
      S.save();
    };
    const add = app.querySelector('[data-act="add"]');
    if (add) {
      add.addEventListener('click', () => {
        if (st.mySkills.length === 0) st.mySkills = card.three.slice();
        st.mySkills.push(nextSkill);
        st.week.added.push({ date: S.today(), skill: nextSkill });
        mark();
        go('rescuecard', { id: EQ.RESCUE.find((r) => r.skill === nextSkill).id });
      });
      app.querySelector('[data-act="later"]').addEventListener('click', () => {
        mark();
        go('home');
      });
    }
  };

  // ================================================================== 30 SECOND RESCUE
  const RESCUE_ICON = { move: '⬇️', select: '▦', fill: '⧉', replace: '⇄', find: '🔍', filter: '⏷', sum: 'Σ' };
  SCREENS.rescue = function () {
    app.innerHTML = `
      <div class="page rescue">
        <div class="rs-head"><span class="rs-tag">30 SECOND RESCUE</span><h1>今、Excelで何に困ってる？</h1></div>
        <div class="rs-grid">${EQ.RESCUE.map((r) => `<button type="button" class="rs-item" data-id="${r.id}"><span class="rs-ico">${RESCUE_ICON[r.id]}</span>${esc(r.need)}</button>`).join('')}</div>
        <p class="note">実務中にそのまま使えます。JOB → KEY → 10秒デモ → 注意点 → Excelで試す。</p>
      </div>`;
    app.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => go('rescuecard', { id: b.dataset.id })));
  };
  SCREENS.rescuecard = function (p) {
    const r = EQ.RESCUE.find((x) => x.id === p.id) || EQ.RESCUE[0];
    const sk = SKILLS[r.skill];
    app.innerHTML = `
      <div class="page rescue-card">
        <button type="button" class="btn btn-ghost back" data-act="back">← 困りごと一覧</button>
        <article class="rc">
          <span class="rs-tag">30 SECOND RESCUE</span>
          <div class="rc-sec"><span class="lbl">JOB</span><h1>${esc(r.need)}</h1><p>${esc(r.job)}</p></div>
          <div class="rc-sec"><span class="lbl">KEY</span>${skKeys(r.skill, true)}</div>
          <div class="rc-sec"><span class="lbl">10秒デモ</span><div class="rc-demo"></div></div>
          <div class="rc-sec rc-caution"><span class="lbl">${img('icon-warning.png', '', 'ico')}注意点</span><p>${esc(r.caution)}</p></div>
          <div class="ov-btns">
            ${IS_MOBILE ? '<p class="note">Excel（PC）を開いて、そのまま試してみよう。</p>' : '<button type="button" class="btn primary" data-act="try">Excelで試す（シミュレーター）▶</button>'}
            <button type="button" class="btn" data-act="used">✓ 実務で使えた</button>
          </div>
        </article>
      </div>`;
    const stop = demo(app.querySelector('.rc-demo'), r.skill);
    app.querySelector('[data-act="back"]').addEventListener('click', () => go('rescue'));
    const t = app.querySelector('[data-act="try"]');
    if (t) t.addEventListener('click', () => go('rescuetry', { id: r.id }));
    app.querySelector('[data-act="used"]').addEventListener('click', (e) => {
      S.recordUsage(r.skill, 'rescue');
      Sound.play('correct');
      e.currentTarget.textContent = '✓ 記録しました（' + sk.name + '）';
      e.currentTarget.disabled = true;
    });
    return stop;
  };
  SCREENS.rescuetry = function (p) {
    const r = EQ.RESCUE.find((x) => x.id === p.id);
    const step = r.practice();
    const L = layout(app, { badge: '30s RESCUE', skipLabel: '← カードに戻る' });
    const sim = new EQ.Simulator(L.simHost, { historyEl: L.history, onEvent, rows: step.rows, start: step.start });
    EQ._sim = sim;
    let tracker = new Tracker(r.skill), finished = false;
    const hc = hintController(L, () => tracker, () => r.skill);
    hc.reset();
    L.story.textContent = step.story;
    L.job.textContent = step.job;
    L.detail.innerHTML = `${skKeys(r.skill)} <span>${esc(step.detail)}</span>`;
    L.bubble.innerHTML = navi('smile', '30秒だけ。キーは上に出しておきます。');
    const shown = new Set();
    const timerT = setInterval(() => (L.timer.textContent = (tracker.ms() / 1000).toFixed(1)), 100);
    function onEvent(e) {
      if (finished) return;
      tracker.handle(e);
      if (e.kind === 'trap' && TRAPS[e.id] && !shown.has(e.id) && (e.id !== 'partial' || step.trap === 'partial')) {
        shown.add(e.id);
        tracker.pause();
        sim.setEnabled(false);
        Sound.play('discovery');
        overlay(trapCard(e.id), { ok: () => (tracker.resume(), sim.setEnabled(true), sim.focus()) }, 'ov-trap');
      }
      if (e.kind === 'change' && step.check({ sim })) {
        finished = true;
        tracker.stop();
        clearInterval(timerT);
        const res = tracker.result();
        S.recordAttempt({ id: 'rescue:' + r.id, skill: r.skill, variant: 'R', ms: res.ms, done: true, usedTarget: res.usedTarget, hint: 0, mouse: res.mouse, kb: res.kb, scCount: res.scCount, mobile: IS_MOBILE });
        S.recordUsage(r.skill, 'rescue');
        Sound.play(res.usedTarget ? 'speed-up' : 'correct');
        overlay(
          `<div class="fb"><div class="fb-top ${res.usedTarget ? 'fb-fast' : ''}">✓ できた！ ${res.usedTarget ? '<span class="su">⚡ SPEED UP</span>' : ''}</div><div class="fb-times"><div><span class="lbl">今回（実測）</span><b>${sec(res.ms)}</b></div></div>${navi('smile', 'Excel に戻って、そのまま使ってみよう。')}<div class="ov-btns"><button class="btn primary" data-ov="back">RESCUE に戻る</button><button class="btn" data-ov="again">もう一度</button></div></div>`,
          { back: () => go('rescue'), again: () => go('rescuetry', { id: r.id }) }
        );
      }
    }
    sim.focus();
    L.skip.addEventListener('click', () => go('rescuecard', { id: r.id }));
    return () => {
      clearInterval(timerT);
      sim.destroy();
    };
  };

  // ================================================================== RECORDS（KPI）
  SCREENS.records = function () {
    const k = S.kpis();
    const st = S.state;
    const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
    const fin = st.final, chk = st.check;
    app.innerHTML = `
      <div class="page records">
        <h1 class="ttl">記録 ／ KPI</h1>
        <p class="sub">この端末のブラウザ内だけに保存されています（サーバー送信なし）。</p>
        <div class="kpi-main"><span>Time to First Speed-Up</span><b>${k.ttfsu == null ? '—' : sec(k.ttfsu)}</b><small>目標 60秒以内 ${k.ttfsu != null ? (k.ttfsu <= 60000 ? '✓ 達成' : '') : ''}</small></div>
        <table class="kpi"><tbody>
          <tr><th>Task Time（平均・実測）</th><td>${k.avgMs == null ? '—' : sec(k.avgMs)}</td></tr>
          <tr><th>Mouse Actions（累計）</th><td>${k.mouse}</td></tr>
          <tr><th>Keyboard Actions（累計）</th><td>${k.kb}</td></tr>
          <tr><th>Shortcut Usage（累計）</th><td>${k.sc}</td></tr>
          <tr><th>Hint Dependency（答えを見た割合）</th><td>${pct(k.hintDependency)}</td></tr>
          <tr><th>Independent Retry（ヒントなし再現 / 再挑戦）</th><td>${k.independentRetry}</td></tr>
          <tr><th>FAST Completion（今日の3技で1つ以上 △以上）</th><td>${k.fastCompletion ? '✓' : '—'}</td></tr>
          <tr><th>Next-Day Use（使えた日 / 回答日）</th><td>${k.nextDayUse}</td></tr>
          <tr><th>1-Week Retention（○自力 の技能数）</th><td>${k.weekRetention}</td></tr>
          <tr><th>BEFORE → AFTER</th><td>${chk && fin ? 'SPEED CHECK ' + chk.date + ' → FINAL ' + fin.date : '—'}</td></tr>
        </tbody></table>
        <h2>技能の状態</h2>
        <table class="kpi skills"><thead><tr><th>技能</th><th>KEY</th><th>状態</th><th>成功</th><th>答えを見た</th></tr></thead><tbody>
          ${Object.keys(SKILLS).map((id) => { const s = S.skill(id); return `<tr><td>${esc(SKILLS[id].name)}</td><td>${skKeys(id)}</td><td class="st-${s.state}">${S.STATE_MARK[s.state]} ${S.STATE_JA[s.state]}</td><td>${s.successes}</td><td>${s.hintAnswers}</td></tr>`; }).join('')}
        </tbody></table>
        <p class="note">判定：表示した → ×（発見）／ 一度成功 → △ ／ ヒントなしで別データでも再現 → ○。答えを見ただけでは習得扱いにしません。</p>
        <h2>デモ・管理</h2>
        <p class="note">翌日／1週間後の体験を確認するための日付シミュレーション（現在：${S.today()}${st.dayOffset ? `、+${st.dayOffset}日` : ''}）</p>
        <div class="ov-btns">
          <button type="button" class="btn" data-act="d1">＋1日</button>
          <button type="button" class="btn" data-act="d7">＋7日</button>
          <button type="button" class="btn" data-act="d0">日付を戻す</button>
          <button type="button" class="btn" data-act="export">JSON を書き出す</button>
          <button type="button" class="btn btn-danger" data-act="wipe">記録をすべて消去</button>
        </div>
      </div>`;
    const on = (a, fn) => app.querySelector(`[data-act="${a}"]`).addEventListener('click', fn);
    on('d1', () => { st.dayOffset += 1; S.save(); go('home'); });
    on('d7', () => { st.dayOffset += 7; S.save(); go('home'); });
    on('d0', () => { st.dayOffset = 0; S.save(); go('records'); });
    on('export', () => {
      const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'excel-quest-os-record-' + S.today() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    on('wipe', () => {
      if (confirm('この端末の記録をすべて消去します。よろしいですか？')) {
        S.reset();
        go('home');
      }
    });
  };

  // ================================================================== boot
  const soundBtn = document.getElementById('sound');
  function soundLabel() {
    soundBtn.textContent = S.state.settings.sound ? '🔊 SOUND ON' : '🔇 SOUND OFF';
    soundBtn.setAttribute('aria-pressed', String(S.state.settings.sound));
  }
  soundBtn.addEventListener('click', () => {
    Sound.toggle();
    soundLabel();
  });
  soundLabel();
  document.querySelectorAll('[data-nav]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      Sound.play('ui-click');
      go(a.dataset.nav);
    })
  );
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (SCREENS[h] && h !== current) go(h);
  });
  const h0 = location.hash.slice(1);
  go(['home', 'rescue', 'card', 'records', 'hub'].indexOf(h0) >= 0 ? h0 : 'home');
})(window.EQ);
