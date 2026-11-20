// Формулы: MathJax рисует SVG, мы превращаем его в картинку для холста
(function () {
  const QB = (window.QB = window.QB || {});
  const RES = 120; // пикселей на 1em в картинке — с запасом под зум
  const cache = new Map(); // latex|цвет -> { img, ok }
  let state = 'loading'; // loading | ready | failed

  function onReady() {
    state = 'ready';
    if (QB.requestDraw) QB.requestDraw();
    if (QB.panels) QB.panels.onMathReady();
    if (QB.notes) QB.notes.onMathReady();
  }
  function onFail() {
    state = 'failed';
    if (QB.panels) QB.panels.onMathReady();
  }

  // { svg, vb:[x,y,w,h], error }
  function toSvg(latex, display = true) {
    const node = window.MathJax.tex2svg(latex, { display });
    const svg = node.querySelector('svg');
    const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    const e = svg.querySelector('[data-mjx-error]');
    return { node, svg, vb, error: e ? e.getAttribute('data-mjx-error') : null };
  }

  // размер формулы в мировых пикселях при кегле fs
  function measure(latex, fs) {
    if (state !== 'ready') return null;
    try {
      const { vb, error } = toSvg(latex);
      return { w: (vb[2] / 1000) * fs, h: (vb[3] / 1000) * fs, error };
    } catch (e) {
      return null;
    }
  }

  function get(latex, color) {
    if (state !== 'ready' || !latex) return null;
    const key = latex + '|' + color;
    let c = cache.get(key);
    if (!c) {
      c = { img: new Image(), ok: false };
      cache.set(key, c);
      try {
        const { svg, vb } = toSvg(latex);
        svg.setAttribute('width', ((vb[2] / 1000) * RES).toFixed(1));
        svg.setAttribute('height', ((vb[3] / 1000) * RES).toFixed(1));
        svg.removeAttribute('style');
        let s = new XMLSerializer().serializeToString(svg);
        s = s.replace(/currentColor/g, color);
        c.img.onload = () => { c.ok = true; if (QB.requestDraw) QB.requestDraw(); };
        c.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      } catch (e) {
        /* битая формула — просто не рисуем */
      }
      if (cache.size > 600) cache.delete(cache.keys().next().value);
    }
    return c.ok ? c.img : null;
  }

  // ждём, пока догрузятся картинки (для экспорта)
  function whenLoaded(keys) {
    return Promise.all(keys.map(([latex, color]) => new Promise((res) => {
      get(latex, color);
      const c = cache.get(latex + '|' + color);
      if (!c || c.ok) return res();
      c.img.addEventListener('load', res, { once: true });
      c.img.addEventListener('error', res, { once: true });
      setTimeout(res, 3000);
    })));
  }

  // живой предпросмотр в панели (обычный DOM, цвет берётся из CSS)
  // display=false — компактно, для формул внутри строки текста
  function preview(latex, el, display = true) {
    el.innerHTML = '';
    if (state !== 'ready' || !latex) return null;
    try {
      const { node, error } = toSvg(latex, display);
      el.appendChild(node);
      return error;
    } catch (e) {
      return 'Ошибка в формуле';
    }
  }

  // формула картинкой PNG (для копирования в чат/Word)
  function toPng(latex, color, fs, bg) {
    return new Promise((res, rej) => {
      try {
        const { svg, vb } = toSvg(latex);
        const k = 2, pad = 14 * k;
        const w = (vb[2] / 1000) * fs * k, h = (vb[3] / 1000) * fs * k;
        svg.setAttribute('width', w.toFixed(1));
        svg.setAttribute('height', h.toFixed(1));
        svg.removeAttribute('style');
        const s = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, color);
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = Math.ceil(w + pad * 2);
          cv.height = Math.ceil(h + pad * 2);
          const ctx = cv.getContext('2d');
          if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); }
          ctx.drawImage(img, pad, pad, w, h);
          cv.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png');
        };
        img.onerror = () => rej(new Error('svg'));
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      } catch (e) {
        rej(e);
      }
    });
  }

  QB.formula = { onReady, onFail, measure, get, whenLoaded, preview, toPng, state: () => state };
})();
