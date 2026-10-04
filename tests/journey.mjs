// Journey Map 検証：ペルソナ別に Journey を通し、各ステージの到達時間・操作・つまずきを計測する
// 実行: npx http-server -p 8123 . &  node tests/journey.mjs [mouse|keyboard|all]
// 出力: 標準出力にタイムライン（JSON は JOURNEY_OUT に保存）
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch (e) {
  pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
}
const BASE = process.env.BASE || 'http://localhost:8123/';
const which = process.argv[2] || 'all';
const READ = Number(process.env.READ_MS || 1800); // 問題文を読む時間（人間らしさ）

async function run(persona) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  const tl = [];
  const mark = (stage, note) => {
    tl.push({ t: +((Date.now() - t0) / 1000).toFixed(1), stage, note: note || '' });
    if (process.env.VERBOSE) console.log('  ', tl[tl.length - 1].t, stage, note || '');
  };
  const wait = (ms) => page.waitForTimeout(ms);
  const has = (sel) => page.$(sel).then((x) => !!x);
  const ovText = async () => ((await page.$('.ov')) ? (await page.textContent('.ov')).replace(/\s+/g, ' ').slice(0, 90) : '');
  const job = () => page.textContent('.m-job');

  // ---- マウス操作の部品（スクロールバーをドラッグ → 目的セルをクリック）
  async function dragThumbToBottom() {
    const th = await (await page.$('.xl-thumb')).boundingBox();
    const tr = await (await page.$('.xl-vscroll')).boundingBox();
    await page.mouse.move(th.x + 4, th.y + 5);
    await page.mouse.down();
    await page.mouse.move(th.x + 4, tr.y + tr.height - 2, { steps: 10 });
    await page.mouse.up();
    await wait(400);
  }
  async function clickRowCell(rowLabel, col, mods) {
    const rows = await page.$$eval('.xl-rh', (els) => els.map((e) => [e.textContent, e.getBoundingClientRect().y]));
    const hit = rows.find(([t]) => t === String(rowLabel));
    if (!hit) return false;
    const colBox = await (await page.$(`.xl-ch[data-col="${col}"]`)).boundingBox();
    for (const m of mods || []) await page.keyboard.down(m);
    await page.mouse.click(colBox.x + colBox.width / 2, hit[1] + 10);
    for (const m of mods || []) await page.keyboard.up(m);
    return true;
  }
  const lastRowLabel = (j) => {
    const m = /([\d,]+) 行目|E(\d+)/.exec(j);
    return m ? (m[1] || m[2]).replace(/,/g, '') : null;
  };

  async function mouseStep(key, j) {
    await wait(READ);
    if (key === 'move') {
      await dragThumbToBottom();
      const detail = await page.textContent('.m-detail');
      const n = /([\d,]+) 行目/.exec(detail);
      await clickRowCell(n ? n[1].replace(/,/g, '') : '5001', 0);
    } else if (key === 'select') {
      await page.click('.xl-c[data-r="1"][data-c="4"]');
      await dragThumbToBottom();
      const n = /E2:E(\d+)/.exec(await page.textContent('.m-detail'));
      await clickRowCell(n ? n[1] : '5001', 4, ['Shift']);
    } else if (key === 'find') {
      const lot = /「(L-\d+)」/.exec(j)[1];
      await page.click('.xl-rb[data-act="find"]');
      await page.type('.xl-dialog [data-f="q"]', lot, { delay: 140 });
      await page.click('.xl-dialog [data-dlg="next"]');
      await wait(300);
      await page.click('.xl-dialog [data-dlg="close"]', { timeout: 800 }).catch(() => {});
    } else if (key === 'replace') {
      await page.click('.xl-rb[data-act="replace"]');
      await page.type('.xl-dialog [data-f="q"]', 'A-01', { delay: 140 });
      await page.type('.xl-dialog [data-f="rep"]', 'A-02', { delay: 140 });
      await page.click('.xl-dialog [data-dlg="all"]');
      await wait(300);
      await page.click('.xl-dialog [data-dlg="close"]', { timeout: 800 }).catch(() => {});
    } else if (key === 'sum') {
      const addr = /([A-Z]+)(\d+) に/.exec(j);
      await dragThumbToBottom();
      await clickRowCell(addr[2], 4);
      await page.click('.xl-rb[data-act="autosum"]');
      await wait(500);
      await page.keyboard.press('Enter');
    } else if (key === 'filter') {
      const want = /「(.+?)」/.exec(j)[1];
      const col = want.endsWith('ライン') ? 1 : 2;
      await page.click('.xl-rb[data-act="filter"]');
      await page.click(`.xl-fbtn[data-fcol="${col}"]`);
      await page.click('.xl-dropdown [data-all]');
      await page.click(`.xl-dropdown input[value="${want}"]`);
      await page.click('.xl-dropdown [data-dd="ok"]');
    }
  }
  async function keyStep(key, j) {
    await wait(READ * 0.6);
    await page.focus('.xl-grid');
    const kb = page.keyboard;
    if (key === 'move') await kb.press('Control+ArrowDown');
    else if (key === 'select') await kb.press('Control+Shift+ArrowDown');
    else if (key === 'find') {
      await kb.press('Control+f');
      await kb.type(/「(L-\d+)」/.exec(j)[1], { delay: 60 });
      await kb.press('Enter');
      await wait(200);
      await kb.press('Escape');
    } else if (key === 'replace') {
      await kb.press('Control+h');
      await kb.type('A-01', { delay: 60 });
      await kb.press('Tab');
      await kb.type('A-02', { delay: 60 });
      await kb.press('Alt+a');
    } else if (key === 'sum') {
      await kb.press('Control+ArrowRight');
      await kb.press('ArrowLeft');
      await kb.press('Control+ArrowDown');
      await kb.press('ArrowDown');
      await kb.press('Alt+Equal');
      await kb.press('Enter');
    } else if (key === 'filter') {
      const want = /「(.+?)」/.exec(j)[1];
      await kb.press('Control+Shift+KeyL');
      for (let i = 0; i < (want.endsWith('ライン') ? 1 : 2); i++) await kb.press('ArrowRight');
      await kb.press('Alt+ArrowDown');
      await page.click('.xl-dropdown [data-all]');
      await page.click(`.xl-dropdown input[value="${want}"]`);
      await page.click('.xl-dropdown [data-dd="ok"]');
    }
  }
  const KEY_BY_CAT = { MOVE: 'move', SELECT: 'select', FIND: 'find', EDIT: 'replace', CALCULATE: 'sum', FILTER: 'filter' };
  const KEY_BY_SKILL = { ctrlArrow: 'move', ctrlShiftArrow: 'select', ctrlF: 'find', ctrlH: 'replace', altEq: 'sum', ctrlShiftL: 'filter' };
  async function dismissTraps() {
    for (let i = 0; i < 3; i++) {
      if (await has('.ov .trap')) {
        mark('TRAP', await ovText());
        await page.click('.ov [data-ov="ok"]');
        await wait(READ);
      }
    }
  }

  // ================= ENTRY
  await page.goto(BASE + '#home');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  mark('ENTRY', 'ホーム表示');
  await wait(READ);
  await page.click('.btn-start');
  await page.waitForSelector('.xl-grid');
  mark('SPEED CHECK', '開始（シミュレーター表示）');

  // ================= SPEED CHECK
  for (let i = 0; i < 6; i++) {
    const j = await job();
    const cat = (await page.textContent('.m-progress .now')) || '';
    const key = KEY_BY_CAT[cat.trim()];
    if (persona === 'mouse') await mouseStep(key, j);
    else await keyStep(key, j);
    await wait(900);
    if (i === 0) {
      await page.waitForSelector('.ov .aha', { timeout: 30000 });
      mark('AHA', await ovText());
      if (await has('.ov [data-ov="try"]')) {
        await wait(READ);
        await page.click('.ov [data-ov="try"]');
        await wait(READ * 0.6);
        await page.focus('.xl-grid');
        await page.keyboard.press('Control+ArrowDown');
        await page.waitForSelector('.ov .speedup', { timeout: 8000 });
      }
      mark('SPEED-UP', await ovText());
      await wait(READ);
      await page.click('.ov [data-ov="next"]');
    }
    // タイムアウト時のオーバーレイは自動で消える
    await wait(300);
    if (await has('.bottleneck')) break;
  }
  await page.waitForSelector('.bottleneck', { timeout: 40000 });
  const picks = await page.$$eval('.pick b', (els) => els.map((e) => e.textContent));
  const bn = await page.$$eval('.bn-row', (els) => els.map((e) => e.querySelector('.bn-cat').firstChild.textContent + ':' + e.className.replace('bn-row bn-', '')));
  mark('BOTTLENECK', bn.join(' ') + ' → 今日の3つ: ' + picks.join('・'));

  // ================= FAST（今日の3つ）
  await wait(READ);
  await page.click('[data-act="fast"]');
  const nPicks = picks.length;
  for (let k = 0; k < nPicks; k++) {
    for (const variant of ['A', 'B']) {
      await page.waitForSelector('.xl-grid');
      const skill = await page.evaluate(() => (EQ._sim ? document.querySelector('.m-badge').textContent : ''));
      const j = await job();
      const sk = await page.evaluate(() => EQ.Store.state.attempts.length);
      const cat = /MISSION\s*([A-Z]+)/.exec(skill)[1];
      const key = KEY_BY_CAT[cat];
      // A は普段どおり（マウス派はマウス）、B は DISCOVERY で知ったキーを使う
      if (variant === 'A' && persona === 'mouse') await mouseStep(key, j);
      else {
        await keyStep(key, j);
        await wait(500);
        await dismissTraps();
        if (!(await has('.ov .fb'))) {
          // 落とし穴の後の続き（もう一度押す・直す）
          await page.focus('.xl-grid').catch(() => {});
          if (key === 'move') await page.keyboard.press('Control+ArrowDown'), await page.keyboard.press('Control+ArrowDown');
          if (key === 'select') await page.keyboard.press('Control+Shift+ArrowDown'), await page.keyboard.press('Control+Shift+ArrowDown');
          if (key === 'replace') {
            await page.click('.xl-dialog [data-dlg="close"]').catch(() => {});
            await page.focus('.xl-grid');
            await page.keyboard.press('Control+z');
            await page.keyboard.press('Control+h');
            await page.check('.xl-dialog [data-f="exact"]');
            await page.keyboard.press('Alt+a');
          }
          if (key === 'sum') {
            // 落とし穴の後：合計セルへ行き、範囲を直して確定
            const addr = /([A-Z]+)(\d+) に/.exec(j);
            // トーストの案内どおり、違う場所に入れた合計を Ctrl+Z で戻す
            await page.focus('.xl-grid');
            if (await page.evaluate(() => EQ._sim.sheet.undoStack.length)) await page.keyboard.press('Control+z');
            await page.evaluate((r) => EQ._sim.setActive(r - 1, 4), +addr[2]);
            await page.focus('.xl-grid');
            await page.keyboard.type(`=SUM(E2:E${addr[2] - 1})`);
            await page.keyboard.press('Enter');
          }
          if (key === 'find') {
            await page.click('.xl-dialog [data-dlg="close"]').catch(() => {});
            await page.evaluate(() => EQ._sim.setActive(0, 0));
            await keyStep('find', j);
          }
          await wait(500);
          await dismissTraps();
        }
      }
      try {
        await page.waitForSelector('.ov .fb', { timeout: 20000 });
      } catch (e) {
        await page.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/journey-stuck.png' });
        mark('STUCK', `${cat}-${variant} job=${j} ov=${await ovText()}`);
        throw e;
      }
      const res = await page.evaluate(() => EQ.Store.state.attempts.slice(-1)[0]);
      mark(`MISSION ${cat}-${variant}`, `${(res.ms / 1000).toFixed(1)}s ${res.usedTarget ? '⚡' : 'other'} → ${(await ovText()).slice(0, 60)}`);
      await wait(READ);
      // 利用者は「主ボタン（Enter）」を押す想定
      const btn = await page.$eval('.ov .btn.primary', (b) => b.dataset.ov);
      if (k === nPicks - 1 && variant === 'B') {
        mark('FAST END', '最後の技の後の出口: ' + (await page.$$eval('.ov .ov-btns button', (b) => b.map((x) => x.textContent.trim()).join(' / '))));
        await page.click('.ov [data-ov="' + btn + '"]');
      } else await page.click('.ov [data-ov="' + btn + '"]');
      await wait(300);
    }
  }
  if (!(await has('.scard'))) {
    if (!(await has('.hub'))) await page.evaluate(() => EQ.go('hub'));
    await page.click('[data-go="card"]');
  }
  await page.waitForSelector('.scard');
  mark('SPEED CARD', (await page.textContent('.sc-list')).replace(/\s+/g, ' '));

  // ================= FINAL（CHALLENGE）
  await page.evaluate(() => EQ.go('final'));
  await wait(READ);
  await page.click('.btn-start');
  await page.waitForSelector('.is-final .xl-grid');
  mark('FINAL', '開始');
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction((n) => document.querySelectorAll('.flist li.done').length === n, i, { timeout: 30000 });
    await wait(400);
    const j = await job();
    const key = ['move', 'select', 'find', 'replace', 'sum', 'filter'][i];
    // FINAL はどちらのペルソナも「今日覚えた技」は使う（マウス派は今日の3技以外はマウス）
    const learned = await page.evaluate((k) => {
      const map = { move: 'ctrlArrow', select: 'ctrlShiftArrow', find: 'ctrlF', replace: 'ctrlH', sum: 'altEq', filter: 'ctrlShiftL' };
      return ['PRACTICED', 'INDEPENDENT'].includes(EQ.Store.skill(map[k]).state);
    }, key);
    if (persona === 'keyboard' || learned) await keyStep(key, j);
    else await mouseStep(key, j);
    await wait(700);
    await dismissTraps();
  }
  await page.click('.btn-report');
  await page.waitForSelector('.ba');
  mark('BEFORE/AFTER', (await page.textContent('.ba-main').catch(() => 'no compare')).replace(/\s+/g, ' ') + ' | ' + (await page.textContent('.ba .note')).replace(/\s+/g, ' ').slice(0, 80));
  const ending = await page.textContent('.ending figcaption');
  mark('ENDING', ending);

  // ================= NEXT DAY / RESCUE / WEEK
  await page.evaluate(() => {
    EQ.Store.state.dayOffset = 1;
    EQ.Store.save();
  });
  await page.goto(BASE + '#home');
  await page.reload();
  mark('NEXT DAY', (await has('.prompt-day')) ? '翌日プロンプト表示' : '⚠ 翌日プロンプトなし');
  if (await has('.prompt-day')) {
    await page.click('.prompt-day');
    for (const row of await page.$$('.nd-row')) await row.$eval('[data-a="used"]', (b) => b.click());
    await page.click('[data-act="save"]');
  }
  await page.goto(BASE + '#rescue');
  await page.click('[data-id="replace"]');
  await page.waitForSelector('.rc');
  mark('RESCUE', 'カード表示（2クリック）');
  await page.evaluate(() => {
    EQ.Store.state.dayOffset = 8;
    EQ.Store.save();
  });
  await page.goto(BASE + '#home');
  await page.reload();
  mark('1 WEEK', (await has('.prompt-week')) ? '1週間プロンプト表示' : '⚠ 1週間プロンプトなし');
  const kpi = await page.evaluate(() => EQ.Store.kpis());
  mark('KPI', `TTFSU=${kpi.ttfsu}ms hintDep=${kpi.hintDependency} indepRetry=${kpi.independentRetry} fast=${kpi.fastCompletion}`);
  if (errors.length) mark('ERRORS', errors.join(' | '));
  await browser.close();
  return tl;
}

