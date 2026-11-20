// Конспект: пишешь текст как в тетради, формулы прямо в строку, зарисовки рисуешь на доске
(function () {
  const QB = window.QB;
  const S = QB.store;
  const G = QB.geom;
  const $ = (id) => document.getElementById(id);
  const ed = $('notesEditor');
  const paper = $('notesPaper');
  const bar = $('notesBar');
  const toast = (t, ms) => QB.ui.toast(t, ms);
  const ZW = '​'; // пустой символ после формулы — чтобы курсору было куда встать

  let cur = null; // лист-конспект, который сейчас в редакторе
  let lastRange = null; // где стоял курсор (панель формулы забирает фокус)
  let saveT = null;
  let prefBlock = false; // формулы «отдельной строкой» по умолчанию?
  let plainPaste = false; // Ctrl+Shift+V — вставить просто текст

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const active = () => !S.sketch && S.doc.pages[S.doc.current].type === 'notes';

  document.execCommand('defaultParagraphSeparator', false, 'p');

  // ---- элементы: формула и зарисовка
  function mathEl(src, block) {
    // в строке — <var>, не <span>: Chrome при вставке выкидывает «пустые» span (например, внутри списка)
    const el = document.createElement(block ? 'div' : 'var');
    el.className = block ? 'qn-mathblock' : 'qn-math';
    el.setAttribute('data-src', src);
    el.setAttribute('contenteditable', 'false');
    el.textContent = QB.math.toPlain(src) || src; // запасной текст: для Word и пока грузятся формулы
    return el;
  }
  const mathHTML = (src, block) => mathEl(src, block).outerHTML;
  function sketchEl(sid) {
    const f = document.createElement('figure');
    f.className = 'qn-sketch';
    f.setAttribute('data-sid', sid);
    f.setAttribute('contenteditable', 'false');
    return f;
  }

  // ---- чистка HTML (из файла, из буфера): только свои теги, без скриптов и чужих ссылок
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'SVG', 'MATH', 'TEMPLATE',
    'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'CANVAS', 'VIDEO', 'AUDIO', 'HEAD']);
  const KEEP = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
    'MARK', 'IMG', 'HR', 'SUB', 'SUP', 'CODE']);
  const CLS = ['qn-box', 'qn-def', 'qn-thm', 'qn-ex', 'qn-warn', 'qn-img'];

  function sanitize(html, opts = {}) {
    const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    const out = document.createElement('div');
    const walk = (src, dst) => {
      for (const n of [...src.childNodes]) {
        if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.data)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (DROP.has(tag)) continue;
        const cl = (n.getAttribute('class') || '').split(/\s+/);
        if (cl.includes('qn-math') || cl.includes('qn-mathblock')) {
          const s = (n.getAttribute('data-src') || '').slice(0, 3000);
          if (s) dst.appendChild(mathEl(s, cl.includes('qn-mathblock')));
          continue;
        }
        if (cl.includes('qn-sketch')) {
          const sid = n.getAttribute('data-sid') || '';
          if (/^[a-z0-9]{4,40}$/i.test(sid) && opts.page && opts.page.sketches && opts.page.sketches[sid]) { dst.appendChild(sketchEl(sid)); continue; }
          // зарисовка из другого конспекта — оставляем картинкой
          const im = n.querySelector('img');
          const s = im && im.getAttribute('src');
          if (s && /^data:image\//.test(s)) {
            const img = document.createElement('img');
            img.className = 'qn-img';
            img.src = s;
            dst.appendChild(img);
          }
          continue;
        }
        if (tag === 'SPAN') {
          // подсветка из других мест -> маркер, остальные span просто разворачиваем
          if (/background(-color)?:\s*(?!transparent|initial|inherit|none)[^;]+/i.test(n.getAttribute('style') || '')) {
            const m = document.createElement('mark');
            walk(n, m);
            dst.appendChild(m);
          } else walk(n, dst);
          continue;
        }
        if (!KEEP.has(tag)) { walk(n, dst); continue; } // незнакомые теги разворачиваем
        if (tag === 'IMG') {
          const s = n.getAttribute('src') || '';
          if (!/^data:image\//.test(s)) continue; // только встроенные картинки
          const img = document.createElement('img');
          img.className = 'qn-img';
          img.src = s;
          const w = parseInt(n.getAttribute('width'), 10);
          if (w > 0 && w < 4000) img.setAttribute('width', w);
          dst.appendChild(img);
          continue;
        }
        const el = document.createElement(tag === 'STRONG' ? 'B' : tag === 'EM' ? 'I' : tag);
        const keep = cl.filter((c) => CLS.includes(c));
        if (keep.length) el.className = keep.join(' ');
        walk(n, el);
        dst.appendChild(el);
      }
    };
    walk(doc.body, out);
    return out.innerHTML;
  }

  // ---- отрисовка формул и зарисовок внутри текста
  function renderMath(el) {
    const src = el.getAttribute('data-src') || '';
    const block = el.classList.contains('qn-mathblock');
    const key = src + '|' + block;
    if (el.dataset.r === key) return;
    if (QB.formula.state() !== 'ready') {
      el.classList.add('pending');
      el.textContent = QB.math.toPlain(src) || src;
      return;
    }
    el.classList.remove('pending');
    QB.formula.preview(QB.math.toLatex(src), el, block);
    el.dataset.r = key;
  }

  const skCache = new Map(); // sid -> { items, theme, bg, url, w, v }
  let skVer = 0;
  const SK_TOOLS = '<div class="qn-sk-tools"><button type="button" data-act="edit"><i data-lucide="pencil"></i>Дорисовать</button>'
    + '<button type="button" class="del" data-act="del"><i data-lucide="trash-2"></i>Удалить</button></div>';
  async function renderSketch(fig, pg) {
    const page = pg || cur;
    const sid = fig.getAttribute('data-sid');
    const sk = page && page.sketches && page.sketches[sid];
    if (!sk) { fig.innerHTML = '<div class="qn-sk-empty">Зарисовка потерялась</div>'; return; }
    const theme = S.doc.theme;
    let c = skCache.get(sid);
    if (!c || c.items !== sk.items || c.theme !== theme || c.bg !== sk.bg) {
      c = { items: sk.items, theme, bg: sk.bg, url: null, w: 0, v: ++skVer };
      skCache.set(sid, c);
      if (sk.items.length) {
        await QB.render.prepare(sk, theme);
        const cv = QB.render.renderPage(sk, theme, 2);
        if (cv) { c.url = cv.toDataURL('image/png'); c.w = Math.round(cv.width / 2); }
      }
    }
    if (fig.dataset.r === String(c.v)) return;
    fig.dataset.r = String(c.v);
    fig.innerHTML = (c.url
      ? `<img src="${c.url}" alt="Зарисовка" style="width:${c.w}px">`
      : '<div class="qn-sk-empty">Пустая зарисовка — нажми, чтобы рисовать</div>') + SK_TOOLS;
    QB.ui.icons();
  }

  function hydrate() {
    ed.querySelectorAll('.qn-math, .qn-mathblock').forEach(renderMath);
    ed.querySelectorAll('.qn-sketch').forEach((f) => renderSketch(f));
    updateEmpty();
  }

  // что храним: формулы и зарисовки без отрисовки, только данные
  function serialize(root) {
    const c = root.cloneNode(true);
    c.querySelectorAll('.qn-math, .qn-mathblock').forEach((el) => { el.textContent = ''; el.removeAttribute('data-r'); el.classList.remove('pending'); });
    c.querySelectorAll('.qn-sketch').forEach((el) => { el.innerHTML = ''; el.removeAttribute('data-r'); });
    return c.innerHTML.replace(/​/g, '');
  }

  function updateEmpty() {
    if (!ed.firstElementChild && !ed.textContent.trim()) ed.innerHTML = '<p><br></p>';
    const empty = !ed.textContent.replace(/​/g, '').trim() && !ed.querySelector('.qn-math, .qn-mathblock, .qn-sketch, img, li, hr');
    ed.classList.toggle('is-empty', empty);
  }

  // ---- загрузка/сохранение листа
  function load(pg) {
    cur = pg;
    if (!pg.sketches) pg.sketches = {};
    ed.innerHTML = sanitize(pg.html || '', { page: pg }) || '<p><br></p>';
    lastRange = null;
    hydrate();
  }
  function flush() {
    clearTimeout(saveT);
    if (cur) cur.html = serialize(ed);
  }
  function scheduleSave() {
    clearTimeout(saveT);
    QB.ui.saveState('saving');
    saveT = setTimeout(() => { flush(); S.saveSoon(); }, 350);
  }

  // переключение: конспект / доска / зарисовка
  function sync() {
    const pg = S.doc.pages[S.doc.current];
    const sketch = !!S.sketch;
    const notes = !sketch && pg.type === 'notes';
    document.body.classList.toggle('mode-notes', notes);
    document.body.classList.toggle('mode-sketch', sketch);
    if (notes) {
      if (cur !== pg) { flush(); load(pg); } else hydrate();
      paper.dataset.bg = pg.bg || 'lines';
    } else if (!sketch && cur) {
      flush();
      cur = null;
    }
  }

  // ---- курсор
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && ed.contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange();
  });
  function setSel(r) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function focusEditor() {
    const sel = getSelection();
    if (document.activeElement === ed && sel.rangeCount && ed.contains(sel.anchorNode)) return; // курсор и так в тексте
    ed.focus({ preventScroll: true });
    if (lastRange && ed.contains(lastRange.startContainer)) setSel(lastRange);
    else if (!getSelection().rangeCount || !ed.contains(getSelection().anchorNode)) {
      const r = document.createRange();
      r.selectNodeContents(ed);
      r.collapse(false);
      setSel(r);
    }
  }
  function insertHTMLAt(html) {
    focusEditor();
    document.execCommand('insertHTML', false, html);
    hydrate();
    scheduleSave();
  }
  function removeNode(el) {
    focusEditor();
    const r = document.createRange();
    r.selectNode(el);
    setSel(r);
    document.execCommand('delete');
    scheduleSave();
  }

  // ---- оформление
  function cmd(name, arg) {
    focusEditor();
    document.execCommand(name, false, arg);
    scheduleSave();
  }
  const block = (tag) => cmd('formatBlock', '<' + tag + '>');

  function toggleMark() {
    focusEditor();
    const s = getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    const n = r.commonAncestorContainer;
    const mk = (n.nodeType === 1 ? n : n.parentElement).closest('mark');
    if (mk && ed.contains(mk)) { // уже подсвечено — снимаем
      const rr = document.createRange();
      rr.selectNode(mk);
      setSel(rr);
      document.execCommand('insertHTML', false, sanitize(mk.innerHTML, { page: cur }));
      hydrate();
      scheduleSave();
      return;
    }
    if (r.collapsed) { toast('Выдели текст, который подсветить'); return; }
    const box = document.createElement('div');
    box.appendChild(r.cloneContents());
    if (box.querySelector('p, h1, h2, h3, li, ul, ol, figure, .qn-mathblock, blockquote, div')) { toast('Маркер — в пределах одного абзаца'); return; }
    document.execCommand('insertHTML', false, '<mark>' + sanitize(box.innerHTML, { page: cur }) + '</mark>');
    hydrate();
    scheduleSave();
  }

  const BOXES = [
    ['qn-def', 'book-open', 'Определение'],
    ['qn-thm', 'lightbulb', 'Теорема'],
    ['qn-ex', 'notebook-pen', 'Пример'],
    ['qn-warn', 'triangle-alert', 'Важно'],
  ];
  function insertBox(cls, label) {
    insertHTMLAt(`<div class="qn-box ${cls}" data-new="1"><p><b>${label}.</b>&nbsp;</p></div><p><br></p>`);
    const box = ed.querySelector('[data-new]');
    if (!box) return;
    box.removeAttribute('data-new');
    const p = box.querySelector('p');
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(false);
    setSel(r);
  }

  // ---- формулы
  function askFormula(existing) {
    if (!cur) return;
    const isBlock = existing ? existing.classList.contains('qn-mathblock') : prefBlock;
    QB.panels.openFormula(null, null, {
      src: existing ? existing.getAttribute('data-src') : '',
      mode: isBlock ? 'block' : 'inline',
      editing: !!existing,
      onClose: () => focusEditor(),
      onDone: (src, mode) => {
        const blk = mode === 'block';
        prefBlock = blk;
        const html = mathHTML(src, blk) + (blk ? '' : ZW);
        if (existing && ed.contains(existing)) {
          focusEditor();
          const r = document.createRange();
          r.selectNode(existing);
          setSel(r);
          document.execCommand('insertHTML', false, html);
          hydrate();
          scheduleSave();
        } else insertHTMLAt(html + (blk ? '<p><br></p>' : ''));
      },
    });
  }

  // $x^2$ прямо при наборе -> формула. Текст может прийти и разом (автозамена, голосовой ввод) —
  // поэтому ищем все пары $…$ перед курсором, а не только последнюю букву
  // текстовые узлы строки, кроме тех, что внутри формул/зарисовок
  const textNodes = (blk) => {
    const out = [];
    const tw = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.qn-math, .qn-mathblock, .qn-sketch') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let t;
    while ((t = tw.nextNode())) out.push(t);
    return out;
  };
  // сколько букв в строке правее курсора — по нему потом вернём курсор на место
  function charsAfterCaret(blk) {
    const r = getSelection().getRangeAt(0);
    let n = 0;
    for (const t of textNodes(blk)) {
      if (t === r.endContainer) n += t.data.length - r.endOffset;
      else if (r.comparePoint(t, 0) > 0) n += t.data.length;
    }
    return n;
  }
  function placeBeforeEnd(blk, n) {
    const nodes = textNodes(blk);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const len = nodes[i].data.length;
      if (n <= len) { const r = document.createRange(); r.setStart(nodes[i], len - n); r.collapse(true); setSel(r); return; }
      n -= len;
    }
    const r = document.createRange();
    r.selectNodeContents(blk);
    r.collapse(false);
    setSel(r);
  }
  function convertDollars() {
    const s = getSelection();
    if (!s.rangeCount || !ed.contains(s.anchorNode)) return false;
    const blk = blockOf(s.anchorNode);
    if (!blk || blk === ed) return false;
    const tail = charsAfterCaret(blk);
    const re = /(^|[^\\$])\$(?!\s)([^$\n]{1,300}?)(?<!\s)\$/;
    let changed = false;
    for (let guard = 0; guard < 30; guard++) {
      const nodes = textNodes(blk);
      let hit = null;
      for (let i = 0; i < nodes.length && !hit; i++) {
        const m = re.exec(nodes[i].data);
        if (m) hit = { i, t: nodes[i], start: m.index + m[1].length, src: m[2] };
      }
      if (!hit) break;
      // только то, что левее курсора
      const end = hit.start + hit.src.length + 2;
      let after = hit.t.data.length - end;
      for (let k = hit.i + 1; k < nodes.length; k++) after += nodes[k].data.length;
      if (after < tail) break;
      const rr = document.createRange();
      rr.setStart(hit.t, hit.start);
      rr.setEnd(hit.t, end);
      setSel(rr);
      document.execCommand('insertHTML', false, mathHTML(cleanSrc(hit.src), false) + ZW);
      changed = true;
    }
    if (changed) { placeBeforeEnd(blk, tail); hydrate(); }
    return changed;
  }
  // LaTeX из нейросети -> обычная запись, если получилось
  function cleanSrc(x) {
    const t = String(x).trim();
    if (!t.includes('\\')) return t;
    const p = QB.math.latexToPlain(t);
    return p && !p.includes('\\') ? p : t;
  }

  // «# », «- », «1. » в начале строки -> заголовок/список
  function blockOf(node) {
    let n = node.nodeType === 3 ? node.parentNode : node;
    while (n && n !== ed && !/^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE)$/.test(n.tagName)) n = n.parentNode;
    return n;
  }
  const MD = { '### ': 'h2', '## ': 'h2', '# ': 'h1', '- ': 'ul', '* ': 'ul', '• ': 'ul', '1. ': 'ol', '> ': 'blockquote' };
  const MD_KEYS = Object.keys(MD).sort((a, b) => b.length - a.length);
  function tryMarkdown(data) {
    const s = getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    if (!r.collapsed) return;
    const blk = blockOf(r.startContainer);
    if (!blk || blk === ed || blk.tagName === 'LI' || blk.classList.contains('qn-box')) return;
    const pre = document.createRange();
    pre.selectNodeContents(blk);
    pre.setEnd(r.startContainer, r.startOffset);
    const t = pre.toString().replace(/ /g, ' ');
    const marker = MD_KEYS.find((k) => t.startsWith(k));
    if (!marker) return;
    // маркер только что набран — или вся строка пришла разом («# Тема»)
    const whole = data.length > 1 && t === data.replace(/ /g, ' ');
    if (t !== marker && !whole) return;
    const tw = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
    const first = tw.nextNode();
    if (!first || !first.data.replace(/ /g, ' ').startsWith(marker)) return;
    const del = document.createRange();
    del.setStart(first, 0);
    del.setEnd(first, marker.length);
    setSel(del);
    document.execCommand('delete');
    const kind = MD[marker];
    if (kind === 'ul') document.execCommand('insertUnorderedList');
    else if (kind === 'ol') document.execCommand('insertOrderedList');
    else document.execCommand('formatBlock', false, '<' + kind + '>');
    if (whole) { // курсор — в конец строки
      const b2 = blockOf(getSelection().anchorNode || ed);
      if (b2 && b2 !== ed) { const end = document.createRange(); end.selectNodeContents(b2); end.collapse(false); setSel(end); }
    }
  }

  // ---- текст (ответ нейросети, markdown) -> HTML конспекта с формулами
  function textToHTML(text) {
    const maths = [];
    const put = (x, blk) => { maths.push({ src: cleanSrc(x), block: blk }); return '\u0000' + (maths.length - 1) + '\u0000'; };
    let t = String(text).replace(/\r/g, '')
      .replace(/\$\$([\s\S]+?)\$\$/g, (m, x) => put(x, true))
      .replace(/\\\[([\s\S]+?)\\\]/g, (m, x) => put(x, true))
      .replace(/\\\(([\s\S]+?)\\\)/g, (m, x) => put(x, false))
      .replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (m, pre, x) => pre + put(x, false));
    const inline = (s) => esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_]+)__/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\u0000(\d+)\u0000/g, (m, i) => mathHTML(maths[i].src, false) + ZW);
    let html = '';
    let list = null;
    const closeList = () => { if (list) { html += '</' + list + '>'; list = null; } };
    for (const raw of t.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if (!line.trim()) { closeList(); continue; }
      if ((m = /^\s*\u0000(\d+)\u0000\s*$/.exec(line))) { closeList(); html += mathHTML(maths[m[1]].src, maths[m[1]].block); continue; }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { closeList(); const tg = m[1].length === 1 ? 'h1' : 'h2'; html += `<${tg}>${inline(m[2])}</${tg}>`; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { closeList(); html += '<hr>'; continue; }
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) { if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
      if ((m = /^>\s?(.*)$/.exec(line))) { closeList(); html += '<blockquote>' + inline(m[1]) + '</blockquote>'; continue; }
      closeList();
      html += '<p>' + inline(line) + '</p>';
    }
    closeList();
    return { html, maths: maths.length };
  }

  // ---- текст для копирования наружу: формулы как (√7 + √89768) / 4
  function plainOf(root) {
    let out = '';
    const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const BLOCK = /^(P|DIV|H1|H2|H3|LI|BLOCKQUOTE|FIGURE|UL|OL|HR)$/;
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { out += c.data.replace(/​/g, ''); continue; }
        if (c.nodeType !== 1) continue;
        if (c.classList.contains('qn-math')) { out += QB.math.toPlain(c.getAttribute('data-src') || ''); continue; }
        if (c.classList.contains('qn-mathblock')) { nl(); out += QB.math.toPlain(c.getAttribute('data-src') || ''); nl(); continue; }
        if (c.classList.contains('qn-sketch')) { nl(); out += '[рисунок]'; nl(); continue; }
        if (c.classList.contains('qn-sk-tools')) continue;
        if (c.tagName === 'IMG') { nl(); out += '[картинка]'; nl(); continue; }
        if (c.tagName === 'BR') { out += '\n'; continue; }
        const blk = BLOCK.test(c.tagName);
        if (blk) nl();
        if (c.tagName === 'LI') {
          const ol = c.parentElement && c.parentElement.tagName === 'OL';
          out += ol ? [...c.parentElement.children].indexOf(c) + 1 + '. ' : '• ';
        }
        walk(c);
        if (blk) nl();
      }
    };
    walk(root);
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // HTML для буфера: в Word формулы видны текстом, у нас — восстанавливаются формулами
  function clipHTML(root) {
    const c = root.cloneNode(true);
    c.querySelectorAll('.qn-math, .qn-mathblock').forEach((el) => { el.textContent = QB.math.toPlain(el.getAttribute('data-src') || ''); el.removeAttribute('data-r'); });
    c.querySelectorAll('.qn-sketch').forEach((el) => {
      const cc = skCache.get(el.getAttribute('data-sid'));
      el.innerHTML = cc && cc.url ? `<img src="${cc.url}" width="${cc.w}">` : '';
    });
    return c.innerHTML.replace(/​/g, '');
  }

  function onCopy(e, cut) {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return;
    const r = s.getRangeAt(0);
    if (!ed.contains(r.commonAncestorContainer)) return;
    const box = document.createElement('div');
    box.appendChild(r.cloneContents());
    e.preventDefault();
    e.clipboardData.setData('text/plain', plainOf(box));
    e.clipboardData.setData('text/html', '<!--qnotes-->' + clipHTML(box));
    if (cut) { document.execCommand('delete'); scheduleSave(); }
  }

  // ---- вставка
  function pasteBoardItems(items) {
    const sid = newSid();
    const copy = QB.tools.cloneItems(items, 0, 0);
    cur.sketches[sid] = { id: 'sk' + sid, bg: 'plain', items: copy, view: null };
    insertHTMLAt(sketchEl(sid).outerHTML + '<p><br></p>');
    toast('Вставил рисунок с доски как зарисовку. Текстом — Ctrl+Shift+V', 2800);
  }
  async function insertImageFile(file) {
    try {
      const im = await QB.ui.readImage(file);
      insertHTMLAt(`<img class="qn-img" src="${im.src}" width="${Math.min(im.w, 760)}"><p><br></p>`);
    } catch (e) { toast('Не получилось вставить картинку'); }
  }

  ed.addEventListener('paste', (e) => {
    const dt = e.clipboardData;
    if (!dt || !cur) return;
    e.preventDefault();
    e.stopPropagation();
    const plain = plainPaste;
    plainPaste = false;
    const file = [...dt.files].find((f) => /^image\//.test(f.type));
    if (file && !plain) { insertImageFile(file); return; }
    const html = dt.getData('text/html') || '';
    if (!plain && html.includes('qnotes')) { insertHTMLAt(sanitize(html, { page: cur })); return; }
    const text = dt.getData('text/plain') || '';
    if (!plain) {
      let raw = '';
      try { raw = dt.getData('application/x-quorboard'); } catch (er) { /* нет */ }
      let items = null;
      if (raw) { try { items = JSON.parse(raw); } catch (er) { /* битое */ } }
      if (!items) items = QB.ui.clipItems(text);
      if (Array.isArray(items) && items.length) { pasteBoardItems(items); return; }
    }
    if (!text) return;
    if (plain) { document.execCommand('insertText', false, text); scheduleSave(); return; }
    const hasMath = /\\\(|\\\[|\$\$|\$(?!\s)[^$\n]+?\$|\\[a-zA-Z]+/.test(text);
    const hasMd = /^\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s|>)/m.test(text) || /\*\*[^*]+\*\*/.test(text);
    // одна формула LaTeX без обёрток — сразу формулой
    if (!/[\n$]|\\\(|\\\[/.test(text) && QB.math.looksLatex(text) && text.length < 400) { insertHTMLAt(mathHTML(cleanSrc(text), false) + ZW); return; }
    if (!hasMath && !hasMd && !text.includes('\n')) { document.execCommand('insertText', false, text); scheduleSave(); return; }
    const res = textToHTML(text);
    insertHTMLAt(res.html);
    if (res.maths) toast('Вставил с формулами (' + res.maths + ') — любую можно поправить кликом', 2600);
  });
  ed.addEventListener('copy', (e) => onCopy(e, false));
  ed.addEventListener('cut', (e) => onCopy(e, true));

  ed.addEventListener('input', (e) => {
    const d = e.data || '';
    if (!e.isComposing && /^insert(Text|ReplacementText)$/.test(e.inputType)) {
      const md = /[  ]/.test(d), dol = d.includes('$');
      // сразу после ввода, а не внутри него — браузер не даёт править текст посреди своей правки
      if (md || dol) setTimeout(() => { if (md) tryMarkdown(d); if (dol) convertDollars(); updateEmpty(); scheduleSave(); }, 0);
    }
    updateEmpty();
    scheduleSave();
  });

  ed.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const L = QB.ui.letterOf(e);
    if (ctrl && L === 'M') { e.preventDefault(); askFormula(); return; }
    if (ctrl && e.shiftKey && L === 'V') { plainPaste = true; setTimeout(() => { plainPaste = false; }, 500); return; }
    if (ctrl && !e.shiftKey && !e.altKey && { B: 'bold', I: 'italic', U: 'underline' }[L]) {
      e.preventDefault(); // свои — чтобы работали в любой раскладке
      cmd({ B: 'bold', I: 'italic', U: 'underline' }[L]);
      return;
    }
    if (e.key === 'Tab') {
      const blk = blockOf(getSelection().anchorNode || ed);
      if (blk && blk.tagName === 'LI') { e.preventDefault(); cmd(e.shiftKey ? 'outdent' : 'indent'); }
    }
  });

  // клик по формуле — поправить; по зарисовке — дорисовать
  ed.addEventListener('click', (e) => {
    const m = e.target.closest('.qn-math, .qn-mathblock');
    if (m && ed.contains(m)) { e.preventDefault(); askFormula(m); return; }
    const f = e.target.closest('.qn-sketch');
    if (f && ed.contains(f)) {
      e.preventDefault();
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'del') { removeNode(f); return; }
      openSketch(f.getAttribute('data-sid'));
    }
  });

  // ---- зарисовки: рисуем на обычной доске, потом «Готово»
  const newSid = () => G.uid().replace(/[^a-z0-9]/gi, '');
  function newSketch(withGraph) {
    if (!cur) return;
    const sid = newSid();
    const sk = { id: 'sk' + sid, bg: 'grid', items: [], view: null };
    let gid = null;
    if (withGraph) {
      gid = G.uid();
      sk.items.push({ id: gid, type: 'graph', x: 0, y: 0, w: 420, h: 300, xmin: -7, xmax: 7, ymin: -5, ymax: 5, fns: [{ expr: '', color: 'blue' }] });
    }
    cur.sketches[sid] = sk;
    insertHTMLAt(sketchEl(sid).outerHTML + '<p><br></p>');
    openSketch(sid, { isNew: true, graphId: gid });
  }
  function openSketch(sid, opts = {}) {
    if (!cur || !cur.sketches[sid]) return;
    flush();
    const sk = cur.sketches[sid];
    if (!sk.view) {
      const { W, H } = QB.size();
      const b = sk.items.length ? G.unionBox(sk.items) : { x: 0, y: 0, w: 0, h: 0 };
      sk.view = { ox: Math.round(W / 2 - (b.x + b.w / 2)), oy: Math.round(H / 2 - (b.y + b.h / 2)), z: 1 };
    }
    QB.panels.closeAll();
    S.sketch = { notesId: cur.id, sid, isNew: !!opts.isNew };
    QB.app.sel.clear();
    S.changed('pages');
    QB.tools.setTool(opts.graphId ? 'select' : 'pen');
    if (opts.graphId) { QB.app.sel = new Set([opts.graphId]); QB.panels.openGraph(opts.graphId); }
    toast('Рисуй как на доске, потом «Готово» — зарисовка встанет в конспект', 3200);
  }
  function finishSketch() {
    if (!S.sketch) return;
    QB.panels.closeAll();
    const { sid, isNew } = S.sketch;
    S.sketch = null;
    QB.app.sel.clear();
    S.changed('pages');
    const fig = ed.querySelector('.qn-sketch[data-sid="' + sid + '"]');
    const sk = cur && cur.sketches[sid];
    if (fig && sk && !sk.items.length && isNew) {
      fig.remove();
      delete cur.sketches[sid];
      scheduleSave();
    } else if (fig) fig.scrollIntoView({ block: 'center' });
  }
  $('sketchDone').onclick = finishSketch;

  // ---- панель кнопок
  const imgInput = document.createElement('input');
  imgInput.type = 'file';
  imgInput.accept = 'image/*';
  imgInput.hidden = true;
  document.body.appendChild(imgInput);
  imgInput.addEventListener('change', () => { if (imgInput.files[0]) insertImageFile(imgInput.files[0]); imgInput.value = ''; });

  async function copyAll() {
    flush();
    const t = plainOf(ed);
    if (!t) { toast('Конспект пустой'); return; }
    await QB.panels.copyText(t);
    toast('Весь конспект скопирован текстом — формулы как √, ², ≤');
  }

  const BTNS = [
    { icon: 'heading-1', tip: 'Заголовок   «# »', act: () => block('h1') },
    { icon: 'heading-2', tip: 'Подзаголовок   «## »', act: () => block('h2') },
    { icon: 'pilcrow', tip: 'Обычный текст', act: () => block('p') },
    '|',
    { icon: 'bold', tip: 'Жирный   Ctrl+B', act: () => cmd('bold') },
    { icon: 'italic', tip: 'Курсив   Ctrl+I', act: () => cmd('italic') },
    { icon: 'underline', tip: 'Подчеркнуть   Ctrl+U', act: () => cmd('underline') },
    { icon: 'highlighter', tip: 'Маркер', act: toggleMark },
    '|',
    { icon: 'list', tip: 'Список   «- »', act: () => cmd('insertUnorderedList') },
    { icon: 'list-ordered', tip: 'Нумерованный   «1. »', act: () => cmd('insertOrderedList') },
    '|',
    { icon: 'sigma', label: 'Формула', tip: 'Ctrl+M или $x^2$ прямо в тексте', act: () => askFormula(), accent: true },
    { icon: 'pencil-ruler', label: 'Зарисовка', tip: 'Нарисовать на доске и вставить', act: () => newSketch(false), accent: true },
    { icon: 'chart-spline', tip: 'График функции', act: () => newSketch(true) },
    { icon: 'image', tip: 'Картинка (или Ctrl+V)', act: () => imgInput.click() },
    { icon: 'book-open', label: 'Блок', tip: 'Определение, теорема, пример, важно', menu: true,
      act: (b) => QB.ui.showMenu(b, BOXES.map(([cls, icon, label]) => ({ icon, label, fn: () => insertBox(cls, label) }))) },
    '|',
    { icon: 'clipboard-type', tip: 'Скопировать весь конспект текстом', act: copyAll },
  ];
  function buildBar() {
    bar.innerHTML = '';
    for (const b of BTNS) {
      if (b === '|') { bar.insertAdjacentHTML('beforeend', '<span class="nb-sep"></span>'); continue; }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'nb' + (b.accent ? ' accent' : '');
      el.dataset.tip = b.tip;
      el.setAttribute('aria-label', b.label || b.tip);
      if (b.menu) el.setAttribute('data-menu', '');
      el.innerHTML = `<i data-lucide="${b.icon}"></i>` + (b.label ? `<span>${b.label}</span>` : '');
      el.addEventListener('mousedown', (e) => e.preventDefault()); // курсор остаётся в тексте
      el.addEventListener('click', () => b.act(el));
      bar.appendChild(el);
    }
    QB.ui.icons();
  }

  // ---- печать / PDF
  const PRINT_CSS = `
    .notes{font-size:12pt;line-height:1.6;color:#1f2430}
    .notes h1{font-size:20pt;margin:0 0 6pt}.notes h2{font-size:14pt;margin:12pt 0 4pt;color:#d9480f}
    .notes p{margin:0 0 3pt}.notes ul,.notes ol{margin:0 0 4pt;padding-left:18pt}
    .notes mark{background:#ffe8a3}.notes blockquote{margin:0;padding-left:10pt;border-left:2pt solid #ccc;color:#555}
    .notes .qn-math{display:inline-block;vertical-align:middle;font-style:normal}.notes .qn-mathblock{text-align:center;margin:6pt 0}
    .notes mjx-container{display:inline-block}.notes mjx-assistive-mml{display:none}
    .notes .qn-box{margin:8pt 0;padding:4pt 10pt;border-left:3pt solid #1c64f2;background:#f3f6fd;border-radius:4pt}
    .notes .qn-thm{border-color:#7048e8;background:#f5f2fd}.notes .qn-ex{border-color:#2b8a3e;background:#f1f8f2}.notes .qn-warn{border-color:#e03131;background:#fdf1f1}
    .notes figure{margin:8pt 0;text-align:center;page-break-inside:avoid}.notes figure img,.notes .qn-img{max-width:100%;height:auto}
  `;
  async function printHTML(pg) {
    if (pg === cur) flush();
    const box = document.createElement('div');
    box.innerHTML = sanitize(pg.html || '', { page: pg });
    box.querySelectorAll('.qn-math, .qn-mathblock').forEach((el) => {
      if (QB.formula.state() === 'ready') QB.formula.preview(QB.math.toLatex(el.getAttribute('data-src') || ''), el, el.classList.contains('qn-mathblock'));
    });
    for (const f of [...box.querySelectorAll('.qn-sketch')]) {
      const sk = (pg.sketches || {})[f.getAttribute('data-sid')];
      if (!sk || !sk.items.length) { f.remove(); continue; }
      await QB.render.prepare(sk, 'paper');
      const cv = QB.render.renderPage(sk, 'paper', 2);
      f.innerHTML = cv ? `<img src="${cv.toDataURL('image/png')}" style="width:${Math.round(cv.width / 2)}px">` : '';
    }
    return box.innerHTML;
  }
  const hasContent = (pg) => !!(pg.html && (pg.html.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s/g, '') || /qn-|<img/.test(pg.html)));

  function clear() {
    focusEditor();
    document.execCommand('selectAll');
    document.execCommand('delete');
    updateEmpty();
    scheduleSave();
  }
  function undo(redo) {
    focusEditor();
    document.execCommand(redo ? 'redo' : 'undo');
    hydrate();
    scheduleSave();
  }

  // не потерять последние буквы при закрытии вкладки
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cur) { flush(); S.saveNow(); } });
  window.addEventListener('pagehide', () => { if (cur) { flush(); S.saveNow(); } });

  S.on((what) => { if (['pages', 'all', 'theme', 'bg'].includes(what)) sync(); });

  QB.notes = {
    sync, flush, sanitize, active, askFormula: () => askFormula(), finishSketch, copyAll, clear, undo,
    printHTML, hasContent, PRINT_CSS, textToHTML,
    onMathReady() { if (active()) hydrate(); },
  };
  buildBar();
})();
