/*
 * EXCEL QUEST OS — Excel Simulator (DOM)
 * 研修対象操作だけを高品質に再現する：セル選択／行列／スクロール／Keyboard／範囲選択／
 * コピー／貼付／検索／置換／Filter／基本集計／操作履歴／Shortcut検知
 */
(function (EQ) {
  'use strict';
  const { Sheet, addr, colName, MAX_ROW, MAX_COL, parseAddr } = EQ;

  const ROW_H = 24;
  const HDR_W = 64;
  const COL_W = [100, 72, 68, 74, 64, 64, 64, 64, 64, 64, 64, 64];
  const ARROWS = { ArrowDown: [1, 0, '↓'], ArrowUp: [-1, 0, '↑'], ArrowRight: [0, 1, '→'], ArrowLeft: [0, -1, '←'] };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  }
  function shiftFormula(f, dr, dc) {
    return f.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (m, d1, col, d2, row) => {
      const c = d1 ? EQ.colIndex(col) : Math.max(0, EQ.colIndex(col) + dc);
      const r = d2 ? parseInt(row, 10) : Math.max(1, parseInt(row, 10) + dr);
      return d1 + colName(c) + d2 + r;
    });
  }

  class Simulator {
    constructor(host, opts) {
      this.host = host;
      this.opts = opts || {};
      this.onEvent = this.opts.onEvent || function () {};
      this.history = [];
      this.enabled = true;
      this.build();
      if (this.opts.rows) this.load(this.opts.rows, this.opts.start);
    }

    // ------------------------------------------------------------ build
    build() {
      const h = this.host;
      h.classList.add('xl');
      h.innerHTML = `
        <div class="xl-ribbon" role="toolbar" aria-label="リボン">
          <span class="xl-tab">ホーム</span>
          <button type="button" data-act="find" class="xl-rb"><span class="ico">🔍</span>検索</button>
          <button type="button" data-act="replace" class="xl-rb"><span class="ico">⇄</span>置換</button>
          <button type="button" data-act="filter" class="xl-rb"><span class="ico">⏷</span>フィルター</button>
          <button type="button" data-act="autosum" class="xl-rb"><span class="ico">Σ</span>オートSUM</button>
          <button type="button" data-act="undo" class="xl-rb"><span class="ico">↶</span>元に戻す</button>
          <span class="xl-spacer"></span>
          <button type="button" data-act="reset" class="xl-rb xl-rb-sub" title="データを最初の状態に戻す">↺ 最初から</button>
        </div>
        <div class="xl-fbar">
          <div class="xl-namebox" aria-label="名前ボックス">A1</div>
          <div class="xl-fx">fx</div>
          <div class="xl-formula" aria-live="off"></div>
        </div>
        <div class="xl-grid" tabindex="0" aria-label="ワークシート（矢印キーで移動）">
          <div class="xl-colhdr"></div>
          <div class="xl-body">
            <div class="xl-rows"></div>
            <div class="xl-selbox"></div>
            <div class="xl-refbox"></div>
            <div class="xl-copybox"></div>
          </div>
          <div class="xl-vscroll"><div class="xl-thumb"></div></div>
        </div>
        <div class="xl-status"><span class="xl-mode">準備完了</span><span class="xl-filterinfo"></span><span class="xl-agg"></span></div>
        <div class="xl-dialog" hidden></div>
        <div class="xl-dropdown" hidden></div>
        <div class="xl-toast" hidden></div>`;
      this.$ = (sel) => h.querySelector(sel);
      this.grid = this.$('.xl-grid');
      this.body = this.$('.xl-body');
      this.rowsEl = this.$('.xl-rows');
      this.colHdr = this.$('.xl-colhdr');
      this.thumb = this.$('.xl-thumb');
      this.vscroll = this.$('.xl-vscroll');
      this.dialog = this.$('.xl-dialog');
      this.dropdown = this.$('.xl-dropdown');

      this.colX = [HDR_W];
      for (let c = 0; c < MAX_COL; c++) this.colX.push(this.colX[c] + COL_W[c]);
      this.colHdr.innerHTML =
        `<div class="xl-corner" data-corner="1"></div>` +
        COL_W.map((w, c) => `<div class="xl-ch" data-col="${c}" style="left:${this.colX[c]}px;width:${w}px">${colName(c)}</div>`).join('');

      this._bind();
    }

    _bind() {
      const safe = (fn) => (e) => {
        try {
          fn.call(this, e);
        } catch (err) {
          // 誤操作で止まらない：例外は握りつぶして表示だけ更新
          console.error(err);
          this.render();
        }
      };
      this.grid.addEventListener('keydown', safe(this._onKey));
      this.grid.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') e.preventDefault();
      });
      this.body.addEventListener('mousedown', safe(this._onMouseDown));
      this.body.addEventListener('dblclick', safe(this._onDblClick));
      this.colHdr.addEventListener('mousedown', safe(this._onColHdr));
      this.body.addEventListener('wheel', safe(this._onWheel), { passive: false });
      this.vscroll.addEventListener('mousedown', safe(this._onScrollbar));
      this.$('.xl-ribbon').addEventListener('click', safe(this._onRibbon));
      this.$('.xl-ribbon').addEventListener('mousedown', (e) => e.preventDefault());
      this._onMove = safe(this._onMouseMove);
      this._onUp = safe(this._onMouseUp);
      this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.render()) : null;
      if (this._ro) this._ro.observe(this.body);
      // タッチ（スマホ）：タップでセル選択、スワイプでスクロール
      let ty = null;
      this.body.addEventListener('touchstart', (e) => {
        ty = e.touches[0].clientY;
      }, { passive: true });
      this.body.addEventListener('touchmove', (e) => {
        if (ty === null) return;
        const dy = ty - e.touches[0].clientY;
        if (Math.abs(dy) > ROW_H) {
          this.scrollBy(Math.round(dy / ROW_H));
          ty = e.touches[0].clientY;
          e.preventDefault();
        }
      }, { passive: false });
    }

    // ------------------------------------------------------------ state
    load(rows, start) {
      this.initialRows = rows;
      this.start = start || {};
      this.reset(true);
    }
    reset(silent) {
      this.sheet = new Sheet(this.initialRows);
      const s = this.start;
      this.anchor = { r: s.r || 0, c: s.c || 0 };
      this.focusPt = s.sel ? { r: s.sel.r2, c: s.sel.c2 } : { r: this.anchor.r, c: this.anchor.c };
      if (s.sel) this.anchor = { r: s.sel.r1, c: s.sel.c1 };
      this.topRow = 0;
      this.copyRange = null;
      this.editing = null;
      this.closeDialog();
      this.closeDropdown();
      this.ensureVisible(this.focusPt);
      this.render();
      if (!silent) {
        this.log('↺ データを最初の状態に戻した', 'mouse');
        this.emit({ kind: 'reset' });
        this.emit({ kind: 'change' });
      }
    }
    sel() {
      const a = this.anchor, f = this.focusPt;
      return { r1: Math.min(a.r, f.r), r2: Math.max(a.r, f.r), c1: Math.min(a.c, f.c), c2: Math.max(a.c, f.c) };
    }
    isMulti() {
      const s = this.sel();
      return s.r1 !== s.r2 || s.c1 !== s.c2;
    }
    setActive(r, c) {
      this.anchor = { r, c };
      this.focusPt = { r, c };
      this.ensureVisible(this.focusPt);
      this.render();
    }
    select(r1, c1, r2, c2) {
      this.anchor = { r: r1, c: c1 };
      this.focusPt = { r: r2, c: c2 };
      this.ensureVisible(this.focusPt);
      this.render();
    }
    focus() {
      if (this.editing) this.editing.input.focus();
      else this.grid.focus({ preventScroll: true });
    }
    setEnabled(on) {
      this.enabled = on;
      this.host.classList.toggle('xl-disabled', !on);
    }
    emit(evt) {
      try {
        this.onEvent(evt);
      } catch (e) {
        console.error(e);
      }
    }
    log(label, kind, shortcut) {
      this.history.unshift({ label, kind, shortcut: !!shortcut, t: Date.now() });
      if (this.history.length > 50) this.history.pop();
      if (this.opts.historyEl) this.renderHistory();
    }
    renderHistory() {
      const el = this.opts.historyEl;
      el.innerHTML = this.history
        .slice(0, 8)
        .map((h) => `<li class="${h.shortcut ? 'is-sc' : h.kind === 'mouse' ? 'is-mouse' : 'is-key'}"><span class="hk">${h.shortcut ? '⚡' : h.kind === 'mouse' ? '🖱' : '⌨'}</span>${esc(h.label)}</li>`)
        .join('') || '<li class="is-empty">まだ操作はありません</li>';
    }
    clearHistory() {
      this.history = [];
      if (this.opts.historyEl) this.renderHistory();
    }
    // key: 操作ラベル, sc: ショートカットID（あれば）
    keyAction(label, sc) {
      this.log(label, 'key', !!sc);
      this.emit({ kind: 'key', label, shortcut: sc || null });
    }
    mouseAction(label) {
      this.log(label, 'mouse');
      this.emit({ kind: 'mouse', label });
    }
    changed() {
      this.render();
      this.emit({ kind: 'change' });
    }
    toast(msg, ms) {
      const t = this.$('.xl-toast');
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => (t.hidden = true), ms || 2200);
    }

    // ------------------------------------------------------------ viewport
    visibleCount() {
      return Math.max(5, Math.floor((this.body.clientHeight || 480) / ROW_H));
    }
    nextVisible(r, d) {
      let n = r;
      while (n >= 0 && n < MAX_ROW && this.sheet.hidden.has(n)) n += d;
      return Math.min(MAX_ROW - 1, Math.max(0, n));
    }
    scrollBy(n) {
      let r = this.topRow;
      const d = n > 0 ? 1 : -1;
      for (let k = 0; k < Math.abs(n); k++) {
        const nx = this.nextVisible(r + d, d);
        if (nx === r || this.sheet.hidden.has(nx)) break;
        r = nx;
      }
      this.topRow = Math.max(0, r);
      this.render();
    }
    ensureVisible(p) {
      const vc = this.visibleCount();
      if (p.r < this.topRow) {
        this.topRow = p.r;
        return;
      }
      // p.r が描画範囲内か
      let r = this.topRow, k = 0;
      while (k < vc - 1 && r < MAX_ROW) {
        if (r === p.r) return;
        if (!this.sheet.hidden.has(r)) k++;
        r++;
      }
      if (r === p.r) return;
      // p.r が最下段に来るよう topRow を戻す
      let t = p.r;
      k = 0;
      while (k < vc - 2 && t > 0) {
        t--;
        if (!this.sheet.hidden.has(t)) k++;
      }
      this.topRow = this.nextVisible(t, 1);
    }
    // スクロールバーの可動範囲（一番下 = 使用範囲の最終行が見える位置。Excel と同じ感覚）
    scrollMax() {
      const vc = this.visibleCount();
      return Math.max(1, this.sheet.usedRows() + 3 - vc, this.focusPt.r + 3 - vc, this.topRow);
    }

    // ------------------------------------------------------------ render
    render() {
      if (!this.sheet) return;
      const sh = this.sheet;
      this.topRow = this.nextVisible(this.topRow, 1);
      const vc = this.visibleCount() + 1;
      const s = this.sel();
      const cp = this.copyRange;
      const f = sh.filter;
      const out = [];
      this.rendered = [];
      let r = this.topRow;
      let y = 0;
      while (this.rendered.length < vc && r < MAX_ROW) {
        if (sh.hidden.has(r)) {
          r++;
          continue;
        }
        this.rendered.push(r);
        const rowSel = r >= s.r1 && r <= s.r2;
        const filtered = f && r > f.r1 && r <= f.r2 && f.criteria.size;
        let cells = `<div class="xl-rh${rowSel ? ' on' : ''}${filtered ? ' filt' : ''}" data-row="${r}">${r + 1}</div>`;
        for (let c = 0; c < MAX_COL; c++) {
          const v = sh.display(r, c);
          const num = typeof sh.value(r, c) === 'number';
          const inSel = rowSel && c >= s.c1 && c <= s.c2;
          const act = r === this.anchor.r && c === this.anchor.c;
          let cls = 'xl-c';
          if (inSel && !act) cls += ' sel';
          if (act) cls += ' act';
          if (num) cls += ' num';
          if (r === 0 && v !== '') cls += ' hd';
          let btn = '';
          if (f && r === f.r1 && c >= f.c1 && c <= f.c2) {
            const on = f.criteria.has(c);
            btn = `<button type="button" tabindex="-1" class="xl-fbtn${on ? ' on' : ''}" data-fcol="${c}" aria-label="${esc(v)} のフィルター">${on ? '⏷' : '▾'}</button>`;
            cls += ' fh';
          }
          cells += `<div class="${cls}" data-r="${r}" data-c="${c}" style="left:${this.colX[c]}px;width:${COL_W[c]}px">${esc(v)}${btn}</div>`;
        }
        out.push(`<div class="xl-row" style="top:${y}px">${cells}</div>`);
        y += ROW_H;
        r++;
      }
      this.rowsEl.innerHTML = out.join('');
      // 列見出しのハイライト
      this.colHdr.querySelectorAll('.xl-ch').forEach((el, c) => el.classList.toggle('on', c >= s.c1 && c <= s.c2));
      this._box(this.$('.xl-selbox'), s, this.isMulti());
      this._box(this.$('.xl-copybox'), cp, !!cp);
      this._box(this.$('.xl-refbox'), this.refRange, !!(this.editing && this.refRange));
      // 名前ボックス・数式バー
      this.$('.xl-namebox').textContent = addr(this.anchor.r, this.anchor.c);
      if (!this.editing) this.$('.xl-formula').textContent = String(sh.raw(this.anchor.r, this.anchor.c));
      // スクロールバー
      const trackH = this.vscroll.clientHeight || 400;
      const mx = this.scrollMax();
      const thumbH = Math.max(24, Math.min(trackH, (this.visibleCount() / (mx + this.visibleCount())) * trackH));
      this.thumb.style.height = thumbH + 'px';
      this.thumb.style.top = Math.min(trackH - thumbH, (Math.min(this.topRow, mx) / mx) * (trackH - thumbH)) + 'px';
      // ステータスバー
      this.$('.xl-mode').textContent = this.editing ? (this.editing.f2 ? '編集' : '入力') : '準備完了';
      this.$('.xl-filterinfo').textContent = f && f.criteria.size ? `${f.r2 - f.r1} レコード中 ${sh.visibleDataCount()} 個が見つかりました` : f ? 'フィルター：ON' : '';
      this.$('.xl-agg').innerHTML = this._aggText(s);
      if (this.editing) this._placeEditor();
    }
    _box(el, range, show) {
      if (!show || !range) {
        el.style.display = 'none';
        return;
      }
      const rs = this.rendered;
      let i1 = -1, i2 = -1;
      for (let i = 0; i < rs.length; i++) {
        if (rs[i] >= range.r1 && rs[i] <= range.r2) {
          if (i1 < 0) i1 = i;
          i2 = i;
        }
      }
      if (i1 < 0) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.top = i1 * ROW_H + 'px';
      el.style.height = (i2 - i1 + 1) * ROW_H + 'px';
      el.style.left = this.colX[range.c1] + 'px';
      el.style.width = this.colX[Math.min(range.c2, MAX_COL - 1) + 1] - this.colX[range.c1] + 'px';
      el.classList.toggle('open-top', range.r1 < rs[i1]);
      el.classList.toggle('open-bottom', range.r2 > rs[i2]);
    }
    _aggText(s) {
      if (!this.isMulti()) return '';
      const sh = this.sheet;
      const r2 = Math.min(s.r2, sh.usedRows() - 1);
      let cnt = 0, n = 0, sum = 0;
      for (let r = s.r1; r <= r2; r++) {
        if (sh.hidden.has(r)) continue;
        for (let c = s.c1; c <= Math.min(s.c2, MAX_COL - 1); c++) {
          const v = sh.value(r, c);
          if (v === '' || v === undefined) continue;
          cnt++;
          if (typeof v === 'number') {
            n++;
            sum += v;
          }
        }
      }
      if (!cnt) return '';
      const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString('ja-JP');
      return (n ? `平均: ${fmt(sum / n)}　` : '') + `データの個数: ${cnt.toLocaleString('ja-JP')}` + (n ? `　合計: ${fmt(sum)}` : '');
    }

    // ------------------------------------------------------------ keyboard
    _onKey(e) {
      if (!this.enabled || !this.sheet) return;
      if (e.isComposing) return;
      const ctrl = e.ctrlKey || e.metaKey, shift = e.shiftKey, alt = e.altKey;
      const k = e.key;
      const sh = this.sheet;
      const pd = () => e.preventDefault();

      if (ARROWS[k]) {
        pd();
        const [dr, dc, sym] = ARROWS[k];
        if (alt && k === 'ArrowDown' && sh.filter && this.anchor.r === sh.filter.r1) {
          this.keyAction('Alt + ↓（フィルター一覧）', 'altDown');
          this.openDropdown(this.anchor.c);
          return;
        }
        if (ctrl && shift) {
          const to = sh.ctrlJump(this.focusPt.r, this.focusPt.c, dr, dc);
          const gap = sh.stoppedAtGap(to.r, to.c, dr);
          this.focusPt = to;
          this.ensureVisible(to);
          this.keyAction(`Ctrl + Shift + ${sym} → ${addr(this.anchor.r, this.anchor.c)}:${addr(to.r, to.c)}`, 'ctrlShiftArrow');
          if (gap) this.emit({ kind: 'trap', id: 'blank', r: to.r, c: to.c });
        } else if (ctrl) {
          const to = sh.ctrlJump(this.anchor.r, this.anchor.c, dr, dc);
          const gap = sh.stoppedAtGap(to.r, to.c, dr);
          this.anchor = to;
          this.focusPt = { r: to.r, c: to.c };
          this.ensureVisible(to);
          this.keyAction(`Ctrl + ${sym} → ${addr(to.r, to.c)}`, 'ctrlArrow');
          if (gap) this.emit({ kind: 'trap', id: 'blank', r: to.r, c: to.c });
          if (to.r === MAX_ROW - 1) this.emit({ kind: 'trap', id: 'sheetEnd' });
        } else if (shift) {
          const to = sh.step(this.focusPt.r, this.focusPt.c, dr, dc) || this.focusPt;
          this.focusPt = to;
          this.ensureVisible(to);
          if (!e.repeat) this.keyAction(`Shift + ${sym}`, null);
          else this.emit({ kind: 'repeat' });
        } else {
          const to = sh.step(this.anchor.r, this.anchor.c, dr, dc) || this.anchor;
          this.anchor = to;
          this.focusPt = { r: to.r, c: to.c };
          this.ensureVisible(to);
          if (!e.repeat) this.keyAction(sym, null);
          else this.emit({ kind: 'repeat' });
        }
        this.changed();
        return;
      }

      if (ctrl && !alt) {
        const code = e.code;
        if (code === 'KeyF') {
          pd();
          this.keyAction('Ctrl + F（検索）', 'ctrlF');
          return this.openDialog('find');
        }
        if (code === 'KeyH') {
          pd();
          this.keyAction('Ctrl + H（置換）', 'ctrlH');
          return this.openDialog('replace');
        }
        if (code === 'KeyL' && shift) {
          pd();
          this.keyAction('Ctrl + Shift + L（フィルター）', 'ctrlShiftL');
          return this.toggleFilter();
        }
        if (code === 'KeyA') {
          pd();
          const reg = sh.currentRegion(this.anchor.r, this.anchor.c);
          const s = this.sel();
          if (s.r1 === reg.r1 && s.r2 === reg.r2 && s.c1 === reg.c1 && s.c2 === reg.c2) {
            this.anchor = { r: 0, c: 0 };
            this.focusPt = { r: MAX_ROW - 1, c: MAX_COL - 1 };
          } else {
            this.anchor = { r: reg.r1, c: reg.c1 };
            this.focusPt = { r: reg.r2, c: reg.c2 };
          }
          this.keyAction('Ctrl + A（表を選択）', 'ctrlA');
          return this.changed();
        }
        if (k === 'Home') {
          pd();
          this.setActive(this.nextVisible(0, 1), 0);
          this.keyAction('Ctrl + Home → A1', 'ctrlHome');
          return this.changed();
        }
        if (k === 'End') {
          pd();
          const lc = sh.lastCell();
          this.setActive(lc.r, lc.c);
          this.keyAction(`Ctrl + End → ${addr(lc.r, lc.c)}`, 'ctrlEnd');
          return this.changed();
        }
        if (code === 'KeyZ') {
          pd();
          const op = sh.undo();
          this.keyAction(op ? `Ctrl + Z（元に戻す：${op.label}）` : 'Ctrl + Z（戻す操作なし）', 'ctrlZ');
          return this.changed();
        }
        if (code === 'KeyC') {
          pd();
          this.copy();
          this.keyAction('Ctrl + C（コピー）', 'ctrlC');
          return this.changed();
        }
        if (code === 'KeyV') {
          pd();
          this.paste();
          this.keyAction('Ctrl + V（貼り付け）', 'ctrlV');
          return this.changed();
        }
        if (code === 'KeyD' || code === 'KeyR') {
          pd();
          this.fill(code === 'KeyD' ? 'down' : 'right');
          this.keyAction(code === 'KeyD' ? 'Ctrl + D（上のセルをコピー）' : 'Ctrl + R（左のセルをコピー）', code === 'KeyD' ? 'ctrlD' : 'ctrlR');
          return this.changed();
        }
        return;
      }

      if (alt && !ctrl && (k === '=' || e.code === 'Equal' || (e.code === 'Minus' && shift) || k === '≠')) {
        pd();
        this.keyAction('Alt + =（オートSUM）', 'altEq');
        return this.autoSum();
      }
      if (alt) return;

      switch (k) {
        case 'Enter':
        case 'Tab': {
          pd();
          const [dr, dc] = k === 'Tab' ? [0, shift ? -1 : 1] : [shift ? -1 : 1, 0];
          const to = sh.step(this.anchor.r, this.anchor.c, dr, dc) || this.anchor;
          this.setActive(to.r, to.c);
          if (!e.repeat) this.keyAction(k, null);
          return this.changed();
        }
        case 'PageDown':
        case 'PageUp': {
          pd();
          const d = k === 'PageDown' ? 1 : -1;
          let r = this.anchor.r;
          for (let i = 0; i < this.visibleCount() - 1; i++) {
            const n = sh.step(r, this.anchor.c, d, 0);
            if (!n) break;
            r = n.r;
          }
          this.scrollBy(d * (this.visibleCount() - 1));
          this.setActive(r, this.anchor.c);
          if (!e.repeat) this.keyAction(k, null);
          else this.emit({ kind: 'repeat' });
          return this.changed();
        }
        case 'Home':
          pd();
          this.setActive(this.anchor.r, 0);
          this.keyAction('Home', null);
          return this.changed();
        case 'F2':
          pd();
          this.keyAction('F2（セル編集）', 'f2');
          return this.startEdit(String(sh.raw(this.anchor.r, this.anchor.c)), true);
        case 'Delete': {
          pd();
          this.clearSel();
          this.keyAction('Delete（クリア）', null);
          return this.changed();
        }
        case 'Backspace':
          pd();
          this.keyAction('Backspace', null);
          return this.startEdit('', false);
        case 'Escape':
          if (this.copyRange) {
            this.copyRange = null;
            this.render();
          }
          return;
      }
      if (k === 'Process') {
        // IME 入力の開始：入力欄へフォーカスを移す
        this.keyAction('入力', null);
        return this.startEdit('', false, true);
      }
      if (k.length === 1 && !ctrl) {
        pd();
        this.keyAction('入力', null);
        return this.startEdit(k, false);
      }
    }

    // ------------------------------------------------------------ editing
    startEdit(text, f2, ime) {
      const r = this.anchor.r, c = this.anchor.c;
      const input = document.createElement('input');
      input.className = 'xl-editor';
      input.value = text;
      input.setAttribute('aria-label', addr(r, c) + ' を編集');
      this.editing = { r, c, input, f2 };
      this.focusPt = { r, c };
      this.body.appendChild(input);
      this._updateRef();
      this.render();
      input.focus();
      if (!ime) input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          this.commitEdit();
          const [dr, dc] = e.key === 'Tab' ? [0, 1] : [e.shiftKey ? -1 : 1, 0];
          const to = this.sheet.step(r, c, dr, dc) || { r, c };
          this.setActive(to.r, to.c);
          this.keyAction(e.key + '（確定）', null);
          this.grid.focus({ preventScroll: true });
          this.changed();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.cancelEdit();
          this.keyAction('Esc（入力取り消し）', null);
        } else if (ARROWS[e.key] && !this.editing.f2 && !e.ctrlKey && !e.metaKey) {
          // 入力モードの矢印は確定して移動（Excelと同じ）
          e.preventDefault();
          this.commitEdit();
          this.grid.focus({ preventScroll: true });
          this._onKey(e);
        }
      });
      input.addEventListener('input', () => {
        this.$('.xl-formula').textContent = input.value;
        this._updateRef();
        this._box(this.$('.xl-refbox'), this.refRange, !!this.refRange);
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (this.editing && this.editing.input === input && document.activeElement !== input) this.commitEdit(true);
        }, 0);
      });
    }
    _updateRef() {
      this.refRange = null;
      if (!this.editing) return;
      const m = /([A-Z]{1,3}\d+):([A-Z]{1,3}\d+)/i.exec(this.editing.input.value);
      if (m && this.editing.input.value[0] === '=') {
        const a = parseAddr(m[1]), b = parseAddr(m[2]);
        if (a && b) this.refRange = { r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) };
      }
    }
    _placeEditor() {
      const ed = this.editing;
      const i = this.rendered.indexOf(ed.r);
      if (i < 0) {
        ed.input.style.display = 'none';
        return;
      }
      ed.input.style.display = 'block';
      ed.input.style.top = i * ROW_H + 'px';
      ed.input.style.left = this.colX[ed.c] + 'px';
      ed.input.style.minWidth = COL_W[ed.c] + 'px';
    }
    commitEdit(fromBlur) {
      const ed = this.editing;
      if (!ed) return;
      this.editing = null;
      this.refRange = null;
      const v = ed.input.value;
      ed.input.remove();
      this.sheet.set(ed.r, ed.c, v, '入力');
      this.emit({ kind: 'commit', r: ed.r, c: ed.c, raw: v });
      if (fromBlur) this.changed();
    }
    cancelEdit() {
      const ed = this.editing;
      if (!ed) return;
      this.editing = null;
      this.refRange = null;
      ed.input.remove();
      this.grid.focus({ preventScroll: true });
      this.render();
    }

    // ------------------------------------------------------------ commands
    clearSel() {
      const s = this.sel();
      const ch = [];
      for (let r = s.r1; r <= Math.min(s.r2, this.sheet.usedRows() - 1); r++)
        for (let c = s.c1; c <= s.c2; c++) if (!this.sheet.isEmpty(r, c)) ch.push({ r, c, v: '' });
      this.sheet.setMany(ch, 'クリア');
    }
    copy() {
      const s = this.sel();
      const r2 = Math.min(s.r2, this.sheet.usedRows() - 1);
      const data = [];
      for (let r = s.r1; r <= r2; r++) {
        if (this.sheet.hidden.has(r)) continue;
        const row = [];
        for (let c = s.c1; c <= s.c2; c++) row.push(this.sheet.raw(r, c));
        data.push(row);
      }
      this.clip = { data, r: s.r1, c: s.c1 };
      this.copyRange = { r1: s.r1, r2: s.r2, c1: s.c1, c2: s.c2 };
    }
    paste() {
      if (!this.clip) return this.toast('先にコピーしてください');
      const ch = [];
      const { r, c } = this.anchor;
      this.clip.data.forEach((row, i) =>
        row.forEach((v, j) => {
          if (c + j >= MAX_COL) return;
          const val = typeof v === 'string' && v[0] === '=' ? shiftFormula(v, r - this.clip.r, c - this.clip.c) : v;
          ch.push({ r: r + i, c: c + j, v: val });
        })
      );
      this.sheet.setMany(ch, '貼り付け');
      this.focusPt = { r: r + this.clip.data.length - 1, c: Math.min(MAX_COL - 1, c + (this.clip.data[0] || []).length - 1) };
    }
    fill(dir) {
      const s = this.sel();
      const sh = this.sheet;
      const ch = [];
      const r2 = Math.min(s.r2, sh.usedRows() + 50);
      if (dir === 'down') {
        const src = s.r1 === r2 ? s.r1 - 1 : s.r1;
        if (src < 0) return;
        for (let r = src + 1; r <= r2; r++)
          for (let c = s.c1; c <= s.c2; c++) {
            const v = sh.raw(src, c);
            ch.push({ r, c, v: typeof v === 'string' && v[0] === '=' ? shiftFormula(v, r - src, 0) : v });
          }
      } else {
        const src = s.c1 === s.c2 ? s.c1 - 1 : s.c1;
        if (src < 0) return;
        for (let r = s.r1; r <= r2; r++)
          for (let c = src + 1; c <= s.c2; c++) {
            const v = sh.raw(r, src);
            ch.push({ r, c, v: typeof v === 'string' && v[0] === '=' ? shiftFormula(v, 0, c - src) : v });
          }
      }
      sh.setMany(ch, dir === 'down' ? '下方向へコピー' : '右方向へコピー');
    }
    autoSum() {
      const { r, c } = this.anchor;
      const a = this.sheet.autoSumFormula(r, c);
      this.setActive(r, c);
      this.startEdit(a.formula, false);
      // 関数の () の中にカーソル
      const inp = this.editing.input;
      inp.setSelectionRange(a.formula.length - 1, a.formula.length - 1);
      this.emit({ kind: 'autosum', range: a });
    }
    toggleFilter() {
      const on = this.sheet.toggleFilter(this.isMulti() ? this.sel() : { r1: this.anchor.r, c1: this.anchor.c, r2: this.anchor.r, c2: this.anchor.c });
      this.closeDropdown();
      this.toast(on ? 'フィルター：見出しに ▾ が付きました' : 'フィルターを解除しました');
      this.changed();
    }

    // ------------------------------------------------------------ mouse
    _cellAt(e) {
      const rect = this.body.getBoundingClientRect();
      const y = e.clientY - rect.top, x = e.clientX - rect.left;
      const i = Math.max(0, Math.min(this.rendered.length - 1, Math.floor(y / ROW_H)));
      let c = 0;
      for (let k = 0; k < MAX_COL; k++) if (x >= this.colX[k]) c = k;
      return { r: this.rendered[i], c, x, y, h: rect.height, rowHdr: x < HDR_W };
    }
    _onMouseDown(e) {
      if (!this.enabled || e.button !== 0) return;
      if (e.target.classList.contains('xl-editor')) return;
      const fb = e.target.closest('.xl-fbtn');
      if (fb) {
        e.preventDefault();
        this.mouseAction('▾ フィルター一覧を開く');
        this.openDropdown(parseInt(fb.dataset.fcol, 10));
        return;
      }
      e.preventDefault();
      if (this.editing) {
        const v = this.editing.input.value;
        // 数式入力中のクリックはセル参照の入力（簡易）
        if (v[0] === '=' && /[(,+\-*/:]$/.test(v)) {
          const p = this._cellAt(e);
          this.editing.input.value = v + addr(p.r, p.c);
          this.editing.input.dispatchEvent(new Event('input'));
          this.editing.input.focus();
          return;
        }
        this.commitEdit();
      }
      this.closeDropdown();
      const p = this._cellAt(e);
      if (p.rowHdr) {
        this.anchor = { r: p.r, c: 0 };
        this.focusPt = { r: p.r, c: MAX_COL - 1 };
        this.mouseAction(`行 ${p.r + 1} を選択`);
      } else if (e.shiftKey) {
        this.focusPt = { r: p.r, c: p.c };
        this.mouseAction(`Shift + クリック → ${addr(this.anchor.r, this.anchor.c)}:${addr(p.r, p.c)}`);
      } else {
        this.anchor = { r: p.r, c: p.c };
        this.focusPt = { r: p.r, c: p.c };
        this.mouseAction(`クリック → ${addr(p.r, p.c)}`);
      }
      this.drag = { startY: e.clientY, rowHdr: p.rowHdr, moved: false };
      this.grid.focus({ preventScroll: true });
      window.addEventListener('mousemove', this._onMove);
      window.addEventListener('mouseup', this._onUp);
      this.changed();
    }
    _onMouseMove(e) {
      if (!this.drag) return;
      this.drag.lastEvent = e;
      const p = this._cellAt(e);
      this.drag.moved = true;
      const rect = this.body.getBoundingClientRect();
      const below = e.clientY - rect.bottom, above = rect.top - e.clientY;
      if (below > 0 || above > 0) {
        if (!this.drag.timer) {
          // ドラッグ中の自動スクロール（離れるほど速い）
          this.drag.timer = setInterval(() => {
            const ev = this.drag && this.drag.lastEvent;
            if (!ev) return;
            const rb = this.body.getBoundingClientRect();
            const d = ev.clientY > rb.bottom ? ev.clientY - rb.bottom : ev.clientY < rb.top ? -(rb.top - ev.clientY) : 0;
            if (!d) return;
            const n = Math.sign(d) * Math.max(1, Math.round(Math.pow(Math.abs(d) / 12, 1.6)));
            this.scrollBy(n);
            const edge = d > 0 ? this.rendered[this.rendered.length - 2] : this.rendered[0];
            if (edge !== undefined) this.focusPt = { r: edge, c: this.drag.rowHdr ? MAX_COL - 1 : this.focusPt.c };
            this.render();
          }, 50);
        }
      } else if (this.drag.timer) {
        clearInterval(this.drag.timer);
        this.drag.timer = null;
      }
      if (below <= 0 && above <= 0) {
        this.focusPt = { r: p.r, c: this.drag.rowHdr ? MAX_COL - 1 : p.c };
        this.render();
      }
    }
    _onMouseUp() {
      window.removeEventListener('mousemove', this._onMove);
      window.removeEventListener('mouseup', this._onUp);
      if (this.drag && this.drag.timer) clearInterval(this.drag.timer);
      if (this.drag && this.drag.moved && this.isMulti()) {
        const s = this.sel();
        this.mouseAction(`ドラッグ選択 → ${addr(s.r1, s.c1)}:${addr(Math.min(s.r2, MAX_ROW - 1), s.c2)}`);
      }
      this.drag = null;
      this.changed();
    }
    _onDblClick(e) {
      if (!this.enabled || e.target.closest('.xl-fbtn') || e.target.classList.contains('xl-editor')) return;
      const p = this._cellAt(e);
      this.setActive(p.r, p.c);
      this.mouseAction(`ダブルクリック（編集）${addr(p.r, p.c)}`);
      this.startEdit(String(this.sheet.raw(p.r, p.c)), true);
    }
    _onColHdr(e) {
      if (!this.enabled) return;
      e.preventDefault();
      if (this.editing) this.commitEdit();
      const ch = e.target.closest('.xl-ch');
      if (e.target.closest('.xl-corner')) {
        this.anchor = { r: 0, c: 0 };
        this.focusPt = { r: MAX_ROW - 1, c: MAX_COL - 1 };
        this.mouseAction('シート全体を選択');
      } else if (ch) {
        const c = parseInt(ch.dataset.col, 10);
        if (e.shiftKey) this.focusPt = { r: MAX_ROW - 1, c };
        else {
          this.anchor = { r: 0, c };
          this.focusPt = { r: MAX_ROW - 1, c };
        }
        this.mouseAction(`${colName(c)} 列を選択`);
      }
      this.grid.focus({ preventScroll: true });
      this.changed();
    }
    _onWheel(e) {
      if (!this.enabled) return;
      e.preventDefault();
      const lines = e.deltaMode === 1 ? e.deltaY : e.deltaMode === 2 ? e.deltaY * this.visibleCount() : e.deltaY / 33.3;
      this._wheelAcc = (this._wheelAcc || 0) + lines;
      const n = Math.trunc(this._wheelAcc);
      if (n) {
        this._wheelAcc -= n;
        this.scrollBy(n);
      }
      const now = Date.now();
      if (!this._lastWheel || now - this._lastWheel > 350) this.mouseAction('マウスホイールでスクロール');
      this._lastWheel = now;
    }
    _onScrollbar(e) {
      if (!this.enabled) return;
      e.preventDefault();
      const track = this.vscroll.getBoundingClientRect();
      const thumbR = this.thumb.getBoundingClientRect();
      if (e.target === this.thumb) {
        const off = e.clientY - thumbR.top;
        const mx = this.scrollMax();
        const move = (ev) => {
          const ratio = Math.max(0, Math.min(1, (ev.clientY - off - track.top) / (track.height - thumbR.height)));
          this.topRow = Math.round(ratio * mx);
          this.render();
        };
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          this.changed();
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        this.mouseAction('スクロールバーをドラッグ');
      } else {
        const d = e.clientY < thumbR.top ? -1 : 1;
        this.scrollBy(d * (this.visibleCount() - 1));
        this.mouseAction('スクロールバーをクリック');
      }
    }
    _onRibbon(e) {
      const b = e.target.closest('[data-act]');
      if (!b || !this.enabled) return;
      if (this.editing) this.commitEdit();
      const act = b.dataset.act;
      const ico = b.querySelector('.ico');
      const label = b.textContent.replace(ico ? ico.textContent : '', '').trim();
      if (act === 'reset') return this.reset();
      this.mouseAction(`リボン：${label || act}`);
      if (act === 'find') this.openDialog('find');
      else if (act === 'replace') this.openDialog('replace');
      else if (act === 'filter') this.toggleFilter();
      else if (act === 'autosum') this.autoSum();
      else if (act === 'undo') {
        this.sheet.undo();
        this.changed();
      }
    }

    // ------------------------------------------------------------ find / replace dialog
    openDialog(mode) {
      this.closeDropdown();
      const d = this.dialog;
      const prev = this._dlgState || { q: '', rep: '', exact: false };
      d.hidden = false;
      d.innerHTML = `
        <div class="xl-dlg-head"><span>検索と置換</span><button type="button" class="xl-x" data-dlg="close" aria-label="閉じる">×</button></div>
        <div class="xl-dlg-tabs" role="tablist">
          <button type="button" role="tab" data-tab="find" class="${mode === 'find' ? 'on' : ''}">検索(D)</button>
          <button type="button" role="tab" data-tab="replace" class="${mode === 'replace' ? 'on' : ''}">置換(P)</button>
        </div>
        <label class="xl-dlg-row">検索する文字列(N):<input type="text" data-f="q" value="${esc(prev.q)}" autocomplete="off"></label>
        ${mode === 'replace' ? `<label class="xl-dlg-row">置換後の文字列(E):<input type="text" data-f="rep" value="${esc(prev.rep)}" autocomplete="off"></label>` : ''}
        <label class="xl-dlg-chk"><input type="checkbox" data-f="exact" ${prev.exact ? 'checked' : ''}> セル内容が完全に同一であるものを検索する(O)</label>
        <div class="xl-dlg-msg" aria-live="polite"></div>
        <div class="xl-dlg-btns">
          ${mode === 'replace' ? '<button type="button" data-dlg="all">すべて置換(A)</button><button type="button" data-dlg="one">置換(R)</button>' : ''}
          <button type="button" data-dlg="next" class="primary">次を検索(F)</button>
          <button type="button" data-dlg="close">閉じる</button>
        </div>`;
      this.dlgMode = mode;
      const q = d.querySelector('[data-f="q"]');
      q.focus();
      q.select();
      const st = () => ({
        q: q.value,
        rep: d.querySelector('[data-f="rep"]') ? d.querySelector('[data-f="rep"]').value : prev.rep,
        exact: d.querySelector('[data-f="exact"]').checked,
      });
      d.oninput = d.onchange = () => (this._dlgState = st());
      d.onmousedown = (e) => {
        const t = e.target.closest('button');
        if (t) e.preventDefault();
      };
      d.onclick = (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        this._dlgState = st();
        if (t.dataset.tab) {
          this.mouseAction(`ダイアログ：${t.dataset.tab === 'find' ? '検索' : '置換'}タブ`);
          return this.openDialog(t.dataset.tab);
        }
        const a = t.dataset.dlg;
        this.mouseAction(`ダイアログ：${t.textContent.replace(/\(.\)/, '')}`);
        this._dlgAct(a);
      };
      d.onkeydown = (e) => {
        e.stopPropagation();
        if (e.isComposing) return;
        this._dlgState = st();
        const ctrl = e.ctrlKey || e.metaKey;
        if (e.key === 'Escape') {
          e.preventDefault();
          this.keyAction('Esc（閉じる）', null);
          return this._dlgAct('close');
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          this.keyAction('Enter（次を検索）', null);
          return this._dlgAct('next');
        }
        if (e.altKey && e.code === 'KeyA' && this.dlgMode === 'replace') {
          e.preventDefault();
          this.keyAction('Alt + A（すべて置換）', 'altA');
          return this._dlgAct('all');
        }
        if (e.altKey && e.code === 'KeyR' && this.dlgMode === 'replace') {
          e.preventDefault();
          this.keyAction('Alt + R（置換）', null);
          return this._dlgAct('one');
        }
        if (e.altKey && e.code === 'KeyO') {
          e.preventDefault();
          const cb = d.querySelector('[data-f="exact"]');
          cb.checked = !cb.checked;
          this._dlgState = st();
          return this.keyAction('Alt + O（完全一致）', null);
        }
        if (e.altKey && e.code === 'KeyF') {
          e.preventDefault();
          this.keyAction('Alt + F（次を検索）', null);
          return this._dlgAct('next');
        }
        if (ctrl && (e.code === 'KeyH' || e.code === 'KeyF')) {
          e.preventDefault();
          this.keyAction(e.code === 'KeyH' ? 'Ctrl + H（置換）' : 'Ctrl + F（検索）', e.code === 'KeyH' ? 'ctrlH' : 'ctrlF');
          return this.openDialog(e.code === 'KeyH' ? 'replace' : 'find');
        }
        if (e.key === 'Tab' || e.key.length > 1) return;
        if (!ctrl && !e.altKey && !e.repeat) this.emit({ kind: 'typing' });
      };
    }
    _dlgMsg(m) {
      const el = this.dialog.querySelector('.xl-dlg-msg');
      if (el) el.textContent = m;
    }
    _dlgAct(a) {
      const st = this._dlgState || { q: '' };
      const sh = this.sheet;
      if (a === 'close') {
        this.closeDialog();
        this.grid.focus({ preventScroll: true });
        return;
      }
      if (!st.q) return this._dlgMsg('検索する文字列を入力してください。');
      const scope = this.isMulti() ? this.sel() : null;
      if (a === 'next') {
        const from = { r: this.anchor.r, c: this.anchor.c };
        const hit = sh.findNext(st.q, from, { exact: st.exact, scope });
        if (!hit) {
          this._dlgMsg('検索条件に一致するデータが見つかりません。');
          if (scope && sh.findNext(st.q, from, { exact: st.exact })) this.emit({ kind: 'trap', id: 'findScope' });
          this.emit({ kind: 'change' });
          return;
        }
        if (scope) {
          // 選択範囲は維持してアクティブセルだけ移動
          const keep = this.sel();
          this.anchor = hit;
          this.focusPt = { r: keep.r1 === hit.r ? keep.r2 : keep.r1, c: keep.c1 === hit.c ? keep.c2 : keep.c1 };
          this.ensureVisible(hit);
        } else this.setActive(hit.r, hit.c);
        this._dlgMsg(`${addr(hit.r, hit.c)}：${sh.display(hit.r, hit.c)}`);
        this.changed();
        return;
      }
      if (a === 'all') {
        const res = sh.replaceAll(st.q, st.rep || '', { exact: st.exact, scope });
        this._dlgMsg(res.count ? `すべて完了しました。${res.count.toLocaleString('ja-JP')} 件を置換しました。` : '置換対象が見つかりません。');
        this.emit({ kind: 'replace', count: res.count, partial: res.partial, q: st.q, rep: st.rep, exact: st.exact });
        if (res.partial) this.emit({ kind: 'trap', id: 'partial', partial: res.partial });
        this.changed();
        return;
      }
      if (a === 'one') {
        const { r, c } = this.anchor;
        const cur = String(sh.display(r, c));
        const match = st.exact ? cur.toLowerCase() === st.q.toLowerCase() : cur.toLowerCase().includes(st.q.toLowerCase());
        if (match) {
          const re = new RegExp(st.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          sh.set(r, c, st.exact ? st.rep || '' : cur.replace(re, st.rep || ''), '置換');
          if (!st.exact && cur.toLowerCase() !== st.q.toLowerCase()) this.emit({ kind: 'trap', id: 'partial', partial: 1 });
        }
        const hit = sh.findNext(st.q, { r, c }, { exact: st.exact, scope });
        if (hit) this.setActive(hit.r, hit.c);
        this._dlgMsg(hit ? `${addr(hit.r, hit.c)}：${sh.display(hit.r, hit.c)}` : '一致するデータは残っていません。');
        this.changed();
      }
    }
    closeDialog() {
      this.dialog.hidden = true;
      this.dialog.innerHTML = '';
    }

    // ------------------------------------------------------------ filter dropdown
    openDropdown(c) {
      const sh = this.sheet;
      if (!sh.filter) return;
      const vals = sh.uniqueValues(c);
      const cur = sh.filter.criteria.get(c);
      const d = this.dropdown;
      d.hidden = false;
      const i = this.rendered.indexOf(sh.filter.r1);
      const hb = this.host.getBoundingClientRect(), bb = this.body.getBoundingClientRect();
      d.style.left = Math.max(0, Math.min(bb.left - hb.left + this.colX[c], hb.width - 250)) + 'px';
      d.style.top = bb.top - hb.top + (i >= 0 ? (i + 1) * ROW_H : 0) + 'px';
      const list = vals.slice(0, 300);
      d.innerHTML = `
        <div class="xl-dd-title">「${esc(sh.display(sh.filter.r1, c))}」で絞り込み</div>
        <button type="button" class="xl-dd-clear" data-dd="clear" ${cur ? '' : 'disabled'}>フィルターをクリア</button>
        <input type="search" class="xl-dd-search" placeholder="検索" aria-label="値を検索">
        <div class="xl-dd-list">
          <label><input type="checkbox" data-all="1" ${!cur ? 'checked' : ''}> (すべて選択)</label>
          ${list.map((v) => `<label data-v="${esc(v)}"><input type="checkbox" value="${esc(v)}" ${!cur || cur.has(v) ? 'checked' : ''}> ${v === '' ? '(空白セル)' : esc(v)}</label>`).join('')}
          ${vals.length > list.length ? `<div class="xl-dd-more">ほか ${vals.length - list.length} 件</div>` : ''}
        </div>
        <div class="xl-dd-btns"><button type="button" class="primary" data-dd="ok">OK</button><button type="button" data-dd="cancel">キャンセル</button></div>`;
      const boxes = () => Array.from(d.querySelectorAll('.xl-dd-list input[value]'));
      const all = d.querySelector('[data-all]');
      d.onchange = (e) => {
        if (e.target === all) boxes().forEach((b) => (b.checked = all.checked));
        else all.checked = boxes().every((b) => b.checked);
        this.mouseAction(`チェック：${e.target === all ? '(すべて選択)' : e.target.value}`);
      };
      d.oninput = (e) => {
        if (!e.target.classList.contains('xl-dd-search')) return;
        const q = e.target.value.toLowerCase();
        d.querySelectorAll('.xl-dd-list label[data-v]').forEach((l) => (l.style.display = l.dataset.v.toLowerCase().includes(q) ? '' : 'none'));
      };
      d.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          this.closeDropdown();
          this.grid.focus({ preventScroll: true });
        }
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          d.querySelector('[data-dd="ok"]').click();
        }
      };
      d.onclick = (e) => {
        const b = e.target.closest('[data-dd]');
        if (!b) return;
        const act = b.dataset.dd;
        if (act === 'ok') {
          const q = d.querySelector('.xl-dd-search').value.toLowerCase();
          let checked = boxes().filter((x) => x.checked && (!q || x.value.toLowerCase().includes(q))).map((x) => x.value);
          const allOn = !q && checked.length === vals.length;
          sh.setCriteria(c, allOn ? null : checked);
          this.mouseAction('フィルター：OK');
        } else if (act === 'clear') {
          sh.setCriteria(c, null);
          this.mouseAction('フィルターをクリア');
        }
        this.closeDropdown();
        this.topRow = 0;
        this.setActive(this.nextVisible(sh.filter ? sh.filter.r1 : 0, 1), this.anchor.c);
        this.grid.focus({ preventScroll: true });
        this.changed();
      };
      const first = d.querySelector('.xl-dd-list input');
      if (first) first.focus();
    }
    closeDropdown() {
      this.dropdown.hidden = true;
      this.dropdown.innerHTML = '';
    }

    destroy() {
      if (this._ro) this._ro.disconnect();
      this.host.innerHTML = '';
    }
  }

  EQ.Simulator = Simulator;
  EQ.shiftFormula = shiftFormula;
})(window.EQ);
