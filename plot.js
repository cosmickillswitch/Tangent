/* Tangent · Plot: a pannable, zoomable coordinate plane in the Manim NumberPlane style,
   with draggable handles and helpers for drawing functions, lines, areas and LaTeX labels. */
(function () {
  'use strict';
  const A = window.Animath;
  const C = A.PAL;

  function niceStep(span, target) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  const fmt = v => { const r = Math.round(v * 1e6) / 1e6; return (r < 0 ? '−' : '') + String(Math.abs(r)); };

  // Draw LaTeX on a 2D canvas. px = font size in pixels. Returns the box size in pixels.
  function tex(ctx, src, x, y, px, color, align = 'left', valign = 'middle') {
    let b;
    try { b = A.texBox(String(src), 1, A.color(color) || '#fff'); } catch (e) { return { w: 0, a: 0, d: 0 }; }
    const ox = align === 'center' ? -b.w / 2 : align === 'right' ? -b.w : 0;
    const oy = valign === 'middle' ? (b.a - b.d) / 2 : valign === 'top' ? b.a : valign === 'bottom' ? -b.d : 0;
    ctx.save();
    ctx.translate(x + ox * px, y + oy * px);
    ctx.scale(px, px);
    A.drawPrims(ctx, b.items, 'full', 1, { scale: 1 });
    ctx.restore();
    return { w: b.w * px, a: b.a * px, d: b.d * px };
  }

  class Plot {
    constructor(canvas, o = {}) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      this.o = o;
      this.handles = [];
      this.cx = 0; this.cy = 0; this.s = 40;
      this.range = o.range || [-8, 8, -5, 5];
      this.pointers = new Map();
      this.drag = null;
      this.onDraw = o.draw || (() => {});
      this.raf = 0;
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas.parentElement);
      this.resize(true);
      canvas.addEventListener('pointerdown', e => this.down(e));
      canvas.addEventListener('pointermove', e => this.move(e));
      canvas.addEventListener('pointerup', e => this.up(e));
      canvas.addEventListener('pointercancel', e => this.up(e));
      canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
      canvas.addEventListener('dblclick', () => { this.fit(); this.request(); });
    }
    resize(first) {
      const p = this.c.parentElement, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = p.clientWidth, h = p.clientHeight;
      if (!w || !h) return;
      this.W = w; this.H = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
      this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
      if (first || !this.fitted) this.fit();
      this.request();
    }
    fit(r) {
      if (r) this.range = r;
      const [x0, x1, y0, y1] = this.range;
      if (!this.W) return;
      this.s = Math.min(this.W / (x1 - x0), this.H / (y1 - y0));
      this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
      this.fitted = true;
    }
    X(x) { return this.W / 2 + (x - this.cx) * this.s; }
    Y(y) { return this.H / 2 - (y - this.cy) * this.s; }
    wx(px) { return this.cx + (px - this.W / 2) / this.s; }
    wy(py) { return this.cy - (py - this.H / 2) / this.s; }
    get xmin() { return this.wx(0); } get xmax() { return this.wx(this.W); }
    get ymin() { return this.wy(this.H); } get ymax() { return this.wy(0); }
    request() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); }); }
    zoomAt(px, py, f) {
      const x = this.wx(px), y = this.wy(py);
      this.s = Math.max(4, Math.min(4000, this.s * f));
      this.cx = x - (px - this.W / 2) / this.s; this.cy = y + (py - this.H / 2) / this.s;
      this.request();
    }
    paint() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.W, this.H);
      this.grid();
      this.onDraw(this);
      for (const hd of this.handles) {
        if (hd.hidden && hd.hidden()) continue;
        const [x, y] = hd.get();
        const px = this.X(x), py = this.Y(y);
        const active = this.drag && this.drag.h === hd;
        ctx.beginPath(); ctx.arc(px, py, active ? 13 : 10, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 6.5, 0, 7); ctx.fillStyle = A.color(hd.color || 'YELLOW'); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
        if (hd.label) tex(ctx, hd.label, px + 12, py - 14, 17, hd.color || 'YELLOW');
      }
    }
    grid() {
      const ctx = this.ctx;
      const step = niceStep(this.W / this.s, Math.max(4, this.W / 90));
      const x0 = Math.floor(this.xmin / step) * step, y0 = Math.floor(this.ymin / step) * step;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(41,171,202,0.16)';
      ctx.beginPath();
      for (let x = x0 - step / 2; x <= this.xmax; x += step / 2) { const p = Math.round(this.X(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, this.H); }
      for (let y = y0 - step / 2; y <= this.ymax; y += step / 2) { const p = Math.round(this.Y(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(this.W, p); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(41,171,202,0.45)';
      ctx.beginPath();
      for (let x = x0; x <= this.xmax; x += step) { const p = Math.round(this.X(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, this.H); }
      for (let y = y0; y <= this.ymax; y += step) { const p = Math.round(this.Y(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(this.W, p); }
      ctx.stroke();
      const ax = Math.min(Math.max(this.X(0), 0), this.W), ay = Math.min(Math.max(this.Y(0), 0), this.H);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(this.W, ay); ctx.moveTo(ax, 0); ctx.lineTo(ax, this.H); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '13px LM, "Times New Roman", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let x = x0; x <= this.xmax; x += step) { if (Math.abs(x) < step / 2) continue; const p = this.X(x); ctx.fillText(fmt(x), p, Math.min(ay + 5, this.H - 16)); }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let y = y0; y <= this.ymax; y += step) { if (Math.abs(y) < step / 2) continue; const p = this.Y(y); ctx.fillText(fmt(y), Math.max(ax - 6, 28), p); }
    }
    // ---- drawing helpers (world coordinates) ----
    fn(f, color, w = 3.5, o = {}) {
      const ctx = this.ctx;
      const a = o.from != null ? Math.max(o.from, this.xmin) : this.xmin, b = o.to != null ? Math.min(o.to, this.xmax) : this.xmax;
      if (b <= a) return;
      ctx.save();
      ctx.strokeStyle = A.color(color); ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (o.dash) ctx.setLineDash(o.dash);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.beginPath();
      const N = Math.ceil((this.X(b) - this.X(a)) / 1.5) + 1;
      let pen = false, py = null;
      const lim = (this.ymax - this.ymin) * 4;
      for (let i = 0; i <= N; i++) {
        const x = a + (b - a) * i / N;
        let y; try { y = f(x); } catch (e) { y = NaN; }
        const ok = isFinite(y) && Math.abs(y - this.cy) < lim;
        if (ok && pen && py != null && Math.abs(y - py) > (this.ymax - this.ymin) * 1.2) pen = false;
        if (ok) { const X = this.X(x), Y = this.Y(y); if (pen) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); pen = true; } else pen = false;
        py = ok ? y : null;
      }
      ctx.stroke(); ctx.restore();
    }
    line(x1, y1, x2, y2, color, w = 2.5, dash) {
      const ctx = this.ctx; ctx.save(); ctx.strokeStyle = A.color(color); ctx.lineWidth = w; ctx.lineCap = 'round'; if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(this.X(x1), this.Y(y1)); ctx.lineTo(this.X(x2), this.Y(y2)); ctx.stroke(); ctx.restore();
    }
    infLine(x0, y0, m, color, w = 2.5, dash) { const a = this.xmin - 1, b = this.xmax + 1; this.line(a, y0 + m * (a - x0), b, y0 + m * (b - x0), color, w, dash); }
    dot(x, y, color, r = 6, ring) {
      const ctx = this.ctx; ctx.beginPath(); ctx.arc(this.X(x), this.Y(y), r, 0, 7); ctx.fillStyle = A.color(color); ctx.fill();
      if (ring) { ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke(); }
    }
    poly(pts, fill, alpha = 0.5, stroke, w = 1.5) {
      const ctx = this.ctx; ctx.save(); ctx.beginPath();
      pts.forEach(([x, y], i) => i ? ctx.lineTo(this.X(x), this.Y(y)) : ctx.moveTo(this.X(x), this.Y(y)));
      ctx.closePath();
      if (fill) { ctx.globalAlpha = alpha; ctx.fillStyle = A.color(fill); ctx.fill(); ctx.globalAlpha = 1; }
      if (stroke) { ctx.strokeStyle = A.color(stroke); ctx.lineWidth = w; ctx.stroke(); }
      ctx.restore();
    }
    tex(src, x, y, px, color, align, valign) { return tex(this.ctx, src, this.X(x), this.Y(y), px || 18, color || 'WHITE', align, valign); }
    // ---- handles and gestures ----
    addHandle(h) { this.handles.push(h); return h; }
    pos(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    down(e) {
      this.c.setPointerCapture(e.pointerId);
      const [px, py] = this.pos(e);
      this.pointers.set(e.pointerId, [px, py]);
      if (this.pointers.size === 2) { const [p, q] = [...this.pointers.values()]; this.drag = { pinch: true, d: Math.hypot(p[0] - q[0], p[1] - q[1]), s: this.s, mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }; return; }
      let best = null, bd = 26;
      for (const hd of this.handles) {
        if (hd.hidden && hd.hidden()) continue;
        const [x, y] = hd.get(); const d = Math.hypot(this.X(x) - px, this.Y(y) - py);
        if (d < bd) { bd = d; best = hd; }
      }
      if (best) { this.drag = { h: best, ox: this.X(best.get()[0]) - px, oy: this.Y(best.get()[1]) - py }; if (best.start) best.start(); this.request(); return; }
      if (this.o.grab) { const g = this.o.grab(this.wx(px), this.wy(py), px, py); if (g) { this.drag = { g, x: this.wx(px), y: this.wy(py) }; this.request(); return; } }
      this.drag = { pan: true, px, py, cx: this.cx, cy: this.cy };
    }
    move(e) {
      if (!this.pointers.has(e.pointerId)) return;
      const [px, py] = this.pos(e);
      this.pointers.set(e.pointerId, [px, py]);
      const d = this.drag; if (!d) return;
      if (d.pinch && this.pointers.size === 2) {
        const [p, q] = [...this.pointers.values()];
        const nd = Math.hypot(p[0] - q[0], p[1] - q[1]);
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        this.zoomAt(d.mid[0], d.mid[1], (d.s * nd / d.d) / this.s);
        this.cx -= (mx - d.mid[0]) / this.s; this.cy += (my - d.mid[1]) / this.s; d.mid = [mx, my];
        this.request(); return;
      }
      if (d.h) { d.h.set(this.wx(px + d.ox), this.wy(py + d.oy)); this.request(); return; }
      if (d.g) { const x = this.wx(px), y = this.wy(py); d.g(x - d.x, y - d.y, x, y); d.x = x; d.y = y; this.request(); return; }
      if (d.pan) { this.cx = d.cx - (px - d.px) / this.s; this.cy = d.cy + (py - d.py) / this.s; this.request(); }
    }
    up(e) {
      this.pointers.delete(e.pointerId);
      if (this.drag && this.drag.h && this.drag.h.end) this.drag.h.end();
      if (this.drag && this.drag.g && this.o.grabEnd) this.o.grabEnd();
      if (this.pointers.size === 0) this.drag = null;
      else if (this.drag && this.drag.pinch) { const [p] = [...this.pointers.values()]; this.drag = { pan: true, px: p[0], py: p[1], cx: this.cx, cy: this.cy }; }
      this.request();
    }
  }

  // An equation strip: LaTeX centred on its own canvas, scaled down to fit.
  class EqStrip {
    constructor(canvas) {
      this.c = canvas; this.ctx = canvas.getContext('2d'); this.src = ''; this.px = 26;
      new ResizeObserver(() => this.paint()).observe(canvas.parentElement);
    }
    set(src) { if (src === this.src) return; this.src = src; this.paint(); }
    paint() {
      const p = this.c.parentElement, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = p.clientWidth, H = p.clientHeight;
      if (!W) return;
      if (this.c.width !== Math.round(W * dpr) || this.c.height !== Math.round(H * dpr)) { this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr); this.c.style.width = W + 'px'; this.c.style.height = H + 'px'; }
      const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const lines = this.src.split('\\\\').map(l => { try { return { l, b: A.texBox(l, 1, '#fff') }; } catch (e) { return null; } }).filter(Boolean);
      if (!lines.length) return;
      const gap = 0.3, totH = lines.reduce((s, x) => s + x.b.a + x.b.d, 0) + gap * (lines.length - 1);
      let px = Math.min(this.px, (H - 10) / totH);
      for (const x of lines) if (x.b.w * px > W - 20) px = (W - 20) / x.b.w;
      let y = H / 2 - totH * px / 2;
      for (const x of lines) { y += x.b.a * px; tex(ctx, x.l, W / 2, y, px, 'WHITE', 'center', 'baseline'); y += (x.b.d + gap) * px; }
    }
  }

  window.TPlot = { Plot, EqStrip, tex, niceStep };
})();