// 初心者：診断では手が止まり（時間切れ）、AHA も「あとで」。練習で初めて答えを見て、FINAL で今日の技を使う
async function runNovice() {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  const tl = [];
  const mark = (stage, note) => tl.push({ t: +((Date.now() - t0) / 1000).toFixed(1), stage, note: note || '' });
  const ovText = async () => ((await page.$('.ov')) ? (await page.textContent('.ov')).replace(/\s+/g, ' ').slice(0, 100) : '');
  await page.goto(BASE + '#home');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('.btn-start');
  mark('SPEED CHECK', '開始・何もできずに時間切れを待つ');
  await page.waitForSelector('.ov .aha', { timeout: 30000 });
  mark('AHA', await ovText());
  await page.click('.ov [data-ov="skip"]');
  await page.waitForSelector('.ov [data-ov="finish"]', { timeout: 60000 });
  mark('STUCK EXIT', await ovText());
  await page.click('.ov [data-ov="finish"]');
  await page.waitForSelector('.bottleneck', { timeout: 120000 });
  mark('BOTTLENECK', (await page.textContent('.today3')).replace(/\s+/g, ' ').slice(0, 120));
  await page.click('[data-act="fast"]');
  await page.waitForSelector('.xl-grid');
  await page.waitForTimeout(21000);
  mark('IDLE NUDGE', (await page.textContent('.m-bubble')).replace(/\s+/g, ' ') + ((await page.$('.btn-hint.pulse')) ? '（ヒントが点滅）' : ''));
  for (let i = 0; i < 3; i++) await page.click('.btn-hint');
  mark('HINT 3', (await page.textContent('.m-hintbox')).replace(/\s+/g, ' '));
  await page.click('.m-skip');
  await page.waitForSelector('.ov .fb');
  mark('SKIP → FEEDBACK', await ovText());
  const st = await page.evaluate(() => EQ.Store.state.skills);
  mark('MASTERY', JSON.stringify(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.state]))));
  // FINAL：今日学んだ MOVE だけキー、残りは時間をかけて完了（BEFORE は時間切れ → 下限比較）
  await page.evaluate(() => EQ.go('finalrun'));
  await page.waitForSelector('.is-final .xl-grid');
  await page.focus('.xl-grid');
  await page.keyboard.press('Control+ArrowDown');
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction((n) => document.querySelectorAll('.flist li.done').length === n, i + 1, { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.click('.m-skip');
  }
  await page.click('.btn-report');
  await page.waitForSelector('.ba');
  mark('BEFORE/AFTER', (await page.textContent('.ba')).replace(/\s+/g, ' ').slice(0, 260));
  if (errors.length) mark('ERRORS', errors.join(' | '));
  await browser.close();
  return tl;
}

const out = {};
for (const p of which === 'all' ? ['mouse', 'keyboard', 'novice'] : [which]) {
  out[p] = p === 'novice' ? await runNovice() : await run(p);
  console.log(`\n=== persona: ${p} ===`);
  for (const r of out[p]) console.log(String(r.t).padStart(6) + 's  ' + r.stage.padEnd(14) + ' ' + r.note);
}
if (process.env.JOURNEY_OUT) fs.writeFileSync(process.env.JOURNEY_OUT, JSON.stringify(out, null, 2));
