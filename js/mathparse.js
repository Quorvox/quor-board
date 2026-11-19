// Разбор школьной записи: x^2, sqrt(x), (a+b)/c, sin(x), >= ...
// Одно дерево -> два выхода: LaTeX для формул и функция f(x) для графиков.
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const QB = (root.QB = root.QB || {});

  const FUNCS = ['arcsin', 'arccos', 'arctan', 'arctg', 'arcctg', 'arccot', 'sinh', 'cosh', 'tanh',
    'sin', 'cos', 'tan', 'tg', 'cot', 'ctg', 'ln', 'lg', 'log', 'exp', 'sign', 'sgn', 'floor', 'ceil', 'min', 'max'];
  const CALLS = ['sqrt', 'cbrt', 'root4', 'root', 'abs', 'int', 'sum', 'prod', 'lim', 'vec', 'bar', 'system', 'sys', 'frac'];
  const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'iota',
    'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'];
  const WORDS = ['inf', 'infinity', 'deg', 'in', 'notin', 'angle', 'triangle', 'perp', 'parallel', 'emptyset'];
  const NAMES = [...FUNCS, ...CALLS, ...GREEK, ...WORDS].sort((a, b) => b.length - a.length);

  const GREEK_LOW = 'αβγδεζηθικλμνξοπρστυφχψω';
  const GREEK_LOW_N = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda',
    'mu', 'nu', 'xi', 'o', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
  const GREEK_UP = { 'Γ': 'Gamma', 'Δ': 'Delta', 'Θ': 'Theta', 'Λ': 'Lambda', 'Ξ': 'Xi', 'Π': 'Pi', 'Σ': 'Sigma', 'Φ': 'Phi', 'Ψ': 'Psi', 'Ω': 'Omega' };
  // надстрочные/подстрочные символы: x², xⁿ, log₂, x₁
  const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼',
    '(': '⁽', ')': '⁾', n: 'ⁿ', x: 'ˣ', i: 'ⁱ', k: 'ᵏ', m: 'ᵐ' };
  const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌',
    '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', i: 'ᵢ', j: 'ⱼ', n: 'ₙ', k: 'ₖ', m: 'ₘ', t: 'ₜ', p: 'ₚ', s: 'ₛ' };
  const flip = (o) => Object.fromEntries(Object.entries(o).map(([a, b]) => [b, a]));
  const SUP = flip(SUPS);
  const SUB = flip(SUBS);
  const SYM = { '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=', '±': '+-', '→': '->', '⇒': '=>', '⇔': '<=>', '·': '*', '⋅': '*',
    '−': '-', '–': '-', '∞': 'inf', 'π': 'pi', '√': 'sqrt', '∈': 'in', '∉': 'notin', '∠': 'angle', '⊥': 'perp', '∥': 'parallel',
    '△': 'triangle', '∅': 'emptyset', '∫': 'int', '∑': 'sum', '∏': 'prod', '∛': 'cbrt', '∜': 'root4', '′': "'" };
  const OPS = ['<=>', '<=', '>=', '!=', '~=', '->', '=>', '+-', '**', '==', '+', '-', '*', '/', ':', '^', '_', '=', '<', '>',
    '!', '%', '°', "'", '(', ')', '[', ']', '{', '}', '|', ',', ';', '×', '÷'];
  const RELS = ['=', '<', '>', '<=', '>=', '!=', '~=', '->', '=>', '<=>'];

  function splitIdent(w) {
    const out = [];
    let i = 0;
    while (i < w.length) {
      const n = NAMES.find((n) => w.startsWith(n, i));
      if (n) { out.push(n); i += n.length; } else { out.push(w[i]); i++; }
    }
    return out;
  }

  function tokenize(s) {
    const out = [];
    let spaced = false; // был ли пробел перед токеном: "1/2 a" != "1/2a"
    const t = { push: (...a) => a.forEach((tok) => { tok.sp = spaced; spaced = false; out.push(tok); }) };
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; spaced = true; continue; }
      if (SUP[c] || SUB[c]) {
        const map = SUP[c] ? SUP : SUB;
        let d = '';
        while (i < s.length && map[s[i]]) d += map[s[i++]];
        const inner = tokenize(d);
        t.push({ k: 'op', v: map === SUP ? '^' : '_' });
        if (inner.length === 1) t.push(inner[0]);
        else t.push({ k: 'op', v: '(' }, ...inner, { k: 'op', v: ')' });
        continue;
      }
      if (/[̀-ͯ⃐-⃿]/.test(c)) { i++; continue; } // комбинируемые стрелки/черты над буквой
      if (SYM[c]) {
        const v = SYM[c];
        t.push(/^[a-z]/.test(v) ? { k: 'id', v } : { k: 'op', v });
        i++;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        const m = /^\d*(?:[.,]\d+)?/.exec(s.slice(i))[0];
        t.push({ k: 'num', v: m });
        i += m.length;
        continue;
      }
      if (c === '"' || c === '«') {
        const close = c === '"' ? '"' : '»';
        const j = s.indexOf(close, i + 1);
        t.push({ k: 'text', v: j < 0 ? s.slice(i + 1) : s.slice(i + 1, j) });
        i = j < 0 ? s.length : j + 1;
        continue;
      }
      if (/[A-Za-z]/.test(c)) {
        const m = /^[A-Za-z]+/.exec(s.slice(i))[0];
        i += m.length;
        splitIdent(m).forEach((v) => t.push({ k: 'id', v }));
        continue;
      }
      if (/[Ѐ-ӿ]/.test(c)) {
        const m = /^[Ѐ-ӿ]+/.exec(s.slice(i))[0];
        t.push({ k: 'text', v: m });
        i += m.length;
        continue;
      }
      const gi = GREEK_LOW.indexOf(c);
      if (gi >= 0) { t.push({ k: 'id', v: GREEK_LOW_N[gi] }); i++; continue; }
      if (GREEK_UP[c]) { t.push({ k: 'id', v: GREEK_UP[c] }); i++; continue; }
      let op = OPS.find((o) => s.startsWith(o, i));
      if (op) {
        i += op.length;
        if (op === '**') op = '^';
        if (op === '==') op = '=';
        t.push({ k: 'op', v: op });
        continue;
      }
      t.push({ k: 'sym', v: c });
      i++;
    }
    return out;
  }

  // ---- разбор в дерево. Терпит недописанное: пустые места -> {t:'empty'} (квадратик)
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    let absDepth = 0;
    const peek = () => toks[p];
    const isOp = (v) => toks[p] && toks[p].k === 'op' && toks[p].v === v;
    const isOpIn = (list) => toks[p] && toks[p].k === 'op' && list.includes(toks[p].v);
    const eat = (v) => (isOp(v) ? (p++, true) : false);

    function parseList() {
      const items = [parseRel()];
      const seps = [];
      while (isOpIn([',', ';'])) { seps.push(toks[p++].v); items.push(parseRel()); }
      return items.length === 1 ? items[0] : { t: 'list', items, seps };
    }
    function parseRel() {
      const parts = [parseAdd()];
      const ops = [];
      while (isOpIn(RELS)) { ops.push(toks[p++].v); parts.push(parseAdd()); }
      return ops.length ? { t: 'rel', parts, ops } : parts[0];
    }
    function parseAdd() {
      let a = parseMul();
      while (isOpIn(['+', '-', '+-'])) { const op = toks[p++].v; a = { t: 'bin', op, a, b: parseMul() }; }
      return a;
    }
    function parseMul() {
      let a = parseJux(false);
      for (;;) {
        if (isOpIn(['*', '/', ':', '×', '÷'])) { const op = toks[p++].v; a = { t: 'bin', op, a, b: parseJux(op === '/') }; }
        else if (startsAtom(peek())) a = { t: 'jux', items: [a, parseJux(false)] }; // 1/2 a h -> (1/2)·a·h
        else break;
      }
      return a;
    }
    function startsAtom(tk) {
      if (!tk) return false;
      if (tk.k !== 'op') return true;
      if (['(', '[', '{'].includes(tk.v)) return true;
      return tk.v === '|' && absDepth === 0;
    }
    function parseJux(stopAtSpace) {
      const items = [parseUnary()];
      while (startsAtom(peek()) && !(stopAtSpace && peek().sp)) items.push(parsePost());
      return items.length === 1 ? items[0] : { t: 'jux', items };
    }
    function parseUnary() {
      if (isOpIn(['-', '+', '+-'])) { const op = toks[p++].v; return { t: 'un', op, a: parseUnary() }; }
      return parsePost();
    }
    function parsePost() {
      let a = parseAtom();
      for (;;) {
        if (isOp('^')) { p++; a = { t: 'pow', a, b: parseScript(true) }; }
        else if (isOp('_')) { p++; a = { t: 'sub', a, b: parseScript(false) }; }
        else if (isOp('!')) { p++; a = { t: 'fact', a }; }
        else if (isOp('%')) { p++; a = { t: 'pct', a }; }
        else if (isOp('°')) { p++; a = { t: 'deg', a }; }
        else if (isOp("'")) { p++; a = { t: 'prime', a }; }
        else break;
      }
      return a;
    }
    function parseScript(allowPow) {
      if (isOpIn(['-', '+'])) { const op = toks[p++].v; return { t: 'un', op, a: parseScript(allowPow) }; }
      let a = parseAtom();
      if (allowPow && isOp('^')) { p++; a = { t: 'pow', a, b: parseScript(true) }; }
      return a;
    }
    function parseArgs() {
      const args = [];
      const seps = [];
      if (isOp(')')) { p++; return { args, seps }; }
      const saved = absDepth;
      absDepth = 0;
      for (;;) {
        args.push(parseRel());
        if (isOpIn([',', ';'])) { seps.push(toks[p++].v); continue; }
        eat(')');
        break;
      }
      absDepth = saved;
      return { args, seps };
    }
    function parseAtom() {
      const tk = peek();
      if (!tk) return { t: 'empty' };
      if (tk.k === 'num') { p++; return { t: 'num', v: tk.v }; }
      if (tk.k === 'text') { p++; return { t: 'text', v: tk.v }; }
      if (tk.k === 'sym') { p++; return { t: 'sym', v: tk.v }; }
      if (tk.k === 'id') {
        p++;
        if (CALLS.includes(tk.v)) {
          if (isOp('(')) {
            p++;
            const r = parseArgs();
            const node = { t: 'call', name: tk.v, args: r.args, seps: r.seps };
            // lim(x->0) sin(x)/x — всё, что дальше, под знаком предела/суммы
            if (['lim', 'sum', 'prod', 'int'].includes(tk.v) && startsAtom(peek())) node.body = parseMul();
            return node;
          }
          if (['sqrt', 'cbrt', 'root4', 'vec', 'bar', 'abs'].includes(tk.v)) return { t: 'call', name: tk.v, args: [parsePost()], seps: [] };
          return { t: 'call', name: tk.v, args: [], seps: [] };
        }
        return { t: 'id', v: tk.v };
      }
      if (tk.v === '(' || tk.v === '[' || tk.v === '{') {
        p++;
        const want = { '(': ')', '[': ']', '{': '}' }[tk.v];
        const saved = absDepth;
        absDepth = 0;
        const body = isOp(want) ? { t: 'empty' } : parseList();
        absDepth = saved;
        let close = want;
        // промежутки вида [0; 1) — скобки могут быть разные
        if (tk.v !== '{' && isOpIn([')', ']'])) close = toks[p++].v;
        else eat(want);
        return { t: 'grp', open: tk.v, close, body };
      }
      if (tk.v === '|' && absDepth === 0) {
        p++;
        absDepth++;
        const body = parseAdd();
        absDepth--;
        eat('|');
        return { t: 'abs', body };
      }
      return { t: 'empty' };
    }

    const nodes = [];
    while (p < toks.length) {
      nodes.push(parseList());
      if (p < toks.length) { nodes.push({ t: 'sym', v: toks[p].v }); p++; } // лишняя ) и т.п.
    }
    if (!nodes.length) return { t: 'empty' };
    return nodes.length === 1 ? nodes[0] : { t: 'jux', items: nodes };
  }

  // ---- LaTeX
  const FN_TEX = { sin: '\\sin', cos: '\\cos', tan: '\\tan', tg: '\\operatorname{tg}', cot: '\\cot', ctg: '\\operatorname{ctg}',
    arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan', arctg: '\\operatorname{arctg}', arcctg: '\\operatorname{arcctg}',
    arccot: '\\operatorname{arccot}', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh', ln: '\\ln', lg: '\\lg', log: '\\log',
    exp: '\\exp', sign: '\\operatorname{sign}', sgn: '\\operatorname{sgn}', floor: '\\operatorname{floor}',
    ceil: '\\operatorname{ceil}', min: '\\min', max: '\\max' };
  const WORD_TEX = { inf: '\\infty', infinity: '\\infty', deg: '^{\\circ}', in: '\\in', notin: '\\notin', angle: '\\angle',
    triangle: '\\triangle', perp: '\\perp', parallel: '\\parallel', emptyset: '\\varnothing' };
  const REL_TEX = { '=': '=', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge', '!=': '\\ne', '~=': '\\approx', '->': '\\to',
    '=>': '\\Rightarrow', '<=>': '\\Leftrightarrow' };
  const L_BR = { '(': '\\left(', '[': '\\left[', '{': '\\left\\{' };
  const R_BR = { ')': '\\right)', ']': '\\right]', '}': '\\right\\}' };

  const escText = (s) => s.replace(/[\\{}$&#^_%~]/g, (c) => (c === '\\' ? '\\backslash ' : '\\' + c));
  const escSym = (c) => ('\\{}$&#^_%~'.includes(c) ? '\\' + c : c);
  const strip = (n) => (n.t === 'grp' && n.open === '(' && n.close === ')' ? tex(n.body) : tex(n));
  const base = (n) => (['bin', 'un', 'jux', 'rel', 'list'].includes(n.t) ? '\\left(' + tex(n) + '\\right)' : tex(n));

  // root(3,8) -> "3,8" прочиталось как десятичная дробь, разрезаем обратно
  function splitCommaNum(n) {
    if (n && n.t === 'num' && n.v.includes(',')) {
      const [a, b] = n.v.split(',');
      return [{ t: 'num', v: a || '0' }, { t: 'num', v: b }];
    }
    return null;
  }
  function callArgs(n, need) {
    if (n.args.length === 1 && need === 2) return splitCommaNum(n.args[0]) || n.args;
    return n.args;
  }
  const E = { t: 'empty' };

  function callTex(n) {
    return callTex0(n) + (n.body ? ' ' + tex(n.body) : '');
  }
  function callTex0(n) {
    const a = n.args;
    switch (n.name) {
      case 'sqrt': return '\\sqrt{' + strip(a[0] || E) + '}';
      case 'cbrt': return '\\sqrt[3]{' + strip(a[0] || E) + '}';
      case 'root4': return '\\sqrt[4]{' + strip(a[0] || E) + '}';
      case 'root': { const r = callArgs(n, 2); return '\\sqrt[' + strip(r[0] || E) + ']{' + strip(r[1] || E) + '}'; }
      case 'abs': return '\\left|' + tex(a[0] || E) + '\\right|';
      case 'frac': return '\\frac{' + strip(a[0] || E) + '}{' + strip(a[1] || E) + '}';
      case 'vec': { const s = strip(a[0] || E); return (s.length > 1 && !s.startsWith('\\') ? '\\overrightarrow{' : '\\vec{') + s + '}'; }
      case 'bar': return '\\overline{' + strip(a[0] || E) + '}';
      case 'int':
        if (a.length === 0) return '\\int';
        if (a.length === 1) return '\\int ' + tex(a[0]) + '\\,dx';
        return '\\int_{' + tex(a[0]) + '}^{' + tex(a[1]) + '}' + (a[2] ? ' ' + tex(a[2]) + '\\,dx' : '');
      case 'sum':
      case 'prod': {
        const op = n.name === 'sum' ? '\\sum' : '\\prod';
        if (a.length === 0) return op;
        return op + '_{' + tex(a[0]) + '}' + (a[1] ? '^{' + tex(a[1]) + '}' : '') + (a[2] ? ' ' + tex(a[2]) : '');
      }
      case 'lim': return '\\lim' + (a[0] ? '_{' + tex(a[0]) + '}' : '') + (a[1] ? ' ' + tex(a[1]) : '');
      case 'system':
      case 'sys': {
        const rows = [];
        if (n.seps.includes(';')) {
          let cur = [a[0]];
          n.seps.forEach((s, i) => { if (s === ';') { rows.push(cur); cur = [a[i + 1]]; } else cur.push(a[i + 1]); });
          rows.push(cur);
        } else a.forEach((x) => rows.push([x]));
        return '\\begin{cases}' + rows.map((r) => r.map(tex).join(',\\ ')).join(' \\\\ ') + '\\end{cases}';
      }
    }
    return '';
  }

  function juxTex(items) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const nx = items[i + 1];
      // log(2, 8) -> log_2 8
      if (it.t === 'id' && it.v === 'log' && nx && nx.t === 'grp') {
        const two = nx.body.t === 'list' && nx.body.items.length === 2 ? nx.body.items : splitCommaNum(nx.body);
        if (two) { out.push('\\log_{' + tex(two[0]) + '}' + base(two[1])); i++; continue; }
      }
      out.push(tex(it));
    }
    return out.join(' ');
  }

  function tex(n) {
    switch (n.t) {
      case 'empty': return '\\square';
      case 'num': return n.v.replace(',', '{,}');
      case 'text': return '\\text{' + escText(n.v) + '}';
      case 'sym': return escSym(n.v);
      case 'id': return FN_TEX[n.v] || WORD_TEX[n.v] || (GREEK.includes(n.v) ? '\\' + n.v + ' ' : n.v);
      case 'grp':
        // { x + y = 5; x - y = 1 } -> система
        if (n.open === '{' && n.body.t === 'list' && n.body.seps.includes(';') && n.body.items.some((x) => x.t === 'rel')) {
          return callTex0({ t: 'call', name: 'system', args: n.body.items, seps: n.body.seps });
        }
        return L_BR[n.open] + tex(n.body) + (R_BR[n.close] || '\\right.');
      case 'abs': return '\\left|' + tex(n.body) + '\\right|';
      case 'list': return n.items.map((x, i) => (i ? (n.seps[i - 1] === ';' ? ';\\ ' : ',\\ ') : '') + tex(x)).join('');
      case 'rel': // "√7 + 5 =" — пустоту после последнего «=» не рисуем
        return n.parts.map((x, i) => (i ? ' ' + REL_TEX[n.ops[i - 1]] + ' ' : '') + (x.t === 'empty' && i === n.parts.length - 1 ? '' : tex(x))).join('');
      case 'bin':
        switch (n.op) {
          case '/': return '\\frac{' + strip(n.a) + '}{' + strip(n.b) + '}';
          case '*': return tex(n.a) + ' \\cdot ' + tex(n.b);
          case '×': return tex(n.a) + ' \\times ' + tex(n.b);
          case '÷': return tex(n.a) + ' \\div ' + tex(n.b);
          case '+-': return tex(n.a) + ' \\pm ' + tex(n.b);
          default: return tex(n.a) + ' ' + n.op + ' ' + tex(n.b);
        }
      case 'un': return (n.op === '+-' ? '\\pm ' : n.op) + tex(n.a);
      case 'jux': return juxTex(n.items);
      case 'pow': return base(n.a) + '^{' + strip(n.b) + '}';
      case 'sub': return base(n.a) + '_{' + strip(n.b) + '}';
      case 'fact': return base(n.a) + '!';
      case 'pct': return tex(n.a) + '\\%';
      case 'deg': return base(n.a) + '^{\\circ}';
      case 'prime': return base(n.a) + "'";
      case 'call': return callTex(n);
    }
    return '';
  }

  function toLatex(src) {
    const s = String(src || '').trim();
    if (!s) return '';
    if (s.includes('\\')) return s; // уже LaTeX — отдаём как есть
    try { return tex(parse(s)); } catch (e) { return '\\text{' + escText(s) + '}'; }
  }

  // ---- вычисление (графики и калькулятор)
  const err = (m) => { const e = new Error(m); e.user = true; return e; };
  const F1 = { sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan, cot: (x) => 1 / Math.tan(x), ctg: (x) => 1 / Math.tan(x),
    arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, arctg: Math.atan, arcctg: (x) => Math.PI / 2 - Math.atan(x),
    arccot: (x) => Math.PI / 2 - Math.atan(x), sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, ln: Math.log,
    lg: Math.log10, log: Math.log10, exp: Math.exp, sign: Math.sign, sgn: Math.sign, floor: Math.floor, ceil: Math.ceil };

  // степень с отрицательным основанием: x^(1/3), x^(2/3) — берём вещественный корень
  function pow(a, b) {
    if (a < 0 && !Number.isInteger(b)) {
      for (let q = 3; q <= 15; q += 2) {
        const pq = b * q;
        if (Math.abs(pq - Math.round(pq)) < 1e-9) {
          const r = Math.pow(-a, b);
          return Math.round(pq) % 2 === 0 ? r : -r;
        }
      }
    }
    return Math.pow(a, b);
  }
  function fact(n) {
    if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function fnInfo(n) {
    if (n.t === 'id' && FUNCS.includes(n.v)) return { name: n.v };
    if (n.t === 'pow' && n.a.t === 'id' && FUNCS.includes(n.a.v)) return { name: n.a.v, pow: comp(n.b) };
    if (n.t === 'sub' && n.a.t === 'id' && n.a.v === 'log') return { name: 'logb', base: comp(n.b) };
    return null;
  }
  function applyFn(fi, args) {
    let f;
    if (fi.name === 'min' || fi.name === 'max') {
      const m = Math[fi.name];
      f = (s) => m(...args.map((a) => a(s)));
    } else if (fi.name === 'log' && args.length === 2) {
      const [b, x] = args;
      f = (s) => Math.log(x(s)) / Math.log(b(s));
    } else if (fi.name === 'logb') {
      const b = fi.base;
      const x = args[0];
      f = (s) => Math.log(x(s)) / Math.log(b(s));
    } else {
      const g = F1[fi.name];
      const a = args[0];
      f = (s) => g(a(s));
    }
    if (fi.pow) { const pw = fi.pow; const h = f; return (s) => pow(h(s), pw(s)); }
    return f;
  }
  function compJux(items) {
    const parts = [];
    let i = 0;
    while (i < items.length) {
      const fi = fnInfo(items[i]);
      if (fi) {
        const nx = items[i + 1];
        if (!nx) throw err('У ' + (fi.name === 'logb' ? 'log' : fi.name) + ' нет аргумента');
        let args;
        if (nx.t === 'grp') {
          const b = nx.body;
          const two = fi.name === 'log' ? splitCommaNum(b) : null;
          args = two ? two.map(comp) : b.t === 'list' ? b.items.map(comp) : [comp(b)];
          i += 2;
        } else {
          args = [compJux(items.slice(i + 1))]; // sin 2x -> sin(2x)
          i = items.length;
        }
        parts.push(applyFn(fi, args));
      } else {
        parts.push(comp(items[i]));
        i++;
      }
    }
    return (s) => { let r = 1; for (const f of parts) r *= f(s); return r; };
  }

  function comp(n) {
    switch (n.t) {
      case 'num': { const v = parseFloat(n.v.replace(',', '.')); return () => v; }
      case 'id':
        if (n.v === 'x') return (s) => s.x;
        if (n.v === 'pi') return () => Math.PI;
        if (n.v === 'e') return () => Math.E;
        if (n.v === 'inf' || n.v === 'infinity') return () => Infinity;
        if (n.v === 'deg') return () => Math.PI / 180;
        if (FUNCS.includes(n.v)) throw err('После ' + n.v + ' нужна скобка: ' + n.v + '(x)');
        throw err('Не знаю, что такое «' + n.v + '» — переменная только x');
      case 'grp':
        if (n.body.t === 'list') throw err('Лишняя запятая в скобках');
        return comp(n.body);
      case 'abs': { const f = comp(n.body); return (s) => Math.abs(f(s)); }
      case 'un': {
        const f = comp(n.a);
        if (n.op === '-') return (s) => -f(s);
        if (n.op === '+') return f;
        throw err('± нельзя посчитать');
      }
      case 'bin': {
        const a = comp(n.a);
        const b = comp(n.b);
        switch (n.op) {
          case '+': return (s) => a(s) + b(s);
          case '-': return (s) => a(s) - b(s);
          case '*': case '×': return (s) => a(s) * b(s);
          case '/': case ':': case '÷': return (s) => a(s) / b(s);
        }
        throw err('± нельзя посчитать');
      }
      case 'pow': {
        if (n.a.t === 'id' && FUNCS.includes(n.a.v)) throw err('После ' + n.a.v + '^… нужна скобка');
        const a = comp(n.a);
        const b = comp(n.b);
        return (s) => pow(a(s), b(s));
      }
      case 'fact': { const f = comp(n.a); return (s) => fact(f(s)); }
      case 'pct': { const f = comp(n.a); return (s) => f(s) / 100; }
      case 'deg': { const f = comp(n.a); return (s) => (f(s) * Math.PI) / 180; }
      case 'jux': return compJux(n.items);
      case 'call': {
        const a = n.args.map(comp);
        switch (n.name) {
          case 'sqrt': if (!a[0]) break; return (s) => Math.sqrt(a[0](s));
          case 'cbrt': if (!a[0]) break; return (s) => Math.cbrt(a[0](s));
          case 'root4': if (!a[0]) break; return (s) => Math.pow(a[0](s), 0.25);
          case 'abs': if (!a[0]) break; return (s) => Math.abs(a[0](s));
          case 'frac': if (a.length < 2) break; return (s) => a[0](s) / a[1](s);
          case 'root': {
            const r = callArgs(n, 2).map(comp);
            if (r.length < 2) break;
            return (s) => {
              const k = r[0](s);
              const v = r[1](s);
              if (v < 0 && Number.isInteger(k) && k % 2 === 1) return -Math.pow(-v, 1 / k);
              return Math.pow(v, 1 / k);
            };
          }
        }
        throw err(n.name + '(…) здесь не посчитать');
      }
      case 'empty': throw err('Есть пустое место');
      case 'rel': throw err('Нужно выражение без «=»');
    }
    throw err('Не получается посчитать');
  }

  function usesX(n) {
    if (!n || typeof n !== 'object') return false;
    if (n.t === 'id' && n.v === 'x') return true;
    return Object.values(n).some((v) => (Array.isArray(v) ? v.some(usesX) : typeof v === 'object' && usesX(v)));
  }

  const fnCache = new Map();
  // "y = x^2" -> { fn(x), error }
  function compileFn(src) {
    const s = String(src || '').replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, '').trim();
    if (fnCache.has(s)) return fnCache.get(s);
    let res;
    if (!s) res = { fn: null, error: null, empty: true };
    else {
      try {
        const f = comp(parse(s));
        res = { fn: (x) => f({ x }), error: null };
      } catch (e) {
        res = { fn: null, error: e.user ? e.message : 'Не понял запись' };
      }
    }
    if (fnCache.size > 300) fnCache.clear();
    fnCache.set(s, res);
    return res;
  }

  // калькулятор: "2+2*3" -> 8, "sqrt(16)=" -> 4; с x или уравнениями -> null
  function calc(src) {
    const s = String(src || '').replace(/=\s*$/, '').trim();
    if (!s || s.includes('\\')) return null;
    try {
      const n = parse(s);
      if (n.t === 'rel' || n.t === 'list' || n.t === 'num' || usesX(n)) return null;
      const v = comp(n)({ x: 0 });
      return Number.isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  }
  function fmtNum(v) {
    if (Math.abs(v) >= 1e12 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(4).replace('.', ',');
    return String(Number(v.toPrecision(10))).replace('.', ',');
  }

  // ---- обычный текст для копирования: (√7 + √89768) / 4, x² − 4x + 3 = 0
  const GREEK_CH = {};
  GREEK_LOW_N.forEach((n, i) => { if (n !== 'o') GREEK_CH[n] = GREEK_LOW[i]; });
  Object.entries(GREEK_UP).forEach(([c, n]) => { GREEK_CH[n] = c; });
  GREEK_CH.varphi = 'φ';
  GREEK_CH.varepsilon = 'ε';
  const P_ID = { inf: '∞', infinity: '∞', deg: '°', in: ' ∈ ', notin: ' ∉ ', angle: '∠', triangle: '△', perp: ' ⊥ ',
    parallel: ' ∥ ', emptyset: '∅' };
  const P_REL = { '=': ' = ', '<': ' < ', '>': ' > ', '<=': ' ≤ ', '>=': ' ≥ ', '!=': ' ≠ ', '~=': ' ≈ ', '->': ' → ',
    '=>': ' ⇒ ', '<=>': ' ⇔ ' };
  const BIG = ['bin', 'un', 'jux', 'rel', 'list'];

  const supText = (s) => ([...s].every((c) => SUPS[c]) ? [...s].map((c) => SUPS[c]).join('') : null);
  const subText = (s) => ([...s].every((c) => SUBS[c]) ? [...s].map((c) => SUBS[c]).join('') : null);
  const unGrp = (n) => (n.t === 'grp' && n.open === '(' && n.close === ')' ? n.body : n);
  // «простое» — можно писать без скобок после √ и в дроби
  const simple = (n) => ['num', 'id', 'text', 'abs', 'empty', 'sym'].includes(n.t)
    || (n.t === 'call' && !n.body && ['sqrt', 'cbrt', 'root4', 'abs'].includes(n.name))
    || (['pow', 'sub', 'fact', 'deg', 'pct', 'prime'].includes(n.t) && simple(n.a))
    || (n.t === 'un' && n.op === '-' && simple(n.a))
    || (n.t === 'jux' && n.items.length === 2 && n.items[1].t === 'grp' && !!fnInfoSafe(n.items[0])); // sin(x)
  const fnInfoSafe = (n) => (n.t === 'id' && FUNCS.includes(n.v)) || (n.t === 'pow' && n.a.t === 'id' && FUNCS.includes(n.a.v))
    || (n.t === 'sub' && n.a.t === 'id' && n.a.v === 'log');
  const wrap = (n) => { const m = unGrp(n); return simple(m) ? plain(m) : '(' + plain(m) + ')'; };
  const pBase = (n) => (BIG.includes(n.t) ? '(' + plain(n) + ')' : plain(n));
  const pScript = (n, map, mark) => {
    const s = plain(unGrp(n)).replace(/\s+/g, '');
    return map(s) || mark + (s.length === 1 || simple(unGrp(n)) ? s : '(' + s + ')');
  };
  const pFrac = (a, b) => {
    const A = wrap(a), B = wrap(b);
    return A.startsWith('(') || B.startsWith('(') ? A + ' / ' + B : A + '/' + B;
  };
  const pRoot = (n) => { const m = unGrp(n); return simple(m) ? plain(m) : '(' + plain(m) + ')'; };

  function plainCall(n) {
    const a = n.args;
    const body = n.body ? ' ' + plain(n.body) : '';
    switch (n.name) {
      case 'sqrt': return '√' + pRoot(a[0] || E);
      case 'cbrt': return '∛' + pRoot(a[0] || E);
      case 'root4': return '∜' + pRoot(a[0] || E);
      case 'root': {
        const r = callArgs(n, 2);
        const k = plain(r[0] || E);
        const sign = k === '3' ? '∛' : k === '4' ? '∜' : (supText(k) || '^' + k) + '√';
        return sign + pRoot(r[1] || E);
      }
      case 'abs': return '|' + plain(a[0] || E) + '|';
      case 'frac': return pFrac(a[0] || E, a[1] || E);
      case 'vec': return plain(unGrp(a[0] || E)) + '⃗';
      case 'bar': return [...plain(unGrp(a[0] || E))].map((c) => c + '̅').join('');
      case 'int': {
        if (!a.length) return '∫' + body;
        if (a.length === 1) return '∫ ' + plain(a[0]) + ' dx' + body;
        const lo = plain(a[0]).replace(/\s+/g, ''), hi = plain(a[1]).replace(/\s+/g, '');
        const lim = subText(lo) && supText(hi) ? subText(lo) + supText(hi) : '[' + lo + '; ' + hi + ']';
        return '∫' + lim + (a[2] ? ' ' + plain(a[2]) + ' dx' : '') + body;
      }
      case 'sum':
      case 'prod': {
        const op = n.name === 'sum' ? '∑' : '∏';
        if (!a.length) return op + body;
        return op + '(' + plain(a[0]) + (a[1] ? ' … ' + plain(a[1]) : '') + ')' + (a[2] ? ' ' + plain(a[2]) : '') + body;
      }
      case 'lim': return 'lim' + (a[0] ? '(' + plain(a[0]) + ')' : '') + (a[1] ? ' ' + plain(a[1]) : '') + body;
      case 'system':
      case 'sys': {
        const rows = [];
        if (n.seps.includes(';')) {
          let cur = [a[0]];
          n.seps.forEach((s, i) => { if (s === ';') { rows.push(cur); cur = [a[i + 1]]; } else cur.push(a[i + 1]); });
          rows.push(cur);
        } else a.forEach((x) => rows.push([x]));
        return '{ ' + rows.map((r) => r.map(plain).join(', ')).join('; ') + ' }';
      }
    }
    return n.name;
  }

  function plain(n) {
    switch (n.t) {
      case 'empty': return '□';
      case 'num': case 'text': case 'sym': return n.v;
      case 'id': return P_ID[n.v] || GREEK_CH[n.v] || n.v;
      case 'grp': return n.open + plain(n.body) + n.close;
      case 'abs': return '|' + plain(n.body) + '|';
      case 'list': return n.items.map((x, i) => (i ? n.seps[i - 1] + ' ' : '') + plain(x)).join('');
      case 'rel': return n.parts.map((x, i) => (i ? P_REL[n.ops[i - 1]] : '') + (x.t === 'empty' && i === n.parts.length - 1 ? '' : plain(x))).join('').trimEnd();
      case 'bin':
        switch (n.op) {
          case '/': return pFrac(n.a, n.b);
          case '*': return plain(n.a) + ' · ' + plain(n.b);
          case '+-': return plain(n.a) + ' ± ' + plain(n.b);
          default: return plain(n.a) + ' ' + n.op + ' ' + plain(n.b);
        }
      case 'un': return (n.op === '+-' ? '±' : n.op) + plain(n.a);
      case 'jux': {
        let out = '';
        n.items.forEach((it, i) => {
          let s = it.t === 'bin' && it.op === '/' ? '(' + plain(it) + ')' : plain(it);
          const prev = n.items[i - 1];
          if (prev) {
            const fn = fnInfoSafe(prev);
            if (fn && it.t !== 'grp') s = ' ' + s;
            else if (prev.t === 'num' && it.t === 'num') s = ' · ' + s;
            else if (/[A-Za-zА-яЁё]$/.test(out) && /^[A-Za-zА-яЁё]{2}/.test(s)) s = ' ' + s;
          }
          out += s;
        });
        return out;
      }
      case 'pow': return pBase(n.a) + pScript(n.b, supText, '^');
      case 'sub': return pBase(n.a) + pScript(n.b, subText, '_');
      case 'fact': return pBase(n.a) + '!';
      case 'pct': return plain(n.a) + '%';
      case 'deg': return pBase(n.a) + '°';
      case 'prime': return pBase(n.a) + "'";
      case 'call': return plainCall(n);
    }
    return '';
  }

  function toPlain(src) {
    const s = String(src || '').trim();
    if (!s) return '';
    if (s.includes('\\')) return latexToPlain(s);
    try { return plain(parse(s)).replace(/ {2,}/g, ' ').trim(); } catch (e) { return s; }
  }

  // ---- LaTeX (например, из ответа нейросети) -> обычная запись
  const TEX_SYM = { cdot: ' · ', times: ' × ', div: ' ÷ ', pm: ' ± ', mp: ' ∓ ', le: ' ≤ ', leq: ' ≤ ', leqslant: ' ≤ ',
    ge: ' ≥ ', geq: ' ≥ ', geqslant: ' ≥ ', ne: ' ≠ ', neq: ' ≠ ', approx: ' ≈ ', equiv: ' ≡ ', sim: ' ~ ', to: ' → ',
    rightarrow: ' → ', Rightarrow: ' ⇒ ', implies: ' ⇒ ', Leftrightarrow: ' ⇔ ', iff: ' ⇔ ', leftarrow: ' ← ',
    infty: '∞', circ: '°', degree: '°', in: ' ∈ ', notin: ' ∉ ', subset: ' ⊂ ', cup: ' ∪ ', cap: ' ∩ ', emptyset: '∅',
    varnothing: '∅', angle: '∠', triangle: '△', perp: ' ⊥ ', parallel: ' ∥ ', cdots: '…', ldots: '…', dots: '…',
    int: '∫', sum: '∑', prod: '∏', partial: '∂', nabla: '∇', quad: ' ', qquad: ' ', square: '□', Box: '□',
    lbrace: '{', rbrace: '}', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', mid: ' | ', prime: "'" };
  const TEX_WRAP = ['text', 'textrm', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathbb', 'operatorname', 'mbox', 'boldsymbol', 'displaystyle'];
  const TEX_SIZE = ['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'middle'];

  function latexToPlain(src) {
    let s = String(src || '').trim();
    s = s.replace(/^\\\(([\s\S]*)\\\)$/, '$1').replace(/^\\\[([\s\S]*)\\\]$/, '$1').replace(/^\$\$?([\s\S]*?)\$?\$$/, '$1');
    // системы и выравнивания: строки через «;»
    s = s.replace(/\\begin\{(cases|array|aligned|align\*?|gathered|matrix|pmatrix)\}(\{[^}]*\})?([\s\S]*?)\\end\{\1\}/g,
      (m, env, cols, body) => (env === 'cases' ? '\\{' : '') + body.replace(/\\\\/g, '; ').replace(/&/g, ' ') + (env === 'cases' ? '\\}' : ''));
    let i = 0;
    const ws = () => { while (/\s/.test(s[i] || '')) i++; };
    const isOpEnd = (out) => /(^|[\s(\[{=<>≤≥≠≈±·×÷+\-−→⇒⇔∈,;])$/.test(out);

    function arg() {
      ws();
      if (s[i] === '{') { i++; const r = seq('}'); i++; return r; }
      if (s[i] === '\\') return command();
      return s[i++] || '';
    }
    function seq(end) {
      let out = '';
      while (i < s.length && s[i] !== end) out += item(out);
      return out.trim();
    }
    function item(out) {
      const c = s[i];
      if (c === '\\') return command();
      if (c === '{') { i++; const r = seq('}'); i++; return r; }
      if (c === '^') { i++; const a = arg().trim(); return a === '°' || a === "'" ? a : supText(a.replace(/\s+/g, '')) || '^' + (a.length === 1 ? a : '(' + a + ')'); }
      if (c === '_') { i++; const a = arg().trim(); return subText(a.replace(/\s+/g, '')) || '_' + (a.length === 1 ? a : '(' + a + ')'); }
      i++;
      if (c === '~') return ' ';
      if (c === '&') return ' ';
      if (c === '+' || c === '=') return ' ' + c + ' ';
      if (c === '<' || c === '>') return ' ' + c + ' ';
      if (c === '-') return isOpEnd(out.trimEnd()) ? '-' : ' - ';
      if (c === '*') return ' · ';
      return c;
    }
    const fracT = (a, b) => {
      const ok = /^(-?\d+([.,]\d+)?|[A-Za-zα-ωΑ-Ω][⁰-⁹ⁿˣ²³¹]*|[√∛∜][\w.,]+|\(.*\))$/;
      const w = (x, strict) => { x = x.trim(); return /\s/.test(x) || (strict && !ok.test(x)) ? '(' + x + ')' : x; };
      const A = w(a, false), B = w(b, true);
      return A.startsWith('(') || B.startsWith('(') ? A + ' / ' + B : A + '/' + B;
    };
    function command() {
      i++;
      const c = s[i];
      if (!/[a-zA-Z]/.test(c || '')) {
        i++;
        return { '{': '{', '}': '}', ',': ' ', ';': ' ', ':': ' ', '!': '', '\\': '; ', '|': '‖', ' ': ' ', '%': '%' }[c] ?? (c || '');
      }
      const name = /^[a-zA-Z]+/.exec(s.slice(i))[0];
      i += name.length;
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = arg(), b = arg(); return fracT(a, b); }
      if (name === 'sqrt') {
        ws();
        let k = null;
        if (s[i] === '[') { const j = s.indexOf(']', i); k = s.slice(i + 1, j).trim(); i = j + 1; }
        const a = arg().trim();
        const body = /\s/.test(a) || a.length > 1 && !/^[\d.,]+$/.test(a) && !/^[A-Za-z]$/.test(a) ? '(' + a + ')' : a;
        const sign = !k ? '√' : k === '3' ? '∛' : k === '4' ? '∜' : (supText(k) || '^' + k) + '√';
        return sign + body;
      }
      if (name === 'lim') {
        ws();
        if (s[i] !== '_') return 'lim ';
        i++;
        return 'lim(' + arg().trim() + ') ';
      }
      if (TEX_SIZE.includes(name)) {
        ws();
        if (s[i] === '.') { i++; return ''; }
        if (s[i] === '\\') return command();
        return s[i++] || '';
      }
      if (TEX_WRAP.includes(name)) return name === 'displaystyle' ? '' : arg();
      if (name === 'vec' || name === 'overrightarrow') return arg() + '⃗';
      if (name === 'overline' || name === 'bar') return [...arg()].map((ch) => ch + '̅').join('');
      if (name === 'hat' || name === 'tilde' || name === 'dot') return arg();
      if (name in TEX_SYM) return TEX_SYM[name];
      if (GREEK_CH[name]) return GREEK_CH[name];
      return name; // sin, cos, log, lim ...
    }

    let out = '';
    while (i < s.length) out += item(out);
    return out.replace(/\s+/g, ' ').replace(/\s+([;,])/g, '$1').replace(/([(\[{])\s+/g, '$1').replace(/\s+([)\]}])/g, '$1')
      .replace(/(√|∛|∜)\s+/g, '$1').trim();
  }

  // похоже на LaTeX? (\frac, \(...\), $...$)
  const looksLatex = (s) => /\\[a-zA-Z]+|^\s*\\[([]|^\s*\$[^$]+\$\s*$/.test(String(s || ''));

  QB.math = { tokenize, parse, toLatex, compileFn, calc, fmtNum, toPlain, latexToPlain, looksLatex };
})();
