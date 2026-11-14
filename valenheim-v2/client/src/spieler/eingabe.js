// Eingabe: Tastatur + Maus (PC) und virtueller Joystick + Wischen (Touch). (übernommen aus v1, erweitert)
export class Input {
  constructor(el) {
    this.el = el; this.keys = new Set(); this.move = { x: 0, y: 0 }; this.look = { dx: 0, dy: 0 }; this.zoom = 0;
    this.run = false; this.runToggle = false; this.jump = false; this.interact = false; this.enabled = true;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; this.lookTouch = { id: null, x: 0, y: 0 };
    this.listeners = [];
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this.listeners.push([t, ev, fn, o]); };

    on(window, 'keydown', (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jump = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'KeyF') this.interact = true;
      if (e.code === 'KeyH') this.handy = true;
      if (e.code === 'KeyV') this.kameraWechsel = true;
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());

    // Maus: Zeiger-Sperre beim Klick, sonst Ziehen
    on(el, 'click', () => { if (!this.isTouch && this.enabled && document.pointerLockElement !== el) { try { const r = el.requestPointerLock?.(); r?.catch?.(() => {}); } catch { /* nicht erlaubt: Ziehen mit gedrückter Maustaste funktioniert trotzdem */ } } });
    on(document, 'mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === el || (e.buttons & 1 && e.target === el)) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
    });
    on(el, 'wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // Touch
    on(el, 'touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.45 && this.joy.id === null) { this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }; }
        else if (this.lookTouch.id === null) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    on(el, 'touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { this.joy.x = t.clientX; this.joy.y = t.clientY; }
        if (t.identifier === this.lookTouch.id) { this.look.dx += (t.clientX - this.lookTouch.x) * 1.6; this.look.dy += (t.clientY - this.lookTouch.y) * 1.6; this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === this.joy.id) this.joy.id = null; if (t.identifier === this.lookTouch.id) this.lookTouch.id = null; } };
    on(el, 'touchend', end); on(el, 'touchcancel', end);
  }

  // Joystick-Zustand für die Anzeige
  joystick() { if (this.joy.id === null) return null; const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy; const d = Math.min(60, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); return { ox: this.joy.ox, oy: this.joy.oy, kx: Math.cos(a) * d, ky: Math.sin(a) * d }; }

  update() {
    let x = 0, y = 0; const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1; if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1; if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joy.id !== null) {
      const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy; const d = Math.hypot(dx, dy);
      if (d > 8) { const m = Math.min(1, d / 60); x = (dx / d) * m; y = -(dy / d) * m; run = d > 56 || this.runToggle; }
    }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    this.move.x = this.enabled ? x : 0; this.move.y = this.enabled ? y : 0; this.run = (run || this.runToggle) && l > 0;
    this.hand = this.enabled && (k.has('Space') || !!this.handTouch);
  }
  consumeLook() { const l = { ...this.look }; this.look.dx = 0; this.look.dy = 0; return l; }
  consume(name) { const v = this[name]; this[name] = name === 'zoom' ? 0 : false; return v; }
  dispose() { for (const [t, ev, fn, o] of this.listeners) t.removeEventListener(ev, fn, o); if (document.pointerLockElement === this.el) document.exitPointerLock?.(); }
}
