// E2E: 60秒チェック → AHA → BOTTLENECK → MISSION(A/B・TRAP) → FINAL → BEFORE/AFTER → SPEED CARD → NEXT DAY → 1 WEEK → RESCUE
// 実行: npx http-server -p 8123 . & node tests/e2e.mjs   （playwright が必要）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch (e) {
  pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
}
const BASE = process.env.BASE || 'http://localhost:8123/';
const SHOTS = process.env.SHOTS || '';
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let n = 0;
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png` });
const ok = (cond, msg) => {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('✓', msg);
};
const ov = (sel) => page.waitForSelector('.ov ' + sel, { timeout: 8000 });
const ovClick = async (sel) => {
  await page.click('.ov ' + sel);
  await page.waitForTimeout(150);
};
const grid = () => page.focus('.xl-grid');
const job = () => page.textContent('.m-job');
const nameBox = () => page.textContent('.xl-namebox');

async function doStep(key) {
  const j = await job();
  if (key === 'move') {
    await page.keyboard.press('Control+ArrowDown');
  } else if (key === 'select') {
    await page.keyboard.press('Control+Shift+ArrowDown');
  } else if (key === 'find') {
    const lot = /「(L-\d+)」/.exec(j)[1];
    await page.keyboard.press('Control+f');
    await page.keyboard.type(lot);
    await page.keyboard.press('Enter');
  } else if (key === 'replace') {
    await page.keyboard.press('Control+h');
    await page.fill('.xl-dialog [data-f="q"]', 'A-01');
    await page.fill('.xl-dialog [data-f="rep"]', 'A-02');
    await page.keyboard.press('Alt+a');
  } else if (key === 'sum') {
    const addr = /([A-Z]+\d+) に/.exec(j)[1];
    await page.keyboard.press('Control+ArrowRight'); // A1 → F1
    await page.keyboard.press('ArrowLeft'); // E1
    await page.keyboard.press('Control+ArrowDown');
    await page.keyboard.press('ArrowDown');
    ok((await nameBox()) === addr, 'sum target reached ' + addr);
    await page.keyboard.press('Alt+Equal');
    await page.keyboard.press('Enter');
  } else if (key === 'filter') {
    const want = /「(.+?)」/.exec(j)[1];
    const col = want.endsWith('ライン') ? 1 : 2;
    await page.keyboard.press('Control+Shift+KeyL');
    for (let i = 0; i < col; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Alt+ArrowDown');
    await page.click('.xl-dropdown [data-all]');
    await page.click(`.xl-dropdown input[value="${want}"]`);
    await page.click('.xl-dropdown [data-dd="ok"]');
  }
}

// ---------------------------------------------------------------- HOME → SPEED CHECK
await page.goto(BASE + '#home');
await page.evaluate(() => localStorage.clear());
await page.reload();
await shot('home');
const t0 = Date.now();
await page.click('.btn-start');
await page.waitForSelector('.xl-grid');
ok(Date.now() - t0 < 10000, '10秒以内に操作開始できる');
await shot('check-1');
// 1問目：マウスでスクロール（遅いルート）→ スキップ → AHA
await page.mouse.move(500, 500);
for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 400);
await page.click('.m-skip');
await ov('.aha');
ok((await page.textContent('.ov')).includes('Ctrl'), 'AHA でキーを提示');
await shot('aha-offer');
await ovClick('[data-ov="try"]');
await grid();
await page.keyboard.press('Control+ArrowDown');
await ov('.speedup');
await page.waitForTimeout(300); await shot('aha-speedup');
ok(true, 'SPEED UP 体験（' + Math.round((Date.now() - t0) / 1000) + '秒）');
await ovClick('[data-ov="next"]');
for (const key of ['select', 'find', 'replace', 'sum', 'filter']) {
  await grid();
  await doStep(key);
  await page.waitForTimeout(700);
  if (key === 'find') await page.keyboard.press('Escape');
}
await page.waitForSelector('.bottleneck', { timeout: 8000 });
ok(true, 'BOTTLENECK 表示');
await shot('bottleneck');
const ttfsu = await page.evaluate(() => JSON.parse(localStorage.getItem('eqos.v1')).kpi.ttfsuMs);
ok(ttfsu != null && ttfsu < 60000, 'Time to First Speed-Up < 60秒: ' + ttfsu + 'ms');
const chk = await page.evaluate(() => JSON.parse(localStorage.getItem('eqos.v1')).check.steps.map((s) => s.key + ':' + s.done));
console.log('  check', chk.join(' '));
ok(chk.filter((s) => s.endsWith('true')).length === 5, '残り5工程をショートカットで完了');

// ---------------------------------------------------------------- MISSION（MOVE を A→B で）
await page.evaluate(() => EQ.go('mission', { skill: 'ctrlArrow', variant: 'A' }));
await page.waitForSelector('.xl-grid');
ok(!/Ctrl/.test(await job()), '問題文にショートカット名を出さない');
// ヒント 1 → 2
await page.click('.btn-hint');
await page.click('.btn-hint');
ok((await page.$$('.hint')).length === 2, '段階ヒント（2段目まで）');
// マウス：スクロールバーをドラッグ → 最終行付近をクリック では難しいので Ctrl+End（別ルート）
await grid();
await page.keyboard.press('Control+End');
await ov('.fb');
await shot('mission-feedback');
await ovClick('[data-ov="retry"]');
await page.waitForSelector('.xl-grid');
await grid();
await page.keyboard.press('Control+ArrowDown');
await ov('.trap');
ok(true, 'REAL EXCEL TRAP：空白セルで停止 → DISCOVERY');
await shot('trap-blank');
await ovClick('[data-ov="ok"]');
await grid();
await page.keyboard.press('Control+ArrowDown');
await page.keyboard.press('Control+ArrowDown');
await ov('.fb');
await shot('mission-b-result');
const st = await page.evaluate(() => JSON.parse(localStorage.getItem('eqos.v1')).skills.ctrlArrow.state);
ok(st === 'INDEPENDENT', 'ヒントなし・別データ再現で INDEPENDENT（' + st + '）');

// 置換トラップ（部分一致）
await page.evaluate(() => EQ.go('mission', { skill: 'ctrlH', variant: 'B' }));
await page.waitForSelector('.xl-grid');
await grid();
await page.keyboard.press('Control+h');
await page.fill('.xl-dialog [data-f="q"]', 'A-01');
await page.fill('.xl-dialog [data-f="rep"]', 'A-02');
await page.keyboard.press('Alt+a');
await ov('.trap');
ok(true, 'REAL EXCEL TRAP：部分一致で A-010 も置換 → DISCOVERY');
await ovClick('[data-ov="ok"]');
await page.click('.xl-dialog [data-dlg="close"]');
await grid();
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+h');
await page.check('.xl-dialog [data-f="exact"]');
await page.click('.xl-dialog [data-dlg="all"]');
await ov('.fb');
ok(true, 'Ctrl+Z → 完全一致で置換し直してクリア');
await ovClick('[data-ov="hub"]');
await page.waitForSelector('.hub');
await shot('hub');

// ---------------------------------------------------------------- FINAL
await page.evaluate(() => EQ.go('final'));
await page.click('.btn-start');
await page.waitForSelector('.is-final .xl-grid');
await shot('final');
for (const key of ['move', 'select', 'find', 'replace', 'sum', 'filter']) {
  await grid();
  await doStep(key);
  await page.waitForTimeout(600);
  if (key === 'find') await page.keyboard.press('Escape');
}
await page.click('.btn-report');
await page.waitForSelector('.ba');
await page.waitForTimeout(300); await shot('before-after'); SHOTS && await page.screenshot({ path: SHOTS + '/ba-full.png', fullPage: true });
const baText = await page.textContent('.ba');
ok(baText.includes('BEFORE') && baText.includes('同等条件'), 'BEFORE / AFTER（同等条件の明示）');
await page.click('[data-go="card"]');
await page.waitForSelector('.scard');
await shot('speed-card');
ok((await page.$$('.sc-list li')).length === 3, '明日使う3技を生成');
await page.click('[data-act="phone"]');
ok(!!(await page.$('.sc-phone .qr svg')), 'SPEED CARD をスマホへ渡す QR を表示');
const cardUrl = await page.evaluate(() => EQ._cardUrl(EQ.Store.state.cards.slice(-1)[0]));
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ics"]')]);
const ics = require('fs').readFileSync(await dl.path(), 'utf8');
ok(/BEGIN:VEVENT[\s\S]*DTSTART:\d{8}T090000[\s\S]*SUMMARY:昨日の3技/.test(ics), '翌日 9:00 の振り返り予定（.ics）');
const phone = await browser.newPage({ ...pw.devices['iPhone 13'] });
await phone.goto(cardUrl);
await phone.waitForSelector('.scard');
ok((await phone.$$('.sc-list li')).length === 3 && (await phone.textContent('.app-toast')).includes('保存'), 'スマホで QR の URL を開くと SPEED CARD を取り込み');
await phone.evaluate(() => { EQ.Store.state.dayOffset = 1; EQ.Store.save(); });
await phone.goto(BASE + '#home');
await phone.reload();
ok(!!(await phone.$('.prompt-day')), 'スマホで翌日チェックが出る');
await phone.close();

// ---------------------------------------------------------------- NEXT DAY / WEEK
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('eqos.v1'));
  s.dayOffset = 1;
  localStorage.setItem('eqos.v1', JSON.stringify(s));
});
await page.goto(BASE + '#home');
await page.reload();
await page.click('.prompt-day');
await page.waitForSelector('.nextday');
const rows = await page.$$('.nd-row');
await rows[0].$eval('[data-a="used"]', (b) => b.click());
await rows[1].$eval('[data-a="nochance"]', (b) => b.click());
await rows[2].$eval('[data-a="forgot"]', (b) => b.click());
await page.click('[data-act="save"]');
await page.waitForSelector('[data-r]');
await shot('next-day');
ok(true, 'NEXT DAY：✓/△/? を記録し、忘れた技は30秒復習へ誘導');
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('eqos.v1'));
  s.dayOffset = 8;
  localStorage.setItem('eqos.v1', JSON.stringify(s));
});
await page.reload();
await page.click('.prompt-week');
await page.waitForSelector('.week');
await shot('week');
await page.click('[data-act="add"]');
await page.waitForSelector('.rc');
ok(true, '1 WEEK：次の1技を追加 → RESCUE カード');

// ---------------------------------------------------------------- RESCUE
await page.click('[data-nav="rescue"]');
await page.waitForSelector('.rs-grid');
await shot('rescue');
await page.click('[data-id="sum"]');
await page.waitForSelector('.rc-demo .dm-stage');
await shot('rescue-card');
await page.click('[data-act="try"]');
await page.waitForSelector('.xl-grid');
await grid();
await page.keyboard.press('Control+ArrowRight');
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('Control+ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Alt+Equal');
await page.keyboard.press('Enter');
await ov('.fb');
ok(true, '30 SECOND RESCUE：試す → 達成');

// 誤操作で止まらない：ランダム打鍵
await page.evaluate(() => EQ.go('mission', { skill: 'ctrlShiftL', variant: 'A' }));
await page.waitForSelector('.xl-grid');
await grid();
const keysPool = ['ArrowDown', 'ArrowRight', 'Control+ArrowDown', 'Control+Shift+ArrowUp', 'Delete', 'F2', 'Escape', 'x', 'Enter', 'Control+z', 'Control+a', 'Control+c', 'Control+v', 'Control+d', 'PageDown', 'Control+Home', 'Tab', 'Alt+Equal', 'Escape'];
for (let i = 0; i < 120; i++) await page.keyboard.press(keysPool[(i * 7) % keysPool.length]);
await page.mouse.click(400, 500);
ok(errors.length === 0, '誤操作・ランダム打鍵でもエラーなし');

console.log('\nALL PASSED');
await browser.close();
