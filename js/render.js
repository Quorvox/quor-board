// Рисование: фон листа, объекты, графики, выделение
(function () {
  const QB = (window.QB = window.QB || {});
  const G = QB.geom;
  const GRID = G.GRID;

  const THEMES = {
    paper: {
      bg: '#fbfaf6', grid: 'rgba(64,118,186,0.19)', gridBold: 'rgba(64,118,186,0.32)', margin: 'rgba(224,49,49,0.35)',
      axis: '#3d4555', label: '#6a7282', sel: '#ff5a1f',
      gBg: 'rgba(255,255,255,0.93)', gLine: 'rgba(30,35,45,0.16)', gGrid: 'rgba(30,35,45,0.08)', gAxis: 'rgba(30,35,45,0.7)',
      colors: { ink: '#1f2430', blue: '#1c64f2', red: '#e03131', green: '#2b8a3e', orange: '#f76707', purple: '#7048e8', yellow: '#fab005' },
    },
    chalk: {
      bg: '#121619', grid: 'rgba(255,255,255,0.075)', gridBold: 'rgba(255,255,255,0.14)', margin: 'rgba(255,135,135,0.3)',
      axis: '#c9d1d9', label: '#8b949e', sel: '#ff7a45',
      gBg: 'rgba(24,29,33,0.95)', gLine: 'rgba(255,255,255,0.14)', gGrid: 'rgba(255,255,255,0.07)', gAxis: 'rgba(230,236,242,0.75)',
      colors: { ink: '#eef1f4', blue: '#74c0fc', red: '#ff8787', green: '#8ce99a', orange: '#ffa94d', purple: '#b197fc', yellow: '#ffe066' },
    },
  };
  const theme = (name) => THEMES[name] || THEMES.paper;
  const color = (c, th) => th.colors[c] || c || th.colors.ink;

  // ---- кэши: пути штрихов и картинки
  const pathCache = new WeakMap();
  const imgCache = new Map();

  function buildPath(pts) {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    if (pts.length < 3) {
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
      return p;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      p.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1];
    p.lineTo(l[0], l[1]);
    return p;
  }
  function pathOf(it) {
    let p = pathCache.get(it);
    if (!p) { p = buildPath(it.pts); pathCache.set(it, p); }
    return p;
  }
  function imageOf(it) {
    let c = imgCache.get(it.aid);
    if (!c) {
      c = { img: new Image(), ok: false };
      c.img.onload = () => { c.ok = true; if (QB.requestDraw) QB.requestDraw(); };
      // только встроенные картинки: чужой файл тетради не дёрнет внешний сервер
      if (/^data:image\//.test(String(it.src || ''))) c.img.src = it.src;
      imgCache.set(it.aid, c);
    }
    return c;
  }

  // ---- фон
  function niceStep(min) {
    const p = Math.pow(10, Math.floor(Math.log10(min)));
    for (const m of [1, 2, 5, 10]) if (m * p >= min) return m * p;
    return 10 * p;
  }
  const fmt = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',').replace('-', '−');

  function gridLines(ctx, view, W, H, step, col, vertical, horizontal) {
    const { ox, oy, z } = view;
    ctx.beginPath();
    if (vertical) {
      for (let x = Math.floor(-ox / z / step) * step; x <= (W - ox) / z; x += step) {
        const sx = Math.round(x * z + ox) + 0.5;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
      }
    }
    if (horizontal) {
      for (let y = Math.floor(-oy / z / step) * step; y <= (H - oy) / z; y += step) {
        const sy = Math.round(y * z + oy) + 0.5;
        ctx.moveTo(0, sy); ctx.lineTo(W, sy);
      }
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawBackground(ctx, bg, view, W, H, th) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);
    const { ox, oy, z } = view;
    if (bg === 'plain') return;
    if (bg === 'lines') {
      const step = GRID * 1.5;
      if (step * z >= 6) gridLines(ctx, view, W, H, step, th.grid, false, true);
      return;
    }
    let step = GRID;
    while (step * z < 9) step *= 5;
    if (bg === 'dots') {
      if (step * z < 12) step *= 2;
      ctx.fillStyle = th.gridBold;
      const r = Math.max(1, Math.min(2, z * 1.4));
      for (let x = Math.floor(-ox / z / step) * step; x <= (W - ox) / z; x += step) {
        for (let y = Math.floor(-oy / z / step) * step; y <= (H - oy) / z; y += step) {
          ctx.fillRect(x * z + ox - r / 2, y * z + oy - r / 2, r, r);
        }
      }
      return;
    }
    gridLines(ctx, view, W, H, step, th.grid, true, true);
    if (bg === 'coord') drawAxes(ctx, view, W, H, th);
  }

  // оси координат на весь лист: 1 клетка = 1
  function drawAxes(ctx, view, W, H, th) {
    const { ox, oy, z } = view;
    const cell = GRID * z;
    const k = niceStep(30 / cell); // подписи не чаще чем раз в 30px
    const ax = Math.min(Math.max(ox, 0), W), ay = Math.min(Math.max(oy, 0), H);
    ctx.strokeStyle = th.axis;
    ctx.fillStyle = th.axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(ay) + 0.5); ctx.lineTo(W, Math.round(ay) + 0.5);
    ctx.moveTo(Math.round(ax) + 0.5, 0); ctx.lineTo(Math.round(ax) + 0.5, H);
    ctx.stroke();
    // стрелки
    ctx.beginPath();
    ctx.moveTo(W - 2, ay); ctx.lineTo(W - 12, ay - 5); ctx.lineTo(W - 12, ay + 5);
    ctx.moveTo(ax, 2); ctx.lineTo(ax - 5, 12); ctx.lineTo(ax + 5, 12);
    ctx.fill();
    ctx.font = '600 13px Manrope, system-ui, sans-serif';
    ctx.fillText('x', W - 16, ay + 20);
    ctx.fillText('y', ax + 10, 16);
    // деления и подписи
    ctx.fillStyle = th.label;
    ctx.font = '500 11px Manrope, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    const u0 = Math.ceil(-ox / cell / k) * k, u1 = (W - ox) / cell;
    for (let u = u0; u <= u1; u += k) {
      const sx = u * cell + ox;
      ctx.moveTo(sx, ay - 3); ctx.lineTo(sx, ay + 3);
      if (Math.abs(u) > 1e-9) ctx.fillText(fmt(u), sx, ay + 5);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const v0 = Math.ceil(-oy / cell / k) * k, v1 = (H - oy) / cell;
    for (let v = v0; v <= v1; v += k) {
      const sy = v * cell + oy;
      ctx.moveTo(ax - 3, sy); ctx.lineTo(ax + 3, sy);
      if (Math.abs(v) > 1e-9) ctx.fillText(fmt(-v), ax - 6, sy);
    }
    ctx.stroke();
    ctx.textBaseline = 'top';
    ctx.fillText('0', ax - 5, ay + 4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ---- объекты
  function arrowHead(ctx, x1, y1, x2, y2, size, col) {
    const len = Math.max(10, size * 3.5);
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(a - 0.42), y2 - len * Math.sin(a - 0.42));
    ctx.lineTo(x2 - len * Math.cos(a + 0.42), y2 - len * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
    return len;
  }
  function fillShape(ctx, it, col) {
    if (!it.fill) return;
    ctx.save();
    ctx.globalAlpha *= 0.14;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }

  function drawItem(ctx, it, th, z, live) {
    const col = color(it.color, th);
    ctx.save();
    ctx.globalAlpha = it.alpha || 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col;
    ctx.lineWidth = it.size || 2;
    if (it.dash) ctx.setLineDash([it.size * 2.6 + 4, it.size * 2.2 + 4]);
    switch (it.type) {
      case 'stroke':
        if (it.pts.length === 1) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(it.pts[0][0], it.pts[0][1], it.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.stroke(live ? buildPath(it.pts) : pathOf(it));
        break;
      case 'line': {
        let { x2, y2 } = it;
        if (it.arrow) {
          const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1);
          if (len > 1) {
            const hl = arrowHead(ctx, it.x1, it.y1, it.x2, it.y2, it.size, col);
            const k = Math.max(0, (len - hl * 0.7) / len);
            x2 = it.x1 + (it.x2 - it.x1) * k;
            y2 = it.y1 + (it.y2 - it.y1) * k;
          }
        }
        ctx.beginPath();
        ctx.moveTo(it.x1, it.y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        break;
      }
      case 'rect':
        ctx.beginPath();
        ctx.rect(it.x, it.y, it.w, it.h);
        fillShape(ctx, it, col);
        ctx.stroke();
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(it.cx, it.cy, Math.max(it.rx, 0.1), Math.max(it.ry, 0.1), 0, 0, Math.PI * 2);
        fillShape(ctx, it, col);
        ctx.stroke();
        break;
      case 'poly':
        ctx.beginPath();
        it.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        if (it.closed) { ctx.closePath(); fillShape(ctx, it, col); }
        ctx.stroke();
        break;
      case 'text': {
        ctx.font = G.textFont(it);
        ctx.fillStyle = col;
        ctx.textBaseline = 'middle';
        const lh = G.textLineH(it);
        it.text.split('\n').forEach((l, i) => ctx.fillText(l, it.x, it.y + i * lh + lh / 2));
        break;
      }
      case 'formula': {
        const img = QB.formula.get(it.latex, col);
        if (img) ctx.drawImage(img, it.x, it.y, it.w, it.h);
        else {
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.4;
          ctx.strokeRect(it.x, it.y, it.w, it.h);
        }
        break;
      }
      case 'image': {
        const c = imageOf(it);
        if (c.ok) ctx.drawImage(c.img, it.x, it.y, it.w, it.h);
        break;
      }
      case 'graph':
        drawGraph(ctx, it, th, z);
        break;
    }
    ctx.restore();
  }

  // ---- график функции в рамке
  function drawGraph(ctx, it, th, z) {
    const { x, y, w, h } = it;
    const { xmin, xmax, ymin, ymax } = it;
    const sx = w / (xmax - xmin), sy = h / (ymax - ymin);
    const X = (v) => x + (v - xmin) * sx;
    const Y = (v) => y + (ymax - v) * sy;
    ctx.setLineDash([]);
    ctx.fillStyle = th.gBg;
    ctx.strokeStyle = th.gLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 10) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    // сетка
    const stx = niceStep(22 / sx), sty = niceStep(22 / sy);
    ctx.beginPath();
    for (let v = Math.ceil(xmin / stx) * stx; v <= xmax; v += stx) { ctx.moveTo(X(v), y); ctx.lineTo(X(v), y + h); }
    for (let v = Math.ceil(ymin / sty) * sty; v <= ymax; v += sty) { ctx.moveTo(x, Y(v)); ctx.lineTo(x + w, Y(v)); }
    ctx.strokeStyle = th.gGrid;
    ctx.lineWidth = 1 / z;
    ctx.stroke();

    // оси
    const ax = Math.min(Math.max(X(0), x), x + w), ay = Math.min(Math.max(Y(0), y), y + h);
    ctx.strokeStyle = th.gAxis;
    ctx.fillStyle = th.gAxis;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, ay); ctx.lineTo(x + w, ay);
    ctx.moveTo(ax, y); ctx.lineTo(ax, y + h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w - 1, ay); ctx.lineTo(x + w - 9, ay - 4); ctx.lineTo(x + w - 9, ay + 4);
    ctx.moveTo(ax, y + 1); ctx.lineTo(ax - 4, y + 9); ctx.lineTo(ax + 4, y + 9);
    ctx.fill();

    // подписи
    ctx.font = '500 10px Manrope, system-ui, sans-serif';
    ctx.fillStyle = th.label;
    const lx = niceStep(34 / sx), ly = niceStep(24 / sy);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = Math.ceil(xmin / lx) * lx; v <= xmax; v += lx) {
      if (Math.abs(v) < lx / 2) continue;
      ctx.fillText(fmt(v), X(v), Math.min(ay + 3, y + h - 12));
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(ymin / ly) * ly; v <= ymax; v += ly) {
      if (Math.abs(v) < ly / 2) continue;
      ctx.fillText(fmt(v), Math.max(ax - 4, x + 22), Y(v));
    }
    ctx.textAlign = 'left';

    // функции
    const N = Math.min(2400, Math.max(200, Math.ceil(w * z * 1.5)));
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const f of it.fns) {
      const c = QB.math.compileFn(f.expr);
      if (!c.fn) continue;
      ctx.strokeStyle = color(f.color, th);
      ctx.beginPath();
      let pen = false, prev = 0;
      for (let i = 0; i <= N; i++) {
        const vx = xmin + ((xmax - xmin) * i) / N;
        const vy = c.fn(vx);
        if (!Number.isFinite(vy)) { pen = false; continue; }
        let py = Y(vy);
        if (pen && Math.abs(py - prev) > h * 2) pen = false; // разрыв (асимптота)
        prev = py;
        py = Math.max(y - h, Math.min(y + 2 * h, py));
        const px = X(vx);
        if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.restore();

    // подписи функций (формулами)
    let ly2 = y + 8;
    for (const f of it.fns) {
      const c = QB.math.compileFn(f.expr);
      if (!c.fn) continue;
      const col = color(f.color, th);
      const latex = 'y=' + QB.math.toLatex(String(f.expr).replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, ''));
      const img = QB.formula.get(latex, col);
      const fh = 17;
      if (img) {
        const fw = (img.naturalWidth / img.naturalHeight) * fh;
        ctx.fillStyle = th.gBg;
        ctx.fillRect(x + 6, ly2 - 2, fw + 8, fh + 4);
        ctx.drawImage(img, x + 10, ly2, fw, fh);
      } else {
        ctx.font = '600 12px Manrope, system-ui, sans-serif';
        ctx.fillStyle = col;
        ctx.textBaseline = 'top';
        ctx.fillText('y = ' + f.expr, x + 10, ly2 + 2);
        ctx.textBaseline = 'alphabetic';
      }
      ly2 += fh + 7;
    }
  }

  // ---- сцена целиком (в экранных координатах ctx уже с учётом DPR)
  function drawScene(ctx, page, view, W, H, opt) {
    const th = theme(opt.theme);
    drawBackground(ctx, page.bg, view, W, H, th);
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.z, view.z);
    const vx0 = -view.ox / view.z, vy0 = -view.oy / view.z, vx1 = (W - view.ox) / view.z, vy1 = (H - view.oy) / view.z;
    for (const it of page.items) {
      if (opt.hideId && it.id === opt.hideId) continue;
      const b = G.bbox(it);
      if (b.x > vx1 || b.y > vy1 || b.x + b.w < vx0 || b.y + b.h < vy0) continue; // за экраном
      drawItem(ctx, it, th, view.z, false);
    }
    if (opt.live) drawItem(ctx, opt.live, th, view.z, true);
    ctx.restore();
  }

  function drawSelection(ctx, items, view, th, showHandle) {
    if (!items.length) return null;
    const S = (b) => ({ x: b.x * view.z + view.ox, y: b.y * view.z + view.oy, w: b.w * view.z, h: b.h * view.z });
    ctx.save();
    ctx.strokeStyle = th.sel;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    for (const it of items) {
      const b = S(G.bbox(it));
      ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    }
    const u = S(G.unionBox(items));
    let handle = null;
    if (showHandle) {
      ctx.setLineDash([]);
      if (items.length > 1) ctx.strokeRect(u.x - 7, u.y - 7, u.w + 14, u.h + 14);
      handle = { x: u.x + u.w + 7, y: u.y + u.h + 7 };
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.rect(handle.x - 6, handle.y - 6, 12, 12);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return handle;
  }

  // всё ли догружено (формулы, картинки) — для экспорта
  function prepare(page, themeName) {
    const th = theme(themeName);
    const keys = [];
    const waits = [];
    for (const it of page.items) {
      if (it.type === 'formula') keys.push([it.latex, color(it.color, th)]);
      if (it.type === 'graph') {
        for (const f of it.fns) {
          if (!QB.math.compileFn(f.expr).fn) continue;
          keys.push(['y=' + QB.math.toLatex(String(f.expr).replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, '')), color(f.color, th)]);
        }
      }
      if (it.type === 'image') {
        const c = imageOf(it);
        if (!c.ok) waits.push(new Promise((r) => { c.img.addEventListener('load', r, { once: true }); setTimeout(r, 3000); }));
      }
    }
    return Promise.all([QB.formula.whenLoaded(keys), ...waits]);
  }

  // картинка листа: только область с содержимым
  function renderPage(page, themeName, scale) {
    const items = page.items;
    if (!items.length) return null;
    const b = G.unionBox(items);
    const m = 40;
    const W = Math.ceil((b.w + m * 2) * scale), H = Math.ceil((b.h + m * 2) * scale);
    const cv = document.createElement('canvas');
    cv.width = Math.min(W, 16000);
    cv.height = Math.min(H, 16000);
    const ctx = cv.getContext('2d');
    const view = { ox: (m - b.x) * scale, oy: (m - b.y) * scale, z: scale };
    drawScene(ctx, page, view, cv.width, cv.height, { theme: themeName });
    return cv;
  }

  QB.render = { THEMES, theme, color, drawScene, drawSelection, drawItem, renderPage, prepare, niceStep };
})();
