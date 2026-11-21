// caylor-ui 1.0.0 — the same six components as DOM helpers, for apps without a build step.
// Same classes as react/, styled by base.css. Text is always set with textContent (never innerHTML).

/** Small element builder: h('div', { class: 'x', onclick }, child, 'text'). */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** The one button. variant: 'default' | 'primary' | 'ghost' | 'danger'. */
export function Button({ label, variant = 'default', size = 'md', block = false, href, onClick, ariaLabel, icon } = {}) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block', !label && 'btn-icon'].filter(Boolean).join(' ');
  const el = href ? h('a', { class: cls, href }) : h('button', { class: cls, type: 'button' });
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  if (icon) el.append(icon);
  if (label) el.append(label);
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

/** The one surface. */
export function Card({ glow = false, tone, pad = true, tag = 'section' } = {}, ...kids) {
  return h(tag, { class: ['card', pad && 'card-pad', glow && 'card-glow', tone && `card-${tone}`].filter(Boolean).join(' ') }, ...kids);
}

/** Shimmer placeholder. */
export function Skeleton(height = 16, width = '100%') {
  const el = h('div', { class: 'skeleton', 'aria-hidden': 'true' });
  el.style.height = typeof height === 'number' ? `${height}px` : height;
  el.style.width = typeof width === 'number' ? `${width}px` : width;
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';
function traceArt(broken) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'state-art'); svg.setAttribute('viewBox', '0 0 160 96'); svg.setAttribute('aria-hidden', 'true');
  if (broken) svg.setAttribute('data-broken', '');
  const add = (tag, a) => { const e = document.createElementNS(SVG, tag); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); };
  add('path', { class: 'state-trace', d: 'M8 72H44L60 56H88' });
  add('path', { class: 'state-trace', d: broken ? 'M104 56H112L128 40H152' : 'M88 56H112L128 40H152' });
  add('path', { class: 'state-trace state-trace-2', d: 'M24 88H70L84 74H136' });
  add('circle', { class: 'state-pad', cx: 152, cy: 40, r: 5 });
  add('circle', { class: 'state-pad', cx: 136, cy: 74, r: 4 });
  add('circle', { class: 'state-pad', cx: 8, cy: 72, r: 4 });
  if (broken) add('path', { class: 'state-gap', d: 'M90 48l4 16M100 48l4 16' });
  return svg;
}
function stateBox(kind, { title, body, action, secondary }) {
  const box = h('div', { class: 'state-box', role: kind === 'error' ? 'alert' : 'status' }, traceArt(kind === 'error'), h('h2', { class: 'state-title' }, title));
  if (body) box.append(h('div', { class: 'state-body' }, body));
  if (action || secondary) {
    const row = h('div', { class: 'state-actions' });
    if (action) row.append(Button({ ...action, variant: 'primary' }));
    if (secondary) row.append(Button(secondary));
    box.append(row);
  }
  return box;
}
/** Nothing here yet: say why, and offer the next step. */
export const EmptyState = (o) => stateBox('empty', o);
/** Something went wrong: say what, and how to recover. */
export const ErrorState = (o) => stateBox('error', o);

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Bottom sheet on phones, dialog on wide screens. Returns { el, body, close }. Esc and backdrop close it;
 * focus is trapped inside and given back to whatever opened it.
 */
export function Sheet({ title, onClose } = {}) {
  const prev = document.activeElement;
  const id = 'sheet-' + Math.random().toString(36).slice(2, 8);
  const backdrop = h('div', { class: 'sheet-backdrop', 'data-shown': 'false' });
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = Button({ variant: 'ghost', ariaLabel: 'Close', icon: xIcon() });
  const el = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, 'data-shown': 'false' },
    h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', { class: 'sheet-title', id }, title || ''), closeBtn),
    body);
  let open = true;
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = [...el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  function close() {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey);
    el.dataset.shown = backdrop.dataset.shown = 'false';
    setTimeout(() => { el.remove(); backdrop.remove(); }, reduced() ? 0 : 260);
    if (prev && prev.focus) prev.focus();
    if (onClose) onClose();
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop, el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.dataset.shown = backdrop.dataset.shown = 'true';
    (el.querySelector('[data-autofocus]') || el.querySelector('input, select, textarea') || closeBtn).focus();
  }));
  return { el, body, close };
}

function xIcon() {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('width', '20'); s.setAttribute('height', '20'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', 'M6 6l12 12M18 6L6 18'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round');
  s.append(p);
  return s;
}
