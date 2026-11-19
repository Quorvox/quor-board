// Геометрия объектов: рамки, попадание мышью, сдвиг/масштаб, распознавание фигур
(function () {
  const QB = (window.QB = window.QB || {});
  const GRID = 30; // размер клетки в мировых пикселях
  let bbCache = new WeakMap();
  const mctx = document.createElement('canvas').getContext('2d');

  const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function textFont(it) {
    return it.font === 'hand'
      ? `600 ${it.size * 1.3}px "Caveat", cursive`
      : `500 ${it.size}px "Manrope", system-ui, sans-serif`;
  }
  const textLineH = (it) => it.size * 1.35;
  function textSize(it) {
    mctx.font = textFont(it);
    const lines = it.text.split('\n');
    let w = 0;
    for (const l of lines) w = Math.max(w, mctx.measureText(l || ' ').width);
    return { w: Math.max(w, it.size * 0.5), h: lines.length * textLineH(it) };
  }

  function ptsBox(pts, pad) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    }
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }

  function bbox(it) {
    let b = bbCache.get(it);
    if (b) return b;
    const pad = (it.size || 0) / 2;
    switch (it.type) {
      case 'stroke': case 'poly': b = ptsBox(it.pts, pad); break;
      case 'line': {
        const ap = it.arrow ? Math.max(10, it.size * 3.5) : 0;
        b = ptsBox([[it.x1, it.y1], [it.x2, it.y2]], pad + ap * 0.6);
        break;
      }
      case 'rect': b = { x: it.x - pad, y: it.y - pad, w: it.w + pad * 2, h: it.h + pad * 2 }; break;
      case 'ellipse': b = { x: it.cx - it.rx - pad, y: it.cy - it.ry - pad, w: it.rx * 2 + pad * 2, h: it.ry * 2 + pad * 2 }; break;
      case 'text': { const s = textSize(it); b = { x: it.x, y: it.y, w: s.w, h: s.h }; break; }
      default: b = { x: it.x, y: it.y, w: it.w, h: it.h };
    }
    bbCache.set(it, b);
    return b;
  }

  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * dx - px, qy = ay + t * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function nearPolyline(pts, x, y, d, closed) {
    if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= d;
    for (let i = 1; i < pts.length; i++) {
      if (distSeg(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= d) return true;
    }
    if (closed) {
      const a = pts[pts.length - 1], b = pts[0];
      if (distSeg(x, y, a[0], a[1], b[0], b[1]) <= d) return true;
    }
    return false;
  }
  function inPoly(pts, x, y) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  const inBox = (b, x, y, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

  function hit(it, x, y, tol) {
    const b = bbox(it);
    if (!inBox(b, x, y, tol)) return false;
    const d = tol + (it.size || 0) / 2;
    switch (it.type) {
      case 'stroke': return nearPolyline(it.pts, x, y, d, false);
      case 'line': return distSeg(x, y, it.x1, it.y1, it.x2, it.y2) <= d;
      case 'poly': return nearPolyline(it.pts, x, y, d, it.closed) || (it.fill && it.closed && inPoly(it.pts, x, y));
      case 'rect': {
        const c = [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]];
        return nearPolyline(c, x, y, d, true) || (it.fill && inBox({ x: it.x, y: it.y, w: it.w, h: it.h }, x, y));
      }
      case 'ellipse': {
        const rx = Math.max(it.rx, 0.5), ry = Math.max(it.ry, 0.5);
        const k = Math.hypot((x - it.cx) / rx, (y - it.cy) / ry);
        if (it.fill && k <= 1) return true;
        return Math.abs(k - 1) * Math.min(rx, ry) <= d;
      }
      default: return true; // текст, формула, картинка, график — по рамке
    }
  }

  function intersects(it, r) {
    const b = bbox(it);
    if (b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y) return false;
    if (it.type === 'stroke' || it.type === 'poly') return it.pts.some((p) => inBox(r, p[0], p[1]));
    return true;
  }

  function translate(it, dx, dy) {
    const n = { ...it };
    switch (it.type) {
      case 'stroke': case 'poly': n.pts = it.pts.map((p) => [p[0] + dx, p[1] + dy]); break;
      case 'line': n.x1 += dx; n.y1 += dy; n.x2 += dx; n.y2 += dy; break;
      case 'ellipse': n.cx += dx; n.cy += dy; break;
      default: n.x += dx; n.y += dy;
    }
    return n;
  }

  // масштаб относительно точки (ox, oy)
  function scale(it, ox, oy, sx, sy) {
    const n = { ...it };
    const X = (v) => ox + (v - ox) * sx, Y = (v) => oy + (v - oy) * sy;
    switch (it.type) {
      case 'stroke': case 'poly': n.pts = it.pts.map((p) => [X(p[0]), Y(p[1])]); break;
      case 'line': n.x1 = X(it.x1); n.y1 = Y(it.y1); n.x2 = X(it.x2); n.y2 = Y(it.y2); break;
      case 'ellipse': n.cx = X(it.cx); n.cy = Y(it.cy); n.rx = it.rx * Math.abs(sx); n.ry = it.ry * Math.abs(sy); break;
      case 'text': case 'formula': {
        const s = Math.max(0.1, sx);
        n.x = X(it.x); n.y = oy + (it.y - oy) * s; n.size = Math.max(6, it.size * s);
        if (it.type === 'formula') { n.w = it.w * s; n.h = it.h * s; }
        break;
      }
      default:
        n.x = X(it.x); n.y = Y(it.y); n.w = Math.max(20, it.w * sx); n.h = Math.max(20, it.h * sy);
    }
    return n;
  }

  function unionBox(items) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of items) {
      const b = bbox(it);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    return items.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  // ---- распознавание фигур (держишь мышь в конце линии)
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    let idx = 0, dmax = 0;
    const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = distSeg(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax <= eps) return [a, b];
    const l = rdp(pts.slice(0, idx + 1), eps);
    const r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  function pathLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }
  function snapAngle(x0, y0, x1, y1, stepDeg, tolDeg) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const st = (stepDeg * Math.PI) / 180;
    const sn = Math.round(ang / st) * st;
    if (tolDeg != null && Math.abs(sn - ang) > (tolDeg * Math.PI) / 180) return [x1, y1];
    return [x0 + Math.cos(sn) * len, y0 + Math.sin(sn) * len];
  }

  // pts — точки штриха; вернёт описание фигуры без цвета/толщины или null
  function recognize(pts) {
    if (pts.length < 4) return null;
    const L = pathLen(pts);
    if (L < 18) return null;
    const a = pts[0], z = pts[pts.length - 1];
    const D = Math.hypot(z[0] - a[0], z[1] - a[1]);
    const box = ptsBox(pts, 0);
    const diag = Math.hypot(box.w, box.h);

    // прямая
    let maxDev = 0;
    for (const p of pts) maxDev = Math.max(maxDev, distSeg(p[0], p[1], a[0], a[1], z[0], z[1]));
    if (D > L * 0.85 && maxDev < Math.max(5, L * 0.06)) {
      const [x2, y2] = snapAngle(a[0], a[1], z[0], z[1], 45, 6);
      return { type: 'line', x1: a[0], y1: a[1], x2, y2 };
    }

    const closed = D < Math.max(L * 0.18, diag * 0.22);
    if (closed) {
      // эллипс / окружность
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const rx = box.w / 2, ry = box.h / 2;
      if (rx > 4 && ry > 4) {
        let e = 0;
        for (const p of pts) e += Math.abs(Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry) - 1);
        e /= pts.length;
        if (e < 0.085) {
          if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) {
            const r = (rx + ry) / 2;
            return { type: 'ellipse', cx, cy, rx: r, ry: r };
          }
          return { type: 'ellipse', cx, cy, rx, ry };
        }
      }
      // многоугольник
      let v = rdp(pts.concat([pts[0]]), Math.max(6, diag * 0.07));
      v = v.slice(0, -1);
      // склеиваем почти совпавшие вершины
      v = v.filter((p, i) => i === 0 || Math.hypot(p[0] - v[i - 1][0], p[1] - v[i - 1][1]) > diag * 0.08);
      if (v.length >= 3 && v.length <= 6) {
        if (v.length === 4) {
          // почти прямоугольник по осям -> ровный прямоугольник
          const axis = v.every((p, i) => {
            const q = v[(i + 1) % 4];
            const ang = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) % (Math.PI / 2);
            return ang < 0.14 || ang > Math.PI / 2 - 0.14;
          });
          if (axis) {
            const b = ptsBox(v, 0);
            return { type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h };
          }
        }
        return { type: 'poly', pts: v.map((p) => [p[0], p[1]]), closed: true };
      }
      return null;
    }

    // ломаная из 2–3 отрезков (например, угол)
    const v = rdp(pts, Math.max(5, diag * 0.06));
    if (v.length >= 3 && v.length <= 4) {
      let dev = 0;
      for (const p of pts) {
        let m = Infinity;
        for (let i = 1; i < v.length; i++) m = Math.min(m, distSeg(p[0], p[1], v[i - 1][0], v[i - 1][1], v[i][0], v[i][1]));
        dev = Math.max(dev, m);
      }
      if (dev < Math.max(5, diag * 0.06)) return { type: 'poly', pts: v.map((p) => [p[0], p[1]]), closed: false };
    }
    return null;
  }

  const snapGrid = (v) => Math.round(v / GRID) * GRID;

  QB.geom = {
    GRID, uid, bbox, hit, intersects, translate, scale, unionBox, recognize, snapAngle, snapGrid,
    textFont, textLineH, textSize, distSeg, inBox,
    resetCache() { bbCache = new WeakMap(); },
  };
})();
