/* ============================================================
   FIL: assets/js/charts.js  (HEL FIL)
   PROJEKT: Enkätmätningar — Matlådor (GitHub Pages)
   VERSION: 0.1.0 (MVP)

   Syfte:
   - Enkla grafer utan externa bibliotek (Canvas 2D)
   - Stapeldiagram (counts per svarsalternativ)
   - Liten trendlinje (positiv % över tid) per fråga

   Policy:
   - UI-only
   - XSS-safe: inga HTML-injektioner, bara canvas-ritning
   - Fail-closed: vid tom data rita "Ingen data" tydligt
============================================================ */

/* ============================================================
   BLOCK 1 — Canvas helpers
============================================================ */

function setupCanvas(canvas, width, height) {
  // HOOK: hidpi-scale
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawText(ctx, text, x, y, opts = {}) {
  const {
    size = 12,
    weight = 600,
    color = 'rgba(226,232,240,0.95)',
    align = 'left'
  } = opts;

  ctx.save();
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(text), x, y);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPanel(ctx, w, h) {
  // HOOK: panel-background
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.35)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 14);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawNoData(ctx, w, h, msg) {
  drawPanel(ctx, w, h);
  drawText(ctx, msg || 'Ingen data', w / 2, h / 2, {
    size: 13,
    weight: 700,
    align: 'center',
    color: 'rgba(148,163,184,0.95)'
  });
}

/* ============================================================
   BLOCK 2 — Stapeldiagram (counts)
   Input:
     options: string[]
     counts: number[] (samma längd)
============================================================ */

export function drawBarCounts(canvas, options, counts, cfg = {}) {
  const width = cfg.width ?? 640;
  const height = cfg.height ?? 220;

  const ctx = setupCanvas(canvas, width, height);
  clear(ctx, width, height);

  if (!Array.isArray(options) || !Array.isArray(counts) || options.length === 0 || counts.length !== options.length) {
    drawNoData(ctx, width, height, 'Ingen data för staplar');
    return;
  }

  const max = Math.max(1, ...counts.map((n) => (Number.isFinite(n) ? n : 0)));

  // Panel
  drawPanel(ctx, width, height);

  // Layout
  const pad = 14;
  const top = 28;
  const left = pad;
  const right = pad;
  const bottom = 48;

  const plotW = width - left - right;
  const plotH = height - top - bottom;

  // Axlar
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth = 1;

  // Baslinje
  ctx.beginPath();
  ctx.moveTo(left, top + plotH);
  ctx.lineTo(left + plotW, top + plotH);
  ctx.stroke();
  ctx.restore();

  // Bars
  const n = options.length;
  const gap = 10;
  const barW = Math.max(18, Math.floor((plotW - gap * (n - 1)) / n));

  for (let i = 0; i < n; i++) {
    const c = Number.isFinite(counts[i]) ? counts[i] : 0;
    const h = Math.round((c / max) * plotH);

    const x = left + i * (barW + gap);
    const y = top + (plotH - h);

    // bar fill
    ctx.save();
    ctx.fillStyle = 'rgba(59,130,246,0.28)';        // blå ton (inte kritiskt, men läsbar)
    ctx.strokeStyle = 'rgba(59,130,246,0.55)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, barW, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // count label
    drawText(ctx, c, x + barW / 2, y - 6, {
      size: 12,
      weight: 700,
      align: 'center',
      color: 'rgba(226,232,240,0.95)'
    });

    // option label (kortas om lång)
    const label = String(options[i]).length > 16 ? `${String(options[i]).slice(0, 16)}…` : String(options[i]);
    drawText(ctx, label, x + barW / 2, top + plotH + 22, {
      size: 11,
      weight: 600,
      align: 'center',
      color: 'rgba(148,163,184,0.95)'
    });
  }

  // Title (valfritt)
  if (cfg.title) {
    drawText(ctx, cfg.title, 14, 18, { size: 13, weight: 800, color: 'rgba(226,232,240,0.95)' });
  }
}

/* ============================================================
   BLOCK 3 — Trendlinje (positiv % över tid)
   Input:
     points: Array<{ date: "YYYY-MM-DD", value: number }>, value 0..100
============================================================ */

export function drawTrendLine(canvas, points, cfg = {}) {
  const width = cfg.width ?? 640;
  const height = cfg.height ?? 180;

  const ctx = setupCanvas(canvas, width, height);
  clear(ctx, width, height);

  if (!Array.isArray(points) || points.length === 0) {
    drawNoData(ctx, width, height, 'Ingen trenddata');
    return;
  }

  // Sanera & sortera
  const cleaned = points
    .filter((p) => p && typeof p.date === 'string' && Number.isFinite(p.value))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (cleaned.length === 0) {
    drawNoData(ctx, width, height, 'Ingen trenddata');
    return;
  }

  // Panel
  drawPanel(ctx, width, height);

  // Layout
  const pad = 14;
  const top = 26;
  const left = pad;
  const right = pad;
  const bottom = 34;

  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const minY = 0;
  const maxY = 100;

  // Axel-linjer (0, 50, 100)
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.16)';
  ctx.lineWidth = 1;

  const y0 = top + plotH;
  const y50 = top + plotH * 0.5;
  const y100 = top;

  [y0, y50, y100].forEach((yy) => {
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(left + plotW, yy);
    ctx.stroke();
  });
  ctx.restore();

  // Labels 0/50/100
  drawText(ctx, '100%', left, y100 - 6, { size: 11, weight: 700, color: 'rgba(148,163,184,0.95)' });
  drawText(ctx, '50%', left, y50 - 6, { size: 11, weight: 700, color: 'rgba(148,163,184,0.95)' });
  drawText(ctx, '0%', left, y0 - 6, { size: 11, weight: 700, color: 'rgba(148,163,184,0.95)' });

  // Mapping
  const n = cleaned.length;
  const stepX = n === 1 ? 0 : plotW / (n - 1);

  function yFor(v) {
    const clamped = Math.max(minY, Math.min(maxY, v));
    const t = (clamped - minY) / (maxY - minY);
    return top + plotH - t * plotH;
  }

  // Line
  ctx.save();
  ctx.strokeStyle = 'rgba(34,197,94,0.75)';   // grön ton för "positivt"
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i < n; i++) {
    const x = left + i * stepX;
    const y = yFor(cleaned[i].value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.stroke();
  ctx.restore();

  // Dots + datum label för första/sista
  for (let i = 0; i < n; i++) {
    const x = left + i * stepX;
    const y = yFor(cleaned[i].value);

    ctx.save();
    ctx.fillStyle = 'rgba(34,197,94,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // skriv värde vid sista punkt
    if (i === n - 1) {
      drawText(ctx, `${Math.round(cleaned[i].value)}%`, x - 4, y - 8, {
        size: 12,
        weight: 800,
        align: 'right',
        color: 'rgba(226,232,240,0.95)'
      });
    }
  }

  // X-labels (första + sista datum)
  const first = cleaned[0].date;
  const last = cleaned[cleaned.length - 1].date;

  drawText(ctx, first, left, top + plotH + 22, { size: 11, weight: 700, color: 'rgba(148,163,184,0.95)' });
  drawText(ctx, last, left + plotW, top + plotH + 22, { size: 11, weight: 700, align: 'right', color: 'rgba(148,163,184,0.95)' });

  // Title (valfritt)
  if (cfg.title) {
    drawText(ctx, cfg.title, 14, 18, { size: 13, weight: 800, color: 'rgba(226,232,240,0.95)' });
  }
}
