// Распознавание рукописных формул: штрихи -> "√7 + 5 =".
// Символы — облако точек ($P, Vatavu и др. 2012) по шаблонам + правила: =, +, дроби, корни, степени.
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const QB = (root.QB = root.QB || {});
  const N = 32;

  // ---- шаблоны (рамка 1×1, y вниз; потом сжимаем по ширине)
  const arc = (cx, cy, rx, ry, a0, a1, n = 16) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  };
  const cat = (...parts) => [].concat(...parts);
  const RAW = [
    ['0', [arc(0.5, 0.5, 0.45, 0.5, -90, 270)], 0.65],
    ['0', [arc(0.5, 0.5, 0.45, 0.5, -40, 320)], 0.65],
    ['1', [[[0.15, 0.3], [0.6, 0], [0.6, 1]]], 0.5],
    ['1', [[[0.2, 0.25], [0.6, 0], [0.6, 1]], [[0.25, 1], [0.95, 1]]], 0.55],
    ['2', [cat(arc(0.5, 0.3, 0.42, 0.3, 200, 370), [[0.05, 1], [0.95, 1]])], 0.65],
    ['2', [cat(arc(0.5, 0.3, 0.42, 0.3, 190, 360), [[0.55, 0.65], [0.05, 1], [0.95, 1]])], 0.65],
    ['3', [cat(arc(0.48, 0.25, 0.4, 0.25, 200, 450), arc(0.48, 0.74, 0.44, 0.26, 270, 520))], 0.65],
    ['3', [cat([[0.1, 0], [0.85, 0], [0.4, 0.42]], arc(0.48, 0.72, 0.44, 0.28, 250, 520))], 0.65],
    ['4', [[[0.65, 0], [0.05, 0.68], [0.95, 0.68]], [[0.7, 0.3], [0.7, 1]]], 0.7],
    ['4', [[[0.15, 0], [0.1, 0.6], [0.9, 0.6]], [[0.7, 0.05], [0.7, 1]]], 0.7],
    ['5', [[[0.85, 0], [0.25, 0], [0.2, 0.45]], arc(0.5, 0.68, 0.4, 0.32, 230, 520)], 0.65],
    ['5', [[[0.25, 0], [0.2, 0.45]], arc(0.5, 0.68, 0.4, 0.32, 230, 520), [[0.25, 0], [0.85, 0]]], 0.65],
    ['6', [cat([[0.8, 0.02], [0.45, 0.12], [0.22, 0.35], [0.12, 0.65]], arc(0.5, 0.72, 0.38, 0.28, 180, -180))], 0.65],
    ['7', [[[0.05, 0], [0.95, 0], [0.35, 1]]], 0.65],
    ['7', [[[0.05, 0], [0.95, 0], [0.35, 1]], [[0.3, 0.52], [0.85, 0.52]]], 0.65],
    ['7', [[[0.05, 0.12], [0.2, 0], [0.95, 0], [0.45, 1]]], 0.65],
    ['8', [arc(0.5, 0.25, 0.32, 0.25, 90, 450), arc(0.5, 0.73, 0.4, 0.27, -90, 270)], 0.6],
    ['8', [cat(arc(0.5, 0.25, 0.32, 0.25, 90, -180), arc(0.5, 0.73, 0.4, 0.27, -90, 270), arc(0.5, 0.25, 0.32, 0.25, 180, 90))], 0.6],
    ['9', [cat(arc(0.5, 0.3, 0.4, 0.3, 0, 360), [[0.9, 0.3], [0.8, 1]])], 0.65],
    ['9', [cat(arc(0.5, 0.3, 0.4, 0.3, 0, 360), [[0.9, 0.3], [0.85, 0.8], [0.5, 1], [0.2, 0.9]])], 0.65],
    ['x', [[[0, 0], [1, 1]], [[1, 0], [0, 1]]], 0.9],
    ['x', [arc(0.05, 0.5, 0.42, 0.5, -70, 70), arc(0.95, 0.5, 0.42, 0.5, 110, 250)], 0.9],
    ['y', [[[0, 0], [0.5, 0.5]], [[1, 0], [0.25, 1]]], 0.75],
    ['y', [cat(arc(0.25, 0.1, 0.22, 0.4, 180, 90), arc(0.75, 0.1, 0.22, 0.4, 90, 0)), [[0.97, 0], [0.9, 0.8], [0.6, 1], [0.3, 0.9]]], 0.75],
    ['a', [arc(0.45, 0.5, 0.42, 0.45, -20, 340), [[0.88, 0.05], [0.88, 1]]], 0.85],
    ['a', [cat(arc(0.45, 0.5, 0.42, 0.45, -20, 340), [[0.88, 0.05], [0.88, 0.9], [1, 1]])], 0.85],
    ['b', [[[0.15, 0], [0.15, 1]], arc(0.5, 0.7, 0.36, 0.3, 180, 540)], 0.6],
    ['c', [arc(0.6, 0.5, 0.52, 0.5, -40, -320)], 0.8],
    ['n', [[[0.1, 0.05], [0.1, 1]], cat(arc(0.5, 0.45, 0.4, 0.4, 180, 360), [[0.9, 1]])], 0.85],
    ['(', [arc(1, 0.5, 0.9, 0.55, 235, 125)], 1],
    [')', [arc(0, 0.5, 0.9, 0.55, -55, 55)], 1],
    ['√', [[[0, 0.55], [0.15, 0.45], [0.35, 1], [0.65, 0], [1, 0]]], 1],
    ['√', [[[0, 0.6], [0.2, 0.5], [0.45, 1], [1, 0]]], 0.9],
    ['<', [[[1, 0], [0, 0.5], [1, 1]]], 0.7],
    ['>', [[[0, 0], [1, 0.5], [0, 1]]], 0.7],
    ['π', [[[0, 0.1], [1, 0]], [[0.3, 0.05], [0.25, 1]], [[0.7, 0.05], [0.75, 1]]], 1],
    // буквы для log, sin, cos, tg, lim, max...
    ['o', [arc(0.5, 0.5, 0.47, 0.5, -90, 270)], 0.95],
    ['o', [arc(0.5, 0.5, 0.47, 0.5, 0, 390)], 0.95],
    ['g', [cat(arc(0.5, 0.25, 0.42, 0.25, 0, 360), [[0.92, 0.25], [0.88, 0.8]], arc(0.5, 0.8, 0.38, 0.2, 0, 170))], 0.7],
    ['g', [cat(arc(0.5, 0.22, 0.42, 0.22, 0, 360), [[0.9, 0.3], [0.7, 0.6], [0.35, 0.78]], arc(0.42, 0.86, 0.3, 0.14, 230, 520), [[0.75, 0.75]])], 0.7],
    // g «восьмёркой»: петля сверху, хвост вниз с петлёй (как пишут от руки)
    ['g', [[[0.95, 0.06], [0.69, 0], [0.26, 0.06], [0.17, 0.22], [0.43, 0.35], [0.83, 0.3], [1, 0.16], [0.95, 0.03], [0.86, 0.42],
      [0.6, 0.58], [0.09, 0.74], [0, 0.9], [0.26, 1], [0.6, 0.94], [0.72, 0.74], [0.69, 0.54]]], 0.47],
    ['s', [cat(arc(0.5, 0.25, 0.42, 0.25, -20, -270), arc(0.5, 0.75, 0.42, 0.25, -90, 160))], 0.65],
    ['t', [[[0.45, 0], [0.45, 0.85], [0.6, 1], [0.85, 0.95]], [[0.1, 0.32], [0.85, 0.32]]], 0.7],
    ['m', [cat([[0.05, 1], [0.05, 0.15]], arc(0.27, 0.4, 0.22, 0.35, 180, 360), [[0.49, 1], [0.49, 0.4]], arc(0.72, 0.4, 0.22, 0.35, 180, 360), [[0.94, 1]])], 1.2],
    ['e', [cat([[0.12, 0.55], [0.88, 0.5]], arc(0.5, 0.5, 0.4, 0.45, 350, 40))], 0.8],
  ];

  // ---- $P: облако точек
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function resample(strokes, n) {
    const pts = [];
    strokes.forEach((s, id) => s.forEach((p) => pts.push({ x: p[0], y: p[1], id })));
    let L = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) L += dist(pts[i - 1], pts[i]);
    if (!L) return Array.from({ length: n }, () => ({ ...pts[0] }));
    const I = L / (n - 1);
    let D = 0;
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].id !== pts[i - 1].id) continue;
      const d = dist(pts[i - 1], pts[i]);
      if (D + d >= I && d > 0) {
        const t = (I - D) / d;
        const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y), id: pts[i].id };
        out.push(q);
        pts.splice(i, 0, q);
        D = 0;
      } else D += d;
    }
    while (out.length < n) out.push({ ...pts[pts.length - 1] });
    return out.slice(0, n);
  }
  function normalize(strokes) {
    let pts = resample(strokes, N);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const s = Math.max(x1 - x0, y1 - y0) || 1;
    pts = pts.map((p) => ({ x: (p.x - x0) / s, y: (p.y - y0) / s }));
    const cx = pts.reduce((a, p) => a + p.x, 0) / N, cy = pts.reduce((a, p) => a + p.y, 0) / N;
    return pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  }
  function cloudDist(a, b, start) {
    const n = a.length;
    const used = new Array(n).fill(false);
    let sum = 0;
    let i = start;
    do {
      let min = Infinity, idx = 0;
      for (let j = 0; j < n; j++) {
        if (used[j]) continue;
        const d = dist(a[i], b[j]);
        if (d < min) { min = d; idx = j; }
      }
      used[idx] = true;
      sum += (1 - ((i - start + n) % n) / n) * min;
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  function match(a, b) {
    const step = Math.floor(Math.pow(N, 0.5));
    let min = Infinity;
    for (let i = 0; i < N; i += step) min = Math.min(min, cloudDist(a, b, i), cloudDist(b, a, i));
    return min;
  }
  const TEMPLATES = RAW.map(([ch, strokes, k]) => ({ ch, cloud: normalize(strokes.map((s) => s.map((p) => [p[0] * k, p[1]]))) }));

  // ---- помощники по штрихам
  function box(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: x1, b: y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
  }
  // прямая ли линия и под каким углом (0 — горизонталь, 90 — вертикаль)
  function lineInfo(s) {
    // концы — самые дальние точки (если в конце рука чуть вернулась назад, линия всё равно прямая)
    const far = (p) => s.reduce((m, q) => (Math.hypot(q[0] - p[0], q[1] - p[1]) > Math.hypot(m[0] - p[0], m[1] - p[1]) ? q : m), p);
    const a = far(s[0]), b = far(a);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let dev = 0;
    for (const p of s) dev = Math.max(dev, segDist(p, a, b));
    let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (ang < 0) ang += 180;
    if (ang >= 180) ang -= 180;
    return { straight: len > 0 && dev < Math.max(2.5, len * 0.13), ang, len, a, b };
  }
  const isHor = (l) => l.ang < 22 || l.ang > 158;
  const isVer = (l) => l.ang > 62 && l.ang < 118;
  function segCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  // радикал одним штрихом: галочка + длинная черта сверху
  function radicalOf(s) {
    const b = box([s]);
    if (b.w < 10 || b.h < 10) return null;
    let iLow = 0;
    s.forEach((p, i) => { if (p[1] > s[iLow][1]) iLow = i; });
    if (s[iLow][0] > b.x + b.w * 0.45) return null;
    let iTop = -1;
    for (let i = iLow; i < s.length; i++) if (s[i][1] < b.y + b.h * 0.2) { iTop = i; break; }
    if (iTop < 0) return null;
    const tail = s.slice(iTop);
    const tb = box([tail]);
    if (tb.h > b.h * 0.25 || tb.w < b.w * 0.3 || tb.r < b.r - b.w * 0.05) return null;
    return { x0: s[iTop][0], x1: b.r, y: b.y };
  }
  // галочка корня без черты (черта отдельным штрихом или её нет)
  function checkOf(s) {
    const b = box([s]);
    if (b.h < 8) return null;
    let iLow = 0;
    s.forEach((p, i) => { if (p[1] > s[iLow][1]) iLow = i; });
    const end = s[s.length - 1], start = s[0];
    const low = s[iLow];
    const left = start[0] < end[0] ? start : end, right = start[0] < end[0] ? end : start;
    if (low[0] > b.x + b.w * 0.55 || low[1] < b.b - b.h * 0.15) return null;
    if (right[1] > b.y + b.h * 0.2 || right[0] < b.r - b.w * 0.15) return null; // правый конец вверху справа
    if (left[1] < b.y + b.h * 0.25) return null; // левый конец не вверху
    if (b.w > b.h * 2.2) return null;
    return { x: right[0], y: right[1] };
  }

  // один символ
  function classify(strokes, refH) {
    const b = box(strokes);
    if (Math.max(b.w, b.h) < refH * 0.3) return [strokes.length >= 2 && b.h > b.w * 1.5 ? ':' : '.'];
    const L = strokes.map(lineInfo);
    // i: палочка + точка над ней
    if (strokes.length === 2) {
      const sm = strokes.findIndex((s) => { const sb = box([s]); return Math.max(sb.w, sb.h) < refH * 0.3; });
      if (sm >= 0) {
        const db = box([strokes[sm]]), sb = box([strokes[1 - sm]]);
        if (db.cy < sb.y && (L[1 - sm].straight || sb.h > sb.w * 2)) return ['i'];
      }
    }
    if (strokes.length === 1 && L[0].straight) {
      if (isHor(L[0])) return ['-'];
      if (isVer(L[0])) return ['1', 'l'];
      return [L[0].ang < 90 ? '\\' : '/'];
    }
    if (strokes.length === 2 && L.every((l) => l.straight)) {
      const [p, q] = L;
      if (isHor(p) && isHor(q)) return ['='];
      if (segCross(p.a, p.b, q.a, q.b)) {
        if ((isHor(p) && isVer(q)) || (isVer(p) && isHor(q))) {
          // у буквы t перекладина высоко, у плюса — посередине
          const v = isVer(p) ? p : q, hz = isVer(p) ? q : p;
          const top = Math.min(v.a[1], v.b[1]), len = Math.abs(v.a[1] - v.b[1]) || 1;
          const at = ((hz.a[1] + hz.b[1]) / 2 - top) / len;
          // у руки плюс часто кривой, поэтому t — только когда перекладина совсем у верха
          return at < 0.22 ? ['t', '+'] : at < 0.4 ? ['+', 't'] : ['+'];
        }
        if (!isHor(p) && !isHor(q) && !isVer(p) && !isVer(q)) return ['x'];
      }
    }
    if (strokes.length === 3 && L.filter((l) => l.straight && isHor(l)).length === 3) return ['≡'];
    // скобка: высокая узкая дуга, концы сверху и снизу, выгиб посередине
    if (strokes.length === 1 && b.h > b.w * 1.8) {
      const s = strokes[0];
      const a = s[0], z = s[s.length - 1];
      if (Math.abs(a[1] - z[1]) > b.h * 0.8) {
        let dev = 0, at = null;
        for (const p of s) { const d = segDist(p, a, z); if (d > dev) { dev = d; at = p; } }
        const mid = (at[1] - b.y) / b.h;
        if (dev > b.w * 0.5 && mid > 0.25 && mid < 0.75) {
          const chordX = a[0] + ((z[0] - a[0]) * (at[1] - a[1])) / (z[1] - a[1] || 1);
          return at[0] < chordX ? ['(', 'l'] : [')', 'l'];
        }
      }
    }
    // перечёркнутая черта через изогнутый штрих: посередине — европейская 7, у верха — t
    if (strokes.length === 2) {
      const hi = L.findIndex((l) => l.straight && isHor(l));
      if (hi >= 0 && !L[1 - hi].straight) {
        const o = strokes[1 - hi], h = L[hi];
        let cross = false;
        for (let k = 1; k < o.length && !cross; k++) cross = segCross(h.a, h.b, o[k - 1], o[k]);
        if (cross) {
          const ob = box([o]);
          const at = ((h.a[1] + h.b[1]) / 2 - ob.y) / (ob.h || 1);
          if (at > 0.35 && at < 0.8) return ['7'];
          if (at <= 0.35) return ['t', 'f'];
        }
      }
    }
    // пятёрка: ровная «шапка» сверху + изогнутый низ
    if (strokes.length === 2) {
      const hi = L.findIndex((l) => l.straight && isHor(l));
      if (hi >= 0 && !L[1 - hi].straight) {
        const hb = box([strokes[hi]]), ob = box([strokes[1 - hi]]);
        // у семёрки с чертой черта посередине (сюда не попадает), у пятёрки — сверху, низ изогнут
        if (hb.cy < b.y + b.h * 0.2 && ob.h > b.h * 0.6 && ob.cy > hb.cy) return ['5', 's'];
      }
    }
    return rank(strokes);
  }

  // варианты по шаблонам: лучшие 4, не сильно хуже первого
  function rank(strokes) {
    const c = normalize(strokes);
    const best = {};
    for (const t of TEMPLATES) {
      const d = match(c, t.cloud);
      if (!(t.ch in best) || d < best[t.ch]) best[t.ch] = d;
    }
    const list = Object.entries(best).sort((a, b) => a[1] - b[1]);
    if (!list.length) return ['?'];
    const top = list[0][1];
    return list.filter(([, d], i) => i < 4 && d <= top * 1.45).map(([ch]) => ch);
  }

  // ---- слова: из вариантов символов собираем log, sin, lim...
  const WORDS = ['arcsin', 'arccos', 'arcctg', 'arctg', 'sin', 'cos', 'ctg', 'cot', 'tan', 'tg', 'log', 'lim', 'max', 'min', 'exp', 'lg', 'ln'];
  // что легко спутать при письме мышкой
  const CONF = { 1: 'li', l: '1i', i: '1l', 0: 'oa', o: '0a', a: 'oc', 9: 'gq', g: '9', 5: 's', s: '5', c: '(', '(': 'cl', ')': 'l', 2: 'z', n: 'h', r: 'n', 7: 't' };
  const DESC = 'gyqp'; // буквы с хвостом вниз
  function allowed(a) {
    const s = new Set(a.cands);
    a.cands.forEach((c) => (CONF[c] || '').split('').forEach((x) => s.add(x)));
    return s;
  }
  function findWords(atoms, refH) {
    for (let i = 0; i < atoms.length; i++) {
      if (!atoms[i].cands) continue;
      for (const w of WORDS) {
        const seg = atoms.slice(i, i + w.length);
        if (seg.length < w.length || seg.some((a) => !a.cands)) continue;
        if (!seg.every((a, k) => allowed(a).has(w[k]))) continue;
        if (w.includes('t') && !seg.some((a, k) => w[k] === 't' && a.cands.includes('t'))) continue; // «+9» не превращаем в tg
        let close = true;
        for (let k = 1; k < seg.length; k++) if (seg[k].box.x - seg[k - 1].box.r > refH * 0.9) close = false;
        if (!close) continue;
        // цифры одинаковой высоты (109) — не слово; у букв высоты разные (l выше o)
        const letterTop = seg.some((a) => /[a-z]/.test(a.cands[0]));
        const hs = seg.map((a) => a.box.h);
        const varied = Math.max(...hs) / Math.max(1, Math.min(...hs)) > 1.45;
        if (!letterTop && !varied) continue;
        const bx = Math.min(...seg.map((a) => a.box.x)), by = Math.min(...seg.map((a) => a.box.y));
        const br = Math.max(...seg.map((a) => a.box.r)), bb = Math.max(...seg.map((a) => a.box.b));
        // линия строки: низ маленьких букв (o, a, n…) — у l и g низ гуляет
        const small = seg.filter((a, k) => 'oacnmsexiru'.includes(w[k]));
        const plain = small.length ? small : seg.filter((a, k) => !DESC.includes(w[k]));
        const bots = plain.map((a) => a.box.b).sort((p, q) => p - q);
        const baseline = bots.length ? bots[Math.floor(bots.length / 2)] : bb;
        const xh = Math.min(...seg.map((a) => a.box.h));
        atoms.splice(i, w.length, { box: { x: bx, y: by, r: br, b: bb, w: br - bx, h: bb - by, cx: (bx + br) / 2, cy: (by + bb) / 2 }, text: w, word: true, baseline, xh });
        break;
      }
    }
  }
  // одиночные буквы, похожие на цифры, среди цифр — цифры
  const TO_DIGIT = { o: '0', l: '1', g: '9', s: '5', z: '2', i: '1' };
  function pickText(atoms) {
    atoms.forEach((a, i) => {
      if (!a.cands) return;
      let t = a.cands[0];
      if (TO_DIGIT[t] && !(t === 'i' || t === 's')) t = TO_DIGIT[t];
      else if (TO_DIGIT[t]) {
        const near = [atoms[i - 1], atoms[i + 1]].some((n) => n && /^\d/.test(n.text || (n.cands && n.cands[0]) || ''));
        if (near) t = TO_DIGIT[t];
      }
      a.text = t;
    });
  }

  const OPS = '+-=<>·:/*≤≥≡';

  // штрихи + готовые куски (текст/формулы) -> строка в школьной записи
  function rec(units) {
    if (!units.length) return '';
    const strokesOnly = units.filter((u) => u.s);
    const hs = strokesOnly.map((u) => box([u.s])).filter((b) => b.h > 4 && b.h > b.w * 0.25).map((b) => b.h).sort((a, b) => a - b);
    const refH = hs.length ? hs[Math.floor(hs.length / 2)] : 30;
    let pool = units.slice();
    const atoms = []; // { box, text }
    const take = (list) => { pool = pool.filter((u) => !list.includes(u)); };
    const inner = (list) => rec(list);
    const wrapped = (t) => {
      if (t[0] !== '(' || t[t.length - 1] !== ')') return false;
      let d = 0;
      for (let i = 0; i < t.length; i++) { d += t[i] === '(' ? 1 : t[i] === ')' ? -1 : 0; if (d === 0 && i < t.length - 1) return false; }
      return true;
    };
    const wrap = (t) => (t.length <= 1 || /^[\d.,]+$/.test(t) || /^[a-zA-Zπ]$/.test(t) || wrapped(t) ? t : '(' + t + ')');

    // корни
    for (const u of units) {
      if (!u.s || !pool.includes(u)) continue;
      let r = radicalOf(u.s);
      let parts = [u];
      if (!r) {
        const ck = checkOf(u.s);
        if (!ck) continue;
        const over = pool.find((v) => v !== u && v.s && (() => {
          const l = lineInfo(v.s);
          const lb = box([v.s]);
          return l.straight && isHor(l) && Math.abs(lb.x - ck.x) < refH * 0.45 && Math.abs(lb.cy - ck.y) < refH * 0.45 && lb.w > refH * 0.4;
        })());
        if (!over) continue;
        const ob = box([over.s]);
        r = { x0: ck.x, x1: ob.r, y: Math.min(ob.cy, ck.y) };
        parts = [u, over];
      }
      const radicand = pool.filter((v) => !parts.includes(v) && v.box.cx > r.x0 && v.box.cx < r.x1 + refH * 0.2 && v.box.cy > r.y);
      take(parts.concat(radicand));
      atoms.push({ box: box(parts.map((p) => p.s)), text: '√' + wrap(inner(radicand)), unit: true });
    }

    // дроби: горизонтальная черта, сверху и снизу что-то есть
    const bars = pool.filter((u) => u.s && (() => { const l = lineInfo(u.s); return l.straight && isHor(l) && l.len > refH * 0.6; })())
      .sort((a, b) => b.box.w - a.box.w);
    for (const bar of bars) {
      if (!pool.includes(bar)) continue;
      const bb = bar.box;
      const inX = (v) => v !== bar && v.box.cx > bb.x - refH * 0.1 && v.box.cx < bb.r + refH * 0.1;
      const up = pool.filter((v) => inX(v) && v.box.b < bb.cy + refH * 0.1 && v.box.b > bb.cy - refH * 2.5);
      const down = pool.filter((v) => inX(v) && v.box.y > bb.cy - refH * 0.1 && v.box.y < bb.cy + refH * 2.5);
      if (!up.length || !down.length) continue;
      // «=» — две черты одна над другой, это не дробь
      const lineLike = (v) => v.s && lineInfo(v.s).straight && isHor(lineInfo(v.s));
      if (up.every(lineLike) || down.every(lineLike)) continue;
      const wu = box(up.map((v) => v.b4)).w, wd = box(down.map((v) => v.b4)).w;
      if (bb.w < Math.max(wu, wd) * 0.6) continue;
      take([bar, ...up, ...down]);
      atoms.push({ box: bb, text: wrap(inner(up)) + '/' + wrap(inner(down)), unit: true });
    }

    // остальное: склеиваем штрихи, которые перекрываются по горизонтали, в символы
    const rest = pool.slice().sort((a, b) => a.box.x - b.box.x);
    let group = null;
    const flush = () => {
      if (!group) return;
      if (group.text != null) atoms.push({ box: group.box, text: group.text, unit: true });
      else {
        const cands = classify(group.list.map((u) => u.s), refH);
        atoms.push({ box: box(group.list.map((u) => u.s)), cands, text: cands[0] });
      }
      group = null;
    };
    for (const u of rest) {
      if (u.text != null) { flush(); atoms.push({ box: u.box, text: u.text, unit: true }); continue; }
      if (group) {
        const gb = group.box;
        const ov = Math.min(gb.r, u.box.r) - Math.max(gb.x, u.box.x);
        if (ov > Math.min(gb.w, u.box.w) * 0.35 || ov > refH * 0.25) {
          group.list.push(u);
          group.box = box(group.list.map((v) => v.s));
          continue;
        }
      }
      flush();
      group = { list: [u], box: u.box };
    }
    flush();

    // сборка строки: по порядку слева направо; слова (log, sin); степени и индексы — по высоте
    atoms.sort((a, b) => a.box.x - b.box.x);
    findWords(atoms, refH);
    pickText(atoms);
    let out = '';
    let base = null;
    let sup = '', sub = '';
    const flushSup = () => {
      if (sub) { out += '_' + wrap(sub); sub = ''; }
      if (sup) { out += '^' + wrap(sup); sup = ''; }
    };
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      let t = a.text;
      if (t === '.') {
        // точка посередине строки — умножение, внизу — десятичная
        const nb = base || atoms[i + 1];
        if (nb && a.box.cy < nb.box.y + nb.box.h * 0.75) t = '·';
      }
      const op = OPS.includes(t);
      // log₂: после слова маленький символ ниже строки
      if (base && base.word && !op && a.box.cy > base.baseline - base.xh * 0.15 && a.box.h < base.box.h * 0.8) { sub += t; continue; }
      const raised = base && !OPS.includes(base.text) && !op
        && a.box.b < base.box.y + base.box.h * 0.55 && a.box.h < base.box.h * 0.85;
      if (raised) { sup += t; continue; }
      flushSup();
      // буквы/цифры после слова — через пробел: log 5, sin x
      out += (base && base.word && !op && t !== '(' ? ' ' : '') + (t === '·' ? '*' : t);
      base = op ? null : a;
    }
    flushSup();
    return out;
  }

  // items -> текст: "√7 + 5 ="
  function recognize(items) {
    const units = [];
    const add = (s) => {
      if (!s || !s.length) return;
      const u = { s, box: box([s]) };
      u.b4 = s;
      units.push(u);
    };
    for (const it of items) {
      if (it.type === 'stroke') add(it.pts.map((p) => [p[0], p[1]]));
      else if (it.type === 'line') add([[it.x1, it.y1], [it.x2, it.y2]]);
      else if (it.type === 'poly') add(it.closed ? it.pts.concat([it.pts[0]]) : it.pts);
      else if (it.type === 'ellipse') add(arc(it.cx, it.cy, it.rx, it.ry, -90, 270, 24));
      else if (it.type === 'text' || it.type === 'formula') {
        const b = QB.geom ? QB.geom.bbox(it) : { x: it.x, y: it.y, w: it.w || 0, h: it.h || 0 };
        const text = it.type === 'text' ? it.text : it.src;
        units.push({ text, box: { x: b.x, y: b.y, w: b.w, h: b.h, r: b.x + b.w, b: b.y + b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 } });
      }
    }
    units.forEach((u) => { if (u.s) u.b4 = u.s; });
    // для дробей нужны рамки «верха» и «низа» — у готовых кусков берём их рамку
    units.forEach((u) => { if (!u.s) u.b4 = [[u.box.x, u.box.y], [u.box.r, u.box.b]]; });
    let raw = rec(units);
    if (!raw) return '';
    // красиво: √7+5= -> √7 + 5 =
    const tail = /=\s*$/.test(raw);
    if (tail) raw = raw.replace(/=\s*$/, '');
    let nice = raw;
    if (QB.math) { try { nice = QB.math.toPlain(raw) || raw; } catch (e) { nice = raw; } }
    return (nice + (tail ? ' =' : '')).trim();
  }

  QB.ink = { recognize, classify, normalize };
})();
