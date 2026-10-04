/*
 * EXCEL QUEST OS — コンテンツ定義
 * JOB FIRST：問題文にショートカット名は出さない。キーはHINT 3とDISCOVERYでのみ表示。
 */
(function (EQ) {
  'use strict';
  const { production, addr } = EQ;

  // ------------------------------------------------------------------ SKILLS（MVP 6技能 + 追加候補）
  const SKILLS = {
    ctrlArrow: { keys: ['Ctrl', '↓'], name: '大量データ移動', cat: 'MOVE', est: 1.0, mvp: true },
    ctrlShiftArrow: { keys: ['Ctrl', 'Shift', '↓'], name: '大量範囲選択', cat: 'SELECT', est: 1.5, mvp: true },
    ctrlF: { keys: ['Ctrl', 'F'], name: 'データ検索', cat: 'FIND', est: 5, mvp: true },
    ctrlH: { keys: ['Ctrl', 'H'], name: '一括修正', cat: 'EDIT', est: 7, mvp: true },
    ctrlShiftL: { keys: ['Ctrl', 'Shift', 'L'], name: '絞り込み', cat: 'FILTER', est: 6, mvp: true },
    altEq: { keys: ['Alt', '='], name: '合計', cat: 'CALCULATE', est: 2, mvp: true },
    ctrlD: { keys: ['Ctrl', 'D'], name: '上と同じ入力', cat: 'EDIT', est: 1.5, mvp: false },
  };
  const CATS = ['MOVE', 'SELECT', 'FIND', 'EDIT', 'FILTER', 'CALCULATE'];
  const CAT_SKILL = { MOVE: 'ctrlArrow', SELECT: 'ctrlShiftArrow', FIND: 'ctrlF', EDIT: 'ctrlH', FILTER: 'ctrlShiftL', CALCULATE: 'altEq' };
  const CAT_JA = { MOVE: '移動', SELECT: '選択', FIND: '検索', EDIT: '修正', FILTER: '絞込', CALCULATE: '集計' };
  // 1週間ループで追加する順番
  const PROGRESSION = ['ctrlArrow', 'ctrlShiftArrow', 'ctrlH', 'ctrlF', 'ctrlShiftL', 'altEq', 'ctrlD'];

  const HINTS = {
    ctrlArrow: ['スクロールしなくても、データの端まで一気に移動できます。', 'Ctrl キーと矢印キーを組み合わせます。', 'Ctrl + ↓'],
    ctrlShiftArrow: ['1セルずつ広げなくても、データの端まで一気に選べます。', '「一気に移動」の技に、範囲を広げるキー（Shift）を足します。', 'Ctrl + Shift + ↓'],
    ctrlF: ['目で探さなくても、Excel に探させることができます。', 'Ctrl ＋「Find」の頭文字。', 'Ctrl + F → 文字を入力 → Enter'],
    ctrlH: ['1つずつ直さなくても、まとめて書き換えられます。', '「検索と置換」の置換タブ。Ctrl ＋アルファベット1文字で開けます。', 'Ctrl + H → 検索/置換後を入力 → すべて置換（Alt + A）'],
    ctrlShiftL: ['行を探すより、条件に合う行だけ残すほうが速い。', 'Ctrl + Shift ＋アルファベット1文字で、見出しに ▾ が付きます。', 'Ctrl + Shift + L → 見出しの ▾ → 値を1つだけチェック → OK'],
    altEq: ['SUM を手で書かなくても、Excel が範囲を提案してくれます。', '合計を入れたいセルで、Alt と記号キーを組み合わせます。', '合計セルを選んで Alt + = → Enter'],
    ctrlD: ['同じ値を何度も打たなくても、上のセルを写せます。', 'Ctrl ＋「Down」の頭文字。', 'Ctrl + D'],
  };

  // ------------------------------------------------------------------ REAL EXCEL TRAP
  const TRAPS = {
    blank: {
      title: 'なぜ途中で止まった？',
      cause: '途中に空白セルがありました。',
      body: 'Ctrl + 矢印は「データの塊の端」へ移動します。空白セルがあると、その手前で止まります。もう一度押すと次の塊へ進みます。',
      tip: '実務では「途中で止まる＝どこかに空白がある」サイン。データ抜けの発見にも使えます。',
    },
    findScope: {
      title: 'なぜ見つからない？',
      cause: '複数セルを選択したまま検索していました。',
      body: '範囲を選択した状態で検索すると、Excel は「選択範囲の中だけ」を探します。',
      tip: 'セルを1つだけ選んでから検索すれば、シート全体が対象になります。',
    },
    partial: {
      title: '関係ない品番まで変わった？',
      cause: '「A-01」が「A-010」の一部にも一致しました。',
      body: '置換は初期設定だと「部分一致」。A-010 が A-020 に変わってしまいます。',
      tip: 'Ctrl + Z で元に戻し、「セル内容が完全に同一であるものを検索する」を ON にして置換し直そう。',
    },
    autosumBlank: {
      title: '合計が少ない？',
      cause: '数量の途中に空白セルがありました。',
      body: 'オートSUM（Alt + =）は空白セルの手前で範囲が止まります。確定前に点線の範囲を確認するのがコツ。',
      tip: 'セルを選んで F2 で数式を直す（例：=SUM(E2:E61)）か、範囲をドラッグし直せばOK。',
    },
    sheetEnd: {
      title: 'シートの一番下に来てしまった？',
      cause: 'データの下は全部空白だったので、最終行（1,048,576 行目）まで移動しました。',
      body: 'Ctrl + ↓ は「次のデータ」まで進みます。データがなければシートの端まで行きます。',
      tip: 'Ctrl + ↑ で戻れます。Ctrl + Home で A1 へ。',
    },
  };

  // ------------------------------------------------------------------ チェック関数
  const C = {
    atLastRow: (m) => (x) => x.sim.anchor.r === m.last,
    selected: (m) => (x) => {
      const s = x.sim.sel();
      return s.r1 === m.sel.r1 && s.r2 === m.sel.r2 && s.c1 === m.sel.c1 && s.c2 === m.sel.c2;
    },
    activeValue: (m) => (x) => String(x.sim.sheet.display(x.sim.anchor.r, x.sim.anchor.c)) === m.target,
    replaced: (m) => (x) => {
      const sh = x.sim.sheet;
      let from = 0, keep = 0, bad = 0;
      for (let r = 1; r < sh.usedRows(); r++) {
        const v = sh.raw(r, m.col);
        if (v === m.from) from++;
        if (m.keep && v === m.keep) keep++;
        if (m.bad && v === m.bad) bad++;
      }
      return from === 0 && (!m.keep || keep === m.keepCount) && bad === 0;
    },
    filtered: (m) => (x) => {
      const f = x.sim.sheet.filter;
      if (!f || f.criteria.size !== 1) return false;
      const set = f.criteria.get(m.col);
      return !!set && set.size === 1 && set.has(m.value);
    },
    summed: (m) => (x) => {
      const v = x.sim.sheet.value(m.cell.r, m.cell.c);
      return typeof v === 'number' && Math.abs(v - m.total) < 1e-6;
    },
  };

  function totalOf(rows, c) {
    let t = 0;
    for (let r = 1; r < rows.length; r++) if (typeof rows[r][c] === 'number') t += rows[r][c];
    return t;
  }
  function pickLot(rows, seed) {
    const r = 1 + Math.floor((rows.length - 2) * (0.45 + ((seed * 7919) % 100) / 220));
    return { row: r + 1, value: rows[r][3] };
  }

  // ------------------------------------------------------------------ STEP BUILDERS
  // すべて { skill, cat, story, job, detail, rows, start, check, meta, trap? } を返す
  const BUILD = {
    move(seed, o) {
      o = o || {};
      const n = o.rows || 5000;
      const blank = o.trap ? [{ row: Math.floor(n * 0.24) + 2, col: 0 }] : [];
      const rows = production(seed, { rows: n, blankCells: blank });
      const m = { last: n };
      return {
        skill: 'ctrlArrow',
        cat: 'MOVE',
        story: `検査記録が ${n.toLocaleString('ja-JP')} 行あります。いちばん新しい記録（最終行）を確認したい。`,
        job: '最終データの行へ移動してください',
        detail: `日付（A列）の最後のデータ＝${(n + 1).toLocaleString('ja-JP')} 行目のセルを選択できたらクリア。`,
        rows,
        start: { r: 0, c: 0 },
        meta: m,
        check: C.atLastRow(m),
        trap: o.trap ? 'blank' : null,
      };
    },
    select(seed, o) {
      o = o || {};
      const n = o.rows || 3000;
      const blank = o.trap ? [{ row: Math.floor(n * 0.42) + 2, col: 4 }] : [];
      const rows = production(seed, { rows: n, blankCells: blank });
      const m = { sel: { r1: 1, c1: 4, r2: n, c2: 4 } };
      return {
        skill: 'ctrlShiftArrow',
        cat: 'SELECT',
        story: '数量のデータだけをコピーして、報告書に貼りたい。',
        job: '数量（E列）を、E2 から最後のデータまで範囲選択してください',
        detail: `E2:E${n + 1} が選択できたらクリア（見出しは含めない）。`,
        rows,
        start: { r: 1, c: 4 },
        meta: m,
        check: C.selected(m),
        trap: o.trap ? 'blank' : null,
      };
    },
    find(seed, o) {
      o = o || {};
      const n = o.rows || 3000;
      const base = production(seed, { rows: n });
      const lot = pickLot(base, seed);
      const rows = production(seed, { rows: n, lot });
      const m = { target: lot.value };
      return {
        skill: 'ctrlF',
        cat: 'FIND',
        story: `品質保証から連絡。「ロット ${lot.value} の数量を確認して」`,
        job: `ロット「${lot.value}」のセルを探して選択してください`,
        detail: `${n.toLocaleString('ja-JP')} 行の中に1件だけあります。`,
        rows,
        start: o.trap ? { sel: { r1: 1, c1: 0, r2: 220, c2: 2 } } : { r: 0, c: 0 },
        meta: m,
        check: C.activeValue(m),
        trap: o.trap ? 'findScope' : null,
      };
    },
    replace(seed, o) {
      o = o || {};
      const n = o.rows || 300;
      const rows = production(seed, { rows: n, partialTrap: !!o.trap });
      let keepCount = 0;
      rows.forEach((r) => r[2] === 'A-010' && keepCount++);
      const m = { col: 2, from: 'A-01', keep: o.trap ? 'A-010' : null, keepCount, bad: o.trap ? 'A-020' : null };
      return {
        skill: 'ctrlH',
        cat: 'EDIT',
        story: '設計変更で、旧品番「A-01」が新品番「A-02」になりました。' + (o.trap ? '（※品番「A-010」は別部品なので変えないこと）' : ''),
        job: '品番「A-01」を、すべて「A-02」に変更してください',
        detail: o.trap ? 'A-01 が0件、A-010 はそのまま残っていればクリア。' : 'A-01 が0件になったらクリア。',
        rows,
        start: { r: 0, c: 0 },
        meta: m,
        check: C.replaced(m),
        trap: o.trap ? 'partial' : null,
      };
    },
    filter(seed, o) {
      o = o || {};
      const n = o.rows || 1500;
      const rows = production(seed, { rows: n });
      const alt = o.variant === 'part';
      const m = alt ? { col: 2, value: 'B-07' } : { col: 1, value: '3ライン' };
      return {
        skill: 'ctrlShiftL',
        cat: 'FILTER',
        story: alt ? '品番 B-07 に不具合の問い合わせ。B-07 の実績だけを見たい。' : '3ラインの班長から「うちのラインの実績だけ見せて」。',
        job: alt ? '品番「B-07」の行だけを表示してください' : '「3ライン」の行だけを表示してください',
        detail: alt ? '品番（C列）で B-07 だけが表示されたらクリア。' : 'ライン（B列）で 3ライン だけが表示されたらクリア。',
        rows,
        start: { r: 0, c: 0 },
        meta: m,
        check: C.filtered(m),
      };
    },
    sum(seed, o) {
      o = o || {};
      const n = o.rows || 40;
      const blank = o.trap ? [{ row: Math.floor(n * 0.3) + 2, col: 4 }] : [];
      const rows = production(seed, { rows: n, blankCells: blank });
      const m = { cell: { r: n + 1, c: 4 }, total: totalOf(rows, 4) };
      return {
        skill: 'altEq',
        cat: 'CALCULATE',
        story: '今日の生産数を朝礼で報告します。' + (o.trap ? '（入力漏れの日もあるデータです）' : ''),
        job: `数量（E列）の合計を、${addr(n + 1, 4)} に入れてください`,
        detail: `${addr(n + 1, 4)}（数量の最終行のすぐ下）に合計 ＝ すべての数量の合計 が入ればクリア。`,
        rows,
        start: { r: 0, c: 0 },
        meta: m,
        check: C.summed(m),
        trap: o.trap ? 'autosumBlank' : null,
      };
    },
    fillDown(seed) {
      const rows = production(seed, { rows: 12 });
      rows[0].push('担当');
      rows[1][6] = '佐藤';
      const m = { col: 6, value: '佐藤', r2: 12 };
      return {
        skill: 'ctrlD',
        cat: 'EDIT',
        story: '担当（G列）が空欄。全部「佐藤」さんの担当です。',
        job: 'G3〜G13 に、G2 と同じ「佐藤」を入れてください',
        detail: 'G2:G13 がすべて「佐藤」になればクリア。',
        rows,
        start: { r: 1, c: 6 },
        meta: m,
        check: (x) => {
          for (let r = 1; r <= m.r2; r++) if (x.sim.sheet.raw(r, 6) !== '佐藤') return false;
          return true;
        },
      };
    },
  };
  const SKILL_BUILD = { ctrlArrow: 'move', ctrlShiftArrow: 'select', ctrlF: 'find', ctrlH: 'replace', ctrlShiftL: 'filter', altEq: 'sum', ctrlD: 'fillDown' };

  // スキルミッション：A=最初の挑戦 / B=別データでの再挑戦（REAL TRAP入り）/ C=追加練習
  function skillMission(skill, variant, seed) {
    const b = BUILD[SKILL_BUILD[skill]];
    const opt = { trap: variant === 'B' && skill !== 'ctrlShiftL' && skill !== 'ctrlD' };
    if (skill === 'ctrlShiftL' && variant === 'B') opt.variant = 'part';
    if (skill === 'ctrlArrow') opt.rows = variant === 'B' ? 4000 : 5000;
    if (skill === 'altEq' && variant === 'B') opt.rows = 60;
    if (skill === 'ctrlH' && variant === 'B') opt.rows = 400;
    const st = b(seed, opt);
    st.variant = variant;
    st.id = skill + ':' + variant;
    return st;
  }

  // ------------------------------------------------------------------ SPEED CHECK / FINAL（同じ6工程・同じ行数＝同等条件）
  const CHECK_ROWS = 5000;
  function stepSet(seed) {
    return [
      Object.assign(BUILD.move(seed + 1, { rows: CHECK_ROWS }), { key: 'move', job: '最終データの行へ移動してください' }),
      Object.assign(BUILD.select(seed + 2, { rows: CHECK_ROWS }), { key: 'select' }),
      Object.assign(BUILD.find(seed + 3, { rows: CHECK_ROWS }), { key: 'find' }),
      Object.assign(BUILD.replace(seed + 4, { rows: CHECK_ROWS }), { key: 'replace' }),
      Object.assign(BUILD.sum(seed + 5, { rows: CHECK_ROWS }), { key: 'sum' }),
      Object.assign(BUILD.filter(seed + 6, { rows: CHECK_ROWS }), { key: 'filter' }),
    ];
  }
  // FINAL は1枚の表で連続作業（状態が引き継がれる）。比較用の6工程は SPEED CHECK と同じ行数・同じ内容。
  function finalMission(seed) {
    const n = CHECK_ROWS;
    const base = production(seed, { rows: n });
    const lot = pickLot(base, seed);
    const rows = production(seed, { rows: n, lot });
    const totalAfterReplace = totalOf(rows, 4);
    const steps = [
      { key: 'move', skill: 'ctrlArrow', cat: 'MOVE', job: '何行あるか確認：最終データの行へ移動', start: { r: 0, c: 0 }, check: C.atLastRow({ last: n }) },
      { key: 'select', skill: 'ctrlShiftArrow', cat: 'SELECT', job: '数量（E列）を E2 から最後のデータまで範囲選択', start: { r: 1, c: 4 }, check: C.selected({ sel: { r1: 1, c1: 4, r2: n, c2: 4 } }) },
      { key: 'find', skill: 'ctrlF', cat: 'FIND', job: `品証から問い合わせ：ロット「${lot.value}」のセルを探して選択`, start: { r: 0, c: 0 }, check: C.activeValue({ target: lot.value }) },
      { key: 'replace', skill: 'ctrlH', cat: 'EDIT', job: '旧品番「A-01」を、すべて新品番「A-02」に修正', start: { r: 0, c: 0 }, check: C.replaced({ col: 2, from: 'A-01' }) },
      { key: 'sum', skill: 'altEq', cat: 'CALCULATE', job: `数量の合計を ${addr(n + 1, 4)} に入れる`, start: { r: 0, c: 0 }, check: C.summed({ cell: { r: n + 1, c: 4 }, total: totalAfterReplace }) },
      { key: 'filter', skill: 'ctrlShiftL', cat: 'FILTER', job: '会議で見せる「3ライン」の行だけを表示', start: { r: 0, c: 0 }, check: C.filtered({ col: 1, value: '3ライン' }) },
    ];
    return { rows, steps, n };
  }

  // ------------------------------------------------------------------ 30 SECOND RESCUE
  const RESCUE = [
    { id: 'move', skill: 'ctrlArrow', need: '大量データを移動したい', job: '何千行もある表の、いちばん下（端）へ行く', caution: '途中に空白セルがあると、そこで止まります。もう一度押せば次へ。', practice: () => BUILD.move(Date.now() % 9973, { rows: 1500 }) },
    { id: 'select', skill: 'ctrlShiftArrow', need: '一気に選びたい', job: '列のデータを最後までまとめて選択', caution: '空白セルの手前で選択も止まります。止まったらもう一度押す。', practice: () => BUILD.select(Date.now() % 9973, { rows: 1500 }) },
    { id: 'fill', skill: 'ctrlD', need: '同じ入力を繰り返したい', job: '上のセルと同じ値・数式を下へコピー', caution: '範囲を選んでから押すと、先頭行の内容がまとめて入ります。', practice: () => BUILD.fillDown(Date.now() % 9973) },
    { id: 'replace', skill: 'ctrlH', need: '文字をまとめて直したい', job: '品番・名称などを一括で書き換える', caution: '部分一致に注意。「完全に同一」を ON にすると安全です。', practice: () => BUILD.replace(Date.now() % 9973, { rows: 200, trap: true }) },
    { id: 'find', skill: 'ctrlF', need: '探したい', job: '大量データの中から1件を探す', caution: '範囲を選択したままだと、その中しか探しません。', practice: () => BUILD.find(Date.now() % 9973, { rows: 1500 }) },
    { id: 'filter', skill: 'ctrlShiftL', need: '絞りたい', job: '条件に合う行だけを表示する', caution: '終わったらもう一度 Ctrl + Shift + L で解除。空行があると表が途切れます。', practice: () => BUILD.filter(Date.now() % 9973, { rows: 800 }) },
    { id: 'sum', skill: 'altEq', need: '合計したい', job: '列の合計をワンタッチで入れる', caution: '空白セルの手前で範囲が止まります。Enter の前に点線の範囲を確認。', practice: () => BUILD.sum(Date.now() % 9973, { rows: 25 }) },
  ];

  // ------------------------------------------------------------------ 10秒デモ（ミニグリッドのアニメーション）
  const R = (n, v) => ({ n, v });
  const GAP = { gap: true };
  const DEMOS = {
    ctrlArrow: {
      cols: ['日付', 'ライン'],
      rows: [R(1, ['日付', 'ライン']), R(2, ['04/01', '1ライン']), R(3, ['04/01', '3ライン']), GAP, R(4999, ['08/29', '2ライン']), R(5000, ['08/29', '5ライン']), R(5001, ['08/30', '1ライン'])],
      frames: [
        { act: [1, 0], cap: '先頭のデータを選んで…' },
        { act: [1, 0], keys: ['Ctrl', '↓'], cap: 'Ctrl を押しながら ↓' },
        { act: [6, 0], keys: ['Ctrl', '↓'], cap: '一瞬で最終行へ', jump: true },
        { act: [6, 0], cap: 'スクロール不要。5,000行でも 1 秒' },
      ],
    },
    ctrlShiftArrow: {
      cols: ['ロット', '数量'],
      rows: [R(1, ['ロット', '数量']), R(2, ['L-1021', '120']), R(3, ['L-3307', '80']), GAP, R(2999, ['L-8810', '240']), R(3000, ['L-1192', '90']), R(3001, ['L-5560', '310'])],
      frames: [
        { act: [1, 1], cap: '範囲の先頭セルを選んで…' },
        { act: [1, 1], keys: ['Ctrl', 'Shift', '↓'], cap: 'Ctrl + Shift を押しながら ↓' },
        { act: [1, 1], sel: [1, 6], keys: ['Ctrl', 'Shift', '↓'], cap: 'データの最後まで一気に選択', jump: true },
        { act: [1, 1], sel: [1, 6], cap: 'そのまま Ctrl + C でコピーへ' },
      ],
    },
    ctrlF: {
      cols: ['品番', 'ロット'],
      rows: [R(1, ['品番', 'ロット']), R(2, ['A-01', 'L-1021']), R(3, ['B-07', 'L-3307']), GAP, R(2417, ['C-20', 'L-4821']), R(2418, ['A-05', 'L-6630'])],
      frames: [
        { act: [1, 0], keys: ['Ctrl', 'F'], cap: 'Ctrl + F で検索を開く' },
        { act: [1, 0], dialog: { title: '検索', q: 'L-4821' }, cap: '探したい文字を入力' },
        { act: [1, 0], dialog: { title: '検索', q: 'L-4821' }, keys: ['Enter'], cap: 'Enter' },
        { act: [4, 1], cap: '見つかったセルへ移動', jump: true },
      ],
    },
    ctrlH: {
      cols: ['品番', '数量'],
      rows: [R(1, ['品番', '数量']), R(2, ['A-01', '120']), R(3, ['B-07', '80']), R(4, ['A-01', '240']), R(5, ['A-010', '90']), R(6, ['A-01', '310'])],
      frames: [
        { act: [0, 0], keys: ['Ctrl', 'H'], cap: 'Ctrl + H で置換を開く' },
        { act: [0, 0], dialog: { title: '置換', q: 'A-01', rep: 'A-02', exact: true }, cap: '検索・置換後を入力（完全一致 ON）' },
        { act: [0, 0], dialog: { title: '置換', q: 'A-01', rep: 'A-02', exact: true }, keys: ['Alt', 'A'], cap: 'すべて置換' },
        { act: [0, 0], set: { '1,0': 'A-02', '3,0': 'A-02', '5,0': 'A-02' }, hl: ['1,0', '3,0', '5,0'], cap: 'A-010 は変わらず、A-01 だけ一括修正', jump: true },
      ],
    },
    ctrlShiftL: {
      cols: ['ライン', '数量'],
      rows: [R(1, ['ライン', '数量']), R(2, ['1ライン', '120']), R(3, ['3ライン', '80']), R(4, ['2ライン', '240']), R(5, ['3ライン', '90']), R(6, ['5ライン', '310'])],
      frames: [
        { act: [0, 0], keys: ['Ctrl', 'Shift', 'L'], cap: 'Ctrl + Shift + L' },
        { act: [0, 0], filter: true, cap: '見出しに ▾ が付く' },
        { act: [0, 0], filter: true, list: ['1ライン', '2ライン', '3ライン✓', '5ライン'], cap: '▾ から「3ライン」だけチェック' },
        { act: [0, 0], filter: true, hide: [1, 3, 5], cap: '3ラインの行だけ表示', jump: true },
      ],
    },
    altEq: {
      cols: ['日付', '数量'],
      rows: [R(1, ['日付', '数量']), R(2, ['04/01', '120']), R(3, ['04/02', '80']), R(4, ['04/03', '240']), R(5, ['04/04', '90']), R(6, ['', ''])],
      frames: [
        { act: [5, 1], cap: '合計を入れたいセルを選んで…' },
        { act: [5, 1], keys: ['Alt', '='], set: { '5,1': '=SUM(B2:B5)' }, ref: [1, 4], cap: 'Alt + =（点線＝合計範囲）' },
        { act: [5, 1], keys: ['Enter'], set: { '5,1': '=SUM(B2:B5)' }, ref: [1, 4], cap: '範囲を確認して Enter' },
        { act: [5, 1], set: { '5,1': '530' }, hl: ['5,1'], cap: '合計が入った', jump: true },
      ],
    },
    ctrlD: {
      cols: ['品番', '担当'],
      rows: [R(1, ['品番', '担当']), R(2, ['A-01', '佐藤']), R(3, ['B-07', '']), R(4, ['A-05', '']), R(5, ['C-20', '']), R(6, ['A-01', ''])],
      frames: [
        { act: [1, 1], sel: [1, 5], cap: 'コピー元を先頭に、範囲を選択' },
        { act: [1, 1], sel: [1, 5], keys: ['Ctrl', 'D'], cap: 'Ctrl + D' },
        { act: [1, 1], sel: [1, 5], set: { '2,1': '佐藤', '3,1': '佐藤', '4,1': '佐藤', '5,1': '佐藤' }, hl: ['2,1', '3,1', '4,1', '5,1'], cap: '上のセルが下へコピーされた', jump: true },
      ],
    },
  };

  Object.assign(EQ, { SKILLS, CATS, CAT_SKILL, CAT_JA, PROGRESSION, HINTS, TRAPS, BUILD, skillMission, stepSet, finalMission, RESCUE, DEMOS, CHECK_ROWS });
})(window.EQ);
