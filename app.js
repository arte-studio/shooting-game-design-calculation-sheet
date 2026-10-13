/* 歯車列 設計計算シート GUI */
(function () {
  'use strict';
  const GC = window.GearCore;
  const $ = (s) => document.querySelector(s);
  const f3 = (v) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
  const f2 = (v) => v.toFixed(2);
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;

  // ---------------------------------------------------------------------------
  // 条件フォーム
  // ---------------------------------------------------------------------------
  const FIELDS = [
    ['grp', '速度比（厳密一致）'],
    ['ratio', 'n青 / n黄', 'num'],
    ['grp', 'モジュール（任意値を刻みで走査）'],
    ['modMin', '下限', 'num'], ['modMax', '上限', 'num'], ['modStep', '刻み', 'num'],
    ['allowTwoLayer', '緑の二層構造を許可', 'bool'],
    ['grp', '歯形（標準・転位なし）'],
    ['pressureAngleDeg', '圧力角 [°]', 'num'], ['addendum', '歯末の丈 係数', 'num'], ['dedendum', '歯元の丈 係数', 'num'],
    ['grp', '歯数'],
    ['zMin', '最小歯数', 'int'], ['zMaxRed', '赤 最大', 'int'], ['zMaxBlue', '青 最大', 'int'], ['zMaxGreen', '緑 最大', 'int'],
    ['internalMinDiff', '黄 − 緑二層目 最小差', 'int'],
    ['grp', '寸法 [mm]'],
    ['yellowRootMax', '黄 歯底円直径 上限', 'num'], ['blueY', '青 中心 y', 'num'], ['purpleD', 'モーター（紫円）直径', 'num'], ['brownD', '茶円 直径', 'num'],
    ['grp', 'すき間 [mm]'],
    ['clrPart', '歯先円 ↔ 水色部品', 'num'], ['clrGear', '歯先円 ↔ 歯先円・軸', 'num'],
    ['redBlueTip', '赤 ↔ 青 歯先円を干渉させない（二層時も）', 'bool'],
    ['clrRedBlue', '赤 ↔ 青 歯先円 最小距離', 'num', 'redBlueTip'],
    ['blueShaftD', '青 軸径（赤 ↔ 青軸 で判定）', 'num', '!redBlueTip'],
    ['checkCrossLayer', '赤・青 が黄の歯先円内', 'bool'],
    ['green1InYellow', '緑1 も黄の歯先円内（二層時）', 'bool'],
    ['green1OuterMax', '緑1 最外点の上限半径', 'num'],
    ['grp', '配置探索 [mm]'],
    ['clrPurplePart', 'モーター ↔ P1・P3 すき間', 'num'], ['ballD', '球 直径（黄の中心）', 'num'], ['clrPurpleBall', 'モーター ↔ 球 すき間', 'num'],
    ['blueMotor', '青 歯先円 ↔ モーター 重ならない', 'bool'], ['clrBlueMotor', '青 歯先円 ↔ モーター すき間', 'num', 'blueMotor'],
    ['motorTailD', 'モーター尻 直径（モーターと同心）', 'num'], ['motorTailXMin', 'モーター尻 全体が x > ', 'num'],
    ['redXRef', '赤 現在位置 x（移動量の基準）', 'num'], ['redYRef', '赤 中心 y 基準（現在位置 y）', 'num'], ['redYTol', '赤 中心 y 許容 ±', 'num'],
    ['xbMin', '青 x 下限', 'num'], ['xbMax', '青 x 上限', 'num'], ['xbStep', '青 x 刻み', 'num'],
  ];
  const STORE_KEY = 'gearsheet.cfg.v15';

  function loadCfg() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { saved = {}; }
    return Object.assign({}, GC.DEFAULTS, saved, { ratioTolPct: 0 });
  }
  function saveCfg(cfg) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) { /* 保存不可でも動作 */ }
  }

  function buildForm(cfg) {
    const form = $('#cfgForm');
    form.innerHTML = '';
    const deps = [];
    for (const [k, label, type, dep] of FIELDS) {
      if (k === 'grp') { const d = document.createElement('div'); d.className = 'grp'; d.textContent = label; form.appendChild(d); continue; }
      const lab = document.createElement('label'); lab.textContent = label; lab.htmlFor = 'cf_' + k;
      const inp = document.createElement('input'); inp.id = 'cf_' + k; inp.dataset.k = k; inp.dataset.t = type;
      if (type === 'bool') { inp.type = 'checkbox'; inp.checked = !!cfg[k]; }
      else { inp.type = 'number'; inp.step = type === 'int' ? '1' : 'any'; inp.value = cfg[k]; }
      if (dep) { lab.classList.add('sub'); deps.push([dep, lab, inp]); }
      form.appendChild(lab); form.appendChild(inp);
    }
    // 依存項目: チェックボックスの状態に応じて表示（'!k' はオフのとき表示）
    const upd = () => {
      for (const [dep, lab, inp] of deps) {
        const neg = dep[0] === '!', on = $('#cf_' + dep.replace('!', '')).checked !== neg;
        lab.hidden = inp.hidden = !on;
      }
    };
    for (const dep of new Set(deps.map((d) => d[0].replace('!', '')))) $('#cf_' + dep).addEventListener('change', upd);
    upd();
  }
  function readForm() {
    const cfg = Object.assign({}, GC.DEFAULTS, { ratioTolPct: 0 });
    for (const inp of document.querySelectorAll('#cfgForm input')) {
      const k = inp.dataset.k, t = inp.dataset.t;
      cfg[k] = t === 'bool' ? inp.checked : t === 'int' ? parseInt(inp.value, 10) : parseFloat(inp.value);
    }
    return cfg;
  }

  // ---------------------------------------------------------------------------
  // 状態
  // ---------------------------------------------------------------------------
  // 現行設計（参考配置）: m = 1.2, 赤 12, 青 15, 緑 35（一層）, 黄 135 → 速度比 135/15 = 9（目標 15 に不一致）
  const FIG2_SET = { m1: 1.2, m2: 1.2, zr: 12, zb: 15, zg1: 35, zg2: 35, zy: 135 };
  const state = {
    cfg: loadCfg(),       // フォームの値
    runCfg: null,         // 結果を出したときの条件
    results: [], view: [], sort: [{ k: 'redMove', dir: 1 }, { k: 'minM', dir: -1 }], page: 0, perPage: 100,
    sel: null, ev: null,
    vp: { cx: 10, cy: 0, k: 4 },
    shapes: [], hover: null, meas: [], measA: null, cursor: null,
  };

  function fig2Selection() {
    // 赤を現在位置 R0 に置き, 緑 = 「原点中心 半径 a緑黄」と「R0 中心 半径 a緑赤」の交点（図2 の緑に近い方）,
    // 青 = y = blueY 上で緑から a緑青 の点（図2 の青に近い方）として組み立てる
    const cfg = state.cfg;
    const D = GC.derive(cfg, FIG2_SET);
    const ref = GC.FIG2_REFERENCE.center, R0 = [cfg.redXRef, cfg.redYRef];
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const Gs = [1, -1].map((br) => GC.greenCenter(D.aGY, D.aGR, R0[0], R0[1], br)).filter(Boolean);
    const G = Gs.sort((a, b) => near(a, ref.green) - near(b, ref.green))[0];
    const dy = cfg.blueY - G[1], w = Math.sqrt(Math.max(0, D.aGB * D.aGB - dy * dy));
    const xb = [G[0] - w, G[0] + w].sort((a, b) => Math.abs(a - ref.blue[0]) - Math.abs(b - ref.blue[0]))[0];
    const branch = near(GC.greenCenter(D.aGY, D.aGB, xb, cfg.blueY, 1) || [1e9, 1e9], G) < 1e-6 ? 1 : -1;
    const phi = Math.atan2(R0[1] - G[1], R0[0] - G[0]);
    return { s: Object.assign({}, FIG2_SET), pl: { xb, branch, phi }, zrList: null, title: '現行設計（参考, m = 1.2 / 速度比 9 のため不成立）', isRef: true };
  }

  // ---------------------------------------------------------------------------
  // 探索実行
  // ---------------------------------------------------------------------------
  let running = null;
  function runSearch() {
    if (running) return;
    const cfg = readForm();
    state.cfg = cfg; saveCfg(cfg);
    $('#hdrRatio').textContent = cfg.ratio;
    const btn = $('#btnRun'); btn.disabled = true;
    const pg = $('#progress'); pg.style.display = 'block';
    pg.querySelector('span').textContent = '歯数の組み合わせを列挙中…';
    pg.querySelector('div').style.width = '0%';
    setTimeout(() => {
      const t0 = Date.now();
      const S = GC.createSearch(cfg);
      running = S;
      const tick = () => {
        const p = S.step(40);
        pg.querySelector('div').style.width = (p * 100).toFixed(1) + '%';
        pg.querySelector('span').textContent = `配置判定 ${S.index.toLocaleString()} / ${S.total.toLocaleString()}　成立 ${S.results.length.toLocaleString()}`;
        if (!S.done) { setTimeout(tick, 0); return; }
        running = null; btn.disabled = false;
        pg.querySelector('span').textContent = `完了: 候補 ${S.total.toLocaleString()} 件 → 成立 ${S.results.length.toLocaleString()} 件（${((Date.now() - t0) / 1000).toFixed(1)} s）`;
        state.runCfg = S.cfg;
        state.results = S.results;
        state.page = 0;
        fillFilterOptions();
        applyView();
        if (state.view.length) selectResult(state.view[0]);
        // スマホ: 長い条件フォームの下にある結果表へ移動
        if (matchMedia('(max-width: 760px)').matches) $('#resTable').closest('details').scrollIntoView({ behavior: 'smooth' });
      };
      tick();
    }, 30);
  }

  // ---------------------------------------------------------------------------
  // 結果一覧
  // ---------------------------------------------------------------------------
  function fillFilterOptions() {
    for (const k of ['m1', 'm2']) {
      const sel = $(k === 'm1' ? '#fM1' : '#fM2');
      const vals = [...new Set(state.results.map((r) => r[k]))].sort((a, b) => b - a);
      sel.innerHTML = '<option value="">全て</option>' + vals.map((v) => `<option>${v}</option>`).join('');
    }
  }

  function applyView() {
    const fm1 = $('#fM1').value, fm2 = $('#fM2').value, fl = $('#fLayer').value;
    let v = state.results.filter((r) =>
      (fm1 === '' || r.m1 === +fm1) && (fm2 === '' || r.m2 === +fm2) &&
      (fl === '' || (fl === '1' ? !r.layered : r.layered)));
    // 第1・第2優先で並べ, 同順位は余裕の大きい順
    const keys = state.sort.filter((o) => o.k);
    const cmp1 = ({ k, dir }) => (a, b) => { const x = sortVal(a, k), y = sortVal(b, k); return dir * ((x > y) - (x < y)); };
    const cmps = keys.map(cmp1).concat([(a, b) => b.score - a.score]);
    v.sort((a, b) => { for (const c of cmps) { const r = c(a, b); if (r) return r; } return 0; });
    state.view = v;
    renderTable();
  }

  // 並び替えのキー（表の列 + 小さい方の m）
  const SORT_KEYS = [['minM', '小さい方の m'], ['m1', 'm1'], ['m2', 'm2'], ['zr', 'z赤'], ['zb', 'z青'], ['zg1', 'z緑1'], ['zg2', 'z緑2'], ['zy', 'z黄'],
    ['layered', '層'], ['ratioErrPct', '比誤差%'], ['yellowDf', '黄df'], ['score', '余裕'], ['redMove', '赤移動']];
  const DESC_FIRST = new Set(['minM', 'm1', 'm2', 'score']);   // 初回クリックで降順にするキー
  // 赤移動は探索の刻み（青 x 1 mm）による誤差があるので 0.1 mm 単位で比較し, 第2優先が効くようにする
  const sortVal = (r, k) => (k === 'minM' ? Math.min(r.m1, r.m2) : k === 'layered' ? +r.layered : k === 'redMove' ? Math.round(r.redMove * 10) / 10 : r[k]);

  function buildSortCtl() {
    const opts = (none) => (none ? '<option value="">なし</option>' : '') + SORT_KEYS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    $('#sortCtl').innerHTML = [0, 1].map((i) =>
      `<label>${i ? '②' : '並び替え ①'} <select id="sk${i}">${opts(i === 1)}</select></label>` +
      `<select id="sd${i}" title="昇順 / 降順"><option value="-1">降順</option><option value="1">昇順</option></select>`).join('');
    for (const i of [0, 1]) {
      $('#sk' + i).onchange = (e) => {
        const k = e.target.value;
        state.sort[i] = { k, dir: DESC_FIRST.has(k) ? -1 : 1 };
        state.page = 0; applyView();
      };
      $('#sd' + i).onchange = (e) => { state.sort[i].dir = +e.target.value; state.page = 0; applyView(); };
    }
  }
  function syncSortCtl() {
    for (const i of [0, 1]) { $('#sk' + i).value = state.sort[i].k; $('#sd' + i).value = String(state.sort[i].dir); $('#sd' + i).disabled = !state.sort[i].k; }
  }

  function renderTable() {
    const v = state.view, n = v.length, pp = state.perPage;
    const pages = Math.max(1, Math.ceil(n / pp));
    state.page = Math.min(state.page, pages - 1);
    $('#resCount').textContent = state.results.length ? `(${n.toLocaleString()} / ${state.results.length.toLocaleString()} 件)` : '';
    $('#pgInfo').textContent = `${state.page + 1} / ${pages}`;
    for (const th of document.querySelectorAll('#resTable th')) {
      const i = state.sort.findIndex((o) => o.k && o.k === th.dataset.k);
      th.classList.toggle('sorted', i >= 0);
      th.dataset.dir = i >= 0 ? (state.sort[i].dir > 0 ? ' ▲' : ' ▼') + (i ? '②' : '①') : '';
    }
    syncSortCtl();
    const rows = v.slice(state.page * pp, (state.page + 1) * pp);
    const tb = $('#resTable tbody');
    tb.innerHTML = rows.map((r, i) => {
      const sel = state.sel && state.sel.src === r ? ' class="sel"' : '';
      const zrRange = r.zrList.length > 1 ? `<span class="muted">(${r.zrList[0]}–${r.zrList[r.zrList.length - 1]})</span>` : '';
      return `<tr data-i="${state.page * pp + i}"${sel}><td>${r.m1}</td><td>${r.m2}</td><td>${r.zr}${zrRange}</td><td>${r.zb}</td><td>${r.zg1}</td><td>${r.zg2}</td><td>${r.zy}</td>` +
        `<td>${r.layered ? '二層' : '一層'}</td><td>${f3(r.ratioErrPct)}</td><td>${f2(r.yellowDf)}</td><td>${f2(r.score)}</td><td>${f2(r.redMove)}</td></tr>`;
    }).join('') || '<tr><td colspan="12" class="muted" style="text-align:center">探索実行で結果を表示</td></tr>';
  }

  function setTab(t) {
    document.body.dataset.tab = t;
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    if (t === 'center') { if (state.needFit) fit(); else draw(); }
  }

  function selectResult(r) {
    const cfg = state.runCfg;
    // 赤の移動量で並べているときは移動量最小の配置, それ以外は余裕最大の配置
    const move = state.sort[0].k === 'redMove';
    const s = { m1: r.m1, m2: r.m2, zr: move ? r.zrMove : r.zr, zb: r.zb, zg1: r.zg1, zg2: r.zg2, zy: r.zy };
    const best = GC.optimizePlacement(cfg, s, move ? r.plMove : r.pl, move ? 'move' : 'slack');
    state.sel = { s, pl: best.pl, zrList: r.zrList, src: r, title: '探索結果', isRef: false };
    renderTable();
    renderSelection(true);
  }

  // ---------------------------------------------------------------------------
  // 選択中の解: 配置操作
  // ---------------------------------------------------------------------------
  function viewCfg() { return state.sel && !state.sel.isRef && state.runCfg ? state.runCfg : state.cfg; }

  function renderPlaceCtl() {
    const sel = state.sel, cfg = viewCfg();
    const zrOpts = (sel.zrList || [sel.s.zr]).map((z) => `<option ${z === sel.s.zr ? 'selected' : ''}>${z}</option>`).join('');
    $('#placeCtl').innerHTML = `
      <label>赤 歯数</label><select id="pcZr">${zrOpts}</select><span></span>
      <label>青 x</label><input type="range" id="pcXbR" min="${cfg.xbMin}" max="${cfg.xbMax}" step="0.01" value="${sel.pl.xb}"><input type="number" id="pcXb" step="0.1" value="${f3(sel.pl.xb)}">
      <label>赤 角度°</label><input type="range" id="pcPhR" min="-180" max="180" step="0.1" value="${deg(sel.pl.phi)}"><input type="number" id="pcPh" step="1" value="${deg(sel.pl.phi).toFixed(2)}">
      <div class="full">
        <label><input type="checkbox" id="pcBr" ${sel.pl.branch > 0 ? 'checked' : ''}> 緑の分岐 +</label>
        <button id="pcOpt" type="button" class="ghost">余裕最大の配置にする</button>
        <button id="pcMove" type="button" class="ghost">赤の移動最小の配置にする</button>
      </div>`;
    const upd = (fn) => (e) => { fn(e); renderSelection(false); };
    $('#pcZr').onchange = upd((e) => { sel.s.zr = +e.target.value; });
    $('#pcXbR').oninput = upd((e) => { sel.pl.xb = +e.target.value; $('#pcXb').value = f3(sel.pl.xb); });
    $('#pcXb').onchange = upd((e) => { sel.pl.xb = +e.target.value; $('#pcXbR').value = sel.pl.xb; });
    $('#pcPhR').oninput = upd((e) => { sel.pl.phi = rad(+e.target.value); $('#pcPh').value = (+e.target.value).toFixed(2); });
    $('#pcPh').onchange = upd((e) => { sel.pl.phi = rad(+e.target.value); $('#pcPhR').value = +e.target.value; });
    $('#pcBr').onchange = upd((e) => { sel.pl.branch = e.target.checked ? 1 : -1; });
    $('#pcOpt').onclick = () => {
      const best = GC.optimizePlacement(cfg, sel.s, sel.pl);
      sel.pl = best.pl; renderSelection(true);
    };
    $('#pcMove').onclick = () => {
      const best = GC.optimizePlacement(cfg, sel.s, sel.pl, 'move');
      sel.pl = best.pl; renderSelection(true);
    };
  }

  function renderSelection(rebuildCtl) {
    const sel = state.sel, cfg = viewCfg();
    state.ev = GC.evaluate(cfg, sel.s, sel.pl);
    const ev = state.ev, D = ev.D, s = sel.s;
    const ratioOk = Math.abs(D.ratio - cfg.ratio) < 1e-9;
    const ok = ev.ok && ratioOk;
    $('#selSummary').innerHTML = `
      <div><b>${sel.title}</b> <span class="badge ${ok ? 'ok' : 'ng'}">${ok ? '成立' : '不成立'}</span></div>
      <div>構造: ${D.layered ? '緑 二層' : '緑 一層'}　m1 = ${s.m1}, m2 = ${s.m2}</div>
      <div>速度比 z緑1·z黄 / (z青·z緑2) = ${s.zg1}·${s.zy} / (${s.zb}·${s.zg2}) = <b class="${ratioOk ? '' : 'ng'}">${D.ratio.toFixed(4)}</b>（目標 ${cfg.ratio}）</div>
      <div>回転方向: 赤と青は同方向, 青と黄は逆方向</div>
      <div>最小余裕: <b>${f3(ev.minSlack)}</b> mm${sel.zrList ? `　赤 歯数の成立範囲: ${compactRanges(sel.zrList)}` : ''}</div>
      ${ev.P ? `<div>赤の移動量: <b>${f3(GC.redMove(cfg, ev.P.R))}</b> mm（現在位置 R0 (${cfg.redXRef}, ${cfg.redYRef}) から）</div>` : ''}`;
    if (rebuildCtl) renderPlaceCtl();
    renderGearTable();
    renderConsTable();
    buildScene();
    draw();
  }

  function compactRanges(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      let j = i; while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      out.push(i === j ? `${list[i]}` : `${list[i]}–${list[j]}`); i = j;
    }
    return out.join(', ');
  }

  function renderGearTable() {
    const ev = state.ev, D = ev.D, P = ev.P;
    const rows = [['R', '赤', D.R, P && P.R], ['G1', D.layered ? '緑 一層目' : '緑', D.G1, P && P.G]];
    if (D.layered) rows.push(['G2', '緑 二層目', D.G2, P && P.G]);
    rows.push(['B', '青', D.B, P && P.B], ['Y', '黄(内)', D.Y, [0, 0]]);
    $('#gearTable').innerHTML = '<tr><th>ID</th><th>m</th><th>z</th><th>d</th><th>da</th><th>df</th><th>中心 (x, y)</th></tr>' +
      rows.map(([id, nm, g, c]) => `<tr><td>${id} ${nm}</td><td>${g.m}</td><td>${g.z}</td><td>${f3(g.d)}</td><td>${f3(g.da)}</td><td>${f3(g.df)}</td><td>${c ? `${f3(c[0])}, ${f3(c[1])}` : '–'}</td></tr>`).join('') +
      `<tr><td colspan="7" class="muted" style="text-align:left">中心距離: 緑–黄 ${f3(D.aGY)} / 緑–青 ${f3(D.aGB)} / 緑–赤 ${f3(D.aGR)}</td></tr>`;
  }

  function renderConsTable() {
    const items = state.ev.items.slice().sort((a, b) => a.slack - b.slack);
    $('#consTable').innerHTML = '<tr><th>制約</th><th>余裕</th><th>備考</th></tr>' +
      items.map((it) => `<tr><td>${it.id} ${it.label}</td><td class="${it.slack >= -1e-9 ? 'ok' : 'ng'}">${f3(it.slack)}</td><td class="muted">${it.note}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------------------
  // 図: シーン構築
  // ---------------------------------------------------------------------------
  function buildScene() {
    const cfg = viewCfg(), ev = state.ev, D = ev.D, P = ev.P;
    const showTip = $('#showTip').checked, showRoot = $('#showRoot').checked;
    const shapes = [];
    const gears = [['Y', '黄', 'var(--yellow)', D.Y, [0, 0], '']];
    if (P) {
      gears.push(['G1', D.layered ? '緑 一層目' : '緑', 'var(--green)', D.G1, P.G, '']);
      // 二層目は一層目と同心なので, 少し黄みの緑で区別する
      if (D.layered) gears.push(['G2', '緑 二層目', 'var(--green2)', D.G2, P.G, '']);
      gears.push(['R', '赤', 'var(--red)', D.R, P.R, ''], ['B', '青', 'var(--blue)', D.B, P.B, '']);
    }
    for (const [id, nm, col, g, c, dash] of gears) {
      const base = [`m = ${g.m}, z = ${g.z}${g.internal ? '（内歯車）' : ''}`];
      shapes.push({ kind: 'circle', id: id + '.d', name: nm + ' 基準円', c, r: g.d / 2, color: col, width: 2, dash, info: base });
      if (showTip) shapes.push({ kind: 'circle', id: id + '.da', name: nm + ' 歯先円', c, r: g.da / 2, color: col, width: 1, dash: '6 4', info: base });
      if (showRoot) shapes.push({ kind: 'circle', id: id + '.df', name: nm + ' 歯底円', c, r: g.df / 2, color: col, width: 1, dash: '2 3', info: base });
      if (id !== 'G2') shapes.push({ kind: 'point', id: id + '.c', name: nm + ' 中心', p: c, color: col, draw: true });
    }
    if (P && D.layered) shapes.push({ kind: 'circle', id: 'B.shaft', name: '青 軸', c: P.B, r: cfg.blueShaftD / 2, color: 'var(--blue)', width: 1, dash: '', info: [cfg.redBlueTip ? '赤 ↔ 青は歯先円同士で判定中' : '二層時は赤の歯先円とこの軸で干渉判定'] });
    shapes.push({ kind: 'circle', id: 'BR', name: '茶円', c: [0, 0], r: cfg.brownD / 2, color: 'var(--brown)', width: 1.5, dash: '', info: ['黄と同心'] });
    shapes.push({ kind: 'circle', id: 'BL', name: '球', c: [0, 0], r: cfg.ballD / 2, color: 'var(--brown)', width: 1.5, dash: '', info: ['黄の中心にある球（投影）'] });
    if (P) shapes.push({ kind: 'circle', id: 'PU', name: 'モーター（紫円）', c: P.R, r: cfg.purpleD / 2, color: 'var(--purple)', width: 1.5, dash: '', info: ['赤と同心'] });
    if (P) shapes.push({ kind: 'circle', id: 'MT', name: 'モーター尻', c: P.R, r: cfg.motorTailD / 2, color: 'var(--purple)', width: 1, dash: '5 3', info: ['モーターと同心', `円全体が x > ${cfg.motorTailXMin}（ローラー固定のアルミ板との干渉防止）`] });
    shapes.push({ kind: 'vline', id: 'L.mt', name: 'モーター尻の制限線', x: cfg.motorTailXMin, color: 'var(--purple)' });
    for (const part of GC.PARTS) {
      shapes.push({ kind: 'poly', id: part.id, name: part.name, pts: part.poly, color: 'var(--part)', info: part.purpleOnly ? ['モーター（紫円）とだけ干渉判定'] : [] });
      part.poly.forEach((p, i) => shapes.push({ kind: 'point', id: `${part.id}.v${i}`, name: part.name + ' 頂点', p, color: 'var(--part)', draw: false }));
    }
    shapes.push({ kind: 'point', id: 'R0', name: '赤 現在位置（移動量の基準）', p: [cfg.redXRef, cfg.redYRef], color: 'var(--red)', draw: true });
    shapes.push({ kind: 'hline', id: 'L.by', name: '青中心 y', y: cfg.blueY, color: 'var(--muted)' });
    state.shapes = shapes;
  }

  // ---------------------------------------------------------------------------
  // 図: 描画
  // ---------------------------------------------------------------------------
  const svg = $('#view');
  const size = () => { const r = svg.getBoundingClientRect(); return [r.width, r.height]; };
  const toS = (p) => { const [W, H] = size(); return [W / 2 + (p[0] - state.vp.cx) * state.vp.k, H / 2 - (p[1] - state.vp.cy) * state.vp.k]; };
  const toW = (sx, sy) => { const [W, H] = size(); return [state.vp.cx + (sx - W / 2) / state.vp.k, state.vp.cy - (sy - H / 2) / state.vp.k]; };

  function fit() {
    const [W, H] = size();
    state.needFit = !(W > 0 && H > 0);   // 非表示中（スマホのタブ切替前）は表示時に合わせ直す
    if (state.needFit) return;
    const r = state.ev ? state.ev.D.Y.df / 2 + 4 : 90;
    state.vp = { cx: 0, cy: 0, k: Math.min(W, H) / (2 * r) };
    draw();
  }

  function shapeSvg(sh, extraCls) {
    const k = state.vp.k;
    const cls = extraCls ? ` class="${extraCls}"` : '';
    if (sh.kind === 'circle') {
      const [x, y] = toS(sh.c);
      return `<circle${cls} cx="${x}" cy="${y}" r="${sh.r * k}" style="stroke:${extraCls ? '' : sh.color}" stroke-width="${sh.width}" ${sh.dash ? `stroke-dasharray="${sh.dash}"` : ''} fill="none"/>`;
    }
    if (sh.kind === 'poly') {
      const pts = sh.pts.map((p) => toS(p).join(',')).join(' ');
      return `<polygon${cls} points="${pts}" style="stroke:${extraCls ? '' : sh.color};fill:${extraCls ? 'none' : sh.color}" fill-opacity="0.25" stroke-width="1.5"/>`;
    }
    if (sh.kind === 'point') {
      if (!sh.draw && !extraCls) return '';
      const [x, y] = toS(sh.p);
      return `<rect${cls} x="${x - 3}" y="${y - 3}" width="6" height="6" style="fill:${extraCls ? 'none' : sh.color};stroke:${extraCls ? '' : 'var(--fg)'}" stroke-width="${extraCls ? 2 : 0.5}"/>`;
    }
    if (sh.kind === 'hline') {
      const [W] = size(); const [, y] = toS([0, sh.y]);
      return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" style="stroke:${sh.color}" stroke-width="0.75" stroke-dasharray="4 4"/>`;
    }
    if (sh.kind === 'vline') {
      const [, H] = size(); const [x] = toS([sh.x, 0]);
      return `<line${cls} x1="${x}" x2="${x}" y1="0" y2="${H}" style="stroke:${extraCls ? '' : sh.color}" stroke-width="${extraCls ? 2 : 1}" stroke-dasharray="6 4"/>`;
    }
    return '';
  }

  function draw() {
    if (!state.ev) return;
    const out = [];
    // 背景画像
    const bg = $('#bgSel').value;
    if (bg) {
      const F = GC.FIGURES[bg], S = F.s || GC.PX_PER_MM;
      const [x0, y0] = toS([-F.cx / S, F.cy / S]);
      out.push(`<image href="${F.src}" x="${x0}" y="${y0}" width="${(F.w / S) * state.vp.k}" height="${(F.h / S) * state.vp.k}" opacity="${$('#bgOp').value}" preserveAspectRatio="none"/>`);
    }
    // 原点軸
    const [W, H] = size(), [ox, oy] = toS([0, 0]);
    out.push(`<line x1="0" x2="${W}" y1="${oy}" y2="${oy}" style="stroke:var(--grid)"/><line y1="0" y2="${H}" x1="${ox}" x2="${ox}" style="stroke:var(--grid)"/>`);
    for (const sh of state.shapes) out.push(shapeSvg(sh));
    // ラベル
    if ($('#showLabels').checked && state.ev.P) {
      const P = state.ev.P;
      for (const [p, t] of [[[0, 0], '黄 Y'], [P.G, 'G 緑'], [P.R, 'R 赤'], [P.B, 'B 青'], [[viewCfg().redXRef, viewCfg().redYRef], 'R0']]) {
        const [x, y] = toS(p); out.push(`<text class="lbl" x="${x + 6}" y="${y - 6}">${t}</text>`);
      }
      for (const part of GC.PARTS) {
        const c = part.poly.reduce((a, p) => [a[0] + p[0] / part.poly.length, a[1] + p[1] / part.poly.length], [0, 0]);
        const [x, y] = toS(c); out.push(`<text class="lbl" x="${x}" y="${y}" text-anchor="middle">${part.id}</text>`);
      }
    }
    // ホバー強調
    if (state.hover) out.push(shapeSvg(state.hover.shape, 'hl'));
    // 計測
    const measLine = (a, b, pending) => {
      const [x1, y1] = toS(a), [x2, y2] = toS(b);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let s = `<line class="meas" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="1.5" ${pending ? 'stroke-dasharray="4 3"' : ''}/>` +
        `<circle class="meas" cx="${x1}" cy="${y1}" r="3"/><circle class="meas" cx="${x2}" cy="${y2}" r="3"/>`;
      s += `<text class="lbl" x="${(x1 + x2) / 2 + 6}" y="${(y1 + y2) / 2 - 6}">L = ${f3(L)} mm (Δx ${f3(b[0] - a[0])}, Δy ${f3(b[1] - a[1])})</text>`;
      return s;
    };
    for (const m of state.meas) out.push(measLine(m.a, m.b, false));
    if (state.measA && state.cursor) out.push(measLine(state.measA, state.cursor.p, true));
    else if (state.measA) { const [x, y] = toS(state.measA); out.push(`<circle class="meas" cx="${x}" cy="${y}" r="3"/>`); }
    svg.innerHTML = out.join('');
  }

  // ---------------------------------------------------------------------------
  // ヒットテスト（ホバー・吸着共通）
  // ---------------------------------------------------------------------------
  function hitTest(sx, sy) {
    const w = toW(sx, sy), k = state.vp.k;
    let best = null;
    const consider = (h, dpx, prio) => { if (!best || prio < best.prio || (prio === best.prio && dpx < best.dpx)) best = Object.assign(h, { dpx, prio }); };
    for (const sh of state.shapes) {
      if (sh.kind === 'point') {
        const d = Math.hypot(sh.p[0] - w[0], sh.p[1] - w[1]) * k;
        if (d <= 8 * hitScale) consider({ shape: sh, type: 'point', p: sh.p }, d, 0);
      } else if (sh.kind === 'circle') {
        const dx = w[0] - sh.c[0], dy = w[1] - sh.c[1], rr = Math.hypot(dx, dy) || 1e-9;
        const d = Math.abs(rr - sh.r) * k;
        if (d <= 6 * hitScale) consider({ shape: sh, type: 'edge', p: [sh.c[0] + (dx / rr) * sh.r, sh.c[1] + (dy / rr) * sh.r] }, d, 1);
      } else if (sh.kind === 'vline') {
        const d = Math.abs(w[0] - sh.x) * k;
        if (d <= 6 * hitScale) consider({ shape: sh, type: 'edge', p: [sh.x, w[1]] }, d, 1);
      } else if (sh.kind === 'poly') {
        const pd = GC.polyDist(w[0], w[1], sh.pts);
        const d = Math.abs(pd.d) * k;
        if (d <= 6 * hitScale) consider({ shape: sh, type: 'edge', p: [pd.qx, pd.qy] }, d, 1);
        else if (pd.d < 0) consider({ shape: sh, type: 'inside', p: w }, 0, 2);
      }
    }
    return best;
  }

  function tooltipHtml(h) {
    const sh = h.shape, p = h.p;
    const lines = [`<b>${sh.id}　${sh.name}</b>`];
    if (sh.kind === 'point') lines.push(`座標 (${f3(p[0])}, ${f3(p[1])})`);
    if (sh.kind === 'vline') lines.push(`x = ${f3(sh.x)}（モーター尻の円はこの線より右）`, `線上の点 (${f3(p[0])}, ${f3(p[1])})`);
    if (sh.id === 'R0' && state.ev && state.ev.P) lines.push(`赤中心までの移動量 ${f3(GC.redMove(viewCfg(), state.ev.P.R))}`);
    if (sh.kind === 'circle') {
      lines.push(...(sh.info || []));
      lines.push(`直径 φ${f3(sh.r * 2)}（半径 ${f3(sh.r)}）`);
      lines.push(`中心 (${f3(sh.c[0])}, ${f3(sh.c[1])})`);
      lines.push(`円周上の点 (${f3(p[0])}, ${f3(p[1])})`);
    }
    if (sh.kind === 'poly') {
      lines.push(...(sh.info || []));
      const xs = sh.pts.map((q) => q[0]), ys = sh.pts.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      lines.push(`外形 ${f3(x1 - x0)} × ${f3(y1 - y0)}`);
      lines.push(`範囲 x [${f3(x0)}, ${f3(x1)}]　y [${f3(y0)}, ${f3(y1)}]`);
      lines.push(`${h.type === 'inside' ? 'カーソル' : '輪郭上の点'} (${f3(p[0])}, ${f3(p[1])})`);
    }
    return lines.join('<br>');
  }

  // ---------------------------------------------------------------------------
  // マウス・タッチ操作
  // ---------------------------------------------------------------------------
  const tip = $('#tooltip');
  const pts = new Map();     // 押下中のポインタ（タッチのピンチ用）
  let drag = null, pinch = null, press = null, lastTouch = 0;

  function localXY(e) { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  // 吸着・ホバーの許容幅はタッチで広げる
  let hitScale = 1;
  function hitAt(sx, sy, touch) { hitScale = touch ? 2.5 : 1; const h = hitTest(sx, sy); hitScale = 1; return h; }

  function showTip(h, sx, sy) {
    if (!h) { tip.style.display = 'none'; return; }
    tip.innerHTML = tooltipHtml(h);
    tip.style.display = 'block';
    const wrap = svg.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(sx + 14, wrap.width - tw - 4)) + 'px';
    tip.style.top = Math.max(4, sy + 14 + th > wrap.height ? sy - th - 10 : sy + 14) + 'px';
  }

  function setCursor(w, p) {
    state.cursor = { p };
    $('#cursorPos').textContent = `x: ${f3(w[0])}　y: ${f3(w[1])}` + (state.measA ? `　計測中: L = ${f3(Math.hypot(p[0] - state.measA[0], p[1] - state.measA[1]))}` : '');
  }

  // 計測点の追加（右クリック・長押し・計測モードのタップ）
  function addMeasPoint(sx, sy, noSnap, touch) {
    const h = noSnap ? null : hitAt(sx, sy, touch);
    const p = h && h.type !== 'inside' ? h.p.slice() : toW(sx, sy);
    if (!state.measA) state.measA = p;
    else if (Math.hypot(p[0] - state.measA[0], p[1] - state.measA[1]) > 1e-9) { state.meas.push({ a: state.measA, b: p }); state.measA = null; }
    setCursor(p, p);
    draw();
  }

  function zoomAt(sx, sy, f) {
    const w = toW(sx, sy);
    state.vp.k = Math.min(400, Math.max(0.5, state.vp.k * f));
    const w2 = toW(sx, sy);
    state.vp.cx += w[0] - w2[0]; state.vp.cy += w[1] - w2[1];
  }

  const measMode = () => $('#measMode').checked;

  svg.addEventListener('pointerdown', (e) => {
    const touch = e.pointerType !== 'mouse';
    if (touch) lastTouch = Date.now();
    if (!touch && e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    const [sx, sy] = localXY(e);
    pts.set(e.pointerId, [sx, sy]);
    if (pts.size === 2) {
      // ピンチ開始: ドラッグ・タップ・長押しを取り消し
      clearTimeout(press && press.timer); press = null; drag = null;
      const [p1, p2] = [...pts.values()];
      pinch = { d: Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) || 1, m: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] };
      return;
    }
    if (pts.size > 2) return;
    drag = { x: e.clientX, y: e.clientY, cx: state.vp.cx, cy: state.vp.cy, moved: false };
    press = { sx, sy, touch, shift: e.shiftKey, long: false, timer: null };
    if (touch) {
      press.timer = setTimeout(() => {
        // 長押し = 右クリック相当（計測点）
        if (!press || drag.moved) return;
        press.long = true;
        if (navigator.vibrate) navigator.vibrate(15);
        addMeasPoint(sx, sy, false, true);
      }, 500);
    }
  });

  function endPointer(e) {
    pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) pinch = null; drag = null; press = null; return; }
    if (press) {
      clearTimeout(press.timer);
      if (!press.long && drag && !drag.moved) {
        // タップ / クリック
        if (measMode()) addMeasPoint(press.sx, press.sy, press.shift, press.touch);
        else if (press.touch) {
          const h = hitAt(press.sx, press.sy, true);
          state.hover = h;
          setCursor(toW(press.sx, press.sy), h && h.type !== 'inside' ? h.p : toW(press.sx, press.sy));
          showTip(h, press.sx, press.sy);
          draw();
        }
      }
    }
    press = null; drag = null;
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  svg.addEventListener('pointermove', (e) => {
    const [sx, sy] = localXY(e);
    const touch = e.pointerType !== 'mouse';
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [sx, sy]);
    if (pinch && pts.size >= 2) {
      const [p1, p2] = [...pts.values()];
      const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) || 1, m = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      state.vp.cx -= (m[0] - pinch.m[0]) / state.vp.k;
      state.vp.cy += (m[1] - pinch.m[1]) / state.vp.k;
      zoomAt(m[0], m[1], d / pinch.d);
      pinch = { d, m };
      tip.style.display = 'none';
      draw();
      return;
    }
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > (touch ? 8 : 3)) {
        drag.moved = true;
        if (press) clearTimeout(press.timer);
      }
      if (drag.moved) {
        state.vp.cx = drag.cx - (e.clientX - drag.x) / state.vp.k;
        state.vp.cy = drag.cy + (e.clientY - drag.y) / state.vp.k;
      }
    }
    if (touch) {
      // タッチはホバーなし（タップで表示）。ドラッグ中はツールチップを隠す
      if (drag && drag.moved) { tip.style.display = 'none'; state.hover = null; draw(); }
      return;
    }
    const w = toW(sx, sy);
    const h = drag && drag.moved ? null : hitTest(sx, sy);
    state.hover = h;
    setCursor(w, !e.shiftKey && h && h.type !== 'inside' ? h.p : w);
    showTip(h, sx, sy);
    draw();
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.hover = null; tip.style.display = 'none'; draw();
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = localXY(e);
    zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
    draw();
  }, { passive: false });

  // 右クリック: 2 点間距離（タッチ由来の contextmenu は長押しで処理済みなので無視）
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (Date.now() - lastTouch < 1500) return;
    const [sx, sy] = localXY(e);
    addMeasPoint(sx, sy, e.shiftKey, false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { state.measA = null; draw(); }
  });

  new ResizeObserver(() => draw()).observe(svg);

  // ---------------------------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 共有リンク: 条件（全項目）と選択中の解・配置を URL の # に入れる
  // ---------------------------------------------------------------------------
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));

  function shareUrl() {
    const cfg = state.sel && !state.sel.isRef ? viewCfg() : readForm();
    // 既定値が将来変わっても同じ結果になるよう, 条件は全項目を入れる
    const c = {};
    for (const k of Object.keys(GC.DEFAULTS)) c[k] = cfg[k];
    const o = { v: 1, c, bg: $('#bgSel').value };
    if (state.sel && !state.sel.isRef) {
      const pl = state.sel.pl;
      o.s = state.sel.s;
      o.pl = { xb: +pl.xb.toFixed(4), branch: pl.branch, phi: +pl.phi.toFixed(6) };
      if (state.sel.zrList) o.zr = state.sel.zrList;
    }
    return location.origin + location.pathname + '#share=' + b64e(JSON.stringify(o));
  }

  async function copyShare() {
    const url = shareUrl(), msg = $('#shareMsg'), box = $('#shareUrl');
    box.value = url;
    // スマホは OS の共有シート（LINE・メールなど）を使う
    if (navigator.share && matchMedia('(hover: none)').matches) {
      try { await navigator.share({ title: document.title, url }); msg.textContent = ''; return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      msg.textContent = 'リンクをコピーしました' + (state.sel && !state.sel.isRef ? '（条件 + 選択中の解）' : '（条件のみ）');
      box.style.display = 'none';
    } catch (e) {
      msg.textContent = '下のリンクをコピーしてください';
      box.style.display = 'block'; box.select();
    }
  }

  // 起動時に # の共有データを読み込む。成功したら true
  function loadShare() {
    const m = location.hash.match(/^#share=([A-Za-z0-9_-]+)$/);
    if (!m) return false;
    let o;
    try { o = JSON.parse(b64d(m[1])); } catch (e) { alert('共有リンクを読み込めませんでした'); return false; }
    state.cfg = Object.assign({}, GC.DEFAULTS, o.c || {}, { ratioTolPct: 0 });
    saveCfg(state.cfg);
    buildForm(state.cfg);
    if (o.bg !== undefined && (o.bg === '' || GC.FIGURES[o.bg])) $('#bgSel').value = o.bg;
    if (o.s && o.pl) {
      state.runCfg = state.cfg;
      state.sel = { s: o.s, pl: o.pl, zrList: o.zr || null, src: null, title: '共有された解', isRef: false };
    }
    // 読み込み後は # を消す（再読み込みで手元の変更が上書きされないように）
    history.replaceState(null, '', location.pathname + location.search);
    return !!state.sel;
  }

  // ---------------------------------------------------------------------------
  // 列幅の変更（PC: 列の境界をドラッグ, ダブルクリックで既定に戻す）
  // ---------------------------------------------------------------------------
  const WIDTH_KEY = 'gearsheet.widths';
  const W_DEF = { L: 360, R: 340 };
  function applyWidths(w) {
    const main = $('main');
    main.style.setProperty('--wL', w.L + 'px');
    main.style.setProperty('--wR', w.R + 'px');
  }
  function initSplitters() {
    let w = Object.assign({}, W_DEF);
    try { Object.assign(w, JSON.parse(localStorage.getItem(WIDTH_KEY) || '{}')); } catch (e) { /* 既定値 */ }
    applyWidths(w);
    const save = () => { try { localStorage.setItem(WIDTH_KEY, JSON.stringify(w)); } catch (e) { /* 保存不可 */ } };
    for (const sp of document.querySelectorAll('.splitter')) {
      const side = sp.dataset.side;
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sp.setPointerCapture(e.pointerId);
        sp.classList.add('drag'); document.body.classList.add('resizing');
        const x0 = e.clientX, w0 = w[side];
        const total = $('main').getBoundingClientRect().width;
        const move = (ev) => {
          const dx = ev.clientX - x0;
          const other = side === 'L' ? w.R : w.L;
          // 各列 180px 以上, 図は 200px 以上を残す
          w[side] = Math.round(Math.max(180, Math.min(total - other - 200 - 12, w0 + (side === 'L' ? dx : -dx))));
          applyWidths(w);
        };
        const up = () => {
          sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up);
          sp.classList.remove('drag'); document.body.classList.remove('resizing');
          save();
        };
        sp.addEventListener('pointermove', move);
        sp.addEventListener('pointerup', up);
      });
      sp.addEventListener('dblclick', () => { w[side] = W_DEF[side]; applyWidths(w); save(); });
    }
    // ウィンドウが狭くなったら図の幅を残すよう表示上だけ縮める（保存値は変えない）
    const fitToWindow = () => {
      const total = $('main').getBoundingClientRect().width, over = w.L + w.R + 212 - total;
      if (over <= 0) { applyWidths(w); return; }
      const k = Math.max(0, (w.L + w.R - over) / (w.L + w.R));
      applyWidths({ L: Math.max(180, Math.round(w.L * k)), R: Math.max(180, Math.round(w.R * k)) });
    };
    window.addEventListener('resize', fitToWindow);
    fitToWindow();
  }

  function init() {
    initSplitters();
    buildForm(state.cfg);
    $('#hdrRatio').textContent = state.cfg.ratio;
    const bgSel = $('#bgSel');
    for (const [k, F] of Object.entries(GC.FIGURES)) bgSel.insertAdjacentHTML('beforeend', `<option value="${k}">${F.label}</option>`);
    $('#btnRun').onclick = runSearch;
    $('#btnReset').onclick = () => { state.cfg = Object.assign({}, GC.DEFAULTS); saveCfg(state.cfg); buildForm(state.cfg); };
    $('#btnFit').onclick = fit;
    $('#btnClearMeas').onclick = () => { state.meas = []; state.measA = null; draw(); };
    // スマホ: 下部タブで 条件・結果 / 図 / 詳細 を切替
    for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => setTab(b.dataset.tab);
    setTab('left');
    for (const id of ['#bgSel', '#bgOp']) $(id).oninput = draw;
    for (const id of ['#showTip', '#showRoot', '#showLabels']) $(id).onchange = () => { buildScene(); draw(); };
    for (const id of ['#fM1', '#fM2', '#fLayer']) $(id).onchange = () => { state.page = 0; applyView(); };
    for (const th of document.querySelectorAll('#resTable th')) {
      // クリック: 第1優先（同じ列なら昇降切替）, Shift+クリック: 第2優先
      th.onclick = (e) => {
        const k = th.dataset.k, i = e.shiftKey ? 1 : 0, cur = state.sort[i];
        if (cur.k === k) cur.dir = -cur.dir;
        else {
          if (i === 0 && state.sort[1].k === k) state.sort[1] = { k: state.sort[0].k, dir: state.sort[0].dir };
          state.sort[i] = { k, dir: DESC_FIRST.has(k) ? -1 : 1 };
        }
        state.page = 0; applyView();
      };
    }
    $('#resTable tbody').onclick = (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      // スマホでは行を選ぶと図タブへ
      if (matchMedia('(max-width: 760px)').matches) setTab('center');
      selectResult(state.view[+tr.dataset.i]);
    };
    $('#pgPrev').onclick = () => { state.page = Math.max(0, state.page - 1); renderTable(); };
    $('#pgNext').onclick = () => { state.page++; renderTable(); };

    $('#btnShare').onclick = copyShare;
    buildSortCtl();

    $('#bgSel').value = 'fig2';
    if (!loadShare()) state.sel = fig2Selection();
    else if (matchMedia('(max-width: 760px)').matches) setTab('center');
    renderTable();
    renderSelection(true);
    fit();
  }
  init();
})();
