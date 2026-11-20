// Интерфейс: инструменты, настройки, листы, меню, экспорт, горячие клавиши, буфер обмена
(function () {
  const QB = window.QB;
  const G = QB.geom;
  const S = QB.store;
  const A = QB.app;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TOOLS = [
    { id: 'select', icon: 'mouse-pointer-2', name: 'Выделение', key: 'V' },
    { id: 'hand', icon: 'hand', name: 'Двигать лист', key: 'H' },
    '|',
    { id: 'pen', icon: 'pen-line', name: 'Ручка', key: 'P' },
    { id: 'marker', icon: 'highlighter', name: 'Маркер', key: 'M' },
    { id: 'eraser', icon: 'eraser', name: 'Ластик', key: 'E' },
    '|',
    { id: 'line', icon: 'slash', name: 'Отрезок', key: 'L' },
    { id: 'arrow', icon: 'move-up-right', name: 'Стрелка, вектор', key: 'A' },
    { id: 'rect', icon: 'square', name: 'Прямоугольник', key: 'R' },
    { id: 'circle', icon: 'circle', name: 'Окружность — циркуль', key: 'C' },
    { id: 'poly', icon: 'triangle', name: 'Многоугольник', key: 'G' },
    '|',
    { id: 'text', icon: 'type', name: 'Текст', key: 'T' },
    { id: 'formula', icon: 'sigma', name: 'Формула', key: 'F' },
    { id: 'graph', icon: 'chart-spline', name: 'График функции', key: 'K' },
    { id: 'image', icon: 'image', name: 'Картинка (или Ctrl+V)', key: 'I', action: true },
    '|',
    { id: 'laser', icon: 'pointer', name: 'Указка', key: 'U' },
  ];
  const HINTS = {
    select: 'Клик — выделить, рамкой — несколько. Квадратик в углу — размер. Двойной клик — изменить. Ctrl+C копирует формулы нормальным текстом.',
    hand: 'Тяни лист. Колесо — прокрутка, Ctrl + колесо — масштаб. Пробел — рука на время.',
    pen: 'Задержи мышь в конце линии — станет ровной: прямая, круг, треугольник, прямоугольник.',
    marker: 'Выделяй важное. Задержи в конце — ровная линия.',
    eraser: 'Стирает линии, фигуры, текст и формулы. Картинки и графики — выдели и нажми Delete.',
    line: 'Shift — угол кратно 15°. Точки липнут к углам клеток (магнит в настройках).',
    arrow: 'Shift — угол кратно 15°. Удобно для векторов и осей.',
    rect: 'Shift — квадрат. Размер видно в клетках.',
    circle: 'Тяни от центра — как циркуль. Shift — эллипс.',
    poly: 'Клик — вершина. Клик по первой точке — замкнуть. Двойной клик или Enter — закончить.',
    text: 'Клик — напиши текст. Ctrl+Enter или клик мимо — готово.',
    formula: 'Клик по листу — вставить формулу. Пиши как в калькуляторе: x^2, √(x), (a+b)/c.',
    graph: 'Растяни рамку или просто кликни, потом впиши функцию, например y = x^2 - 3.',
    laser: 'Указка для объяснений при показе экрана — след исчезает сам.',
  };
  const BGS = [
    { id: 'grid', icon: 'grid-3x3', name: 'Клетка' },
    { id: 'lines', icon: 'rows-3', name: 'Линейка' },
    { id: 'dots', icon: 'grip', name: 'Точки' },
    { id: 'coord', icon: 'crosshair', name: 'Координаты' },
    { id: 'plain', icon: 'file', name: 'Чистый' },
  ];
  const INK = ['ink', 'blue', 'red', 'green', 'orange', 'purple'];
  const MARK = ['yellow', 'green', 'blue', 'red', 'purple', 'orange'];
  const NAMES = { ink: 'Чёрный', blue: 'Синий', red: 'Красный', green: 'Зелёный', orange: 'Оранжевый', purple: 'Фиолетовый', yellow: 'Жёлтый' };

  const icons = () => { if (window.lucide) window.lucide.createIcons(); };

  // ---- тосты и статус сохранения
  let toastT = null;
  function toast(text, ms = 2200) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  function saveState(s) {
    const el = $('saveState');
    el.dataset.s = s;
    el.textContent = s === 'saving' ? 'Сохраняю…' : s === 'saved' ? 'Сохранено' : 'Не сохранилось';
  }

  // ---- панель инструментов слева
  function buildRail() {
    const rail = $('rail');
    rail.innerHTML = '';
    for (const t of TOOLS) {
      if (t === '|') { rail.insertAdjacentHTML('beforeend', '<span class="rail-sep"></span>'); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.setAttribute('aria-label', t.name);
      b.dataset.tip = t.name + '   ' + t.key + ' / ' + RU[t.key];
      b.innerHTML = `<i data-lucide="${t.icon}"></i>`;
      b.onclick = () => (t.action ? $('imgInput').click() : QB.tools.setTool(t.id));
      rail.appendChild(b);
    }
  }
  function refreshTools() {
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === A.tool));
    $('hint').textContent = HINTS[A.tool] || '';
    refreshOpts();
  }

  // ---- нижняя панель настроек инструмента
  function swatch(c, active, onPick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sw' + (active ? ' on' : '');
    b.title = NAMES[c] || c;
    b.style.setProperty('--c', QB.render.color(c, QB.render.theme(S.doc.theme)));
    b.onclick = () => onPick(c);
    return b;
  }
  function toggle(icon, title, key) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt-btn' + (A.opts[key] ? ' on' : '');
    b.title = title;
    b.innerHTML = `<i data-lucide="${icon}"></i>`;
    b.onclick = () => { A.opts[key] = !A.opts[key]; QB.tools.saveOpts(); refreshOpts(); toast(title + (A.opts[key] ? ': вкл' : ': выкл'), 1200); };
    return b;
  }
  function actionBtn(icon, title, fn, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt-btn' + (cls ? ' ' + cls : '');
    b.title = title;
    b.innerHTML = `<i data-lucide="${icon}"></i>`;
    b.onclick = fn;
    return b;
  }
  const sep = () => Object.assign(document.createElement('span'), { className: 'opt-sep' });

  function refreshOpts() {
    const bar = $('optbar');
    bar.innerHTML = '';
    const tool = A.tool;
    const kind = QB.tools.KIND[tool];
    const selN = tool === 'select' ? A.sel.size : 0;

    if (tool === 'marker') {
      MARK.forEach((c) => bar.appendChild(swatch(c, A.opts.markColor === c, (v) => { A.opts.markColor = v; QB.tools.saveOpts(); refreshOpts(); })));
    } else if (kind || selN) {
      const pick = (v) => {
        A.opts.color = v;
        QB.tools.saveOpts();
        if (selN) QB.tools.applyColor(v);
        refreshOpts();
      };
      INK.forEach((c) => bar.appendChild(swatch(c, A.opts.color === c, pick)));
      const custom = document.createElement('label');
      custom.className = 'sw sw-custom' + (A.opts.color.startsWith('#') ? ' on' : '');
      custom.title = 'Свой цвет';
      custom.innerHTML = `<input type="color" value="${A.opts.color.startsWith('#') ? A.opts.color : '#ff5a1f'}">`;
      if (A.opts.color.startsWith('#')) custom.style.setProperty('--c', A.opts.color);
      custom.querySelector('input').addEventListener('change', (e) => pick(e.target.value));
      bar.appendChild(custom);
    }
    if (kind) {
      bar.appendChild(sep());
      const sizes = QB.tools.SIZES[kind];
      sizes.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'size' + (A.opts.size[kind] === s ? ' on' : '');
        b.title = 'Размер ' + (i + 1);
        const d = kind === 'text' || kind === 'formula' ? `<span class="size-t" style="font-size:${10 + i * 3}px">A</span>` : `<span class="dot" style="width:${Math.min(18, 3 + s * (kind === 'marker' ? 0.5 : 1.6))}px;height:${Math.min(18, 3 + s * (kind === 'marker' ? 0.5 : 1.6))}px"></span>`;
        b.innerHTML = d;
        b.onclick = () => { A.opts.size[kind] = s; QB.tools.saveOpts(); refreshOpts(); };
        bar.appendChild(b);
      });
    }
    if (tool === 'pen' || tool === 'marker') {
      bar.appendChild(sep());
      bar.appendChild(toggle('spline', 'Сглаживание дрожания', 'smooth'));
      bar.appendChild(toggle('shapes', 'Ровные фигуры при задержке', 'autoShape'));
    }
    if (kind === 'shape' || tool === 'graph') {
      bar.appendChild(sep());
      bar.appendChild(toggle('magnet', 'Привязка к клеткам', 'snap'));
      if (kind === 'shape') {
        bar.appendChild(toggle('ellipsis', 'Пунктир', 'dash'));
        if (['rect', 'circle', 'poly'].includes(tool)) bar.appendChild(toggle('paint-bucket', 'Заливка', 'fill'));
      }
    }
    if (tool === 'text') {
      bar.appendChild(sep());
      const f = document.createElement('button');
      f.type = 'button';
      f.className = 'opt-btn wide' + (A.opts.font === 'hand' ? ' on' : '');
      f.title = 'Шрифт: обычный / от руки';
      f.innerHTML = A.opts.font === 'hand' ? '<span class="hand-font">От руки</span>' : '<span>Обычный</span>';
      f.onclick = () => { A.opts.font = A.opts.font === 'hand' ? 'sans' : 'hand'; QB.tools.saveOpts(); refreshOpts(); };
      bar.appendChild(f);
    }
    if (selN) {
      bar.appendChild(sep());
      const items = QB.tools.selItems();
      const hasText = items.some((it) => ['text', 'formula', 'graph'].includes(it.type));
      const ink = QB.tools.hasInk(items);
      if (ink) {
        const r = actionBtn('scan-text', 'Распознать написанное от руки', recognizeSel, 'wide');
        r.insertAdjacentHTML('beforeend', '<span>Распознать</span>');
        bar.appendChild(r);
      }
      if (hasText || ink) bar.appendChild(actionBtn('clipboard-type', 'Копировать текстом (формулы как √, ², ≤)', copySelText));
      bar.appendChild(actionBtn('image-down', 'Копировать картинкой', copySelImage));
      bar.appendChild(actionBtn('copy', 'Дублировать  Ctrl+D', QB.tools.duplicateSel));
      bar.appendChild(actionBtn('bring-to-front', 'Наверх', QB.tools.bringFront));
      bar.appendChild(actionBtn('trash-2', 'Удалить  Delete', QB.tools.deleteSel, 'danger'));
    }
    bar.hidden = !bar.children.length;
    icons();
  }

  // ---- верхняя панель: листы, фон, тема, отмена, масштаб
  function renderPages() {
    const box = $('pages');
    box.innerHTML = '';
    S.doc.pages.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'page-tab' + (i === S.doc.current ? ' on' : '');
      b.innerHTML = (p.type === 'notes' ? '<i data-lucide="notebook-text"></i>' : '') + '<span>' + esc(p.name) + '</span>';
      b.title = 'Двойной клик — переименовать, правый — меню';
      b.onclick = () => {
        if (S.sketch) { QB.notes.finishSketch(); if (i === S.doc.current) return; }
        if (i !== S.doc.current) { QB.panels.closeAll(); QB.notes.flush(); A.sel.clear(); S.setPage(i); }
      };
      b.ondblclick = () => renamePage(i, b);
      b.oncontextmenu = (e) => {
        e.preventDefault();
        showMenu(b, [
          { icon: 'pencil', label: 'Переименовать', fn: () => renamePage(i, b) },
          { icon: 'copy', label: 'Дублировать лист', fn: () => S.duplicatePage(i) },
          { icon: 'trash-2', label: 'Удалить лист', danger: true, fn: () => {
            const pg = S.doc.pages[i];
            if ((pg.items.length || QB.notes.hasContent(pg)) && !confirm('Удалить «' + S.doc.pages[i].name + '»? Это не отменить.')) return;
            S.removePage(i);
          } },
        ]);
      };
      box.appendChild(b);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'page-add';
    add.title = 'Новый лист или конспект';
    add.setAttribute('aria-label', 'Новый лист');
    add.setAttribute('data-menu', '');
    add.innerHTML = '<i data-lucide="plus"></i>';
    const addPage = (type) => {
      if (S.sketch) QB.notes.finishSketch();
      QB.panels.closeAll();
      QB.notes.flush();
      A.sel.clear();
      S.addPage(type);
    };
    add.onclick = () => showMenu(add, [
      { icon: 'pen-line', label: 'Доска — рисовать', fn: () => addPage('board') },
      { icon: 'notebook-text', label: 'Конспект — писать', fn: () => addPage('notes') },
    ]);
    box.appendChild(add);
    const on = box.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    icons();
  }
  function renamePage(i, el) {
    const inp = document.createElement('input');
    inp.className = 'page-rename';
    inp.value = S.doc.pages[i].name;
    el.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; if (ok) S.renamePage(i, inp.value); else renderPages(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }
  function refreshTop() {
    const bg = BGS.find((b) => b.id === S.page().bg) || BGS[0];
    $('bgBtn').innerHTML = `<i data-lucide="${bg.icon}"></i><span class="hide-sm">${bg.name}</span><i data-lucide="chevron-down" class="chev"></i>`;
    $('themeBtn').innerHTML = `<i data-lucide="${S.doc.theme === 'chalk' ? 'sun' : 'moon'}"></i>`;
    $('themeBtn').dataset.tip = S.doc.theme === 'chalk' ? 'Светлая тетрадь' : 'Тёмная доска';
    const notes = QB.notes && QB.notes.active();
    $('undoBtn').disabled = !notes && !S.canUndo();
    $('redoBtn').disabled = !notes && !S.canRedo();
    document.body.dataset.theme = S.doc.theme;
    document.querySelector('meta[name="theme-color"]').content = S.doc.theme === 'chalk' ? '#121619' : '#fbfaf6';
    updateZoom();
    icons();
  }
  function updateZoom() { $('zoomVal').textContent = Math.round(QB.view().z * 100) + '%'; }

  // ---- всплывающее меню
  function showMenu(anchor, items) {
    const m = $('menu');
    m.innerHTML = '';
    for (const it of items) {
      if (it === '|') { m.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item' + (it.danger ? ' danger' : '') + (it.on ? ' on' : '');
      b.innerHTML = `<i data-lucide="${it.icon}"></i><span>${esc(it.label)}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}`;
      b.onclick = () => { closeMenus(); it.fn(); };
      m.appendChild(b);
    }
    m.hidden = false;
    icons();
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - mw - 8)) + 'px';
    m.style.top = (r.bottom + 6 + mh > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
  }
  function closeMenus() { $('menu').hidden = true; }
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#menu') && !e.target.closest('[data-menu]')) closeMenus(); });

  // ---- экспорт и файлы
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'лист';
  const today = () => new Date().toISOString().slice(0, 10);

  async function exportPNG() {
    const pg = S.page();
    if (!pg.items.length) return toast('Лист пустой — нечего сохранять');
    await QB.render.prepare(pg, S.doc.theme);
    const cv = QB.render.renderPage(pg, S.doc.theme, 2);
    cv.toBlob((b) => { download(b, safeName(pg.name) + '.png'); toast('Картинка листа сохранена в «Загрузки»'); }, 'image/png');
  }
  async function exportPDF() {
    QB.notes.flush();
    const pages = S.doc.pages.filter((p) => (p.type === 'notes' ? QB.notes.hasContent(p) : p.items.length));
    if (!pages.length) return toast('Все листы пустые');
    toast('Готовлю PDF…');
    const parts = [];
    for (const p of pages) {
      if (p.type === 'notes') {
        parts.push(`<div class="pg"><h2>${esc(p.name)}</h2><div class="notes">${await QB.notes.printHTML(p)}</div></div>`);
        continue;
      }
      await QB.render.prepare(p, 'paper');
      parts.push(`<div class="pg"><h2>${esc(p.name)}</h2><img src="${QB.render.renderPage(p, 'paper', 2).toDataURL('image/png')}"></div>`);
    }
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const d = fr.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Тетрадь ${today()}</title><style>
      @page{size:A4;margin:12mm}body{margin:0;font-family:Manrope,Arial,sans-serif;color:#555}
      .pg{page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto}
      h2{font-size:11pt;font-weight:600;margin:0 0 6mm}.pg > img{display:block;max-width:100%;max-height:255mm;margin:0 auto;object-fit:contain}
      ${QB.notes.PRINT_CSS}
    </style></head><body>${parts.join('')}</body></html>`);
    d.close();
    const go = () => {
      fr.contentWindow.focus();
      fr.contentWindow.print();
      setTimeout(() => fr.remove(), 2000);
    };
    const all = [...d.images];
    Promise.all(all.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; })))).then(go);
    toast('В окне печати выбери «Сохранить как PDF»', 4000);
  }
  function saveFile() {
    QB.notes.flush();
    download(new Blob([S.serialize()], { type: 'application/json' }), 'Тетрадь ' + today() + '.qboard');
    toast('Файл тетради сохранён в «Загрузки»');
  }
  function openFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        if (!confirm('Открыть файл? Текущая тетрадь заменится (сначала сохрани её в файл, если нужна).')) return;
        S.load(String(r.result));
        A.sel.clear();
        toast('Тетрадь открыта');
      } catch (e) {
        toast('Не получилось открыть: это не файл тетради');
      }
    };
    r.readAsText(file);
  }

  // ---- картинки: вставка, перетаскивание
  function readImage(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) { rej(new Error('не картинка')); return; }
      const r = new FileReader();
      r.onerror = rej;
      r.onload = () => {
        const img = new Image();
        img.onerror = rej;
        img.onload = () => {
          let src = String(r.result);
          let w = img.naturalWidth, h = img.naturalHeight;
          const MAX = 1600;
          if (w > MAX || h > MAX || src.length > 2e6) { // большие сжимаем, чтобы тетрадь не раздувалась
            const k = Math.min(1, MAX / Math.max(w, h));
            const cv = document.createElement('canvas');
            cv.width = Math.round(w * k);
            cv.height = Math.round(h * k);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            src = cv.toDataURL('image/webp', 0.9);
            if (!src.startsWith('data:image/webp')) src = cv.toDataURL('image/jpeg', 0.9);
            w = cv.width;
            h = cv.height;
          }
          res({ src, w, h });
        };
        img.src = String(r.result);
      };
      r.readAsDataURL(file);
    });
  }
  function insertImage(file, at) {
    if (!file || !/^image\//.test(file.type)) return;
    if (QB.notes.active()) return; // в конспекте вставляет сам конспект
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let src = String(r.result);
        let w = img.naturalWidth, h = img.naturalHeight;
        const MAX = 1600;
        if (w > MAX || h > MAX || src.length > 2e6) { // большие сжимаем, чтобы тетрадь не раздувалась
          const k = Math.min(1, MAX / Math.max(w, h));
          const cv = document.createElement('canvas');
          cv.width = Math.round(w * k);
          cv.height = Math.round(h * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          src = cv.toDataURL('image/webp', 0.9);
          if (!src.startsWith('data:image/webp')) src = cv.toDataURL('image/jpeg', 0.9);
          w = cv.width;
          h = cv.height;
        }
        const fit = Math.min(1, 560 / w, 420 / h);
        const dw = w * fit, dh = h * fit;
        const c = at || centerWorld();
        const it = { id: G.uid(), type: 'image', aid: G.uid(), src, x: c.x - dw / 2, y: c.y - dh / 2, w: dw, h: dh };
        QB.tools.addAndSelect([it]);
        toast('Картинка вставлена. Тяни квадратик в углу — поменять размер');
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  }
  const centerWorld = () => { const { W, H } = QB.size(); return QB.toWorld(W / 2, H / 2); };

  // ---- буфер обмена: формулы наружу уходят нормальным текстом
  const CLIP_MIME = 'application/x-quorboard';
  let lastClip = null; // { plain, items } — запасной путь, если свой формат не прошёл
  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

  function onCopy(e, cut) {
    if (isTyping(document.activeElement) || A.tool !== 'select' || !A.sel.size) return;
    const items = QB.tools.selItems();
    const plain = QB.tools.selectionText(items) || '[рисунок из QuorBoard]';
    e.preventDefault();
    e.clipboardData.setData('text/plain', plain);
    try { e.clipboardData.setData(CLIP_MIME, JSON.stringify(items)); } catch (er) { /* не везде можно */ }
    lastClip = { plain, items };
    if (cut) QB.tools.deleteSel();
    toast(QB.tools.selectionText(items) ? 'Скопировано текстом: ' + plain.split('\n')[0].slice(0, 60) : 'Скопировано (рисунок — вставится здесь же). Картинкой — кнопка внизу', 2600);
  }
  document.addEventListener('copy', (e) => onCopy(e, false));
  document.addEventListener('cut', (e) => onCopy(e, true));
  document.addEventListener('paste', (e) => {
    if (isTyping(document.activeElement) || QB.notes.active()) return; // в конспекте вставляет сам конспект
    const dt = e.clipboardData;
    if (!dt) return;
    const file = [...dt.files].find((f) => /^image\//.test(f.type));
    if (file) { e.preventDefault(); insertImage(file, A.cursor ? QB.toWorld(A.cursor.x, A.cursor.y) : null); return; }
    let raw = '';
    try { raw = dt.getData(CLIP_MIME); } catch (er) { /* нет */ }
    const text = dt.getData('text/plain');
    let items = null;
    if (raw) { try { items = JSON.parse(raw); } catch (er) { /* битое */ } }
    if (!items && lastClip && text === lastClip.plain) items = lastClip.items;
    e.preventDefault();
    if (items && items.length) { QB.tools.addAndSelect(QB.tools.cloneItems(items, 24, 24)); return; }
    if (!text || !text.trim()) return;
    const c = A.cursor ? QB.toWorld(A.cursor.x, A.cursor.y) : centerWorld();
    if (QB.math.looksLatex(text)) {
      // формула из нейросети/учебника: показываем нормальной формулой
      const src = QB.math.latexToPlain(text.trim());
      const latex = QB.math.toLatex(src);
      const m = QB.formula.measure(latex, A.opts.size.formula);
      if (m) {
        QB.tools.addAndSelect([{ id: G.uid(), type: 'formula', src, latex, x: c.x, y: c.y - m.h / 2, w: m.w, h: m.h, size: A.opts.size.formula, color: A.opts.color }]);
        toast('Вставил формулу: ' + src);
        return;
      }
    }
    QB.tools.addAndSelect([{ id: G.uid(), type: 'text', x: c.x, y: c.y, text: text.replace(/\r/g, '').trimEnd().slice(0, 5000), color: A.opts.color, size: A.opts.size.text }]);
  });

  async function copySelText() {
    const t = QB.tools.selectionText(QB.tools.selItems());
    if (!t) return;
    await QB.panels.copyText(t);
    toast('Скопировано: ' + t.split('\n')[0].slice(0, 60));
  }
  // рукописное -> панель формулы с распознанным текстом; «Заменить» ставит ровную формулу
  function recognizeSel() {
    const items = QB.tools.selItems().filter((it) => QB.tools.INK.includes(it.type) || it.type === 'text' || it.type === 'formula');
    const text = QB.tools.selectionText(items);
    if (!text) { toast('Не получилось распознать — попробуй писать чуть крупнее'); return; }
    const b = G.unionBox(items);
    QB.panels.openFormula(null, { x: b.x, y: b.y + b.h / 2 }, { src: text, replaceIds: items.map((it) => it.id) });
  }

  // картинка в буфер (если нельзя — скачиваем)
  async function copyImage(blobPromise, name) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      return true;
    } catch (e) {
      try { download(await blobPromise, name); toast('Буфер недоступен — сохранил картинкой в «Загрузки»'); } catch (e2) { toast('Не получилось скопировать'); }
      return false;
    }
  }
  async function copySelImage() {
    const items = QB.tools.selItems();
    if (!items.length) return;
    const tmp = { bg: 'plain', items };
    const ok = await copyImage(QB.render.prepare(tmp, 'paper').then(() => new Promise((res) => {
      QB.render.renderPage({ ...tmp, bg: 'plain' }, 'paper', 2).toBlob(res, 'image/png');
    })), 'выделенное.png');
    if (ok) toast('Скопировано картинкой — вставляй в чат или Word');
  }

  // ---- справка
  function openHelp() { $('helpModal').hidden = false; }
  function closeHelp() { $('helpModal').hidden = true; }

  // ---- горячие клавиши: работают в любой раскладке.
  // Латинская буква — берём как есть (немецкая Z/Y на своих местах), иначе — физическую клавишу (русская З = P).
  const RU = { Q: 'Й', W: 'Ц', E: 'У', R: 'К', T: 'Е', Y: 'Н', U: 'Г', I: 'Ш', O: 'Щ', P: 'З', A: 'Ф', S: 'Ы', D: 'В', F: 'А',
    G: 'П', H: 'Р', J: 'О', K: 'Л', L: 'Д', Z: 'Я', X: 'Ч', C: 'С', V: 'М', B: 'И', N: 'Т', M: 'Ь' };
  function letterOf(e) {
    const k = e.key || '';
    if (/^[a-z]$/i.test(k)) return k.toUpperCase();
    const m = /^Key([A-Z])$/.exec(e.code || '');
    if (m) return m[1];
    if (e.keyCode >= 65 && e.keyCode <= 90) return String.fromCharCode(e.keyCode);
    return '';
  }
  function digitOf(e) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code || '');
    if (m) return +m[1];
    return /^\d$/.test(e.key) ? +e.key : -1;
  }
  const keyIs = (e, ...names) => names.includes(e.key) || names.includes(e.code);
  const KEYMAP = {};
  TOOLS.forEach((t) => { if (t !== '|') KEYMAP[t.key] = t.id; });

  document.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const L = letterOf(e);
    const D = digitOf(e);
    if (QB.notes && QB.notes.active()) {
      if (keyIs(e, 'Escape')) { if (!$('helpModal').hidden) closeHelp(); else if (!$('menu').hidden) closeMenus(); else QB.panels.closeAll(); }
      else if (e.key === '?' || e.code === 'F1') { e.preventDefault(); openHelp(); }
      else if (ctrl && L === 'S') { e.preventDefault(); QB.notes.flush(); S.saveNow(); toast('Сохранено в браузере. Файлом — в меню «Файл»'); }
      else if (ctrl && L === 'M') { e.preventDefault(); QB.notes.askFormula(); }
      return;
    }
    if (keyIs(e, ' ', 'Space') && !ctrl) { if (!A.spaceDown) { A.spaceDown = true; QB.canvas.classList.add('grab'); } e.preventDefault(); return; }
    if (ctrl) {
      if (L === 'Z') { e.preventDefault(); (e.shiftKey ? S.redo() : S.undo()) && afterHistory(); return; }
      if (L === 'Y') { e.preventDefault(); S.redo() && afterHistory(); return; }
      if (L === 'D') { e.preventDefault(); QB.tools.duplicateSel(); return; }
      if (L === 'A') { e.preventDefault(); QB.tools.selectAll(); return; }
      if (L === 'S') { e.preventDefault(); S.saveNow(); toast('Сохранено в браузере. Файлом — в меню «Файл»'); return; }
      if (keyIs(e, '+', '=', 'Equal', 'NumpadAdd')) { e.preventDefault(); QB.zoomAt(QB.view().z * 1.2); return; }
      if (keyIs(e, '-', 'Minus', 'NumpadSubtract')) { e.preventDefault(); QB.zoomAt(QB.view().z / 1.2); return; }
      if (D === 0) { e.preventDefault(); QB.zoomAt(1); return; }
      if (L === 'C' && e.shiftKey) { e.preventDefault(); copySelImage(); return; }
      // Ctrl+C / Ctrl+X по выделенному — сами запускаем копирование
      if ((L === 'C' || L === 'X') && A.tool === 'select' && A.sel.size) {
        e.preventDefault();
        document.execCommand(L === 'C' ? 'copy' : 'cut');
        return;
      }
      return;
    }
    if (e.altKey) return;
    if (e.key === '?' || e.code === 'F1' || (e.code === 'Slash' && e.shiftKey)) { e.preventDefault(); openHelp(); return; }
    if (keyIs(e, 'Escape')) {
      if (!$('helpModal').hidden) return closeHelp();
      if (!$('menu').hidden) return closeMenus();
      if (QB.panels.isOpen()) return QB.panels.closeAll();
      QB.tools.escape();
      return;
    }
    if (keyIs(e, 'Enter', 'NumpadEnter') && A.tool === 'poly') { QB.tools.finishPoly(); return; }
    if (keyIs(e, 'Delete', 'Backspace')) { e.preventDefault(); QB.tools.deleteSel(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const arr = arrows[e.key] || arrows[e.code];
    if (arr && A.sel.size) { e.preventDefault(); const k = e.shiftKey ? 10 : 1; QB.tools.nudge(arr[0] * k, arr[1] * k); return; }
    if (D >= 1 && D <= 6) {
      const c = (A.tool === 'marker' ? MARK : INK)[D - 1];
      if (A.tool === 'marker') A.opts.markColor = c; else { A.opts.color = c; if (A.sel.size) QB.tools.applyColor(c); }
      QB.tools.saveOpts();
      refreshOpts();
      return;
    }
    if (keyIs(e, '[', ']', 'BracketLeft', 'BracketRight')) {
      const kind = QB.tools.KIND[A.tool];
      if (!kind) return;
      const list = QB.tools.SIZES[kind];
      const down = e.key === '[' || e.code === 'BracketLeft';
      const i = Math.max(0, Math.min(list.length - 1, list.indexOf(A.opts.size[kind]) + (down ? -1 : 1)));
      A.opts.size[kind] = list[i];
      QB.tools.saveOpts();
      refreshOpts();
      return;
    }
    const t = KEYMAP[L];
    if (t) {
      e.preventDefault();
      if (t === 'image') $('imgInput').click(); else QB.tools.setTool(t);
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.key === ' ') { A.spaceDown = false; QB.canvas.classList.remove('grab'); }
  });
  window.addEventListener('blur', () => { A.spaceDown = false; QB.canvas.classList.remove('grab'); });
  function afterHistory() { A.sel = new Set([...A.sel].filter((id) => S.page().items.some((it) => it.id === id))); refreshOpts(); }

  // ---- кнопки верхней панели
  function bindTop() {
    $('undoBtn').onclick = () => { if (QB.notes.active()) return QB.notes.undo(false); S.undo(); afterHistory(); };
    $('redoBtn').onclick = () => { if (QB.notes.active()) return QB.notes.undo(true); S.redo(); afterHistory(); };
    $('zoomIn').onclick = () => QB.zoomAt(QB.view().z * 1.25);
    $('zoomOut').onclick = () => QB.zoomAt(QB.view().z / 1.25);
    $('zoomVal').onclick = () => QB.zoomAt(1);
    $('themeBtn').onclick = () => {
      S.doc.theme = S.doc.theme === 'chalk' ? 'paper' : 'chalk';
      S.changed('theme');
    };
    $('bgBtn').onclick = (e) => showMenu(e.currentTarget, BGS.filter((b) => !(QB.notes.active() && b.id === 'coord')).map((b) => ({
      icon: b.icon, label: b.name, on: S.page().bg === b.id,
      fn: () => { S.page().bg = b.id; S.changed('bg'); },
    })));
    $('fileBtn').onclick = (e) => showMenu(e.currentTarget, QB.notes.active() ? [
      { icon: 'file-text', label: 'PDF — все листы', fn: exportPDF },
      { icon: 'clipboard-type', label: 'Скопировать конспект текстом', fn: QB.notes.copyAll },
      '|',
      { icon: 'save', label: 'Сохранить тетрадь в файл', fn: saveFile },
      { icon: 'folder-open', label: 'Открыть файл тетради', fn: () => $('fileInput').click() },
      '|',
      { icon: 'trash-2', label: 'Очистить конспект', danger: true, fn: () => {
        if (confirm('Очистить «' + S.doc.pages[S.doc.current].name + '»? Вернуть можно через Ctrl+Z.')) QB.notes.clear();
      } },
    ] : [
      { icon: 'image-down', label: 'Сохранить лист картинкой', fn: exportPNG },
      { icon: 'file-text', label: 'PDF — все листы', fn: exportPDF },
      '|',
      { icon: 'save', label: 'Сохранить тетрадь в файл', fn: saveFile },
      { icon: 'folder-open', label: 'Открыть файл тетради', fn: () => $('fileInput').click() },
      '|',
      { icon: 'trash-2', label: 'Очистить лист', danger: true, fn: () => {
        if (!S.page().items.length) return;
        if (confirm('Очистить «' + S.page().name + '»? Можно будет вернуть через Ctrl+Z.')) { A.sel.clear(); S.setItems([]); refreshOpts(); }
      } },
    ]);
    $('helpBtn').onclick = openHelp;
    document.querySelectorAll('[data-close="help"]').forEach((b) => { b.onclick = closeHelp; });
    $('helpModal').addEventListener('pointerdown', (e) => { if (e.target === $('helpModal')) closeHelp(); });
    $('imgInput').addEventListener('change', (e) => { insertImage(e.target.files[0]); e.target.value = ''; });
    $('fileInput').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
    const stage = $('stage');
    stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drop'); });
    stage.addEventListener('dragleave', (e) => { if (e.target === stage || e.target === QB.canvas) stage.classList.remove('drop'); });
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      stage.classList.remove('drop');
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (/\.(qboard|json)$/i.test(f.name)) return openFile(f);
      const s = QB.screenOf(e);
      insertImage(f, QB.toWorld(s.x, s.y));
    });
  }

  S.on((what) => {
    if (what === 'pages' || what === 'all') { renderPages(); A.sel.clear(); }
    if (what === 'theme' || what === 'all') refreshOpts();
    refreshTop();
  });

  QB.ui = {
    toast, saveState, buildRail, refreshTools, refreshOpts, refreshTop, renderPages, updateZoom, closeMenus, icons,
    copyImage, bindTop, showMenu, readImage, letterOf,
    clipItems: (text) => (lastClip && text === lastClip.plain ? lastClip.items : null),
  };
})();
