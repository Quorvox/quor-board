// Холст: размер, вид (сдвиг/масштаб), цикл отрисовки
(function () {
  const QB = (window.QB = window.QB || {});
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, dirty = true;

  const A = (QB.app = {
    tool: 'pen',
    sel: new Set(),
    live: null, // то, что рисуется прямо сейчас
    editingId: null, // текст в редакторе — на холсте не рисуем
    cursor: null, // курсор в экранных координатах
    overlay: {}, // рамка выделения, подписи размеров и т.п.
    spaceDown: false,
  });

  QB.requestDraw = () => { dirty = true; };

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = r.width;
    H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas.parentElement);

  function view() {
    const pg = QB.store.page();
    if (!pg.view) pg.view = { ox: Math.round(W / 2 / 30) * 30, oy: Math.round(H / 2 / 30) * 30, z: 1 };
    return pg.view;
  }
  const toWorld = (sx, sy) => {
    const v = view();
    return { x: (sx - v.ox) / v.z, y: (sy - v.oy) / v.z };
  };
  const screenOf = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function viewChanged() {
    dirty = true;
    QB.store.saveSoon();
    if (QB.ui) QB.ui.updateZoom();
    if (QB.panels) QB.panels.reposition();
  }
  function zoomAt(z, sx, sy) {
    const v = view();
    z = Math.min(6, Math.max(0.15, z));
    if (sx == null) { sx = W / 2; sy = H / 2; }
    const wx = (sx - v.ox) / v.z, wy = (sy - v.oy) / v.z;
    v.z = z;
    v.ox = sx - wx * z;
    v.oy = sy - wy * z;
    viewChanged();
  }
  // показать точку мира в центре экрана
  function centerOn(wx, wy) {
    const v = view();
    v.ox = W / 2 - wx * v.z;
    v.oy = H / 2 - wy * v.z;
    viewChanged();
  }

  function frame() {
    requestAnimationFrame(frame);
    const busy = QB.tools && QB.tools.animating();
    if (!dirty && !busy) return;
    dirty = false;
    const th = QB.render.theme(QB.store.doc.theme);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = view();
    QB.render.drawScene(ctx, QB.store.page(), v, W, H, { theme: QB.store.doc.theme, live: A.live, hideId: A.editingId });
    if (QB.tools) QB.tools.drawOverlay(ctx, v, th, W, H);
  }

  Object.assign(QB, { canvas, view, toWorld, screenOf, zoomAt, centerOn, viewChanged, size: () => ({ W, H }) });
  resize();
  requestAnimationFrame(frame);
})();
