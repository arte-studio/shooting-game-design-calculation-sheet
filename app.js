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
    ['yellowRootMax', '黄 歯底円直径 上限', 'num'], ['blueY', '青 中心 y', 'num'], ['purpleD', '紫円 直径', 'num'], ['brownD', '茶円 直径', 'num'],
    ['grp', 'すき間 [mm]'],
    ['clrPart', '歯先円 ↔ 水色部品', 'num'], ['clrGear', '歯先円 ↔ 歯先円・軸', 'num'],
    ['redBlueTip', '赤 ↔ 青 歯先円を干渉させない（二層時も）', 'bool'],
    ['blueShaftD', '青 軸径（上をオフ時の赤↔青判定）', 'num'],
    ['checkCrossLayer', '赤・青 が黄の歯先円内', 'bool'],
    ['green1InYellow', '緑1 も黄の歯先円内（二層時）', 'bool'],
    ['green1OuterMax', '緑1 最外点の上限半径', 'num'],
    ['grp', '配置探索 [mm]'],
    ['clrPurplePart', '紫円 ↔ P1・P3 すき間', 'num'], ['ballD', '球 直径（黄の中心）', 'num'], ['clrPurpleBall', '紫円 ↔ 球 すき間', 'num'],
    ['redXRef', '赤 現在位置 x（移動量の基準）', 'num'], ['redYRef', '赤 中心 y 基準（現在位置 y）', 'num'], ['redYTol', '赤 中心 y 許容 ±', 'num'],
    ['xbMin', '青 x 下限', 'num'], ['xbMax', '青 x 上限', 'num'], ['xbStep', '青 x 刻み', 'num'],
  ];
  const STORE_KEY = 'gearsheet.cfg.v10';

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
    for (const [k, label, type] of FIELDS) {
      if (k === 'grp') { const d = document.createElement('div'); d.className = 'grp'; d.textContent = label; form.appendChild(d); continue; }
      const lab = document.createElement('label'); lab.textContent = label; lab.htmlFor = 'cf_' + k;
      const inp = document.createElement('input'); inp.id = 'cf_' + k; inp.dataset.k = k; inp.dataset.t = type;
      if (type === 'bool') { inp.type = 'checkbox'; inp.checked = !!cfg[k]; }
      else { inp.type = 'number'; inp.step = type === 'int' ? '1' : 'any'; inp.value = cfg[k]; }
      form.appendChild(lab); form.appendChild(inp);
    }
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
  const FIG2_SET = { m1: 0.6, m2: 0.6, zr: 24, zb: 30, zg1: 70, zg2: 70, zy: 270 };
  const state = {
    cfg: loadCfg(),       // フォームの値
    runCfg: null,         // 結果を出したときの条件
    results: [], view: [], sort: { k: 'default', dir: -1 }, page: 0, perPage: 100,
    sel: null, ev: null,
    vp: { cx: 10, cy: 0, k: 4 },
    shapes: [], hover: null, meas: [], measA: null, cursor: null,
  };

  function fig2Selection() {
    const cfg = state.cfg;
    const D = GC.derive(cfg, FIG2_SET);
    const ref = GC.FIG2_REFERENCE.center;
    const xb = ref.blue[0];
    let branch = 1, G = GC.greenCenter(D.aGY, D.aGB, xb, cfg.blueY, 1);
    const G2 = GC.greenCenter(D.aGY, D.aGB, xb, cfg.blueY, -1);
    if (G && G2 && Math.hypot(G2[0] - ref.green[0], G2[1] - ref.green[1]) < Math.hypot(G[0] - ref.green[0], G[1] - ref.green[1])) { branch = -1; G = G2; }
    const phi = Math.atan2(ref.red[1] - G[1], ref.red[0] - G[0]);
    return { s: Object.assign({}, FIG2_SET), pl: { xb, branch, phi }, zrList: null, title: '図2 の配置（参考, m=0.6 と仮定 / 比 9 のため不成立）', isRef: true };
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
    const { k, dir } = state.sort;
    if (k === 'default') v.sort((a, b) => Math.min(b.m1, b.m2) - Math.min(a.m1, a.m2) || b.score - a.score);
    else v.sort((a, b) => dir * ((a[k] > b[k]) - (a[k] < b[k])) || b.score - a.score);
    state.view = v;
    renderTable();
  }

  function renderTable() {
    const v = state.view, n = v.length, pp = state.perPage;
    const pages = Math.max(1, Math.ceil(n / pp));
    state.page = Math.min(state.page, pages - 1);
    $('#resCount').textContent = state.results.length ? `(${n.toLocaleString()} / ${state.results.length.toLocaleString()} 件)` : '';
    $('#pgInfo').textContent = `${state.page + 1} / ${pages}`;
    for (const th of document.querySelectorAll('#resTable th')) {
      const on = th.dataset.k === state.sort.k;
      th.classList.toggle('sorted', on);
      th.dataset.dir = on ? (state.sort.dir > 0 ? ' ▲' : ' ▼') : '';
    }
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
    const move = state.sort.k === 'redMove';
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
      if (D.layered) gears.push(['G2', '緑 二層目', 'var(--green)', D.G2, P.G, '9 3 2 3']);
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
    if (P) shapes.push({ kind: 'circle', id: 'PU', name: '紫円', c: P.R, r: cfg.purpleD / 2, color: 'var(--purple)', width: 1.5, dash: '', info: ['赤と同心'] });
    for (const part of GC.PARTS) {
      shapes.push({ kind: 'poly', id: part.id, name: part.name, pts: part.poly, color: 'var(--part)', info: part.purpleOnly ? ['紫円（モーター）とだけ干渉判定'] : [] });
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
  // 共有リンク: 条件（既定値との差分）と選択中の解・配置を URL の # に入れる
  // ---------------------------------------------------------------------------
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));

  function shareUrl() {
    const cfg = state.sel && !state.sel.isRef ? viewCfg() : readForm();
    const c = {};
    for (const k of Object.keys(GC.DEFAULTS)) if (cfg[k] !== GC.DEFAULTS[k]) c[k] = cfg[k];
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

  function init() {
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
      th.onclick = () => {
        const k = th.dataset.k;
        state.sort = state.sort.k === k ? { k, dir: -state.sort.dir } : { k, dir: k === 'score' || k === 'm1' || k === 'm2' ? -1 : 1 };
        applyView();
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

    $('#bgSel').value = 'fig2';
    if (!loadShare()) state.sel = fig2Selection();
    else if (matchMedia('(max-width: 760px)').matches) setTab('center');
    renderTable();
    renderSelection(true);
    fit();
  }
  init();
})();
