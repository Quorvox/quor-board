// Инструменты: ручка, маркер, фигуры, ластик, выделение, указка + мышь/тач
(function () {
  const QB = window.QB;
  const G = QB.geom;
  const S = QB.store;
  const A = QB.app;
  const canvas = QB.canvas;
  const draw = () => QB.requestDraw();

  // ---- настройки инструментов (помним между запусками)
  const SIZES = { pen: [2, 3, 5, 8], marker: [10, 18, 28], shape: [2, 3, 5], text: [18, 24, 32, 44], formula: [22, 30, 40, 56] };
  const DEF = {
    color: 'ink', markColor: 'yellow',
    size: { pen: 3, marker: 18, shape: 3, text: 24, formula: 30 },
    smooth: true, autoShape: true, snap: true, dash: false, fill: false, font: 'sans',
  };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('quorboard-opts') || '{}'); } catch (e) { /* нет доступа */ }
  A.opts = { ...DEF, ...saved, size: { ...DEF.size, ...(saved.size || {}) } };
  const saveOpts = () => { try { localStorage.setItem('quorboard-opts', JSON.stringify(A.opts)); } catch (e) { /* ок */ } };

  const KIND = { pen: 'pen', marker: 'marker', line: 'shape', arrow: 'shape', rect: 'shape', circle: 'shape', poly: 'shape', text: 'text', formula: 'formula' };

  const view = () => QB.view();
  const worldOf = (e) => { const s = QB.screenOf(e); return QB.toWorld(s.x, s.y); };
  const coalesced = (e) => {
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    return list && list.length ? list : [e];
  };
  const snapP = (p) => (A.opts.snap ? { x: G.snapGrid(p.x), y: G.snapGrid(p.y) } : { x: p.x, y: p.y });
  const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const byId = (id) => S.page().items.find((it) => it.id === id);
  const selItems = () => S.page().items.filter((it) => A.sel.has(it.id));

  function topHit(wp, filter) {
    const items = S.page().items;
    const tol = 6 / view().z;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (filter && !filter(it)) continue;
      if (G.hit(it, wp.x, wp.y, tol)) return it;
    }
    return null;
  }

  // ---- ручка и маркер
  function penDown(e, wp, marker) {
    const z = view().z;
    const it = {
      id: G.uid(), type: 'stroke', pts: [[wp.x, wp.y]],
      color: marker ? A.opts.markColor : A.opts.color,
      size: A.opts.size[marker ? 'marker' : 'pen'],
    };
    if (marker) it.alpha = 0.38;
    A.live = it;
    const sm = [wp.x, wp.y];
    let last = wp;
    let holdAt = QB.screenOf(e);
    let timer = null;
    let snapped = null;
    const k = A.opts.smooth ? (marker ? 0.3 : 0.55) : 0; // сглаживание дрожания мыши

    const arm = () => {
      clearTimeout(timer);
      if (A.opts.autoShape) timer = setTimeout(trySnap, 520);
    };
    function trySnap() {
      if (snapped || it.pts.length < 4) return;
      const sh = G.recognize(it.pts);
      if (!sh) return;
      snapped = { ...sh, id: it.id, color: it.color, size: it.size };
      if (it.alpha) snapped.alpha = it.alpha;
      A.live = snapped;
      QB.ui.toast(sh.type === 'line' ? 'Ровная линия — можно ещё повернуть' : 'Готово: ровная фигура', 900);
      draw();
    }
    arm();
    return {
      move(e2) {
        for (const ev of coalesced(e2)) {
          const p = worldOf(ev);
          last = p;
          if (snapped) continue;
          sm[0] += (p.x - sm[0]) * (1 - k);
          sm[1] += (p.y - sm[1]) * (1 - k);
          const lp = it.pts[it.pts.length - 1];
          if (Math.hypot(sm[0] - lp[0], sm[1] - lp[1]) > 0.7 / z) it.pts.push([sm[0], sm[1]]);
        }
        if (snapped && snapped.type === 'line') {
          const [x2, y2] = e2.shiftKey ? G.snapAngle(snapped.x1, snapped.y1, last.x, last.y, 15) : G.snapAngle(snapped.x1, snapped.y1, last.x, last.y, 45, 5);
          snapped.x2 = x2;
          snapped.y2 = y2;
        }
        const s = QB.screenOf(e2);
        if (Math.hypot(s.x - holdAt.x, s.y - holdAt.y) > 3) { holdAt = s; arm(); }
        draw();
      },
      up() {
        clearTimeout(timer);
        A.live = null;
        if (snapped) { S.add({ ...snapped }); return; }
        const lp = it.pts[it.pts.length - 1];
        if (it.pts.length > 1 && Math.hypot(last.x - lp[0], last.y - lp[1]) > 0.5 / z) it.pts.push([last.x, last.y]);
        it.pts = it.pts.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
        S.add(it);
      },
      cancel() { clearTimeout(timer); A.live = null; },
    };
  }

  // ---- отрезок, стрелка, прямоугольник, окружность
  function shapeDown(e, wp, kind) {
    const p0 = snapP(wp);
    const base = { id: G.uid(), color: A.opts.color, size: A.opts.size.shape };
    if (A.opts.dash) base.dash = true;
    let it = null;
    const upd = (ev) => {
      const s = QB.screenOf(ev);
      const p = snapP(worldOf(ev));
      let label = '';
      A.overlay.radius = null;
      if (kind === 'line' || kind === 'arrow') {
        if (ev.shiftKey) [p.x, p.y] = G.snapAngle(p0.x, p0.y, p.x, p.y, 15);
        it = { ...base, type: 'line', x1: p0.x, y1: p0.y, x2: p.x, y2: p.y };
        if (kind === 'arrow') it.arrow = true;
        const len = Math.hypot(p.x - p0.x, p.y - p0.y) / G.GRID;
        let ang = (Math.atan2(p0.y - p.y, p.x - p0.x) * 180) / Math.PI;
        if (ang < 0) ang += 360;
        label = fmt(len) + ' кл · ' + Math.round(ang) + '°';
      } else if (kind === 'rect') {
        let w = p.x - p0.x, h = p.y - p0.y;
        if (ev.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        it = { ...base, type: 'rect', x: Math.min(p0.x, p0.x + w), y: Math.min(p0.y, p0.y + h), w: Math.abs(w), h: Math.abs(h) };
        if (A.opts.fill) it.fill = true;
        label = fmt(Math.abs(w) / G.GRID) + ' × ' + fmt(Math.abs(h) / G.GRID) + ' кл';
      } else if (kind === 'circle') {
        const r = Math.hypot(p.x - p0.x, p.y - p0.y);
        it = ev.shiftKey
          ? { ...base, type: 'ellipse', cx: p0.x, cy: p0.y, rx: Math.abs(p.x - p0.x), ry: Math.abs(p.y - p0.y) }
          : { ...base, type: 'ellipse', cx: p0.x, cy: p0.y, rx: r, ry: r };
        if (A.opts.fill) it.fill = true;
        A.overlay.radius = { x1: p0.x, y1: p0.y, x2: p.x, y2: p.y };
        label = ev.shiftKey ? fmt(it.rx / G.GRID) + ' × ' + fmt(it.ry / G.GRID) + ' кл' : 'R = ' + fmt(r / G.GRID) + ' кл';
      }
      A.live = it;
      A.overlay.label = { text: label, x: s.x + 16, y: s.y + 20 };
      draw();
    };
    upd(e);
    const big = () => {
      if (!it) return false;
      if (it.type === 'line') return Math.hypot(it.x2 - it.x1, it.y2 - it.y1) > 2;
      if (it.type === 'rect') return it.w > 2 && it.h > 2;
      return it.rx > 2 || it.ry > 2;
    };
    const end = () => { A.live = null; A.overlay.label = null; A.overlay.radius = null; draw(); };
    return {
      move: upd,
      up() { const ok = big(); const n = it; end(); if (ok) S.add(n); },
      cancel: end,
    };
  }

  // ---- многоугольник: клики по вершинам
  let poly = null;
  function polyLive(cursor) {
    if (!poly) return;
    const pts = poly.pts.slice();
    if (cursor) pts.push([cursor.x, cursor.y]);
    A.live = { ...poly.base, type: 'poly', pts, closed: false };
    draw();
  }
  function polyDown(e, wp) {
    const p = snapP(wp);
    if (!poly) {
      const base = { id: G.uid(), color: A.opts.color, size: A.opts.size.shape };
      if (A.opts.dash) base.dash = true;
      poly = { base, pts: [[p.x, p.y]] };
      polyLive(p);
      return null;
    }
    const f = poly.pts[0];
    if (poly.pts.length >= 3 && Math.hypot(p.x - f[0], p.y - f[1]) * view().z < 12) { finishPoly(true); return null; }
    const l = poly.pts[poly.pts.length - 1];
    if (l[0] !== p.x || l[1] !== p.y) poly.pts.push([p.x, p.y]);
    polyLive(p);
    return null;
  }
  function finishPoly(closed) {
    if (!poly) return;
    const pts = poly.pts;
    const base = poly.base;
    poly = null;
    A.live = null;
    if (pts.length >= 2) {
      const it = { ...base, type: 'poly', pts, closed: !!closed && pts.length >= 3 };
      if (it.closed && A.opts.fill) it.fill = true;
      S.add(it);
    }
    draw();
  }

  // ---- ластик (картинки и графики не трогает — их через выделение)
  function eraserDown(e, wp) {
    const before = S.page().items.slice();
    let removed = 0;
    let last = wp;
    const r = 9 / view().z;
    const eraseAt = (p) => {
      const items = S.page().items;
      const keep = items.filter((it) => it.type === 'image' || it.type === 'graph' || !G.hit(it, p.x, p.y, r));
      if (keep.length !== items.length) { removed += items.length - keep.length; S.page().items = keep; draw(); }
    };
    eraseAt(wp);
    return {
      move(ev) {
        const p = worldOf(ev);
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        const n = Math.max(1, Math.ceil(d / (r * 0.7)));
        for (let i = 1; i <= n; i++) eraseAt({ x: last.x + ((p.x - last.x) * i) / n, y: last.y + ((p.y - last.y) * i) / n });
        last = p;
      },
      up() { if (removed) S.setItems(S.page().items, before); },
      cancel() { if (removed) S.page().items = before; draw(); },
    };
  }

  // ---- выделение: клик, рамка, перенос, размер
  const KEEP_RATIO = ['text', 'formula', 'image'];
  function selectDown(e, wp, sp) {
    const h = A.overlay.handle;
    if (h && A.sel.size && Math.hypot(sp.x - h.x, sp.y - h.y) < 12) return resizeOp(wp, e);
    const hitIt = topHit(wp);
    if (hitIt) {
      if (e.shiftKey) {
        if (A.sel.has(hitIt.id)) A.sel.delete(hitIt.id); else A.sel.add(hitIt.id);
        QB.ui.refreshOpts();
        draw();
        return null;
      }
      if (!A.sel.has(hitIt.id)) A.sel = new Set([hitIt.id]);
      QB.ui.refreshOpts();
      return moveOp(wp);
    }
    if (!e.shiftKey) A.sel.clear();
    QB.ui.refreshOpts();
    return marqueeOp(wp, e.shiftKey);
  }
  function moveOp(start) {
    const before = S.page().items.slice();
    let moved = false;
    return {
      move(ev) {
        const p = worldOf(ev);
        let dx = p.x - start.x, dy = p.y - start.y;
        if (!moved && Math.hypot(dx, dy) * view().z < 3) return;
        moved = true;
        if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        S.page().items = before.map((it) => (A.sel.has(it.id) ? G.translate(it, dx, dy) : it));
        draw();
      },
      up() { if (moved) S.setItems(S.page().items, before); },
      cancel() { S.page().items = before; draw(); },
    };
  }
  function resizeOp(start, e) {
    const before = S.page().items.slice();
    const items = before.filter((it) => A.sel.has(it.id));
    const box = G.unionBox(items);
    const ratio = items.length > 1 || items.some((it) => KEEP_RATIO.includes(it.type));
    let moved = false;
    return {
      move(ev) {
        const p = worldOf(ev);
        let sx = Math.max(0.05, (p.x - box.x) / box.w);
        let sy = Math.max(0.05, (p.y - box.y) / box.h);
        if (ratio !== ev.shiftKey) { const s = Math.max(sx, sy); sx = s; sy = s; }
        moved = true;
        S.page().items = before.map((it) => (A.sel.has(it.id) ? G.scale(it, box.x, box.y, sx, sy) : it));
        draw();
      },
      up() { if (moved) S.setItems(S.page().items, before); },
      cancel() { S.page().items = before; draw(); },
    };
  }
  function marqueeOp(start, add) {
    const prev = new Set(A.sel);
    const rectOf = (p) => ({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) });
    return {
      move(ev) {
        const r = rectOf(worldOf(ev));
        A.overlay.marquee = r;
        A.sel = new Set(add ? prev : []);
        for (const it of S.page().items) if (G.intersects(it, r)) A.sel.add(it.id);
        draw();
      },
      up() { A.overlay.marquee = null; QB.ui.refreshOpts(); draw(); },
      cancel() { A.overlay.marquee = null; draw(); },
    };
  }

  // ---- график: тянем рамку или просто клик
  function graphDown(e, wp) {
    const p0 = snapP(wp);
    let r = null;
    return {
      move(ev) {
        const p = snapP(worldOf(ev));
        r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
        A.overlay.box = r;
        draw();
      },
      up() {
        A.overlay.box = null;
        if (!r || r.w < 60 || r.h < 60) r = { x: p0.x, y: p0.y, w: 360, h: 300 };
        const cx = r.w / 2 / G.GRID, cy = r.h / 2 / G.GRID;
        const it = {
          id: G.uid(), type: 'graph', x: r.x, y: r.y, w: r.w, h: r.h,
          xmin: -Math.round(cx * 10) / 10, xmax: Math.round(cx * 10) / 10,
          ymin: -Math.round(cy * 10) / 10, ymax: Math.round(cy * 10) / 10,
          fns: [{ expr: '', color: 'blue' }],
        };
        S.add(it);
        A.sel = new Set([it.id]);
        QB.panels.openGraph(it.id);
      },
      cancel() { A.overlay.box = null; draw(); },
    };
  }

  // ---- указка
  const trail = [];
  let laserOn = false;
  function laserDown(e, wp) {
    laserOn = true;
    trail.push({ x: wp.x, y: wp.y, t: performance.now(), br: true }); // новый росчерк не соединяем со старым
    return {
      move(ev) { for (const c of coalesced(ev)) { const p = worldOf(c); trail.push({ x: p.x, y: p.y, t: performance.now() }); } },
      up() { laserOn = false; if (trail.length) trail[trail.length - 1].end = true; },
      cancel() { laserOn = false; },
    };
  }

  // ---- сдвиг листа
  function panOp(sp) {
    const v = view();
    const o = { ox: v.ox, oy: v.oy };
    canvas.classList.add('grabbing');
    return {
      move(ev) {
        const s = QB.screenOf(ev);
        v.ox = o.ox + s.x - sp.x;
        v.oy = o.oy + s.y - sp.y;
        QB.viewChanged();
      },
      up() { canvas.classList.remove('grabbing'); },
      cancel() { canvas.classList.remove('grabbing'); },
    };
  }

  const TOOLS = {
    select: { down: selectDown },
    hand: { down: (e, wp, sp) => panOp(sp) },
    pen: { down: (e, wp) => penDown(e, wp, false) },
    marker: { down: (e, wp) => penDown(e, wp, true) },
    eraser: { down: eraserDown },
    line: { down: (e, wp) => shapeDown(e, wp, 'line') },
    arrow: { down: (e, wp) => shapeDown(e, wp, 'arrow') },
    rect: { down: (e, wp) => shapeDown(e, wp, 'rect') },
    circle: { down: (e, wp) => shapeDown(e, wp, 'circle') },
    poly: { down: polyDown },
    text: {
      down(e, wp) {
        const t = topHit(wp, (it) => it.type === 'text');
        QB.panels.editText(t, wp);
        return null;
      },
    },
    formula: {
      down(e, wp) {
        const f = topHit(wp, (it) => it.type === 'formula');
        QB.panels.openFormula(f, wp);
        return null;
      },
    },
    graph: { down: graphDown },
    laser: { down: laserDown },
  };

  // ---- мышь, перо, пальцы
  const pointers = new Map();
  let op = null;
  let gesture = null;

  function cancelOp() {
    if (op && op.cancel) op.cancel();
    op = null;
  }
  function startGesture() {
    const [a, b] = [...pointers.values()];
    const v = view();
    gesture = { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, v: { ...v } };
  }
  function moveGesture() {
    const [a, b] = [...pointers.values()];
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const v = view();
    const g = gesture;
    const z = Math.min(6, Math.max(0.15, (g.v.z * d) / g.d));
    const wx = (g.c.x - g.v.ox) / g.v.z, wy = (g.c.y - g.v.oy) / g.v.z;
    v.z = z;
    v.ox = c.x - wx * z;
    v.oy = c.y - wy * z;
    QB.viewChanged();
  }

  canvas.addEventListener('pointerdown', (e) => {
    QB.ui.closeMenus();
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ок */ }
    const sp = QB.screenOf(e);
    pointers.set(e.pointerId, { x: sp.x, y: sp.y, type: e.pointerType });
    if (pointers.size === 2 && [...pointers.values()].every((p) => p.type === 'touch')) {
      cancelOp();
      startGesture();
      return;
    }
    if (gesture || op) return;
    const wp = QB.toWorld(sp.x, sp.y);
    if (e.button === 1 || (e.button === 0 && A.spaceDown)) { e.preventDefault(); op = panOp(sp); return; }
    if (e.button !== 0) return;
    const t = TOOLS[A.tool];
    op = (t && t.down && t.down(e, wp, sp)) || null;
  });

  canvas.addEventListener('pointermove', (e) => {
    const sp = QB.screenOf(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { ...pointers.get(e.pointerId), x: sp.x, y: sp.y });
    A.cursor = sp;
    if (gesture) { if (pointers.size >= 2) moveGesture(); return; }
    if (op && op.move) { op.move(e); return; }
    // без нажатия
    if (A.tool === 'poly' && poly) polyLive(snapP(QB.toWorld(sp.x, sp.y)));
    if (A.tool === 'select') {
      const h = A.overlay.handle;
      const wp = QB.toWorld(sp.x, sp.y);
      canvas.style.cursor = h && A.sel.size && Math.hypot(sp.x - h.x, sp.y - h.y) < 12 ? 'nwse-resize' : topHit(wp) ? 'move' : '';
    }
    if (['eraser', 'laser', 'line', 'arrow', 'rect', 'circle', 'poly', 'graph'].includes(A.tool)) draw();
  });

  function pointerEnd(e) {
    pointers.delete(e.pointerId);
    if (gesture) { if (pointers.size < 2) gesture = null; return; }
    if (op) {
      const o = op;
      op = null;
      if (e.type === 'pointercancel') { if (o.cancel) o.cancel(); } else if (o.up) o.up(e);
      QB.ui.refreshTop();
    }
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointerleave', () => { A.cursor = null; draw(); });

  canvas.addEventListener('dblclick', (e) => {
    const wp = worldOf(e);
    if (A.tool === 'poly') { if (poly) finishPoly(false); return; }
    if (A.tool !== 'select' && A.tool !== 'text') return;
    const it = topHit(wp);
    if (!it) return;
    if (it.type === 'text') QB.panels.editText(it, wp);
    else if (it.type === 'formula') QB.panels.openFormula(it, wp);
    else if (it.type === 'graph') QB.panels.openGraph(it.id);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const sp = QB.screenOf(e);
    if (e.ctrlKey || e.metaKey) {
      QB.zoomAt(view().z * Math.exp(-e.deltaY * k * 0.0025), sp.x, sp.y);
      return;
    }
    const v = view();
    if (e.shiftKey && !e.deltaX) v.ox -= e.deltaY * k;
    else { v.ox -= e.deltaX * k; v.oy -= e.deltaY * k; }
    QB.viewChanged();
  }, { passive: false });

  // ---- поверх холста: рамки, подписи, ластик, указка
  function drawOverlay(ctx, v, th, W, H) {
    const toS = (x, y) => [x * v.z + v.ox, y * v.z + v.oy];
    ctx.save();
    // выделение
    const sel = A.tool === 'select' ? selItems() : [];
    A.overlay.handle = QB.render.drawSelection(ctx, sel, v, th, sel.length > 0);
    // рамка выделения мышью
    const m = A.overlay.marquee || A.overlay.box;
    if (m) {
      const [x, y] = toS(m.x, m.y);
      ctx.fillStyle = th.sel + '18';
      ctx.strokeStyle = th.sel;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(x, y, m.w * v.z, m.h * v.z);
      ctx.strokeRect(x + 0.5, y + 0.5, m.w * v.z, m.h * v.z);
      ctx.setLineDash([]);
    }
    // радиус циркуля
    const r = A.overlay.radius;
    if (r) {
      const [x1, y1] = toS(r.x1, r.y1), [x2, y2] = toS(r.x2, r.y2);
      ctx.strokeStyle = th.sel;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = th.sel;
      ctx.beginPath();
      ctx.arc(x1, y1, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // точка привязки к клетке
    const c = A.cursor;
    if (c && A.opts.snap && ['line', 'arrow', 'rect', 'circle', 'poly', 'graph'].includes(A.tool)) {
      const w = QB.toWorld(c.x, c.y);
      const [sx, sy] = toS(G.snapGrid(w.x), G.snapGrid(w.y));
      ctx.strokeStyle = th.sel;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // подпись размеров
    const lb = A.overlay.label;
    if (lb && lb.text) {
      ctx.font = '600 12px Manrope, system-ui, sans-serif';
      const tw = ctx.measureText(lb.text).width;
      const x = Math.min(lb.x, W - tw - 20), y = Math.min(lb.y, H - 30);
      ctx.fillStyle = 'rgba(20,22,28,0.86)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, tw + 16, 24, 7); else ctx.rect(x, y, tw + 16, 24);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(lb.text, x + 8, y + 12);
    }
    // ластик
    if (c && A.tool === 'eraser') {
      ctx.strokeStyle = th.label;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    // указка: след тает за ~0.8 с
    const now = performance.now();
    while (trail.length && now - trail[0].t > 800) trail.shift();
    if (trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        if (b.br || a.end) continue;
        const life = 1 - (now - b.t) / 800;
        const [x1, y1] = toS(a.x, a.y), [x2, y2] = toS(b.x, b.y);
        ctx.strokeStyle = `rgba(255,60,40,${0.25 * life})`;
        ctx.lineWidth = 12 * life + 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,70,50,${0.95 * life})`;
        ctx.lineWidth = 4 * life + 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    if (c && A.tool === 'laser') {
      ctx.fillStyle = 'rgba(255,60,40,0.25)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3c28';
      ctx.beginPath(); ctx.arc(c.x, c.y, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---- действия с выделенным
  function setTool(name) {
    if (A.tool === 'poly' && name !== 'poly') finishPoly(false);
    cancelOp();
    A.tool = name;
    if (name !== 'select') A.sel.clear();
    A.overlay.label = null;
    canvas.dataset.tool = name;
    canvas.style.cursor = '';
    QB.ui.refreshTools();
    draw();
  }
  function deleteSel() {
    if (!A.sel.size) return;
    const map = {};
    A.sel.forEach((id) => { map[id] = null; });
    A.sel.clear();
    S.replace(map);
    QB.ui.refreshOpts();
  }
  function cloneItems(items, dx, dy) {
    return items.map((it) => {
      const n = G.translate(it, dx, dy);
      n.id = G.uid();
      return n;
    });
  }
  function addAndSelect(items) {
    if (!items.length) return;
    S.setItems(S.page().items.concat(items));
    A.sel = new Set(items.map((it) => it.id));
    if (A.tool !== 'select') setTool('select');
    QB.ui.refreshOpts();
    draw();
  }
  const duplicateSel = () => addAndSelect(cloneItems(selItems(), 20, 20));
  function selectAll() {
    setTool('select');
    A.sel = new Set(S.page().items.map((it) => it.id));
    QB.ui.refreshOpts();
    draw();
  }
  function bringFront() {
    const items = S.page().items;
    S.setItems(items.filter((it) => !A.sel.has(it.id)).concat(items.filter((it) => A.sel.has(it.id))));
  }
  function nudge(dx, dy) {
    if (!A.sel.size) return;
    const before = S.page().items.slice();
    S.setItems(before.map((it) => (A.sel.has(it.id) ? G.translate(it, dx, dy) : it)), before);
  }
  function applyColor(c) {
    const map = {};
    for (const it of selItems()) {
      if (it.type === 'image') continue;
      if (it.type === 'graph') map[it.id] = { ...it, fns: it.fns.map((f, i) => (i === 0 ? { ...f, color: c } : f)) };
      else map[it.id] = { ...it, color: c };
    }
    if (Object.keys(map).length) S.replace(map);
  }
  function applySize(kind, size) {
    const map = {};
    for (const it of selItems()) {
      if (['stroke', 'line', 'rect', 'ellipse', 'poly'].includes(it.type) && kind !== 'text') map[it.id] = { ...it, size };
    }
    if (Object.keys(map).length) S.replace(map);
  }
  function escape() {
    if (poly) { poly = null; A.live = null; draw(); return true; }
    if (op) { cancelOp(); return true; }
    if (A.sel.size) { A.sel.clear(); QB.ui.refreshOpts(); draw(); return true; }
    return false;
  }

  // текст выделенного — для копирования наружу (формулы человеческим текстом)
  const INK = ['stroke', 'line', 'poly', 'ellipse'];
  const hasInk = (items) => items.some((it) => INK.includes(it.type));
  function selectionText(items) {
    // написано от руки — распознаём вместе с текстом и формулами рядом
    if (hasInk(items)) return QB.ink.recognize(items.filter((it) => INK.includes(it.type) || it.type === 'text' || it.type === 'formula'));
    const list = items.slice().sort((a, b) => {
      const ba = G.bbox(a), bb = G.bbox(b);
      return Math.abs(ba.y - bb.y) > 12 ? ba.y - bb.y : ba.x - bb.x;
    });
    const out = [];
    for (const it of list) {
      if (it.type === 'text') out.push(it.text);
      else if (it.type === 'formula') out.push(QB.math.toPlain(it.src));
      else if (it.type === 'graph') it.fns.forEach((f) => { if (f.expr.trim()) out.push('y = ' + QB.math.toPlain(String(f.expr).replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, ''))); });
    }
    return out.join('\n');
  }

  QB.tools = {
    SIZES, KIND, INK, hasInk, setTool, deleteSel, duplicateSel, selectAll, bringFront, nudge, applyColor, applySize, escape,
    finishPoly: () => finishPoly(false), drawOverlay, selItems, selectionText, cloneItems, addAndSelect, topHit, saveOpts,
    animating: () => trail.length > 0 || laserOn,
    hasPoly: () => !!poly,
  };
})();
