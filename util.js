/* Shared helpers: safe HTML templating, ids, dates, small formatting utilities. */
window.CR = window.CR || {};

(function (CR) {
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = (s) => new Raw(s);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(v) {
    if (v == null || v === false || v === true) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(esc).join('');
    return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  /** Tagged template: interpolations are escaped unless wrapped in raw() / html``. */
  function html(strings, ...vals) {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += esc(vals[i]) + strings[i + 1];
    return raw(out);
  }

  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = () => new Date().toISOString();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return '—';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  function relTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
    return fmtDate(iso);
  }
  function dueLabel(dateStr) {
    if (!dateStr) return { text: 'No due date', tone: 'muted' };
    const due = new Date(dateStr + 'T23:59:59');
    const days = Math.ceil((due - Date.now()) / 86400000);
    if (days < 0) return { text: `Overdue · ${fmtDate(dateStr)}`, tone: 'danger' };
    if (days === 0) return { text: 'Due today', tone: 'warn' };
    if (days <= 3) return { text: `Due in ${days} day${days > 1 ? 's' : ''}`, tone: 'warn' };
    return { text: `Due ${fmtDate(dateStr)}`, tone: 'muted' };
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

  function isSafeUrl(u) {
    try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:'; } catch { return false; }
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }

  /** Pick readable text colour for a swatch background. */
  function inkOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#141414';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#141414' : '#ffffff';
  }

  CR.util = { raw, html, esc, uid, nowIso, fmtDate, relTime, dueLabel, pad2, plural, isSafeUrl, hostOf, inkOn };
})(window.CR);
