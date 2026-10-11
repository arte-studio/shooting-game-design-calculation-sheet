/*
 * 歯車列 探索コア（ブラウザ / Node 共通）
 *   座標: 黄歯車中心 = 原点, +x 右, +y 上, 単位 mm
 *   歯車: 赤(R)=駆動, 緑(G1/G2)=中間, 青(B)=出力1, 黄(Y)=出力2(内歯車)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GearCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 図から読み取った形状
  // ---------------------------------------------------------------------------

  // 縮尺: 図2 の黄基準円 φ162 が半径 531 px → 6.5556 px/mm（図2・図3・図4 共通）
  const PX_PER_MM = 531 / 81;

  // 図3 の水色部品（輪郭をピクセル抽出 → mm 変換, 精度 ±0.15 mm 程度）
  const PARTS = [
    {
      id: 'P1', name: '水色部品（レバー）',
      poly: [[-12.57, -1.07], [-12.57, -11.59], [-11.5, -10.68], [-10.43, -8.24], [-9.52, -7.32], [-8.3, -6.86], [-6.62, -7.02], [-4.79, -7.78], [-3.72, -9.0], [-3.72, -14.34], [3.45, -14.34], [3.45, -10.22], [5.58, -9.92], [5.89, -7.93], [6.65, -7.17], [7.57, -6.86], [8.94, -7.02], [9.7, -7.47], [10.62, -8.54], [11.53, -10.68], [12.45, -11.59], [13.67, -12.2], [15.35, -12.2], [16.72, -11.59], [17.63, -10.68], [18.24, -9.31], [18.24, -7.78], [17.48, -6.25], [12.14, -0.61], [6.8, 6.1], [4.97, 7.63], [2.68, 8.69], [1.31, 9.0], [-1.28, 9.0], [-3.11, 8.54], [-5.25, 7.47], [-5.71, 7.02], [-5.71, 6.56], [-7.23, 5.03], [-8.76, 3.05], [-9.37, 2.9]],
    },
    {
      id: 'P2', name: '水色部品（箱）',
      poly: [[10.09, -32.11], [10.09, -42.18], [20.15, -42.18], [20.15, -32.11]],
    },
  ];

  // 背景画像の配置（画像ピクセル → mm）: x = (px - cx)/S, y = -(py - cy)/S
  const FIGURES = {
    fig3: { src: 'figures/fig3_cad_front.png', w: 1614, h: 1210, cx: 808.4, cy: 605.0, label: '図3 CAD正面図' },
    fig2: { src: 'figures/fig2_failed_layout.png', w: 1306, h: 1242, cx: 653.1, cy: 621.2, label: '図2 不成立配置' },
    fig4: { src: 'figures/fig4_red_layout.png', w: 1306, h: 1242, cx: 653.1, cy: 621.2, label: '図4 赤の配置' },
  };

  // 図2 の配置（参考, 読み取り値）
  const FIG2_REFERENCE = {
    d: { red: 14.4, blue: 18, green: 42, yellow: 162 },
    center: { red: [39.05, 3.13], blue: [27.15, -21.96], green: [57.13, -18.84] },
  };

  const DEFAULTS = {
    ratio: 15,              // n_青 / n_黄
    ratioTolPct: 0,         // 比の許容誤差 [%]
    // 3Dプリント前提でモジュールは任意 → 下限〜上限を刻みで走査
    modMin: 1.0,            // 1 以上が望ましい（0.5 以上必須。0.5 まで下げると探索は数分）
    modMax: 2.0,
    modStep: 0.05,
    allowTwoLayer: true,    // 緑を二層構造にしてよいか
    pressureAngleDeg: 20,
    addendum: 1.0,          // 歯末の丈係数
    dedendum: 1.25,         // 歯元の丈係数
    zMin: 17,               // 強度上の最小歯数
    zMaxRed: 60,
    zMaxBlue: 100,
    zMaxGreen: 200,
    internalMinDiff: 10,    // 黄 − 緑二層目 の最小歯数差
    yellowRootMax: 172,     // 黄 歯底円直径 上限
    blueY: -22,
    purpleD: 32,
    brownD: 112,
    clrPart: 0.5,           // 歯先円 ↔ 水色部品 の最小すき間
    clrGear: 0.5,           // かみ合わない歯車同士の歯先円の最小すき間
    blueShaftD: 8,          // 青の軸径（二層構造時は赤 ↔ 青軸 で判定）
    checkCrossLayer: true,  // 赤・青の歯先円が黄の歯先円（内側）に収まるか
    green1InYellow: false,  // 二層時, 緑一層目の歯先円も黄の歯先円内に収めるか（false: 別の面なので外に出てよい）
    green1OuterMax: 90,     // 緑一層目 歯先の最外点の上限半径（外周ホイール 外径 φ179.8 相当）
    xbMin: 27,              // 青 中心 x の下限（図2 の青の位置 x≈27 より右）
    xbMax: 80,
    xbStep: 1.0,
    redYRef: 3.15,          // 赤 中心 y の基準（図2・図4 の赤の現在位置 (39.1, 3.15)）
    redYTol: 8,             // 赤 中心 y の許容幅 ±（基準からの相対）
    clrPurpleP1: 0,         // 紫円 ↔ P1（レバー）の最小すき間（被らなければよい）
    ballD: 27,              // 黄の中心にある球の直径。紫円と干渉させない
    clrPurpleBall: 0.5,     // 紫円 ↔ 球 の最小すき間
    maxResults: 200000,
  };

  // ---------------------------------------------------------------------------
  // 幾何ユーティリティ
  // ---------------------------------------------------------------------------

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t * dx, qy = ay + t * dy;
    return { d: Math.hypot(px - qx, py - qy), qx, qy };
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // 多角形までの符号付き距離（内部は負）と最近点
  function polyDist(x, y, poly) {
    let best = { d: Infinity, qx: 0, qy: 0 };
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const r = segDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
      if (r.d < best.d) best = r;
    }
    if (pointInPoly(x, y, poly)) best.d = -best.d;
    return best;
  }

  // polyDist の距離のみ版（格子生成用, オブジェクト生成なし）
  function polyDistFast(x, y, poly) {
    let m2 = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], ay = poly[j][1], dx = poly[i][0] - ax, dy = poly[i][1] - ay;
      let t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x - ax - t * dx, ey = y - ay - t * dy, e = ex * ex + ey * ey;
      if (e < m2) m2 = e;
    }
    const d = Math.sqrt(m2);
    return pointInPoly(x, y, poly) ? -d : d;
  }

  // 全部品への最小符号付き距離の格子（探索の高速化用, 双線形補間）
  function DistField(parts, lo, hi, h) {
    this.lo = lo; this.h = h;
    this.n = Math.round((hi - lo) / h) + 1;
    this.parts = parts;
    const n = this.n, data = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const y = lo + j * h;
      for (let i = 0; i < n; i++) {
        const x = lo + i * h;
        let m = Infinity;
        for (const p of parts) { const d = polyDistFast(x, y, p.poly); if (d < m) m = d; }
        data[j * n + i] = m;
      }
    }
    this.data = data;
  }
  DistField.prototype.at = function (x, y) {
    const fx = (x - this.lo) / this.h, fy = (y - this.lo) / this.h;
    const i = Math.floor(fx), j = Math.floor(fy), n = this.n;
    if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) {
      let m = Infinity;
      for (const p of this.parts) { const d = polyDistFast(x, y, p.poly); if (d < m) m = d; }
      return m;
    }
    const tx = fx - i, ty = fy - j, D = this.data, k = j * n + i;
    return (D[k] * (1 - tx) + D[k + 1] * tx) * (1 - ty) + (D[k + n] * (1 - tx) + D[k + n + 1] * tx) * ty;
  };

  const P1POLY = PARTS.find((q) => q.id === 'P1').poly;
  let fieldCache = null;
  function getField() {
    if (!fieldCache) fieldCache = new DistField(PARTS, -95, 95, 0.25);
    return fieldCache;
  }

  // ---------------------------------------------------------------------------
  // 歯車寸法
  // ---------------------------------------------------------------------------

  function gearDims(m, z, internal, cfg) {
    const d = m * z;
    const ha = cfg.addendum * m, hf = cfg.dedendum * m;
    const db = d * Math.cos((cfg.pressureAngleDeg * Math.PI) / 180);
    return internal
      ? { m, z, d, da: d - 2 * ha, df: d + 2 * hf, db, internal: true }
      : { m, z, d, da: d + 2 * ha, df: d - 2 * hf, db, internal: false };
  }

  // 解（歯車の組）→ 各寸法・中心距離
  function derive(cfg, s) {
    const R = gearDims(s.m1, s.zr, false, cfg);
    const B = gearDims(s.m1, s.zb, false, cfg);
    const G1 = gearDims(s.m1, s.zg1, false, cfg);
    const G2 = gearDims(s.m2, s.zg2, false, cfg);
    const Y = gearDims(s.m2, s.zy, true, cfg);
    const layered = !(s.m1 === s.m2 && s.zg1 === s.zg2);
    return {
      R, B, G1, G2, Y, layered,
      aGY: (s.m2 * (s.zy - s.zg2)) / 2,
      aGB: (s.m1 * (s.zg1 + s.zb)) / 2,
      aGR: (s.m1 * (s.zg1 + s.zr)) / 2,
      ratio: (s.zg1 * s.zy) / (s.zb * s.zg2),
    };
  }

  // 青の x 座標と分岐から緑の中心を求める（原点中心 aGY の円 ∩ 青中心 aGB の円）
  function greenCenter(aGY, aGB, bx, by, branch) {
    const d = Math.hypot(bx, by);
    if (d < 1e-9 || d > aGY + aGB || d < Math.abs(aGY - aGB)) return null;
    const a = (aGY * aGY - aGB * aGB + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, aGY * aGY - a * a));
    const ux = bx / d, uy = by / d;
    return [a * ux - branch * h * uy, a * uy + branch * h * ux];
  }

  function positions(cfg, s, D, pl) {
    const B = [pl.xb, cfg.blueY];
    const G = greenCenter(D.aGY, D.aGB, B[0], B[1], pl.branch);
    if (!G) return null;
    const R = [G[0] + D.aGR * Math.cos(pl.phi), G[1] + D.aGR * Math.sin(pl.phi)];
    return { R, B, G, Y: [0, 0] };
  }

  // 赤が避けるべき青側の半径（一層: 青の歯先円, 二層: 青の軸）
  function blueObstacleR(cfg, D) {
    return D.layered ? cfg.blueShaftD / 2 : D.B.da / 2;
  }

  // ---------------------------------------------------------------------------
  // 厳密評価（詳細表示・最終値用）: 全制約の余裕 [mm]（≥0 で成立）
  // ---------------------------------------------------------------------------

  function evaluate(cfg, s, pl) {
    const D = derive(cfg, s);
    const P = positions(cfg, s, D, pl);
    const items = [];
    const add = (id, label, slack, note) => items.push({ id, label, slack, note: note || '' });

    add('C2', '黄 歯底円直径 ≤ ' + cfg.yellowRootMax, cfg.yellowRootMax - D.Y.df, 'df = ' + D.Y.df.toFixed(3));
    add('C6a', '内歯車 歯数差 ≥ ' + cfg.internalMinDiff, s.zy - s.zg2 - cfg.internalMinDiff, 'z差 = ' + (s.zy - s.zg2));
    add('C6b', '黄 歯先円 > 基礎円', (D.Y.da - D.Y.db) / 2, '');
    if (!P) {
      add('GEO', '緑の配置（青 x に対する解なし）', -1, '');
      return { D, P: null, items, minSlack: -1, ok: false };
    }
    const rR = D.R.da / 2, rB = D.B.da / 2;
    const rRmax = (cfg.brownD - cfg.purpleD) / 2;
    add('C3', '紫φ' + cfg.purpleD + ' ⊂ 茶φ' + cfg.brownD, rRmax - Math.hypot(P.R[0], P.R[1]), '|R| = ' + Math.hypot(P.R[0], P.R[1]).toFixed(3));
    const p1 = PARTS.find((q) => q.id === 'P1');
    const dPU = polyDist(P.R[0], P.R[1], p1.poly).d - cfg.purpleD / 2;
    add('C8', '紫円 φ' + cfg.purpleD + ' ↔ P1 ' + p1.name, dPU - cfg.clrPurpleP1, 'すき間 ' + dPU.toFixed(3) + ' mm');
    add('C9', '紫円 φ' + cfg.purpleD + ' ↔ 球 φ' + cfg.ballD, Math.hypot(P.R[0], P.R[1]) - (cfg.purpleD + cfg.ballD) / 2 - cfg.clrPurpleBall,
      'すき間 ' + (Math.hypot(P.R[0], P.R[1]) - (cfg.purpleD + cfg.ballD) / 2).toFixed(3) + ' mm');
    add('C7a', '青 中心 x ≥ ' + cfg.xbMin, P.B[0] - cfg.xbMin, 'x = ' + P.B[0].toFixed(3));
    add('C7b', '赤 中心 y = ' + cfg.redYRef + ' ± ' + cfg.redYTol, cfg.redYTol - Math.abs(P.R[1] - cfg.redYRef), 'y = ' + P.R[1].toFixed(3));

    const gearsVsParts = [['R', '赤', P.R, rR], ['B', '青', P.B, rB], ['G1', '緑(一層目)', P.G, D.G1.da / 2]];
    if (D.layered) gearsVsParts.push(['G2', '緑(二層目)', P.G, D.G2.da / 2]);
    for (const [gid, gname, c, r] of gearsVsParts) {
      for (const part of PARTS) {
        const pd = polyDist(c[0], c[1], part.poly);
        add('C4', gname + '歯先円 ↔ ' + part.id + ' ' + part.name, pd.d - r - cfg.clrPart,
          'すき間 ' + (pd.d - r).toFixed(3) + ' mm');
      }
    }
    // 一層: 赤・青が同一面 → 歯先円同士。二層: 赤は片持ちで青歯車とは別面 → 赤歯先円 ↔ 青の軸
    const dRB = Math.hypot(P.R[0] - P.B[0], P.R[1] - P.B[1]);
    const rBx = blueObstacleR(cfg, D);
    add('C5a', D.layered ? '赤 歯先円 ↔ 青 軸φ' + cfg.blueShaftD : '赤 ↔ 青 歯先円', dRB - rR - rBx - cfg.clrGear,
      'すき間 ' + (dRB - rR - rBx).toFixed(3) + ' mm');
    if (cfg.checkCrossLayer) {
      const rYa = D.Y.da / 2;
      add('C5b', '赤 歯先円 ⊂ 黄 歯先円', rYa - Math.hypot(P.R[0], P.R[1]) - rR - cfg.clrGear, '');
      add('C5c', '青 歯先円 ⊂ 黄 歯先円', rYa - Math.hypot(P.B[0], P.B[1]) - rB - cfg.clrGear, '');
    }
    if (D.layered) {
      const reach = D.aGY + D.G1.da / 2;
      if (cfg.green1InYellow) add('C5d', '緑(一層目) 歯先円 ⊂ 黄 歯先円', D.Y.da / 2 - reach - cfg.clrGear, '最外点 半径 ' + reach.toFixed(3));
      else add('C5e', '緑(一層目) 最外点 ≤ 半径 ' + cfg.green1OuterMax, cfg.green1OuterMax - reach, '最外点 半径 ' + reach.toFixed(3) + '（黄の歯先円の外側は可）');
    }
    // 最小余裕 = 配置に関わるすき間（C3〜C5）の最小値。C2・C6 は成否判定のみ
    let minSlack = Infinity, ok = true;
    for (const it of items) {
      if (it.slack < -1e-9) ok = false;
      if (!/^C2|^C6/.test(it.id) && it.slack < minSlack) minSlack = it.slack;
    }
    return { D, P, items, minSlack, ok };
  }

  // ---------------------------------------------------------------------------
  // 高速評価（距離場使用）
  // ---------------------------------------------------------------------------

  // 青・緑のみの余裕
  function slackBG(cfg, D, field, B, G) {
    let s = field.at(B[0], B[1]) - D.B.da / 2 - cfg.clrPart;
    const gR = D.layered ? Math.max(D.G1.da, D.G2.da) / 2 : D.G1.da / 2;
    s = Math.min(s, field.at(G[0], G[1]) - gR - cfg.clrPart);
    if (cfg.checkCrossLayer) s = Math.min(s, D.Y.da / 2 - Math.hypot(B[0], B[1]) - D.B.da / 2 - cfg.clrGear);
    return s;
  }

  // 赤のみの余裕（rR: 赤歯先半径）
  function slackR(cfg, D, field, R, B, rR) {
    const rn = Math.hypot(R[0], R[1]);
    let s = Math.min((cfg.brownD - cfg.purpleD) / 2 - rn, cfg.redYTol - Math.abs(R[1] - cfg.redYRef));
    s = Math.min(s, rn - redRmin(cfg));
    s = Math.min(s, Math.hypot(R[0] - B[0], R[1] - B[1]) - rR - blueObstacleR(cfg, D) - cfg.clrGear);
    if (cfg.checkCrossLayer) s = Math.min(s, D.Y.da / 2 - rn - rR - cfg.clrGear);
    if (s < 0) return s;
    s = Math.min(s, field.at(R[0], R[1]) - rR - cfg.clrPart);
    if (s < 0) return s;
    return Math.min(s, polyDistFast(R[0], R[1], P1POLY) - cfg.purpleD / 2 - cfg.clrPurpleP1);
  }

  // 赤中心の原点からの最小距離（紫円 ↔ 球）
  function redRmin(cfg) { return (cfg.purpleD + cfg.ballD) / 2 + cfg.clrPurpleBall; }

  // 赤の角度候補: rmin ≤ |R| ≤ rmax かつ |R.y − yRef| ≤ yTol となる円弧上をサンプル
  function redAngles(G, aGR, rmax, n, yRef, yTol, rmin) {
    const g = Math.hypot(G[0], G[1]);
    const th0 = Math.atan2(-G[1], -G[0]);
    const c = (g * g + aGR * aGR - rmax * rmax) / (2 * g * aGR);
    if (c > 1) return [];
    const w = c < -1 ? Math.PI : Math.acos(c);
    let arcs = [[th0 - w, th0 + w]];
    if (yTol != null && isFinite(yTol)) {
      const lo = (yRef - yTol - G[1]) / aGR, hi = (yRef + yTol - G[1]) / aGR;
      if (lo > 1 || hi < -1) return [];
      const a1 = Math.asin(Math.max(-1, lo)), a2 = Math.asin(Math.min(1, hi));
      const band = [[a1, a2], [Math.PI - a2, Math.PI - a1]];
      const out = [];
      for (const [p, q] of arcs) for (const [u, v] of band) for (const k of [-2, -1, 0, 1, 2]) {
        const l = Math.max(p, u + 2 * Math.PI * k), h = Math.min(q, v + 2 * Math.PI * k);
        if (h >= l) out.push([l, h]);
      }
      arcs = out;
    }
    if (rmin > 0) {
      const c2 = (g * g + aGR * aGR - rmin * rmin) / (2 * g * aGR);
      if (c2 < -1) return [];
      if (c2 < 1) {
        const w2 = Math.acos(c2), out = [];
        for (const [l, h] of arcs) {
          let segs = [[l, h]];
          for (const k of [-2, -1, 0, 1, 2]) {
            const el = th0 - w2 + 2 * Math.PI * k, eh = th0 + w2 + 2 * Math.PI * k, nx = [];
            for (const [a, b] of segs) {
              if (eh <= a || el >= b) { nx.push([a, b]); continue; }
              if (el > a) nx.push([a, el]);
              if (eh < b) nx.push([eh, b]);
            }
            segs = nx;
          }
          out.push(...segs);
        }
        arcs = out;
      }
    }
    if (!arcs.length) return [];
    const total = arcs.reduce((t, [l, h]) => t + h - l, 0);
    const out = [];
    for (const [l, h] of arcs) {
      const k = Math.max(1, Math.round((n * (h - l)) / (total || 1)));
      for (let i = 0; i < k; i++) out.push(k === 1 ? (l + h) / 2 : l + ((h - l) * i) / (k - 1));
    }
    return out;
  }

  // 1 つの歯車組（赤以外）について, 成立する赤歯数と最良配置を探す
  function solveCombo(cfg, c, field) {
    const base = { m1: c.m1, m2: c.m2, zr: cfg.zMin, zb: c.zb, zg1: c.zg1, zg2: c.zg2, zy: c.zy };
    const D = derive(cfg, base);
    // 青・緑の配置候補
    const cands = [];
    for (let xb = cfg.xbMin; xb <= cfg.xbMax + 1e-9; xb += cfg.xbStep) {
      for (const br of [1, -1]) {
        const G = greenCenter(D.aGY, D.aGB, xb, cfg.blueY, br);
        if (!G) continue;
        const B = [xb, cfg.blueY];
        const s = slackBG(cfg, D, field, B, G);
        if (s >= 0) cands.push({ xb, branch: br, G, B, s });
      }
    }
    if (!cands.length) return null;
    // 候補を間引く: 余裕最大 + x 方向に均等
    const K = 10;
    let pick = cands;
    if (cands.length > K) {
      pick = [];
      const best = cands.reduce((a, b) => (b.s > a.s ? b : a));
      pick.push(best);
      for (let k = 0; k < K - 1; k++) pick.push(cands[Math.round((k * (cands.length - 1)) / (K - 2))]);
    }
    const rmax = (cfg.brownD - cfg.purpleD) / 2;
    const zrLo = Math.max(cfg.zMin, Math.ceil((2 * (D.aGY - rmax)) / c.m1 - c.zg1 - 1e-9));
    const zrOk = [];
    let best = null;
    for (let zr = zrLo; zr <= cfg.zMaxRed; zr++) {
      const aGR = (c.m1 * (c.zg1 + zr)) / 2;
      const rR = (c.m1 * (zr + 2 * cfg.addendum)) / 2;
      let zrBest = null;
      for (const p of pick) {
        for (const phi of redAngles(p.G, aGR, rmax, 13, cfg.redYRef, cfg.redYTol, redRmin(cfg))) {
          const R = [p.G[0] + aGR * Math.cos(phi), p.G[1] + aGR * Math.sin(phi)];
          const s = Math.min(p.s, slackR(cfg, D, field, R, p.B, rR));
          if (s >= 0 && (!zrBest || s > zrBest.s)) zrBest = { s, xb: p.xb, branch: p.branch, phi };
        }
        if (zrBest) break; // この赤歯数は成立 → 次へ
      }
      if (zrBest) {
        zrOk.push(zr);
        if (!best || zrBest.s > best.s) best = Object.assign({ zr }, zrBest);
      }
    }
    if (!best) return null;
    return {
      m1: c.m1, m2: c.m2, zr: best.zr, zb: c.zb, zg1: c.zg1, zg2: c.zg2, zy: c.zy,
      layered: D.layered, ratio: D.ratio, ratioErrPct: (D.ratio / cfg.ratio - 1) * 100,
      yellowDf: D.Y.df, zrList: zrOk, score: best.s,
      pl: { xb: best.xb, branch: best.branch, phi: best.phi },
    };
  }

  function moduleList(cfg) {
    const out = [];
    for (let k = 0; ; k++) {
      const m = Math.round((cfg.modMin + k * cfg.modStep) * 1e6) / 1e6;
      if (m > cfg.modMax + 1e-9 || cfg.modStep <= 0) break;
      out.push(m);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // 歯車組の列挙（速度比・単体条件のみ）
  // ---------------------------------------------------------------------------

  function enumerate(cfg) {
    const out = [];
    const tol = cfg.ratioTolPct / 100;
    const ha = cfg.addendum, hf = cfg.dedendum;
    const cosA = Math.cos((cfg.pressureAngleDeg * Math.PI) / 180);
    const mods = moduleList(cfg).reverse(); // 大きいモジュールから（件数上限で打ち切っても大きい側が残る）
    for (const m1 of mods) for (const m2 of mods) {
      if (!cfg.allowTwoLayer && m1 !== m2) continue;
      const zyMax = Math.floor(cfg.yellowRootMax / m2 - 2 * hf + 1e-9);
      for (let zy = 3; zy <= zyMax; zy++) {
        if (zy - 2 * ha <= zy * cosA) continue; // 歯先円が基礎円より内側
        const rYa = (m2 * (zy - 2 * ha)) / 2;
        for (let zg2 = cfg.zMin; zg2 <= Math.min(cfg.zMaxGreen, zy - cfg.internalMinDiff); zg2++) {
          const aGY = (m2 * (zy - zg2)) / 2;
          for (let zb = cfg.zMin; zb <= cfg.zMaxBlue; zb++) {
            const rBa = (m1 * (zb + 2 * ha)) / 2;
            if (cfg.checkCrossLayer && Math.abs(cfg.blueY) + rBa > rYa - cfg.clrGear) break;
            const target = (cfg.ratio * zb * zg2) / zy; // = zg1
            const lo = Math.max(cfg.zMin, Math.ceil(target * (1 - tol) - 1e-9));
            const hi = Math.min(cfg.zMaxGreen, Math.floor(target * (1 + tol) + 1e-9));
            for (let zg1 = lo; zg1 <= hi; zg1++) {
              const layered = !(m1 === m2 && zg1 === zg2);
              if (layered && !cfg.allowTwoLayer) continue;
              if (!layered && m1 !== m2) continue;
              if (layered) {
                const reach = aGY + (m1 * (zg1 + 2 * ha)) / 2;
                if (cfg.green1InYellow ? reach > rYa - cfg.clrGear : reach > cfg.green1OuterMax) continue;
              }
              out.push({ m1, m2, zb, zg1, zg2, zy });
            }
          }
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // 探索（チャンク実行可能）
  // ---------------------------------------------------------------------------

  function createSearch(userCfg) {
    const cfg = Object.assign({}, DEFAULTS, userCfg || {});
    const field = getField();
    const combos = enumerate(cfg);
    let i = 0;
    const results = [];
    return {
      cfg, total: combos.length, results,
      get done() { return i >= combos.length; },
      get index() { return i; },
      step(budgetMs) {
        const t0 = Date.now();
        while (i < combos.length && Date.now() - t0 < budgetMs) {
          for (let k = 0; k < 200 && i < combos.length; k++, i++) {
            const r = solveCombo(cfg, combos[i], field);
            if (r && results.length < cfg.maxResults) results.push(r);
          }
        }
        return i / Math.max(1, combos.length);
      },
    };
  }

  function runSearch(userCfg) {
    const s = createSearch(userCfg);
    while (!s.done) s.step(1e9);
    return s;
  }

  // ---------------------------------------------------------------------------
  // 配置の局所最適化（厳密評価で最小余裕を最大化）
  // ---------------------------------------------------------------------------

  function optimizePlacement(cfg, s, pl0) {
    cfg = Object.assign({}, DEFAULTS, cfg);
    const score = (pl) => { const e = evaluate(cfg, s, pl); return e.P ? e.minSlack : -1e9; };
    let best = { pl: Object.assign({}, pl0), v: score(pl0) };
    // 粗い全域探索（両分岐）
    const field = getField();
    const D = derive(cfg, s);
    const rmax = (cfg.brownD - cfg.purpleD) / 2;
    const rR = D.R.da / 2;
    for (let xb = cfg.xbMin; xb <= cfg.xbMax; xb += 0.5) {
      for (const br of [1, -1]) {
        const G = greenCenter(D.aGY, D.aGB, xb, cfg.blueY, br);
        if (!G) continue;
        const B = [xb, cfg.blueY];
        const sb = slackBG(cfg, D, field, B, G);
        if (sb < best.v) continue;
        for (const phi of redAngles(G, D.aGR, rmax, 37, cfg.redYRef, cfg.redYTol, redRmin(cfg))) {
          const R = [G[0] + D.aGR * Math.cos(phi), G[1] + D.aGR * Math.sin(phi)];
          const v = Math.min(sb, slackR(cfg, D, field, R, B, rR));
          if (v > best.v) { const pl = { xb, branch: br, phi }; const ve = score(pl); if (ve > best.v) best = { pl, v: ve }; }
        }
      }
    }
    // パターンサーチで微調整
    let hx = 0.25, hp = 0.02;
    while (hx > 1e-3) {
      let improved = false;
      for (const [dx, dp] of [[hx, 0], [-hx, 0], [0, hp], [0, -hp], [hx, hp], [-hx, -hp], [hx, -hp], [-hx, hp]]) {
        const pl = { xb: best.pl.xb + dx, branch: best.pl.branch, phi: best.pl.phi + dp };
        const v = score(pl);
        if (v > best.v + 1e-9) { best = { pl, v }; improved = true; }
      }
      if (!improved) { hx /= 2; hp /= 2; }
    }
    return best;
  }

  return {
    PX_PER_MM, PARTS, FIGURES, FIG2_REFERENCE, DEFAULTS,
    polyDist, pointInPoly, gearDims, derive, greenCenter, positions,
    evaluate, enumerate, moduleList, solveCombo, createSearch, runSearch, optimizePlacement, getField,
  };
});
