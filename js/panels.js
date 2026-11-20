// Панели: редактор текста на листе, формула, график
(function () {
  const QB = window.QB;
  const G = QB.geom;
  const S = QB.store;
  const A = QB.app;
  const $ = (id) => document.getElementById(id);
  const toast = (t, ms) => QB.ui.toast(t, ms);

  function insertAtCursor(input, text, cursorAt) {
    const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
    input.value = input.value.slice(0, a) + text + input.value.slice(b);
    const pos = a + (cursorAt == null ? text.length : cursorAt);
    input.setSelectionRange(pos, pos);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
  }

  // ================= текст прямо на листе
  const ta = $('textEditor');
  let tx = null;

  function editText(item, wp) {
    commitText();
    closeFormula();
    const it = item
      ? { ...item }
      : { id: G.uid(), type: 'text', x: wp.x, y: wp.y - A.opts.size.text * 0.68, text: '', color: A.opts.color, size: A.opts.size.text };
    if (!item && A.opts.font === 'hand') it.font = 'hand';
    tx = { it, isNew: !item };
    A.editingId = item ? item.id : null;
    ta.value = it.text;
    ta.hidden = false;
    placeText();
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    QB.requestDraw();
  }
  function placeText() {
    if (!tx) return;
    const v = QB.view();
    const it = tx.it;
    const th = QB.render.theme(S.doc.theme);
    ta.style.left = it.x * v.z + v.ox - 4 + 'px';
    ta.style.top = it.y * v.z + v.oy - 2 + 'px';
    ta.style.font = G.textFont({ ...it, size: it.size * v.z });
    ta.style.lineHeight = G.textLineH(it) * v.z + 'px';
    ta.style.color = QB.render.color(it.color, th);
    const sz = G.textSize({ ...it, text: ta.value || ' ' });
    ta.style.width = sz.w * v.z + 48 + 'px';
    ta.style.height = sz.h * v.z + 6 + 'px';
  }
  function commitText() {
    if (!tx) return;
    const { it, isNew } = tx;
    tx = null;
    const v = ta.value.replace(/\s+$/, '');
    ta.hidden = true;
    A.editingId = null;
    if (!v) { if (!isNew) S.replace({ [it.id]: null }); }
    else {
      const n = { ...it, text: v };
      if (isNew) S.add(n); else S.replace({ [it.id]: n });
    }
    QB.requestDraw();
  }
  ta.addEventListener('input', placeText);
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitText(); }
  });
  ta.addEventListener('blur', commitText);
  ta.addEventListener('paste', (e) => {
    const t = e.clipboardData.getData('text/plain');
    if (t && QB.math.looksLatex(t)) {
      e.preventDefault();
      insertAtCursor(ta, QB.math.latexToPlain(t));
      placeText();
      toast('Перевёл формулу из LaTeX в обычный вид');
    }
  });

  // ================= формула
  const fp = $('formulaPanel');
  const fIn = $('fInput');
  const fPrev = $('fPreview');
  const fCalc = $('fCalc');
  const fErr = $('fErr');
  let fState = null;
  let fTimer = null;

  const FR = '<span class="fr"><span>a</span><span>b</span></span>';
  const PALETTE = [
    ['Основное', [
      [FR, '(§)/()', 'Дробь'], ['x²', '^2', 'Квадрат'], ['xⁿ', '^(§)', 'Степень'], ['x₁', '_(§)', 'Индекс'],
      ['√', '√(§)', 'Корень'], ['ⁿ√', 'root(§, )', 'Корень n-й степени'], ['|x|', '|§|', 'Модуль'], ['( )', '(§)', 'Скобки'],
      ['±', ' ± '], ['·', ' · ', 'Умножить'], [':', ' : ', 'Разделить'], ['=', ' = '], ['≠', ' ≠ '], ['≈', ' ≈ '],
      ['<', ' < '], ['>', ' > '], ['≤', ' ≤ '], ['≥', ' ≥ '], ['π', 'π'], ['∞', '∞'], ['°', '°', 'Градусы'], ['%', '%'],
    ]],
    ['Алгебра', [
      ['{ система', 'system(§; )', 'Система уравнений'], ['logₐ', 'log_(§)()', 'Логарифм по основанию'], ['ln', 'ln(§)'], ['lg', 'lg(§)'],
      ['sin', 'sin(§)'], ['cos', 'cos(§)'], ['tg', 'tg(§)'], ['ctg', 'ctg(§)'], ['arcsin', 'arcsin(§)'], ['arccos', 'arccos(§)'],
      ['arctg', 'arctg(§)'], ['n!', '!', 'Факториал'], ['eˣ', 'e^(§)'], ['f(x)', 'f(x) = '], ['∈', ' ∈ '], ['[a; b]', '[§; ]', 'Промежуток'],
      ['⇒', ' ⇒ '], ['⇔', ' ⇔ '], ['D', 'D = b^2 - 4ac', 'Дискриминант'], ['x₁,₂', 'x = (-b ± √(D))/(2a)', 'Корни квадратного уравнения'],
    ]],
    ['Геометрия', [
      ['∠', '∠', 'Угол'], ['△', '△', 'Треугольник'], ['⊥', ' ⊥ ', 'Перпендикулярно'], ['∥', ' ∥ ', 'Параллельно'],
      ['a⃗', 'vec(§)', 'Вектор'], ['AB̅', 'bar(§)', 'Отрезок'], ['°', '°'], ['α', 'α'], ['β', 'β'], ['γ', 'γ'], ['φ', 'φ'],
      ['S = ½ah', 'S = 1/2 a h', 'Площадь треугольника'], ['c² = a² + b²', 'c^2 = a^2 + b^2', 'Пифагор'], ['πr²', 'S = π r^2', 'Площадь круга'],
      ['2πr', 'C = 2π r', 'Длина окружности'], ['sin α', 'sin(α) = a/c'],
    ]],
    ['Анализ', [
      ['lim', 'lim(x -> §) ', 'Предел'], ['∫', 'int(§)', 'Интеграл'], ['∫ₐᵇ', 'int(§, , )', 'Интеграл с пределами'],
      ['∑', 'sum(i = 1, §) ', 'Сумма'], ['→', ' → '], ["f′", "'", 'Производная'], ['Δ', 'Δ'], ['∞', '∞'], ['eˣ', 'e^(§)'],
    ]],
    ['Буквы', 'αβγδεθλμπρστφωΔΣΩ'.split('').map((c) => [c, c])],
  ];
  let tabIdx = 0;
  function renderPalette() {
    const tabs = $('fTabs');
    const pal = $('fPalette');
    tabs.innerHTML = '';
    PALETTE.forEach(([name], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab' + (i === tabIdx ? ' on' : '');
      b.textContent = name;
      b.onclick = () => { tabIdx = i; renderPalette(); };
      tabs.appendChild(b);
    });
    pal.innerHTML = '';
    PALETTE[tabIdx][1].forEach(([label, tpl, title]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key';
      b.innerHTML = label;
      b.title = title ? title + ' — ' + tpl.replace('§', '…') : tpl.replace('§', '…');
      b.addEventListener('mousedown', (e) => e.preventDefault()); // фокус остаётся в поле
      b.onclick = () => {
        const sel = fIn.value.slice(fIn.selectionStart, fIn.selectionEnd);
        let t = tpl;
        if (sel && t.includes('§')) t = t.replace('§', sel);
        const pos = t.indexOf('§');
        insertAtCursor(fIn, t.replace('§', ''), pos >= 0 ? pos : null);
        fIn.focus();
        updateFormula();
      };
      pal.appendChild(b);
    });
  }

  // opts: { src, replaceIds } — распознали рукописное и меняем его на формулу;
  // { onDone(src, mode), onClose, mode, editing } — формула для конспекта (в строку / отдельной строкой)
  let fMode = 'inline';
  function setMode(m) {
    fMode = m;
    $('fModeRow').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }
  $('fModeRow').querySelectorAll('button').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.onclick = () => { setMode(b.dataset.mode); fIn.focus(); };
  });
  function openFormula(item, wp, opts) {
    commitText();
    closeGraph();
    if (fState && fState.onClose) { const cb = fState.onClose; fState = null; cb(); }
    const o = opts || {};
    fState = { id: item ? item.id : null, wp, replaceIds: o.replaceIds || null, onDone: o.onDone || null, onClose: o.onClose || null };
    fIn.value = item ? item.src : o.src || '';
    fp.hidden = false;
    $('fNote').hidden = !o.replaceIds;
    $('fModeRow').hidden = !o.onDone;
    setMode(o.mode || 'inline');
    $('fInsert').querySelector('span').textContent = item || o.editing ? 'Сохранить' : o.replaceIds ? 'Заменить' : 'Вставить';
    updateFormula();
    requestAnimationFrame(() => { fIn.focus(); fIn.setSelectionRange(fIn.value.length, fIn.value.length); });
  }
  function closeFormula() {
    if (!fState) return;
    if (fp.contains(document.activeElement)) document.activeElement.blur(); // иначе горячие клавиши уходят в скрытое поле
    fp.hidden = true;
    const cb = fState.onClose;
    fState = null;
    if (cb) cb();
  }
  function updateFormula() {
    const src = fIn.value;
    const st = QB.formula.state();
    fErr.textContent = '';
    if (st === 'loading') fPrev.innerHTML = '<span class="muted">Загружаю формулы…</span>';
    else if (st === 'failed') fPrev.innerHTML = '<span class="muted">Формулы не загрузились — нужен интернет</span>';
    else if (!src.trim()) fPrev.innerHTML = '<span class="muted">Здесь появится формула</span>';
    else {
      const err = QB.formula.preview(QB.math.toLatex(src), fPrev);
      if (err) fErr.textContent = 'Что-то не так: ' + err;
    }
    const v = QB.math.calc(src);
    fCalc.hidden = v === null;
    if (v !== null) fCalc.textContent = '= ' + QB.math.fmtNum(v);
    $('fInsert').disabled = !src.trim() || (st !== 'ready' && !(fState && fState.onDone));
  }
  function insertFormula() {
    if (!fState) return;
    const src = fIn.value.trim();
    if (!src) { closeFormula(); return; }
    if (fState.onDone) { // конспект сам вставит
      const done = fState.onDone;
      const mode = fMode;
      closeFormula();
      done(src, mode);
      return;
    }
    const latex = QB.math.toLatex(src);
    const old = fState.id ? S.page().items.find((i) => i.id === fState.id) : null;
    const size = old ? old.size : A.opts.size.formula;
    const m = QB.formula.measure(latex, size);
    if (!m) { toast('Формулы ещё загружаются, секунду'); return; }
    if (old) S.replace({ [old.id]: { ...old, src, latex, w: m.w, h: m.h } });
    else if (fState.replaceIds) {
      const ids = new Set(fState.replaceIds);
      const wp = fState.wp;
      const it = { id: G.uid(), type: 'formula', src, latex, x: wp.x, y: wp.y - m.h / 2, w: m.w, h: m.h, size, color: A.opts.color };
      S.setItems(S.page().items.filter((i) => !ids.has(i.id)).concat([it]));
      A.sel = new Set([it.id]);
      QB.ui.refreshOpts();
    } else {
      const wp = fState.wp;
      S.add({ id: G.uid(), type: 'formula', src, latex, x: wp.x, y: wp.y - m.h / 2, w: m.w, h: m.h, size, color: A.opts.color });
    }
    closeFormula();
  }

  fIn.addEventListener('input', () => { clearTimeout(fTimer); fTimer = setTimeout(updateFormula, 80); });
  fIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); insertFormula(); }
    if (e.key === 'Escape') { e.preventDefault(); closeFormula(); }
  });
  fIn.addEventListener('paste', (e) => {
    const t = e.clipboardData.getData('text/plain');
    if (t && QB.math.looksLatex(t)) {
      e.preventDefault();
      insertAtCursor(fIn, QB.math.latexToPlain(t));
      updateFormula();
      toast('Перевёл из LaTeX в обычный вид');
    }
  });
  fCalc.onclick = () => {
    const v = QB.math.calc(fIn.value);
    if (v === null) return;
    fIn.value = fIn.value.replace(/=\s*$/, '').trimEnd() + ' = ' + QB.math.fmtNum(v);
    updateFormula();
    fIn.focus();
  };
  $('fInsert').onclick = insertFormula;
  $('fCopyText').onclick = async () => {
    const t = QB.math.toPlain(fIn.value);
    if (!t) return;
    await copyText(t);
    toast('Скопировано: ' + t);
  };
  $('fCopyImg').onclick = async () => {
    const src = fIn.value.trim();
    if (!src || QB.formula.state() !== 'ready') return;
    const th = QB.render.theme('paper');
    const ok = await QB.ui.copyImage(QB.formula.toPng(QB.math.toLatex(src), th.colors[A.opts.color] || A.opts.color, 44, '#ffffff'), 'formula.png');
    if (ok) toast('Формула скопирована картинкой — вставляй Ctrl+V');
  };

  // ================= график
  const gp = $('graphPanel');
  let gState = null;
  let gFocus = 0;
  const GCOLORS = ['blue', 'red', 'green', 'orange', 'purple', 'ink'];
  const EXAMPLES = ['x^2', '2x + 1', 'sin(x)', '1/x', '√x', '|x|', '2^x', 'x^3 - 3x', 'log_2(x)', '-x^2 + 4'];
  const num = (s) => parseFloat(String(s).replace(',', '.').replace('−', '-'));

  const gItem = () => (gState ? S.page().items.find((i) => i.id === gState.id) : null);
  function patch(fn) {
    const it = gItem();
    if (!it) return;
    const n = fn({ ...it, fns: it.fns.map((f) => ({ ...f })) });
    S.page().items = S.page().items.map((i) => (i.id === it.id ? n : i));
    gState.changed = true;
    QB.requestDraw();
  }
  function openGraph(id) {
    commitText();
    closeFormula();
    if (gState && gState.id !== id) closeGraph();
    const it = S.page().items.find((i) => i.id === id);
    if (!it) return;
    if (!gState) gState = { id, before: S.page().items.slice(), changed: false };
    gp.hidden = false;
    gFocus = Math.max(0, it.fns.findIndex((f) => !f.expr.trim()));
    renderGraph(true);
  }
  function closeGraph() {
    if (!gState) return;
    if (gp.contains(document.activeElement)) document.activeElement.blur();
    gp.hidden = true;
    const it = gItem();
    // пустые строки функций убираем
    if (it && it.fns.some((f) => !f.expr.trim()) && it.fns.length > 1) patch((n) => { n.fns = n.fns.filter((f) => f.expr.trim()); return n; });
    if (gState.changed) S.setItems(S.page().items, gState.before);
    gState = null;
  }
  function fnError(expr) {
    if (!expr.trim()) return '';
    const c = QB.math.compileFn(expr);
    return c.error || '';
  }
  function renderGraph(focus) {
    const it = gItem();
    if (!it) return;
    const th = QB.render.theme(S.doc.theme);
    const box = $('gFns');
    box.innerHTML = '';
    it.fns.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'g-row';
      row.innerHTML = `<button type="button" class="g-color" title="Цвет линии"></button><span class="g-y">y =</span>
        <input class="g-in" spellcheck="false" autocomplete="off" placeholder="например, x^2 - 3"><button type="button" class="icon-btn g-del" title="Убрать"><i data-lucide="x"></i></button>
        <div class="g-err"></div>`;
      const cb = row.querySelector('.g-color');
      cb.style.background = QB.render.color(f.color, th);
      cb.onclick = () => {
        patch((n) => { n.fns[i].color = GCOLORS[(GCOLORS.indexOf(f.color) + 1) % GCOLORS.length]; return n; });
        renderGraph(false);
      };
      const inp = row.querySelector('.g-in');
      const er = row.querySelector('.g-err');
      inp.value = f.expr;
      er.textContent = fnError(f.expr);
      inp.addEventListener('focus', () => { gFocus = i; });
      inp.addEventListener('input', () => {
        const v = inp.value;
        patch((n) => { n.fns[i].expr = v; return n; });
        er.textContent = fnError(v);
      });
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closeGraph(); }
      });
      inp.addEventListener('paste', (e) => {
        const t = e.clipboardData.getData('text/plain');
        if (t && QB.math.looksLatex(t)) { e.preventDefault(); insertAtCursor(inp, QB.math.latexToPlain(t)); inp.dispatchEvent(new Event('input')); }
      });
      row.querySelector('.g-del').onclick = () => {
        patch((n) => { n.fns.splice(i, 1); if (!n.fns.length) n.fns.push({ expr: '', color: 'blue' }); return n; });
        renderGraph(false);
      };
      box.appendChild(row);
      if (focus && i === gFocus) requestAnimationFrame(() => inp.focus());
    });
    ['xmin', 'xmax', 'ymin', 'ymax'].forEach((k) => { $('g_' + k).value = String(it[k]).replace('.', ','); });
    $('gAdd').disabled = it.fns.length >= 6;
    QB.ui.icons();
  }
  $('gAdd').onclick = () => {
    patch((n) => {
      const used = n.fns.map((f) => f.color);
      n.fns.push({ expr: '', color: GCOLORS.find((c) => !used.includes(c)) || 'blue' });
      return n;
    });
    gFocus = gItem().fns.length - 1;
    renderGraph(true);
  };
  const ex = $('gExamples');
  EXAMPLES.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = 'y = ' + e;
    b.addEventListener('mousedown', (ev) => ev.preventDefault());
    b.onclick = () => {
      const it = gItem();
      if (!it) return;
      let i = Math.min(gFocus, it.fns.length - 1);
      if (it.fns[i].expr.trim() && it.fns.length < 6) {
        const used = it.fns.map((f) => f.color);
        patch((n) => { n.fns.push({ expr: e, color: GCOLORS.find((c) => !used.includes(c)) || 'blue' }); return n; });
        i = it.fns.length;
      } else patch((n) => { n.fns[i].expr = e; return n; });
      gFocus = i;
      renderGraph(false);
    };
    ex.appendChild(b);
  });
  ['xmin', 'xmax', 'ymin', 'ymax'].forEach((k) => {
    const inp = $('g_' + k);
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    inp.addEventListener('change', () => {
      const v = num(inp.value);
      const it = gItem();
      if (!it || !Number.isFinite(v)) { renderGraph(false); return; }
      const n = { ...it, [k]: v };
      if (n.xmin >= n.xmax || n.ymin >= n.ymax) { toast('«от» должно быть меньше «до»'); renderGraph(false); return; }
      patch((m) => { m[k] = v; return m; });
    });
  });
  $('gCells').onclick = () => {
    patch((n) => {
      const cx = (n.xmin + n.xmax) / 2, cy = (n.ymin + n.ymax) / 2;
      const hw = n.w / 2 / G.GRID, hh = n.h / 2 / G.GRID;
      const r = (v) => Math.round(v * 10) / 10;
      n.xmin = r(cx - hw); n.xmax = r(cx + hw); n.ymin = r(cy - hh); n.ymax = r(cy + hh);
      return n;
    });
    renderGraph(false);
  };
  $('gZoomIn').onclick = () => { patch((n) => zoomRange(n, 0.5)); renderGraph(false); };
  $('gZoomOut').onclick = () => { patch((n) => zoomRange(n, 2)); renderGraph(false); };
  function zoomRange(n, k) {
    const cx = (n.xmin + n.xmax) / 2, cy = (n.ymin + n.ymax) / 2;
    const r = (v) => Math.round(v * 100) / 100;
    n.xmin = r(cx - ((n.xmax - n.xmin) / 2) * k); n.xmax = r(cx + ((n.xmax - n.xmin) / 2) * k);
    n.ymin = r(cy - ((n.ymax - n.ymin) / 2) * k); n.ymax = r(cy + ((n.ymax - n.ymin) / 2) * k);
    return n;
  }

  document.querySelectorAll('[data-close="formula"]').forEach((b) => { b.onclick = closeFormula; });
  document.querySelectorAll('[data-close="graph"]').forEach((b) => { b.onclick = closeGraph; });

  QB.panels = {
    editText, commitText, openFormula, closeFormula, openGraph, closeGraph, copyText,
    reposition() { placeText(); },
    onMathReady() { if (fState) updateFormula(); },
    closeAll() { commitText(); closeFormula(); closeGraph(); },
    isOpen: () => !!(fState || gState || tx),
  };
  renderPalette();
})();
