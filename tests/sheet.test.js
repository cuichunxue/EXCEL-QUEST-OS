// node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { Sheet, production, addr } = require('../js/sheet.js');

function small() {
  // A1:A6 = 見出し, 1, 2, (空白), 4, 5
  return new Sheet([['h', 'q'], [1, 10], [2, 20], ['', ''], [4, 40], [5, 50]]);
}

test('Ctrl+↓ はデータの塊の端へ移動し、空白で止まる', () => {
  const s = small();
  assert.deepStrictEqual(s.ctrlJump(0, 0, 1, 0), { r: 2, c: 0 });
  assert.ok(s.stoppedAtGap(2, 0, 1));
  assert.deepStrictEqual(s.ctrlJump(2, 0, 1, 0), { r: 4, c: 0 });
  assert.deepStrictEqual(s.ctrlJump(4, 0, 1, 0), { r: 5, c: 0 });
  assert.ok(!s.stoppedAtGap(5, 0, 1));
  // 最終データの下は空 → シート最下部
  assert.strictEqual(s.ctrlJump(5, 0, 1, 0).r, 1048575);
  assert.deepStrictEqual(s.ctrlJump(1048575, 0, -1, 0), { r: 5, c: 0 });
});

test('5,000行データで Ctrl+↓ は最終行へ', () => {
  const s = new Sheet(production(1, { rows: 5000 }));
  assert.deepStrictEqual(s.ctrlJump(0, 0, 1, 0), { r: 5000, c: 0 });
});

test('Alt+= は空白セルの手前で範囲が止まる（トラップ）', () => {
  const s = small();
  const a = s.autoSumFormula(6, 1);
  assert.strictEqual(a.formula, '=SUM(B5:B6)');
  s.set(6, 1, '=SUM(B2:B6)');
  assert.strictEqual(s.value(6, 1), 120);
});

test('置換：部分一致だと A-010 も変わる／完全一致なら変わらない', () => {
  const rows = [['品番'], ['A-01'], ['A-010'], ['B-07'], ['A-01']];
  const s1 = new Sheet(rows);
  const r1 = s1.replaceAll('A-01', 'A-02');
  assert.strictEqual(r1.count, 3);
  assert.strictEqual(r1.partial, 1);
  assert.strictEqual(s1.raw(2, 0), 'A-020');
  s1.undo();
  assert.strictEqual(s1.raw(2, 0), 'A-010');
  const s2 = new Sheet(rows);
  assert.strictEqual(s2.replaceAll('A-01', 'A-02', { exact: true }).count, 2);
  assert.strictEqual(s2.raw(2, 0), 'A-010');
});

test('検索：複数セル選択中は選択範囲内だけを検索する', () => {
  const s = new Sheet([['a', 'b'], ['x', 'L-1'], ['y', 'L-2']]);
  assert.deepStrictEqual(s.findNext('L-2', { r: 0, c: 0 }), { r: 2, c: 1 });
  assert.strictEqual(s.findNext('L-2', { r: 0, c: 0 }, { scope: { r1: 0, c1: 0, r2: 2, c2: 0 } }), null);
});

test('フィルター：条件外の行を非表示にし、Ctrl+↓ は可視行だけ', () => {
  const s = new Sheet([['ライン'], ['1ライン'], ['3ライン'], ['1ライン'], ['3ライン']]);
  s.toggleFilter({ r1: 0, c1: 0, r2: 0, c2: 0 });
  s.setCriteria(0, ['3ライン']);
  assert.deepStrictEqual(Array.from(s.hidden).sort(), [1, 3]);
  assert.strictEqual(s.visibleDataCount(), 2);
  assert.deepStrictEqual(s.ctrlJump(0, 0, 1, 0), { r: 4, c: 0 });
  assert.strictEqual(s.autoSumFormula(5, 0).formula, '=SUM()');
});

test('数式：SUBTOTAL は非表示行を除外', () => {
  const s = new Sheet([['q'], [1], [2], [3]]);
  s.hidden.add(2);
  s.set(4, 0, '=SUBTOTAL(9,A2:A4)');
  assert.strictEqual(s.value(4, 0), 4);
  assert.strictEqual(addr(4999, 4), 'E5000');
});
