/* Tangent: interactive maths explorers. Each view pairs a live equation with a graph you can grab. */
(function () {
  'use strict';
  const A = window.Animath, { Plot, EqStrip, tex } = window.TPlot;
  const $ = s => document.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
    return el;
  };
  const app = $('#app');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = v => Math.round(v * 100) / 100;
  const num = (v, d = 2) => { const r = Math.round(v * 10 ** d) / 10 ** d; return Object.is(r, -0) ? '0' : String(r); };
  const col = (v, c, d) => '\\color{' + c + '}{' + num(v, d) + '}';
  const smooth = A.RATE.smooth;
  function tween(dur, fn) { return new Promise(res => { const t0 = performance.now(); const step = () => { const u = Math.min(1, (performance.now() - t0) / dur); fn(smooth(u), u); if (u < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let cleanup = [];
  const onLeave = f => cleanup.push(f);

  // ---------- shared controls ----------
  function slider(o) {
    const input = h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 0.01, value: o.value, 'aria-label': o.name || 'value', style: '--c:' + A.color(o.color) });
    const out = h('output', { style: 'color:' + A.color(o.color) });
    let sweeping = 0;
    const btn = o.sweep === false ? null : h('button', { type: 'button', class: 'sweep', 'aria-label': 'Animate ' + (o.name || ''), title: 'Animate', onclick: () => sweeping ? stop() : start() }, '▶');
    const show = v => { out.textContent = o.fmt ? o.fmt(v) : num(v); };
    input.addEventListener('input', () => { stop(); const v = o.map ? o.map(+input.value) : +input.value; show(v); o.onInput(v); });
    function start() {
      const lo = +o.min, hi = +o.max, mid = (lo + hi) / 2, amp = (hi - lo) / 2 * 0.85;
      let ph = Math.asin(clamp((+input.value - mid) / amp, -1, 1));
      let last = performance.now();
      btn.textContent = '❚❚'; btn.classList.add('on');
      const step = now => {
        if (!sweeping) return;
        ph += (now - last) / 1000 * 1.1; last = now;
        const raw = mid + amp * Math.sin(ph);
        input.value = raw; const v = o.map ? o.map(raw) : raw; show(v); o.onInput(v);
        sweeping = requestAnimationFrame(step);
      };
      sweeping = requestAnimationFrame(step);
    }
    function stop() { if (sweeping) { cancelAnimationFrame(sweeping); sweeping = 0; if (btn) { btn.textContent = '▶'; btn.classList.remove('on'); } } }
    onLeave(stop);
    show(o.map ? o.map(+o.value) : +o.value);
    const el = h('div', { class: 'slider' }, h('span', { class: 'sv', style: 'color:' + A.color(o.color) }, o.label), input, out, btn);
    return { el, set(v, raw) { input.value = raw != null ? raw : v; show(v); }, stop };
  }
  function chips(list, cur, on) {
    const wrap = h('div', { class: 'chips', role: 'radiogroup' });
    const render = c => { wrap.textContent = ''; list.forEach(([k, l]) => wrap.append(h('button', { type: 'button', role: 'radio', 'aria-checked': k === c, class: 'chip' + (k === c ? ' on' : ''), onclick: () => { render(k); on(k); } }, l))); };
    render(cur);
    return wrap;
  }
  function toggle(label, on, set) {
    const c = h('input', { type: 'checkbox' }); c.checked = on;
    c.addEventListener('change', () => set(c.checked));
    return h('label', { class: 'tog' }, c, h('span', {}, label));
  }
  function view(title, sub) {
    cleanup.forEach(f => f()); cleanup = [];
    app.textContent = '';
    const eqc = h('canvas', { 'aria-hidden': 'true' }), pc = h('canvas', { 'aria-label': 'Graph. Drag to move, pinch to zoom.' });
    const controls = h('div', { class: 'controls' });
    const v = h('section', { class: 'view' },
      h('div', { class: 'vhead' }, h('a', { href: '#', class: 'back', 'aria-label': 'All explorers' }, '‹'), h('div', {}, h('h1', {}, title), h('p', {}, sub))),
      h('div', { class: 'stage' }, h('div', { class: 'eqwrap' }, eqc), h('div', { class: 'plotwrap' }, pc, h('span', { class: 'gesture' }, 'drag · pinch to zoom · double-tap to reset'))),
      controls);
    app.append(v);
    return { eq: new EqStrip(eqc), pc, controls, stage: v.querySelector('.stage') };
  }
  const group = (label, ...kids) => h('div', { class: 'grp' }, label ? h('div', { class: 'glab' }, label) : null, ...kids);
  const note = html => { const p = h('p', { class: 'note' }); p.innerHTML = html; return p; };

  // ---------- 1. transform a function ----------
  const BASES = {
    sq: { lab: 'x²', f: u => u * u, u0: 1, T: (a, I) => a + '\\left(' + I + '\\right)^2', pts: [-2, -1, 0, 1, 2] },
    cube: { lab: 'x³', f: u => u * u * u, u0: 1, T: (a, I) => a + '\\left(' + I + '\\right)^3', pts: [-1.5, -1, 0, 1, 1.5] },
    abs: { lab: '|x|', f: Math.abs, u0: 1, T: (a, I) => a + '\\left|' + I + '\\right|', pts: [-2, -1, 0, 1, 2] },
    sqrt: { lab: '√x', f: Math.sqrt, u0: 1, T: (a, I) => a + '\\sqrt{' + I + '}', pts: [0, 1, 4] },
    sin: { lab: 'sin x', f: Math.sin, u0: Math.PI / 2, T: (a, I) => a + '\\sin\\left(' + I + '\\right)', pts: [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI] },
    exp: { lab: 'eˣ', f: Math.exp, u0: 1, T: (a, I) => a + 'e^{' + I + '}', pts: [-1, 0, 1] },
    ln: { lab: 'ln x', f: Math.log, u0: Math.E, T: (a, I) => a + '\\ln\\left(' + I + '\\right)', pts: [1 / Math.E, 1, Math.E] },
    recip: { lab: '1/x', f: u => 1 / u, u0: 1, T: (a, I) => '\\frac{' + a + '}{' + I + '}', pts: [-2, -1, -0.5, 0.5, 1, 2] },
    custom: { lab: 'your own', f: null, u0: 1, T: (a, I) => a + '\\, f\\!\\left(' + I + '\\right)', pts: [-2, -1, 0, 1, 2] }
  };
  function transformView() {
    const S = { base: 'sq', a: 1, b: 1, h: 0, k: 0, custom: 'x^3 - 2x', parent: true, pts: true };
    const v = view('Transform a function', 'y = a·f(b(x − h)) + k');
    const B = () => BASES[S.base];
    let cf = A.compileFn(S.custom);
    const f = u => S.base === 'custom' ? cf(u) : B().f(u);
    const g = x => S.a * f(S.b * (x - S.h)) + S.k;
    const u0 = () => { if (S.base !== 'custom') return B().u0; for (const u of [1, 2, 0.5, -1, 3]) { const y = f(u); if (isFinite(y) && Math.abs(y) > 1e-6) return u; } return 1; };
    const C = { a: 'YELLOW', b: 'PINK', h: 'GREEN', k: 'ORANGE' };
    function eqTex() {
      const inner = col(S.b, C.b) + '\\left(x ' + (S.h < 0 ? '+ ' + col(-S.h, C.h) : '- ' + col(S.h, C.h)) + '\\right)';
      let t = 'y = ' + B().T(col(S.a, C.a), inner) + (S.k < 0 ? ' - ' + col(-S.k, C.k) : ' + ' + col(S.k, C.k));
      if (S.base === 'custom') t += '\\\\ f(x) = \\text{' + S.custom.replace(/[{}\\]/g, '') + '}';
      return t;
    }
    const plot = new Plot(v.pc, {
      range: [-7, 7, -5, 5],
      draw: P => {
        if (S.parent) P.fn(f, 'GREY', 2, { dash: [6, 6] });
        const pts = (B().pts).filter(u => isFinite(f(u)));
        if (S.pts) for (const u of pts) {
          const x0 = u, y0 = f(u), x1 = S.h + u / S.b, y1 = g(x1);
          if (!isFinite(y1)) continue;
          P.line(x0, y0, x1, y1, 'WHITE', 1.2, [3, 4]);
          P.dot(x0, y0, 'GREY', 3.5);
        }
        P.fn(g, 'BLUE', 4);
        if (S.pts) for (const u of pts) { const x1 = S.h + u / S.b, y1 = g(x1); if (isFinite(y1)) P.dot(x1, y1, 'WHITE', 4.5); }
        v.eq.set(eqTex());
      },
      grab: (x, y, px, py) => {
        const gy = g(x);
        if (isFinite(gy) && Math.abs(plot.Y(gy) - py) < 22) return (dx, dy) => { S.h = r2(S.h + dx); S.k = r2(S.k + dy); sync(); };
        return null;
      }
    });
    plot.addHandle({ get: () => [S.h, S.a * f(0) + S.k].map((v, i) => i === 1 && !isFinite(v) ? S.k : v), set: (x, y) => { S.h = r2(x); S.k = r2(y - (isFinite(S.a * f(0)) ? S.a * f(0) : 0)); sync(); }, color: C.h, label: '' });
    plot.addHandle({ get: () => [S.h + u0() / S.b, S.a * f(u0()) + S.k], set: (x, y) => {
      const u = u0(); let dx = x - S.h; if (Math.abs(dx) < 0.05) dx = 0.05 * Math.sign(dx || 1);
      S.b = r2(clamp(u / dx, -6, 6)) || 0.05; S.a = r2(clamp((y - S.k) / f(u), -8, 8)); sync();
    }, color: C.a });
    const sl = {
      a: slider({ label: 'a', name: 'a', color: C.a, min: -4, max: 4, value: 1, onInput: x => { S.a = r2(x); plot.request(); } }),
      b: slider({ label: 'b', name: 'b', color: C.b, min: -4, max: 4, value: 1, onInput: x => { S.b = Math.abs(x) < 0.05 ? 0.05 : r2(x); plot.request(); } }),
      h: slider({ label: 'h', name: 'h', color: C.h, min: -6, max: 6, value: 0, onInput: x => { S.h = r2(x); plot.request(); } }),
      k: slider({ label: 'k', name: 'k', color: C.k, min: -5, max: 5, value: 0, onInput: x => { S.k = r2(x); plot.request(); } })
    };
    function sync() { for (const p of 'abhk') sl[p].set(S[p]); plot.request(); }
    const customIn = h('input', { type: 'text', value: S.custom, 'aria-label': 'Your function f(x)', spellcheck: 'false', autocapitalize: 'off' });
    const err = h('span', { class: 'err' });
    customIn.addEventListener('input', () => { try { cf = A.compileFn(customIn.value) || (x => NaN); S.custom = customIn.value; err.textContent = ''; } catch (e) { err.textContent = e.message; } plot.request(); });
    const customRow = h('div', { class: 'row', hidden: S.base !== 'custom' }, h('span', { class: 'mathlab' }, 'f(x) ='), customIn, err);
    v.controls.append(
      group('Start from', chips(Object.entries(BASES).map(([k, b]) => [k, b.lab]), S.base, k => { S.base = k; customRow.hidden = k !== 'custom'; plot.request(); }), customRow),
      group('Change it', sl.a.el, sl.b.el, sl.h.el, sl.k.el),
      note('Drag the <b style="color:' + A.color('BLUE') + '">curve</b> to slide it (that’s <i>h</i> and <i>k</i>). Drag the <b style="color:' + A.color(C.a) + '">yellow point</b> to stretch it (that’s <i>a</i> and <i>b</i>). Press ▶ to sweep a value and watch the shape respond.'),
      group('Show', h('div', { class: 'row' }, toggle('original (dashed)', S.parent, x => { S.parent = x; plot.request(); }), toggle('where points move', S.pts, x => { S.pts = x; plot.request(); }),
        h('button', { type: 'button', class: 'btn', onclick: () => { Object.assign(S, { a: 1, b: 1, h: 0, k: 0 }); sync(); } }, 'Reset'))),
      group('What each one does', note('<b style="color:' + A.color(C.a) + '">a</b> stretches up and down; negative flips it over the x-axis. <b style="color:' + A.color(C.b) + '">b</b> squeezes sideways by 1/b; negative flips it left–right. <b style="color:' + A.color(C.h) + '">h</b> slides it right (it’s x − h, so +h moves right). <b style="color:' + A.color(C.k) + '">k</b> lifts it up.')));
    plot.request();
  }

  // ---------- 2. slope and the derivative ----------
  const FNS = {
    sq: { lab: 'x²', f: x => x * x },
    cubic: { lab: 'x³ − 3x', f: x => x * x * x - 3 * x },
    sin: { lab: 'sin x', f: Math.sin },
    exp: { lab: 'eˣ', f: Math.exp },
    abs: { lab: '|x|', f: Math.abs },
    wave: { lab: 'x sin x', f: x => x * Math.sin(x) },
    custom: { lab: 'your own', f: null }
  };
  function fnPicker(S, onChange, defCustom) {
    let cf = A.compileFn(defCustom);
    const get = () => S.fn === 'custom' ? cf : FNS[S.fn].f;
    const inp = h('input', { type: 'text', value: defCustom, 'aria-label': 'Your function f(x)', spellcheck: 'false', autocapitalize: 'off' });
    const err = h('span', { class: 'err' });
    inp.addEventListener('input', () => { try { cf = A.compileFn(inp.value) || (x => NaN); err.textContent = ''; } catch (e) { err.textContent = e.message; } onChange(); });
    const row = h('div', { class: 'row', hidden: S.fn !== 'custom' }, h('span', { class: 'mathlab' }, 'f(x) ='), inp, err);
    const el = group('Function', chips(Object.entries(FNS).map(([k, b]) => [k, b.lab]), S.fn, k => { S.fn = k; row.hidden = k !== 'custom'; onChange(); }), row);
    return { el, get };
  }
  function derivativeView() {
    const S = { fn: 'cubic', x0: 1.5, hexp: 0, sign: 1, showD: false, trail: true };
    const v = view('Slope → the derivative', 'shrink the gap and the secant becomes the tangent');
    const trail = [];
    const H = () => S.sign * Math.pow(10, S.hexp);
    const fp = fnPicker(S, () => { trail.length = 0; plot.request(); }, 'x^2/2 - 1');
    const f = x => fp.get()(x);
    const d = x => (f(x + 1e-5) - f(x - 1e-5)) / 2e-5;
    const plot = new Plot(v.pc, {
      range: [-4, 4, -4, 4],
      draw: P => {
        const hh = H(), x0 = S.x0, y0 = f(x0), x1 = x0 + hh, y1 = f(x1), m = (y1 - y0) / hh;
        if (S.showD) P.fn(d, 'PINK', 2.5, { alpha: 0.85 });
        if (S.trail) for (const [tx, ty] of trail) P.dot(tx, ty, 'PINK', 2.5);
        P.fn(f, 'BLUE', 4);
        if (isFinite(m)) P.infLine(x0, y0, m, 'YELLOW', 2.5);
        P.line(x0, y0, x1, y0, 'GREEN', 3); P.line(x1, y0, x1, y1, 'RED', 3);
        if (Math.abs(hh) * P.s > 40) { P.tex('\\Delta x', (x0 + x1) / 2, y0, 17, 'GREEN', 'center', y1 > y0 ? 'top' : 'bottom'); }
        if (Math.abs(y1 - y0) * P.s > 30) P.tex('\\Delta y', x1, (y0 + y1) / 2, 17, 'RED', hh > 0 ? 'left' : 'right');
        if (S.showD || S.trail) { P.line(x0, y0, x0, d(x0), 'PINK', 1.2, [4, 4]); P.dot(x0, d(x0), 'PINK', 5, true); }
        let t = '\\text{slope} = \\frac{\\color{RED}{\\Delta y}}{\\color{GREEN}{\\Delta x}} = \\frac{' + col(y1 - y0, 'RED', 3) + '}{' + col(hh, 'GREEN', Math.max(2, -S.hexp + 1)) + '} = ' + col(m, 'YELLOW', 3);
        t += '\\\\ f\'(' + num(x0) + ') = ' + col(d(x0), 'PINK', 3) + (Math.abs(hh) < 0.02 ? '\\quad\\text{(the secant is now the tangent)}' : '');
        v.eq.set(t);
      }
    });
    plot.addHandle({ get: () => [S.x0, f(S.x0)], set: x => { S.x0 = r2(x); pushTrail(); sx.set(S.x0); }, color: 'WHITE', label: 'P' });
    plot.addHandle({ get: () => [S.x0 + H(), f(S.x0 + H())], set: x => { let dx = x - S.x0; S.sign = dx < 0 ? -1 : 1; S.hexp = clamp(Math.log10(Math.max(Math.abs(dx), 0.001)), -3, 0.6); sh.set(Math.pow(10, S.hexp) * S.sign, S.hexp); }, color: 'YELLOW', label: 'Q' });
    function pushTrail() { const y = d(S.x0); if (isFinite(y)) { trail.push([S.x0, y]); if (trail.length > 600) trail.shift(); } }
    const sx = slider({ label: 'x₀', name: 'x zero', color: 'WHITE', min: -3.5, max: 3.5, value: S.x0, onInput: x => { S.x0 = r2(x); pushTrail(); plot.request(); } });
    const sh = slider({ label: 'Δx', name: 'gap', color: 'GREEN', min: -3, max: 0.6, step: 0.01, value: S.hexp, sweep: false, map: e => S.sign * Math.pow(10, e), fmt: v => num(v, 3), onInput: () => { S.hexp = +sh.el.querySelector('input').value; plot.request(); } });
    async function shrink() {
      const from = S.hexp;
      await tween(2600, u => { S.hexp = from + (-3 - from) * u; sh.set(H(), S.hexp); plot.request(); });
    }
    v.controls.append(
      fp.el,
      group('Move the points', sx.el, sh.el, h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: shrink }, 'Shrink Δx → 0'),
        h('button', { type: 'button', class: 'btn', onclick: () => { S.hexp = 0; sh.set(H(), 0); plot.request(); } }, 'Δx = 1'),
        h('button', { type: 'button', class: 'btn', onclick: () => { S.sign *= -1; sh.set(H(), S.hexp); plot.request(); } }, 'Other side'))),
      note('Drag <b>P</b> along the curve and <b style="color:' + A.color('YELLOW') + '">Q</b> towards it. The yellow line through them is a <i>secant</i>; its slope is <span style="color:' + A.color('RED') + '">Δy</span> ÷ <span style="color:' + A.color('GREEN') + '">Δx</span>. As Δx shrinks, the secant settles on the <i>tangent</i>, and its slope is the derivative f′(x₀).'),
      group('Show', h('div', { class: 'row' }, toggle('trace f′ as P moves', S.trail, x => { S.trail = x; plot.request(); }), toggle('whole f′ graph', S.showD, x => { S.showD = x; plot.request(); }),
        h('button', { type: 'button', class: 'btn', onclick: () => { trail.length = 0; plot.request(); } }, 'Clear trace'),
        h('button', { type: 'button', class: 'btn', onclick: async () => { trail.length = 0; const a = -3.5, b = 3.5; S.hexp = -3; sh.set(H(), S.hexp); await tween(4000, (u, raw) => { S.x0 = a + (b - a) * raw; pushTrail(); sx.set(S.x0); plot.request(); }); } }, '▶ Sweep P')))
    );
    plot.request();
  }

  // ---------- 3. area and the integral ----------
  function integralView() {
    const S = { fn: 'wave', a: 0, b: 3, n: 6, method: 'left' };
    const v = view('Area → the integral', 'more, thinner rectangles close in on the exact area');
    const fp = fnPicker(S, () => plot.request(), '2 + sin(2x)');
    const f = x => fp.get()(x);
    const exact = () => { const N = 2000, a = S.a, b = S.b, hh = (b - a) / N; let s = f(a) + f(b); for (let i = 1; i < N; i++) s += f(a + i * hh) * (i % 2 ? 4 : 2); return s * hh / 3; };
    function sum() {
      const n = S.n, dx = (S.b - S.a) / n; let s = 0;
      for (let i = 0; i < n; i++) { const xl = S.a + i * dx; s += S.method === 'trap' ? (f(xl) + f(xl + dx)) / 2 * dx : f(S.method === 'left' ? xl : S.method === 'right' ? xl + dx : xl + dx / 2) * dx; }
      return s;
    }
    const plot = new Plot(v.pc, {
      range: [-1.5, 5.5, -2.5, 5],
      draw: P => {
        const n = S.n, dx = (S.b - S.a) / n;
        for (let i = 0; i < n; i++) {
          const xl = S.a + i * dx, xr = xl + dx;
          if (S.method === 'trap') { const yl = f(xl), yr = f(xr); P.poly([[xl, 0], [xl, yl], [xr, yr], [xr, 0]], (yl + yr) >= 0 ? 'BLUE' : 'RED', 0.5, n < 80 ? 'BLUE' : null, 1); }
          else { const xs = S.method === 'left' ? xl : S.method === 'right' ? xr : xl + dx / 2, y = f(xs); P.poly([[xl, 0], [xl, y], [xr, y], [xr, 0]], y >= 0 ? 'BLUE' : 'RED', 0.5, n < 80 ? (y >= 0 ? 'BLUE' : 'RED') : null, 1); if (n <= 24) P.dot(xs, y, 'WHITE', 3); }
        }
        P.fn(f, 'WHITE', 3.5);
        P.line(S.a, -100, S.a, 100, 'GREEN', 1.2, [4, 5]); P.line(S.b, -100, S.b, 100, 'ORANGE', 1.2, [4, 5]);
        const s = sum(), e = exact();
        v.eq.set('\\sum_{i=1}^{' + col(S.n, 'YELLOW', 0) + '} f(x_i)\\,\\Delta x = ' + num(s, 4) + '\\\\ \\int_{' + col(S.a, 'GREEN') + '}^{' + col(S.b, 'ORANGE') + '} f(x)\\,dx = ' + num(e, 4) + '\\qquad \\text{error } ' + num(Math.abs(s - e), 4));
      }
    });
    plot.addHandle({ get: () => [S.a, 0], set: x => { S.a = r2(Math.min(x, S.b - 0.05)); sa.set(S.a); }, color: 'GREEN', label: 'a' });
    plot.addHandle({ get: () => [S.b, 0], set: x => { S.b = r2(Math.max(x, S.a + 0.05)); sb.set(S.b); }, color: 'ORANGE', label: 'b' });
    const sn = slider({ label: 'n', name: 'number of rectangles', color: 'YELLOW', min: 1, max: 120, step: 1, value: S.n, fmt: v => String(Math.round(v)), onInput: x => { S.n = Math.max(1, Math.round(x)); plot.request(); } });
    const sa = slider({ label: 'a', name: 'a', color: 'GREEN', min: -4, max: 6, value: S.a, onInput: x => { S.a = r2(Math.min(x, S.b - 0.05)); plot.request(); } });
    const sb = slider({ label: 'b', name: 'b', color: 'ORANGE', min: -4, max: 6, value: S.b, onInput: x => { S.b = r2(Math.max(x, S.a + 0.05)); plot.request(); } });
    async function doubling() { for (let n = 1; n <= 128; n *= 2) { S.n = n; sn.set(n); plot.request(); await sleep(n < 8 ? 700 : 450); } }
    v.controls.append(fp.el,
      group('Rectangles', sn.el, chips([['left', 'Left'], ['mid', 'Middle'], ['right', 'Right'], ['trap', 'Trapezoids']], S.method, k => { S.method = k; plot.request(); }),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: doubling }, '▶ Double n: 1 → 128'))),
      group('Bounds', sa.el, sb.el),
      note('Each rectangle is f(x) tall and Δx = (b − a)/n wide, so their total is the sum above. Area below the axis counts as negative (red). As n grows, the error shrinks towards 0: that limit is the integral.'));
    plot.request();
  }

  // ---------- 4. solve an equation ----------
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  class Q {
    constructor(n, d = 1) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); this.n = n / g; this.d = d / g; }
    add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return this.add(o.neg()); }
    mul(o) { return new Q(this.n * o.n, this.d * o.d); }
    div(o) { return new Q(this.n * o.d, this.d * o.n); }
    neg() { return new Q(-this.n, this.d); }
    get z() { return this.n === 0; } get int() { return this.d === 1; } get v() { return this.n / this.d; }
    eq(o) { return this.n === o.n && this.d === o.d; }
    tex() { const s = this.n < 0 ? '-' : ''; return this.d === 1 ? s + Math.abs(this.n) : s + '\\frac{' + Math.abs(this.n) + '}{' + this.d + '}'; }
  }
  function parseQ(s) {
    s = s.trim(); if (!s) return null;
    let m = /^(-?\d+)\/(\d+)$/.exec(s); if (m) return +m[2] ? new Q(+m[1], +m[2]) : null;
    m = /^(-?)(\d*)\.(\d+)$/.exec(s); if (m) { const d = 10 ** m[3].length; return new Q((m[1] ? -1 : 1) * (+(m[2] || 0) * d + +m[3]), d); }
    m = /^-?\d+$/.exec(s); if (m) return new Q(+s);
    return null;
  }
  function parseSide(s) {
    s = s.replace(/\s+/g, '').replace(/−/g, '-');
    if (!s) throw new Error('one side is empty');
    if (!/^[-+0-9x./]+$/.test(s)) throw new Error('use numbers, x, + and − only (no brackets yet)');
    const out = { x: new Q(0), c: new Q(0) };
    const re = /([+-]?)(\d+(?:\.\d+)?(?:\/\d+)?)?(x)?/g; let m, any = false;
    while ((m = re.exec(s)) && m[0]) {
      if (!m[2] && !m[3]) throw new Error('can’t read “' + m[0] + '”');
      any = true;
      let q = m[2] ? parseQ(m[2]) : new Q(1); if (!q) throw new Error('can’t read “' + m[2] + '”');
      if (m[1] === '-') q = q.neg();
      if (m[3]) out.x = out.x.add(q); else out.c = out.c.add(q);
    }
    if (!any) throw new Error('can’t read “' + s + '”');
    return out;
  }
  function sideTex(sd, hx) {
    const parts = [];
    if (!sd.x.z) { const c = sd.x; parts.push((c.n === 1 && c.d === 1 ? '' : c.n === -1 && c.d === 1 ? '-' : c.tex()) + 'x'); }
    if (!sd.c.z || !parts.length) { const c = sd.c; parts.push(parts.length ? (c.n < 0 ? '- ' + c.neg().tex() : '+ ' + c.tex()) : c.tex()); }
    return parts.join(' ');
  }
  function solveView() {
    const v = view('Solve an equation', 'do the same thing to both sides and watch it balance');
    v.stage.classList.add('solve');
    const plotWrap = v.stage.querySelector('.plotwrap');
    const tiles = h('canvas', { class: 'tiles', 'aria-label': 'Balance with algebra tiles' });
    const tileWrap = h('div', { class: 'tilewrap' }, tiles);
    v.stage.insertBefore(tileWrap, plotWrap);
    plotWrap.classList.add('small');
    let E = null, G = null, start = null, busy = false, pending = '';
    const coef = e => ({ lx: e.L.x.v, lc: e.L.c.v, rx: e.R.x.v, rc: e.R.c.v });
    const hist = [];
    // tiles
    const T = { list: [], id: 0, W: 0, H: 0 };
    const tctx = tiles.getContext('2d');
    function tileable() { return E && [E.L.x, E.L.c, E.R.x, E.R.c].every(q => q.int && Math.abs(q.n) <= 15); }
    function makeTiles() {
      T.list = [];
      if (!tileable()) return;
      for (const s of ['L', 'R']) for (const k of ['x', 'c']) { const q = E[s][k]; for (let i = 0; i < Math.abs(q.n); i++) T.list.push({ id: ++T.id, side: s, kind: k, sign: Math.sign(q.n), x: 0, y: 0, a: 1, tx: 0, ty: 0, ta: 1 }); }
      layout(true);
    }
    const TS = () => Math.max(14, Math.min(26, T.W / 22));
    function layout(snap, groups) {
      const u = TS();
      for (const s of ['L', 'R']) {
        const cx = s === 'L' ? T.W * 0.27 : T.W * 0.73, base = T.H * 0.72;
        const mine = T.list.filter(t => t.side === s && !t.dead);
        const xs = mine.filter(t => t.kind === 'x'), cs = mine.filter(t => t.kind === 'c');
        const xw = u * 0.9, xh = u * 2.6, gap = u * 0.22;
        const perRow = 5;
        if (groups) {
          const n = groups; const per = { x: xs.length / n, c: cs.length / n };
          for (let gI = 0; gI < n; gI++) {
            const row = [...xs.slice(gI * per.x, (gI + 1) * per.x), ...cs.slice(gI * per.c, (gI + 1) * per.c)];
            let x = cx - (row.reduce((w, t) => w + (t.kind === 'x' ? xw : u) + gap, 0)) / 2;
            row.forEach(t => { t.tx = x; t.ty = base - (gI + 1) * (xh + gap * 2) + (t.kind === 'x' ? 0 : xh - u); t.grp = gI; x += (t.kind === 'x' ? xw : u) + gap; });
          }
        } else {
          const xRowW = Math.min(xs.length, 6) * (xw + gap);
          xs.forEach((t, i) => { t.tx = cx - xRowW / 2 + (i % 6) * (xw + gap) - (cs.length ? u * 1.6 : 0); t.ty = base - xh - Math.floor(i / 6) * (xh + gap); t.grp = null; });
          const cRowW = Math.min(cs.length, perRow) * (u + gap);
          const cx0 = cx - cRowW / 2 + (xs.length ? u * 1.4 + xRowW / 2 : 0);
          cs.forEach((t, i) => { t.tx = cx0 + (i % perRow) * (u + gap); t.ty = base - u - Math.floor(i / perRow) * (u + gap); t.grp = null; });
        }
      }
      if (snap) T.list.forEach(t => { t.x = t.tx; t.y = t.ty; t.a = t.ta; });
    }
    function paintTiles() {
      const p = tileWrap, dpr = Math.min(devicePixelRatio || 1, 2), W = p.clientWidth, H = p.clientHeight;
      if (W && (T.W !== W || T.H !== H)) { T.W = W; T.H = H; tiles.width = W * dpr; tiles.height = H * dpr; tiles.style.width = W + 'px'; tiles.style.height = H + 'px'; layout(true); }
      const c = tctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      const base = H * 0.72;
      // balance
      c.strokeStyle = '#888'; c.lineWidth = 2; c.fillStyle = '#222';
      c.beginPath(); c.moveTo(W / 2, base + 4); c.lineTo(W / 2 - 16, H - 8); c.lineTo(W / 2 + 16, H - 8); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#ddd'; c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.08, base + 4); c.lineTo(W * 0.92, base + 4); c.stroke();
      tex(c, '=', W / 2, base - 26, 28, 'WHITE', 'center');
      if (!tileable()) { tex(c, '\\text{(tiles hidden while there are fractions or big numbers)}', W / 2, H * 0.36, 14, 'GREY', 'center'); }
      const u = TS();
      let moving = false;
      for (const t of T.list) {
        t.x += (t.tx - t.x) * 0.22; t.y += (t.ty - t.y) * 0.22; t.a += (t.ta - t.a) * 0.22;
        if (Math.abs(t.tx - t.x) > 0.3 || Math.abs(t.ty - t.y) > 0.3 || Math.abs(t.ta - t.a) > 0.01) moving = true;
        if (t.a < 0.01) continue;
        const w = t.kind === 'x' ? u * 0.9 : u, hh = t.kind === 'x' ? u * 2.6 : u;
        const fill = t.kind === 'x' ? (t.sign > 0 ? '#83C167' : '#C55F73') : (t.sign > 0 ? '#F7D96F' : '#FC6255');
        c.globalAlpha = t.a; c.fillStyle = fill; c.strokeStyle = t.hl ? '#fff' : 'rgba(0,0,0,.6)'; c.lineWidth = t.hl ? 2.5 : 1;
        c.beginPath(); c.roundRect ? c.roundRect(t.x, t.y, w, hh, 3) : c.rect(t.x, t.y, w, hh); c.fill(); c.stroke();
        if (t.kind === 'x') tex(c, t.sign > 0 ? 'x' : '-x', t.x + w / 2, t.y + hh / 2, u * 0.62, '#0b0b0b', 'center');
        else if (t.sign < 0) tex(c, '-', t.x + w / 2, t.y + hh / 2, u * 0.7, '#0b0b0b', 'center');
        c.globalAlpha = 1;
      }
      T.list = T.list.filter(t => !(t.dead && t.a < 0.02));
      if (moving || busy) requestAnimationFrame(paintTiles); else T.raf = 0;
    }
    const kick = () => { if (!T.raf) T.raf = requestAnimationFrame(paintTiles); };
    new ResizeObserver(kick).observe(tileWrap);
    // graph of both sides
    const plot = new Plot(v.pc, {
      range: [-8, 8, -8, 8],
      draw: P => {
        if (!E || !G) return;
        const L = x => G.lx * x + G.lc, R = x => G.rx * x + G.rc;
        P.fn(L, 'BLUE', 3); P.fn(R, 'YELLOW', 3);
        const dm = G.lx - G.rx;
        if (Math.abs(dm) > 1e-9) { const x = (G.rc - G.lc) / dm; P.line(x, P.ymin, x, P.ymax, 'WHITE', 1, [4, 5]); P.dot(x, L(x), 'WHITE', 6, true); P.tex('x = ' + num(x, 3), x, L(x), 16, 'WHITE', 'left', 'bottom'); }
        P.tex('y = ' + sideTex(E.L), P.xmin + 0.3, P.ymax - 0.5, 15, 'BLUE', 'left');
        P.tex('y = ' + sideTex(E.R), P.xmin + 0.3, P.ymax - 1.4 * 18 / P.s - 0.5, 15, 'YELLOW', 'left');
      }
    });
    const showEq = () => v.eq.set(pending || (sideTex(E.L) + ' = ' + sideTex(E.R)));
    const histEl = h('ol', { class: 'hist' });
    const status = h('div', { class: 'status', 'aria-live': 'polite' });
    const sugg = h('div', { class: 'chips' });
    function renderHist() {
      histEl.textContent = '';
      hist.forEach(([eqT, opT]) => {
        const c = h('canvas', { class: 'hc' });
        histEl.append(h('li', {}, c));
        requestAnimationFrame(() => {
          const W = c.clientWidth || 280, H = 30, dpr = Math.min(devicePixelRatio || 1, 2);
          c.width = W * dpr; c.height = H * dpr; const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
          const b = tex(x, eqT, 8, H / 2, 17, 'WHITE', 'left');
          if (opT) tex(x, opT, Math.min(W - 6, 8 + b.w + 18), H / 2, 14, 'RED', 'left');
        });
      });
    }
    function suggestions() {
      sugg.textContent = '';
      const s = [];
      const add = (label, op) => s.push([label, op]);
      if (!E.R.x.z) add((E.R.x.n > 0 ? '− ' : '+ ') + sideTex({ x: new Q(Math.abs(E.R.x.n), E.R.x.d), c: new Q(0) }), { k: 'add', x: E.R.x.neg(), c: new Q(0) });
      if (!E.L.c.z && !E.L.x.z) add((E.L.c.n > 0 ? '− ' : '+ ') + new Q(Math.abs(E.L.c.n), E.L.c.d).tex().replace(/\\frac\{(\d+)\}\{(\d+)\}/, '$1/$2'), { k: 'add', x: new Q(0), c: E.L.c.neg() });
      if (E.L.x.z && !E.R.x.z) add('swap sides', { k: 'swap' });
      if (!E.L.x.z && E.L.c.z && E.R.x.z && !(E.L.x.n === 1 && E.L.x.d === 1)) add('÷ ' + E.L.x.tex().replace(/\\frac\{(\d+)\}\{(\d+)\}/, '($1/$2)'), { k: 'div', q: E.L.x });
      for (const [lab, op] of s) sugg.append(h('button', { type: 'button', class: 'chip go', onclick: () => apply(op) }, lab));
      const solved = E.L.x.eq(new Q(1)) && E.L.c.z && E.R.x.z;
      const none = E.L.x.eq(E.R.x);
      if (solved) {
        const sol = E.R.c, o = start;
        const sub = s2 => { const parts = []; if (!s2.x.z) parts.push((s2.x.n === 1 && s2.x.d === 1 ? '' : s2.x.tex() + '\\cdot') + '\\left(\\color{YELLOW}{' + sol.tex() + '}\\right)'); if (!s2.c.z || !parts.length) parts.push((parts.length && s2.c.n >= 0 ? '+' : '') + s2.c.tex()); return parts.join(' '); };
        const lv = o.L.x.mul(sol).add(o.L.c);
        status.innerHTML = '';
        const c = h('canvas', { class: 'hc big' }); status.append(h('b', {}, 'Solved. '), 'Check it in the original equation:', c);
        requestAnimationFrame(() => { const W = c.clientWidth || 300, H = 40, dpr = Math.min(devicePixelRatio || 1, 2); c.width = W * dpr; c.height = H * dpr; const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); tex(x, sub(o.L) + ' = ' + sub(o.R) + '\\quad\\Rightarrow\\quad ' + lv.tex() + ' = ' + lv.tex() + '\\;\\checkmark', 6, H / 2, 17, 'WHITE', 'left'); });
      } else if (none) {
        status.textContent = E.L.c.eq(E.R.c) ? 'Both sides are always equal: every x is a solution.' : 'The x terms cancelled and what’s left is false: there’s no solution. The two lines are parallel and never meet.';
      } else status.textContent = s.length ? 'Pick a move, or type your own below. It is done to both sides.' : '';
    }
    async function apply(op) {
      if (busy) return;
      busy = true; kick();
      const opTex = op.k === 'add' ? sideTex({ x: op.x, c: op.c }).replace(/^(?!-)/, '+ ').replace(/^-/, '- ').replace(/\+ - /, '- ') : op.k === 'mul' ? '\\times ' + op.q.tex() : op.k === 'div' ? '\\div ' + op.q.tex() : '\\text{swap}';
      const before = sideTex(E.L) + ' = ' + sideTex(E.R);
      // 1. show the move on both sides
      if (op.k === 'add') pending = sideTex(E.L) + ' \\color{RED}{' + opTex + '} = ' + sideTex(E.R) + ' \\color{RED}{' + opTex + '}';
      else if (op.k === 'div') pending = '\\frac{' + sideTex(E.L) + '}{\\color{RED}{' + op.q.tex() + '}} = \\frac{' + sideTex(E.R) + '}{\\color{RED}{' + op.q.tex() + '}}';
      else if (op.k === 'mul') pending = '\\color{RED}{' + op.q.tex() + '}\\left(' + sideTex(E.L) + '\\right) = \\color{RED}{' + op.q.tex() + '}\\left(' + sideTex(E.R) + '\\right)';
      else pending = sideTex(E.R) + ' = ' + sideTex(E.L);
      showEq();
      const next = op.k === 'add' ? { L: { x: E.L.x.add(op.x), c: E.L.c.add(op.c) }, R: { x: E.R.x.add(op.x), c: E.R.c.add(op.c) } }
        : op.k === 'mul' ? { L: { x: E.L.x.mul(op.q), c: E.L.c.mul(op.q) }, R: { x: E.R.x.mul(op.q), c: E.R.c.mul(op.q) } }
          : op.k === 'div' ? { L: { x: E.L.x.div(op.q), c: E.L.c.div(op.q) }, R: { x: E.R.x.div(op.q), c: E.R.c.div(op.q) } }
            : { L: E.R, R: E.L };
      const tilesOk = tileable() && [next.L.x, next.L.c, next.R.x, next.R.c].every(q => q.int && Math.abs(q.n) <= 15);
      if (tilesOk && op.k === 'add' && op.x.int && op.c.int) {
        for (const s of ['L', 'R']) for (const [k, q] of [['x', op.x], ['c', op.c]]) for (let i = 0; i < Math.abs(q.n); i++) T.list.push({ id: ++T.id, side: s, kind: k, sign: Math.sign(q.n), x: 0, y: 0, a: 0, tx: 0, ty: 0, ta: 1, hl: true });
        layout(); T.list.forEach(t => { if (t.hl && t.a === 0) { t.x = t.tx; t.y = t.ty - 60; } }); kick();
        await sleep(900);
        // cancel zero pairs
        for (const s of ['L', 'R']) for (const k of ['x', 'c']) {
          const pos = T.list.filter(t => t.side === s && t.kind === k && t.sign > 0 && !t.dead), neg = T.list.filter(t => t.side === s && t.kind === k && t.sign < 0 && !t.dead);
          const n = Math.min(pos.length, neg.length);
          for (let i = 0; i < n; i++) { const a = pos[pos.length - 1 - i], b = neg[neg.length - 1 - i]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; for (const t of [a, b]) { t.tx = mx; t.ty = my - 20; t.ta = 0; t.dead = true; t.hl = true; } }
        }
        kick(); await sleep(800);
        T.list.forEach(t => { t.hl = false; }); layout(); kick();
      } else if (tilesOk && op.k === 'div' && op.q.int && op.q.n > 1) {
        layout(false, op.q.n); kick(); await sleep(900);
        T.list.forEach(t => { if (t.grp > 0) { t.ta = 0; t.dead = true; t.ty -= 30; } }); kick(); await sleep(700);
        layout(); kick();
      } else if (tilesOk && op.k === 'swap') {
        T.list.forEach(t => { t.side = t.side === 'L' ? 'R' : 'L'; }); layout(); kick(); await sleep(700);
      } else if (tilesOk && op.k === 'mul' && op.q.int) {
        if (op.q.n < 0) { T.list.forEach(t => { t.sign *= -1; t.hl = true; }); kick(); await sleep(600); T.list.forEach(t => { t.hl = false; }); }
        const k = Math.abs(op.q.n);
        const copies = [];
        for (let i = 1; i < k; i++) T.list.filter(t => !t.dead).forEach(t => copies.push(Object.assign({}, t, { id: ++T.id, a: 0, hl: true })));
        T.list.push(...copies); layout(); kick(); await sleep(900); T.list.forEach(t => { t.hl = false; });
      } else await sleep(700);
      // 2. glide the graph lines to the new equation
      const from = Object.assign({}, G), to = coef(next);
      await tween(700, u => { for (const k in G) G[k] = from[k] + (to[k] - from[k]) * u; plot.request(); });
      // 3. commit
      E = next; G = coef(E); pending = '';
      hist.push([before, opTex]);
      if (!tilesOk) makeTiles(); else if (!T.list.length) makeTiles();
      showEq(); renderHist(); suggestions(); plot.request();
      busy = false; kick();
    }
    // the graph's draw reads E; during the tween it reads the animated copy
    function setEquation(src) {
      const [l, r] = src.split('=');
      if (r == null || src.split('=').length !== 2) throw new Error('write it with one = sign');
      E = { L: parseSide(l), R: parseSide(r) };
      if (E.L.x.z && E.R.x.z) throw new Error('there’s no x in it');
      start = { L: E.L, R: E.R }; G = coef(E);
      const dm = G.lx - G.rx; if (Math.abs(dm) > 1e-9) { const x = (G.rc - G.lc) / dm, y = G.lx * x + G.lc; plot.fit([x - 7, x + 7, y - 7, y + 7]); plot.request(); }
      hist.length = 0; pending = '';
      makeTiles(); showEq(); renderHist(); suggestions(); plot.request(); kick();
    }
    function randomEq() {
      const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      const sol = r(-4, 5) || 2, a = r(2, 5), c = Math.random() < 0.6 ? r(-2, 1) : 0, b = r(-8, 8) || 3;
      const cc = c === a ? c - 1 : c, d = (a - cc) * sol + b;
      const side = (x, k) => sideTex({ x: new Q(x), c: new Q(k) }).replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2');
      return side(a, b) + ' = ' + side(cc, d);
    }
    const input = h('input', { type: 'text', 'aria-label': 'Equation', spellcheck: 'false', autocapitalize: 'off', inputmode: 'text' });
    const err = h('span', { class: 'err' });
    const load = s => { try { setEquation(s); input.value = s; err.textContent = ''; } catch (e) { err.textContent = e.message; } };
    const opIn = h('input', { type: 'text', placeholder: 'e.g. − 3, + 2x, ÷ 4, × 2', 'aria-label': 'Move to apply to both sides', spellcheck: 'false', autocapitalize: 'off' });
    const opErr = h('span', { class: 'err' });
    function readOp() {
      const s = opIn.value.replace(/\s+/g, '').replace(/−/g, '-').replace(/×|\*/g, '*').replace(/÷|\//g, '/');
      let m;
      if ((m = /^\*(-?[\d.]+(?:\/\d+)?)$/.exec(s))) { const q = parseQ(m[1]); if (q && !q.z) return { k: 'mul', q }; }
      if ((m = /^\/(-?[\d.]+)$/.exec(s))) { const q = parseQ(m[1]); if (q && !q.z) return { k: 'div', q }; }
      if ((m = /^([+-])([\d.]+(?:\/\d+)?)?(x)?$/.exec(s)) && (m[2] || m[3])) { let q = m[2] ? parseQ(m[2]) : new Q(1); if (q) { if (m[1] === '-') q = q.neg(); return { k: 'add', x: m[3] ? q : new Q(0), c: m[3] ? new Q(0) : q }; } }
      return null;
    }
    v.controls.append(
      group('Moves', sugg, status,
        h('div', { class: 'row' }, opIn, h('button', { type: 'button', class: 'btn', onclick: () => { const op = readOp(); if (!op) { opErr.textContent = 'Try − 3, + 2x, ÷ 4 or × 2'; return; } opErr.textContent = ''; opIn.value = ''; apply(op); } }, 'Apply'), opErr),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => { if (hist.length && !busy) { const [prev] = hist[hist.length - 1]; const keep = hist.slice(0, -1); const s0 = start; setEquation(prev.replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2')); start = s0; hist.push(...keep); renderHist(); suggestions(); } } }, '↶ Undo move'),
          h('button', { type: 'button', class: 'btn', onclick: () => load(randomEq()) }, 'New equation'))),
      group('Working', histEl),
      group('Your own equation', h('div', { class: 'row' }, input, h('button', { type: 'button', class: 'btn', onclick: () => load(input.value) }, 'Load')), err),
      note('<b>Tiles:</b> green bars are <i>x</i>, yellow squares are 1, red ones are negative. A red and a yellow (or green) tile cancel to zero. <b>Graph:</b> the blue line is the left side, the yellow line the right. Every move changes both lines, but they keep crossing at the same <i>x</i>, which is why the answer never changes.'));
    load('3x + 5 = x + 11');
  }

  // ---------- home ----------
  const VIEWS = { transform: transformView, derivative: derivativeView, integral: integralView, solve: solveView };
  function home() {
    cleanup.forEach(f => f()); cleanup = [];
    app.textContent = '';
    const cards = [
      ['transform', 'Transform a function', 'Stretch, squeeze, flip and slide a graph. Drag the curve itself.', 'y=a\\,f(b(x-h))+k'],
      ['derivative', 'Slope → the derivative', 'Shrink a secant into a tangent and watch f′ trace itself out.', '\\frac{\\Delta y}{\\Delta x}\\to f\'(x)'],
      ['integral', 'Area → the integral', 'Thinner rectangles, smaller error: the integral as a limit.', '\\sum f(x_i)\\Delta x \\to \\int_a^b f'],
      ['solve', 'Solve an equation', 'Algebra tiles on a balance, with the graph of both sides.', '3x+5=x+11']
    ];
    const grid = h('div', { class: 'cards' });
    for (const [k, t, d, m] of cards) {
      const c = h('canvas', { class: 'cardeq', 'aria-hidden': 'true' });
      grid.append(h('a', { class: 'card', href: '#' + k }, c, h('h2', {}, t), h('p', {}, d)));
      requestAnimationFrame(() => { const W = c.clientWidth, H = c.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2); c.width = W * dpr; c.height = H * dpr; const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); let px = 24; try { const b = A.texBox(m, 1, '#fff'); px = Math.min(26, (W - 24) / b.w); } catch (e) {} tex(x, m, W / 2, H / 2, px, 'WHITE', 'center'); });
    }
    app.append(h('section', { class: 'home' },
      h('div', { class: 'hero' }, h('h1', {}, 'Tangent'), h('p', {}, 'Maths you can grab. Every graph here responds to your finger, and every equation redraws as you move it.')),
      grid,
      h('p', { class: 'muted foot' }, 'Drag on any graph to move around, pinch to zoom, double-tap to reset the view.')));
  }
  function route() {
    const k = location.hash.slice(1);
    (VIEWS[k] || home)();
    document.title = (VIEWS[k] ? $('.vhead h1').textContent + ' · ' : '') + 'Tangent';
  }
  addEventListener('hashchange', route);
  const ready = document.fonts ? Promise.all(['20px LM', 'italic 20px LM', '20px LMMath', 'bold 20px LM'].map(f => document.fonts.load(f).catch(() => null))) : Promise.resolve();
  ready.then(() => { A.fontsChanged(); route(); });
})();
