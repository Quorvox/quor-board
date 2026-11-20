// Тетрадь: листы, история (отмена), автосохранение в браузере, файл .qboard
(function () {
  const QB = (window.QB = window.QB || {});
  const KEY = 'doc';
  const MAX_UNDO = 120;

  // type: 'board' — доска, 'notes' — конспект (текст + формулы + зарисовки)
  const newPage = (n, type) => (type === 'notes'
    ? { id: QB.geom.uid(), name: 'Конспект ' + n, type: 'notes', bg: 'lines', items: [], html: '', sketches: {}, view: null }
    : { id: QB.geom.uid(), name: 'Лист ' + n, bg: 'grid', items: [], view: null });
  const cleanSketches = (sk) => {
    const out = {};
    if (sk && typeof sk === 'object') {
      for (const [sid, v] of Object.entries(sk)) {
        if (!/^[a-z0-9]{4,40}$/i.test(sid) || !v) continue;
        out[sid] = { id: 'sk' + sid, bg: v.bg || 'grid', items: Array.isArray(v.items) ? v.items : [], view: v.view || null };
      }
    }
    return out;
  };

  const store = {
    doc: { v: 1, theme: 'paper', current: 0, pages: [newPage(1)] },
    hist: new Map(), // id листа -> { u: [], r: [] }
    listeners: [],

    sketch: null, // { notesId, sid } — рисуем зарисовку для конспекта на доске
    page() {
      if (this.sketch) {
        const np = this.doc.pages.find((p) => p.id === this.sketch.notesId);
        const sk = np && np.sketches && np.sketches[this.sketch.sid];
        if (sk) return sk;
        this.sketch = null;
      }
      return this.doc.pages[this.doc.current];
    },
    h() {
      const id = this.page().id;
      if (!this.hist.has(id)) this.hist.set(id, { u: [], r: [] });
      return this.hist.get(id);
    },
    changed(what) {
      this.listeners.forEach((f) => f(what));
      this.saveSoon();
      if (QB.requestDraw) QB.requestDraw();
    },
    on(f) { this.listeners.push(f); },

    // запомнить состояние ДО изменения (items неизменяемые — копия массива дешёвая)
    remember(before) {
      const h = this.h();
      h.u.push(before || this.page().items.slice());
      if (h.u.length > MAX_UNDO) h.u.shift();
      h.r.length = 0;
    },
    setItems(items, before) {
      this.remember(before);
      this.page().items = items;
      this.changed('items');
    },
    add(it) { this.setItems(this.page().items.concat([it])); },
    replace(map, before) { // map: id -> новый объект (или null — удалить)
      const items = [];
      for (const it of this.page().items) {
        if (!(it.id in map)) items.push(it);
        else if (map[it.id]) items.push(map[it.id]);
      }
      this.setItems(items, before);
    },
    undo() {
      const h = this.h();
      if (!h.u.length) return false;
      h.r.push(this.page().items);
      this.page().items = h.u.pop();
      this.changed('items');
      return true;
    },
    redo() {
      const h = this.h();
      if (!h.r.length) return false;
      h.u.push(this.page().items);
      this.page().items = h.r.pop();
      this.changed('items');
      return true;
    },
    canUndo() { return this.h().u.length > 0; },
    canRedo() { return this.h().r.length > 0; },

    // ---- листы
    addPage(type) {
      this.sketch = null;
      const n = this.doc.pages.filter((p) => (p.type === 'notes') === (type === 'notes')).length + 1;
      const pg = newPage(n, type);
      const prev = this.doc.pages[this.doc.current];
      if (type !== 'notes' && prev.type !== 'notes') pg.bg = prev.bg;
      this.doc.pages.splice(this.doc.current + 1, 0, pg);
      this.doc.current += 1;
      this.changed('pages');
    },
    duplicatePage(i) {
      const src = this.doc.pages[i];
      const pg = { ...src, id: QB.geom.uid(), name: src.name + ' (копия)', items: src.items.slice(), view: src.view ? { ...src.view } : null };
      if (src.sketches) {
        if (src === this.doc.pages[this.doc.current] && QB.notes) QB.notes.flush();
        pg.html = src.html;
        pg.sketches = {};
        for (const [sid, v] of Object.entries(src.sketches)) pg.sketches[sid] = { ...v, id: 'sk' + QB.geom.uid().replace(/[^a-z0-9]/gi, ''), items: v.items.slice(), view: v.view ? { ...v.view } : null };
      }
      this.doc.pages.splice(i + 1, 0, pg);
      this.doc.current = i + 1;
      this.changed('pages');
    },
    removePage(i) {
      this.sketch = null;
      const [pg] = this.doc.pages.splice(i, 1);
      this.hist.delete(pg.id);
      if (!this.doc.pages.length) this.doc.pages.push(newPage(1));
      this.doc.current = Math.min(this.doc.current, this.doc.pages.length - 1);
      this.changed('pages');
    },
    setPage(i) {
      if (i < 0 || i >= this.doc.pages.length) return;
      this.sketch = null;
      this.doc.current = i;
      this.changed('pages');
    },
    renamePage(i, name) {
      this.doc.pages[i].name = name.trim().slice(0, 40) || this.doc.pages[i].name;
      this.changed('pages');
    },

    // ---- сохранение
    serialize() {
      return JSON.stringify({
        v: 1, theme: this.doc.theme, current: this.doc.current,
        pages: this.doc.pages.map((p) => (p.type === 'notes'
          ? { id: p.id, name: p.name, type: 'notes', bg: p.bg, items: [], html: p.html || '', sketches: p.sketches || {}, view: null }
          : { id: p.id, name: p.name, bg: p.bg, items: p.items, view: p.view })),
      });
    },
    load(json) {
      const d = JSON.parse(json);
      if (!d || !Array.isArray(d.pages) || !d.pages.length) throw new Error('Это не файл тетради');
      d.pages.forEach((p, i) => {
        p.id = p.id || QB.geom.uid();
        p.name = p.name || 'Лист ' + (i + 1);
        p.bg = p.bg || 'grid';
        p.items = Array.isArray(p.items) ? p.items : [];
        if (p.type === 'notes') {
          p.html = typeof p.html === 'string' ? p.html : '';
          p.sketches = cleanSketches(p.sketches);
          if (QB.notes) p.html = QB.notes.sanitize(p.html, { page: p }); // файл мог прийти от друга — чистим
        } else delete p.type;
      });
      d.current = Math.min(Math.max(0, d.current | 0), d.pages.length - 1);
      d.theme = d.theme === 'chalk' ? 'chalk' : 'paper';
      this.doc = d;
      this.sketch = null;
      this.hist.clear();
      this.changed('all');
    },
    saveSoon() {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.saveNow(), 700);
      if (QB.ui) QB.ui.saveState('saving');
    },
    async saveNow() {
      clearTimeout(this._t);
      const data = this.serialize();
      try {
        await idbSet(KEY, data);
        if (QB.ui) QB.ui.saveState('saved');
      } catch (e) {
        try {
          localStorage.setItem('quorboard-doc', data);
          if (QB.ui) QB.ui.saveState('saved');
        } catch (e2) {
          if (QB.ui) QB.ui.saveState('error');
        }
      }
    },
    async restore() {
      let data = null;
      try { data = await idbGet(KEY); } catch (e) { /* нет IndexedDB */ }
      if (!data) { try { data = localStorage.getItem('quorboard-doc'); } catch (e) { /* пусто */ } }
      if (data) { try { this.load(data); return true; } catch (e) { /* битые данные — начнём с чистого */ } }
      return false;
    },
  };

  // ---- маленькая обёртка над IndexedDB
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('quorboard', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function idbGet(k) {
    const d = await db();
    return new Promise((res, rej) => {
      const q = d.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
  }
  async function idbSet(k, v) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  QB.store = store;
})();
