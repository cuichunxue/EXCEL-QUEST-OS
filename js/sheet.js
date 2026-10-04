/*
 * EXCEL QUEST OS — Sheet model (pure logic, no DOM)
 * 研修対象操作に必要な範囲だけExcelの挙動を再現する。
 * Node.js からも require できる（tests/sheet.test.js）。
 */
(function (root) {
  'use strict';

  const MAX_ROW = 1048576; // Excel の最大行
  const MAX_COL = 12; // シミュレーターは A〜L 列のみ

  function colName(c) {
    let s = '';
    c += 1;
    while (c > 0) {
      const m = (c - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      c = Math.floor((c - 1) / 26);
    }
    return s;
  }
  function colIndex(name) {
    let n = 0;
    for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function addr(r, c) {
    return colName(c) + (r + 1);
  }
  function parseAddr(a) {
    const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a.trim());
    if (!m) return null;
    return { r: parseInt(m[2], 10) - 1, c: colIndex(m[1]) };
  }

  function isBlank(v) {
    return v === '' || v === null || v === undefined;
  }

  // ------------------------------------------------------------------
  // 数式（研修で使う範囲：四則演算・セル参照・SUM/AVERAGE/COUNT/MAX/MIN/SUBTOTAL）
  // ------------------------------------------------------------------
  function evaluate(sheet, src, depth) {
    depth = depth || 0;
    if (depth > 20) return '#REF!';
    let i = 0;
    const s = src.replace(/^=/, '');
    const peek = () => s[i];
    const ws = () => {
      while (s[i] === ' ') i++;
    };
    function num(v) {
      if (typeof v === 'number') return v;
      if (isBlank(v)) return 0;
      const n = Number(v);
      return isNaN(n) ? NaN : n;
    }
    function rangeValues(a, b) {
      const out = [];
      const r1 = Math.min(a.r, b.r), r2 = Math.min(Math.max(a.r, b.r), sheet.usedRows() - 1);
      const c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push({ r, c, v: sheet.value(r, c, depth + 1) });
      return out;
    }
    function primary() {
      ws();
      const ch = peek();
      if (ch === '(') {
        i++;
        const v = expr();
        ws();
        i++; // )
        return v;
      }
      if (ch === '-') {
        i++;
        return -num(primary());
      }
      const numM = /^\d+(\.\d+)?/.exec(s.slice(i));
      if (numM) {
        i += numM[0].length;
        return parseFloat(numM[0]);
      }
      const idM = /^[A-Za-z]+\d*/.exec(s.slice(i));
      if (idM) {
        const id = idM[0];
        i += id.length;
        ws();
        if (peek() === '(') {
          i++;
          const args = [];
          ws();
          while (peek() !== ')' && i < s.length) {
            args.push(arg());
            ws();
            if (peek() === ',') i++;
            ws();
          }
          i++;
          return callFn(id.toUpperCase(), args);
        }
        const a = parseAddr(id);
        if (!a) throw new Error('name');
        return sheet.value(a.r, a.c, depth + 1);
      }
      throw new Error('parse');
    }
    function arg() {
      ws();
      const m = /^(\$?[A-Za-z]{1,3}\$?\d+):(\$?[A-Za-z]{1,3}\$?\d+)/.exec(s.slice(i));
      if (m) {
        i += m[0].length;
        return { range: rangeValues(parseAddr(m[1]), parseAddr(m[2])) };
      }
      return expr();
    }
    function flat(args, skipHidden) {
      const vals = [];
      for (const a of args) {
        if (a && a.range) {
          for (const x of a.range) {
            if (skipHidden && sheet.isHidden(x.r)) continue;
            if (typeof x.v === 'number') vals.push(x.v);
          }
        } else vals.push(num(a));
      }
      return vals;
    }
    function callFn(name, args) {
      switch (name) {
        case 'SUM':
          return flat(args).reduce((a, b) => a + b, 0);
        case 'AVERAGE': {
          const v = flat(args);
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : '#DIV/0!';
        }
        case 'COUNT':
          return flat(args).length;
        case 'MAX':
          return Math.max.apply(null, flat(args));
        case 'MIN':
          return Math.min.apply(null, flat(args));
        case 'SUBTOTAL': {
          const fn = num(args[0]);
          const v = flat(args.slice(1), true);
          if (fn === 9 || fn === 109) return v.reduce((a, b) => a + b, 0);
          if (fn === 1 || fn === 101) return v.length ? v.reduce((a, b) => a + b, 0) / v.length : '#DIV/0!';
          if (fn === 2 || fn === 102) return v.length;
          return '#VALUE!';
        }
        default:
          throw new Error('fn');
      }
    }
    function term() {
      let v = primary();
      for (;;) {
        ws();
        const op = peek();
        if (op === '*' || op === '/') {
          i++;
          const r = num(primary());
          v = op === '*' ? num(v) * r : num(v) / r;
        } else return v;
      }
    }
    function expr() {
      let v = term();
      for (;;) {
        ws();
        const op = peek();
        if (op === '+' || op === '-') {
          i++;
          const r = num(term());
          v = op === '+' ? num(v) + r : num(v) - r;
        } else return v;
      }
    }
    try {
      const v = expr();
      ws();
      if (i < s.length) return '#NAME?';
      if (typeof v === 'number' && !isFinite(v)) return '#DIV/0!';
      return v;
    } catch (e) {
      return '#NAME?';
    }
  }

  // ------------------------------------------------------------------
  // Sheet
  // ------------------------------------------------------------------
  class Sheet {
    constructor(rows) {
      // rows: 2次元配列（1行目は見出し）。値は文字列 or 数値 or '=...'
      this.rows = rows.map((r) => r.slice());
      this.hidden = new Set();
      this.filter = null; // {r1, r2, c1, c2, criteria: Map<col, Set<string>>}
      this.undoStack = [];
    }
    clone() {
      const s = new Sheet(this.rows);
      return s;
    }
    usedRows() {
      return this.rows.length;
    }
    raw(r, c) {
      const row = this.rows[r];
      if (!row) return '';
      const v = row[c];
      return v === undefined || v === null ? '' : v;
    }
    value(r, c, depth) {
      const v = this.raw(r, c);
      if (typeof v === 'string' && v[0] === '=') return evaluate(this, v, depth);
      return v;
    }
    display(r, c) {
      const v = this.value(r, c);
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
      return v;
    }
    isEmpty(r, c) {
      return isBlank(this.raw(r, c));
    }
    isHidden(r) {
      return this.hidden.has(r);
    }
    rowHasData(r) {
      const row = this.rows[r];
      if (!row) return false;
      for (let c = 0; c < row.length; c++) if (!isBlank(row[c])) return true;
      return false;
    }
    lastDataRow(c) {
      for (let r = this.rows.length - 1; r >= 0; r--) {
        if (c === undefined ? this.rowHasData(r) : !this.isEmpty(r, c)) return r;
      }
      return 0;
    }
    lastDataCol() {
      let m = 0;
      for (const row of this.rows) for (let c = row.length - 1; c > m; c--) if (!isBlank(row[c])) { m = c; break; }
      return m;
    }
    // 値の書き込み（undo 記録付き）
    setMany(changes, label) {
      const op = { label: label || '編集', changes: [] };
      for (const ch of changes) {
        const old = this.raw(ch.r, ch.c);
        if (old === ch.v) continue;
        op.changes.push({ r: ch.r, c: ch.c, old, v: ch.v });
        this._put(ch.r, ch.c, ch.v);
      }
      if (op.changes.length) this.undoStack.push(op);
      if (this.filter) this.applyFilter();
      return op.changes.length;
    }
    set(r, c, v, label) {
      return this.setMany([{ r, c, v: coerce(v) }], label);
    }
    _put(r, c, v) {
      while (this.rows.length <= r) this.rows.push([]);
      this.rows[r][c] = v;
    }
    undo() {
      const op = this.undoStack.pop();
      if (!op) return null;
      for (let i = op.changes.length - 1; i >= 0; i--) {
        const ch = op.changes[i];
        this._put(ch.r, ch.c, ch.old);
      }
      if (this.filter) this.applyFilter();
      return op;
    }

    // ---------------- ナビゲーション ----------------
    // 可視行のみを対象に1ステップ進む（端なら null）
    step(r, c, dr, dc) {
      if (dr) {
        let n = r + dr;
        while (n >= 0 && n < MAX_ROW && this.hidden.has(n)) n += dr;
        if (n < 0 || n >= MAX_ROW) return null;
        return { r: n, c };
      }
      const n = c + dc;
      if (n < 0 || n >= MAX_COL) return null;
      return { r, c: n };
    }
    // Ctrl + 矢印（Excel のデータ境界ジャンプ）
    ctrlJump(r, c, dr, dc) {
      const used = this.rows.length;
      const empty = (p) => this.isEmpty(p.r, p.c);
      let n = this.step(r, c, dr, dc);
      if (!n) return { r, c };
      if (!empty({ r, c }) && !empty(n)) {
        let p = n;
        for (;;) {
          const q = this.step(p.r, p.c, dr, dc);
          if (!q || empty(q)) return p;
          p = q;
        }
      }
      let p = n;
      for (;;) {
        if (!empty(p)) return p;
        if (dr > 0 && p.r >= used) {
          // データ領域より下は全て空白 → シート最下部へ
          let last = MAX_ROW - 1;
          while (this.hidden.has(last)) last--;
          return { r: last, c: p.c };
        }
        const q = this.step(p.r, p.c, dr, dc);
        if (!q) return p;
        p = q;
      }
    }
    // Ctrl+↓ が「途中の空白」で止まったか（REAL EXCEL TRAP 判定）
    stoppedAtGap(r, c, dr) {
      if (!dr) return false;
      if (this.isEmpty(r, c)) return false;
      const n = this.step(r, c, dr, 0);
      if (!n || !this.isEmpty(n.r, n.c)) return false;
      // その先にまだデータがあるか
      let p = n;
      for (let k = 0; k < this.rows.length + 2; k++) {
        p = this.step(p.r, p.c, dr, 0);
        if (!p) return false;
        if (dr > 0 && p.r >= this.rows.length) return false;
        if (!this.isEmpty(p.r, p.c)) return true;
      }
      return false;
    }
    lastCell() {
      return { r: this.lastDataRow(), c: this.lastDataCol() };
    }
    // アクティブセルを含む連続データ領域（Ctrl+A / フィルター範囲）
    currentRegion(r, c) {
      let r1 = r, r2 = r;
      while (r1 > 0 && this.rowHasData(r1 - 1)) r1--;
      while (r2 + 1 < this.rows.length && this.rowHasData(r2 + 1)) r2++;
      let c2 = 0;
      for (let rr = r1; rr <= r2; rr++) {
        const row = this.rows[rr] || [];
        for (let cc = row.length - 1; cc >= 0; cc--) if (!isBlank(row[cc])) { if (cc > c2) c2 = cc; break; }
      }
      return { r1, c1: 0, r2, c2 };
    }

    // ---------------- オートSUM（Alt + =） ----------------
    autoSumFormula(r, c) {
      const isNum = (rr, cc) => typeof this.value(rr, cc) === 'number';
      if (r > 0 && isNum(r - 1, c)) {
        let r1 = r - 1;
        while (r1 - 1 >= 0 && isNum(r1 - 1, c)) r1--;
        const fn = this.filter && this._inFilter(r - 1) ? 'SUBTOTAL(9,' : 'SUM(';
        return { formula: '=' + fn + addr(r1, c) + ':' + addr(r - 1, c) + ')', r1, c1: c, r2: r - 1, c2: c };
      }
      if (c > 0 && isNum(r, c - 1)) {
        let c1 = c - 1;
        while (c1 - 1 >= 0 && isNum(r, c1 - 1)) c1--;
        return { formula: '=SUM(' + addr(r, c1) + ':' + addr(r, c - 1) + ')', r1: r, c1, r2: r, c2: c - 1 };
      }
      return { formula: '=SUM()', r1: r, c1: c, r2: r, c2: c };
    }
    _inFilter(r) {
      return this.filter && r > this.filter.r1 && r <= this.filter.r2;
    }

    // ---------------- 検索・置換 ----------------
    _cellMatches(r, c, q, exact) {
      const d = String(this.display(r, c));
      if (!d) return false;
      if (exact) return d.toLowerCase() === q.toLowerCase();
      return d.toLowerCase().indexOf(q.toLowerCase()) >= 0;
    }
    // scope: {r1,c1,r2,c2} or null（行方向に検索）
    findNext(q, from, opts) {
      opts = opts || {};
      if (!q) return null;
      const scope = opts.scope || { r1: 0, c1: 0, r2: this.rows.length - 1, c2: MAX_COL - 1 };
      const r2 = Math.min(scope.r2, this.rows.length - 1);
      const width = scope.c2 - scope.c1 + 1;
      const height = r2 - scope.r1 + 1;
      if (height <= 0) return null;
      const total = width * height;
      let idx = 0;
      if (from && from.r >= scope.r1 && from.r <= r2 && from.c >= scope.c1 && from.c <= scope.c2) {
        idx = (from.r - scope.r1) * width + (from.c - scope.c1) + 1;
      }
      for (let k = 0; k < total; k++) {
        const j = (idx + k) % total;
        const r = scope.r1 + Math.floor(j / width);
        const c = scope.c1 + (j % width);
        if (this.hidden.has(r)) continue;
        if (this._cellMatches(r, c, q, opts.exact)) return { r, c };
      }
      return null;
    }
    countMatches(q, opts) {
      let n = 0;
      for (let r = 0; r < this.rows.length; r++) for (let c = 0; c < MAX_COL; c++) if (this._cellMatches(r, c, q, opts && opts.exact)) n++;
      return n;
    }
    replaceAll(q, rep, opts) {
      opts = opts || {};
      if (!q) return { count: 0, partial: 0 };
      const scope = opts.scope || { r1: 0, c1: 0, r2: this.rows.length - 1, c2: MAX_COL - 1 };
      const changes = [];
      let partial = 0;
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      for (let r = scope.r1; r <= Math.min(scope.r2, this.rows.length - 1); r++) {
        if (this.hidden.has(r)) continue;
        for (let c = scope.c1; c <= scope.c2; c++) {
          const raw = this.raw(r, c);
          if (isBlank(raw) || (typeof raw === 'string' && raw[0] === '=')) continue;
          const s = String(raw);
          if (opts.exact) {
            if (s.toLowerCase() === q.toLowerCase()) changes.push({ r, c, v: coerce(rep) });
          } else if (re.test(s)) {
            re.lastIndex = 0;
            if (s.toLowerCase() !== q.toLowerCase()) partial++;
            changes.push({ r, c, v: coerce(s.replace(re, rep)) });
          }
          re.lastIndex = 0;
        }
      }
      const count = this.setMany(changes, '置換');
      return { count, partial };
    }

    // ---------------- フィルター ----------------
    toggleFilter(sel) {
      if (this.filter) {
        this.filter = null;
        this.hidden.clear();
        return false;
      }
      let reg;
      if (sel && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2) && sel.r2 < this.rows.length) reg = sel;
      else reg = this.currentRegion(sel ? sel.r1 : 0, sel ? sel.c1 : 0);
      this.filter = { r1: reg.r1, r2: reg.r2, c1: reg.c1, c2: reg.c2, criteria: new Map() };
      return true;
    }
    uniqueValues(c) {
      const f = this.filter;
      const m = new Map();
      for (let r = f.r1 + 1; r <= f.r2; r++) {
        const d = String(this.display(r, c));
        m.set(d, (m.get(d) || 0) + 1);
      }
      return Array.from(m.keys()).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'ja', { numeric: true })));
    }
    setCriteria(c, allowed) {
      if (!this.filter) return;
      if (allowed) this.filter.criteria.set(c, new Set(allowed));
      else this.filter.criteria.delete(c);
      this.applyFilter();
    }
    applyFilter() {
      this.hidden.clear();
      const f = this.filter;
      if (!f) return;
      for (let r = f.r1 + 1; r <= f.r2; r++) {
        for (const [c, set] of f.criteria) {
          if (!set.has(String(this.display(r, c)))) {
            this.hidden.add(r);
            break;
          }
        }
      }
    }
    visibleDataCount() {
      if (!this.filter) return this.rows.length - 1;
      return this.filter.r2 - this.filter.r1 - this.hidden.size;
    }
  }

  function coerce(v) {
    if (typeof v !== 'string') return v;
    if (v === '') return '';
    if (v[0] === '=') return v;
    if (/^-?\d+(\.\d+)?$/.test(v.trim())) return parseFloat(v);
    return v;
  }

  // ------------------------------------------------------------------
  // データ生成（シード付き乱数 → 毎回「別データ・同条件」を作れる）
  // ------------------------------------------------------------------
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  const HEADERS = ['日付', 'ライン', '品番', 'ロット', '数量', '不良数'];
  const PARTS = ['A-01', 'A-03', 'A-05', 'B-07', 'B-12', 'C-20', 'C-21', 'D-08'];

  /**
   * 生産実績データ
   * opts.rows       データ行数（見出し除く）
   * opts.blankCells [{row, col}] 空白セル（row はデータ1始まり＝Excel行番号）
   * opts.partialTrap  A-010 を混ぜる（置換の部分一致トラップ）
   * opts.lot        指定ロットを1件だけ埋め込む {row, value}
   */
  function production(seed, opts) {
    opts = opts || {};
    const rand = rng(seed);
    const n = opts.rows || 5000;
    const rows = [HEADERS.slice()];
    const start = new Date(2026, 3, 1);
    const usedLots = new Set();
    for (let i = 0; i < n; i++) {
      const d = new Date(start.getTime() + Math.floor((i / n) * 150) * 86400000);
      const date = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
      const line = 1 + Math.floor(rand() * 5) + 'ライン';
      let part = PARTS[Math.floor(rand() * PARTS.length)];
      if (opts.partialTrap && rand() < 0.04) part = 'A-010';
      let lot;
      do {
        lot = 'L-' + (1000 + Math.floor(rand() * 9000));
      } while (usedLots.has(lot) && usedLots.size < 8900);
      usedLots.add(lot);
      const qty = 50 + Math.floor(rand() * 45) * 10;
      const ng = Math.floor(rand() * rand() * 6);
      rows.push([date, line, part, lot, qty, ng]);
    }
    if (opts.lot) {
      // 指定ロットはユニークにする
      for (let r = 1; r < rows.length; r++) if (rows[r][3] === opts.lot.value) rows[r][3] = 'L-0' + r;
      rows[opts.lot.row - 1][3] = opts.lot.value;
    }
    (opts.blankCells || []).forEach((b) => {
      if (rows[b.row - 1]) rows[b.row - 1][b.col] = '';
    });
    return rows;
  }

  const api = { Sheet, production, rng, addr, colName, colIndex, parseAddr, evaluate, MAX_ROW, MAX_COL, HEADERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EQ = Object.assign(root.EQ || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
