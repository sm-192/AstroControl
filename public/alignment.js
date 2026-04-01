/**
 * AstroControl — alignment.js  (production)
 *
 * Melhorias:
 *   - Smoothing exponencial de pitch/roll (evita tremulação)
 *   - requestAnimationFrame — nunca bloqueia
 *   - Histórico de leituras (últimos 30 segundos)
 *   - Feedback em graus com seta de direção clara
 *   - Canvas eficiente (redraw só quando estado muda)
 *   - applyAlignData() — ponto de entrada único
 */

'use strict';

/* ══════════════════════════════════════════════
   ESTADO DE ALINHAMENTO
   ══════════════════════════════════════════════ */

const ALIGN = {
  /* valores suavizados (exibidos) */
  pitch:   0,
  roll:    0,
  heading: 0,
  lat:     -19.92,
  lon:     -43.93,
  decMag:  -21.4,

  /* valores brutos (para smoothing) */
  _rawPitch:   0,
  _rawRoll:    0,
  _rawHeading: 0,

  /* histórico */
  history: [],   // { ts, pitch, roll, heading }
  MAX_HISTORY: 60,

  /* simulação */
  simMode: true,
  _simTimer: null,

  /* flags de render */
  _dirty: true,
  _rafId: null,
};

/* Coeficiente de suavização exponencial (0=sem suavização, 1=instântaneo) */
const ALPHA_SLOW = 0.08;  // nível / bússola
const ALPHA_FAST = 0.20;  // resposta mais rápida ao mover fisicamente

/* ══════════════════════════════════════════════
   PONTO DE ENTRADA — chamado por app.js / sensor WS
   ══════════════════════════════════════════════ */

/**
 * Recebe dados dos sensores e atualiza estado.
 * @param {Object} data - { pitch, roll, heading, lat, lon, decMag, fix, sats }
 */
function applyAlignData(data) {
  if (data.pitch   !== undefined) ALIGN._rawPitch   = data.pitch;
  if (data.roll    !== undefined) ALIGN._rawRoll     = data.roll;
  if (data.heading !== undefined) ALIGN._rawHeading  = data.heading;
  if (data.lat     !== undefined) ALIGN.lat          = data.lat;
  if (data.lon     !== undefined) ALIGN.lon          = data.lon;
  if (data.decMag  !== undefined) ALIGN.decMag       = data.decMag;

  ALIGN._dirty = true;
  scheduleAlignRender();
}

/* ══════════════════════════════════════════════
   LOOP DE RENDER — requestAnimationFrame
   ══════════════════════════════════════════════ */

function scheduleAlignRender() {
  if (!ALIGN._rafId) {
    ALIGN._rafId = requestAnimationFrame(alignRenderLoop);
  }
}

function alignRenderLoop(ts) {
  ALIGN._rafId = null;

  /* Smoothing exponencial */
  const alpha = ALIGN.simMode ? ALPHA_FAST : ALPHA_SLOW;
  ALIGN.pitch   = lerp(ALIGN.pitch,   ALIGN._rawPitch,   alpha);
  ALIGN.roll    = lerp(ALIGN.roll,    ALIGN._rawRoll,     alpha);
  ALIGN.heading = lerpAngle(ALIGN.heading, ALIGN._rawHeading, alpha);

  /* Histórico (1 ponto/segundo) */
  const now = Date.now();
  const last = ALIGN.history[ALIGN.history.length - 1];
  if (!last || now - last.ts >= 1000) {
    ALIGN.history.push({ ts: now, pitch: ALIGN.pitch, roll: ALIGN.roll, heading: ALIGN.heading });
    if (ALIGN.history.length > ALIGN.MAX_HISTORY) ALIGN.history.shift();
  }

  /* Renderiza apenas se a aba está visível */
  const panel = document.getElementById('p-align');
  if (panel && panel.classList.contains('active')) {
    drawAll();
  }

  /* Continua o loop enquanto a simulação estiver ativa ou dados chegando */
  if (ALIGN.simMode || ALIGN._dirty) {
    ALIGN._dirty = false;
    ALIGN._rafId = requestAnimationFrame(alignRenderLoop);
  }
}

function lerp(a, b, t)      { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  /* interpolação de ângulo pelo caminho mais curto */
  let diff = ((b - a) % 360 + 540) % 360 - 180;
  return (a + diff * t + 360) % 360;
}

/* ══════════════════════════════════════════════
   UTILITÁRIOS
   ══════════════════════════════════════════════ */

function getNorthTrue() {
  return ((ALIGN.heading - ALIGN.decMag) % 360 + 360) % 360;
}

function getAzError() {
  let err = getNorthTrue() % 360;
  if (err > 180) err -= 360;
  return err;
}

/**
 * Cor de feedback baseada em erro absoluto.
 * @param {number} abs - erro absoluto
 * @param {number} ok  - limiar verde
 * @param {number} warn - limiar âmbar
 */
function feedbackColor(abs, ok, warn) {
  if (abs < ok)   return '#1D9E75';
  if (abs < warn) return '#EF9F27';
  return '#E24B4A';
}

/* ══════════════════════════════════════════════
   FEEDBACK GLOBAL
   ══════════════════════════════════════════════ */

function getAlignFeedback() {
  const nt  = getNorthTrue();
  const az  = Math.abs(getAzError());
  const p   = Math.abs(ALIGN.pitch);
  const r   = Math.abs(ALIGN.roll);

  /* Excelente */
  if (p < 0.3 && r < 0.3 && az < 1.0) {
    return { c:'#1D9E75', bg:'#06120a', bc:'#1D9E75',
      t: 'Alinhamento excelente — pode iniciar plate solve.' };
  }

  /* Bom — só ajuste fino */
  if (p < 1.5 && r < 1.5 && az < 5.0) {
    const parts = [];
    if (az >= 1.0) parts.push(`azimute ${azDirectionHint(getAzError())}`);
    if (p  >= 0.3) parts.push(`pitch ${ALIGN.pitch > 0 ? '▼' : '▲'} ${p.toFixed(1)}°`);
    if (r  >= 0.3) parts.push(`roll ${ALIGN.roll  > 0 ? '►' : '◄'} ${r.toFixed(1)}°`);
    return { c:'#EF9F27', bg:'#120e00', bc:'#EF9F27',
      t: 'Quase lá — ajuste: ' + parts.join(' · ') };
  }

  /* Fora — instruções claras */
  const parts = [];
  if (az >= 5.0) parts.push(`Gire ${azDirectionHint(getAzError())}`);
  if (p  >= 1.5) parts.push(`Incline ${ALIGN.pitch > 0 ? 'para frente ▼' : 'para trás ▲'} ${p.toFixed(1)}°`);
  if (r  >= 1.5) parts.push(`Nível lateral ${ALIGN.roll > 0 ? '►' : '◄'} ${r.toFixed(1)}°`);
  return { c:'#E24B4A', bg:'#120606', bc:'#E24B4A',
    t: parts.join(' · ') };
}

function azDirectionHint(err) {
  const abs = Math.abs(err);
  const dir = err > 0 ? 'horário ↻' : 'anti-horário ↺';
  return `${dir} ${abs.toFixed(1)}°`;
}

/* ══════════════════════════════════════════════
   RENDER PRINCIPAL
   ══════════════════════════════════════════════ */

function drawAll() {
  drawBarLat();
  drawBarDec();
  drawNivel2D();
  drawCompass();
  updateFeedback();
  updateAlignTexts();
}

function updateAlignTexts() {
  setText('a-lat',    ALIGN.lat.toFixed(4) + '°');
  setText('a-decmag', ALIGN.decMag.toFixed(1) + '°');
  setText('a-north',  Math.round(getNorthTrue()) + '°');
}

function updateFeedback() {
  const fb  = getAlignFeedback();
  const bar = document.getElementById('a-fb');
  const dot = document.getElementById('a-dot');
  const txt = document.getElementById('a-txt');
  if (!bar || !dot || !txt) return;
  bar.style.background  = fb.bg;
  bar.style.borderColor = fb.bc + '55';
  dot.style.background  = fb.c;
  txt.style.color       = fb.c;
  txt.textContent       = fb.t;
}

/* ── Barra vertical (latitude / pitch) ── */
function drawBarLat() {
  const c = document.getElementById('cv-bar-lat');
  if (!c) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W/2, tw = 10, tt = 8, tb = H-8, th = tb-tt;
  const cy  = tt + th/2;

  /* trilho */
  ctx.fillStyle = '#0a0f1e';
  roundRect(ctx, cx-tw/2, tt, tw, th, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  /* linha de referência (alvo = latitude) */
  ctx.beginPath();
  ctx.moveTo(cx - tw/2 - 5, cy);
  ctx.lineTo(cx + tw/2 + 5, cy);
  ctx.strokeStyle = 'rgba(29,158,117,0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  /* marcador */
  const range = 20;
  const off   = Math.max(-1, Math.min(1, ALIGN.pitch / range)) * th/2;
  const my    = Math.max(tt+7, Math.min(tb-7, cy + off));
  const col   = feedbackColor(Math.abs(ALIGN.pitch), 0.3, 1.5);

  ctx.fillStyle = col + '30';
  ctx.beginPath(); ctx.arc(cx, my, 10, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, my, 5, 0, Math.PI*2); ctx.fill();

  /* label */
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '7px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(ALIGN.lat.toFixed(1) + '°', cx, cy - 7);

  /* valor atual */
  const valEl = document.getElementById('lat-bar-val');
  if (valEl) {
    valEl.textContent = (ALIGN.lat + ALIGN.pitch).toFixed(3) + '°';
    valEl.style.color = col;
  }
}

/* ── Barra horizontal (declinação magnética / erro de azimute) ── */
function drawBarDec() {
  const c = document.getElementById('cv-bar-dec');
  if (!c) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  const cy = H/2, th = 10, tl = 8, tr = W-8, tw = tr-tl;
  const cx = tl + tw/2;

  /* trilho */
  ctx.fillStyle = '#0a0f1e';
  roundRect(ctx, tl, cy-th/2, tw, th, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  /* linha de referência */
  ctx.beginPath();
  ctx.moveTo(cx, cy - th/2 - 5);
  ctx.lineTo(cx, cy + th/2 + 5);
  ctx.strokeStyle = 'rgba(29,158,117,0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  /* marcador */
  const azErr = getAzError();
  const range  = 30;
  const off    = Math.max(-1, Math.min(1, azErr / range)) * tw/2;
  const mx     = Math.max(tl+7, Math.min(tr-7, cx + off));
  const col    = feedbackColor(Math.abs(azErr), 1.0, 5.0);

  ctx.fillStyle = col + '30';
  ctx.beginPath(); ctx.arc(mx, cy, 10, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(mx, cy, 5, 0, Math.PI*2); ctx.fill();

  /* valor */
  const valEl = document.getElementById('dec-bar-val');
  if (valEl) {
    const sign = azErr >= 0 ? '+' : '';
    valEl.textContent = `desvio: ${sign}${azErr.toFixed(2)}°`;
    valEl.style.color = col;
  }
}

/* ── Nível de bolha 2D (pitch × roll) ── */
function drawNivel2D() {
  const c = document.getElementById('cv-nivel');
  if (!c) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const cx = W/2, cy = H/2, R = Math.min(W,H)/2 - 4;

  ctx.clearRect(0, 0, W, H);

  /* fundo */
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.fillStyle = '#0a0f1e'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();

  /* anéis de referência */
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.arc(cx, cy, R * i / 3.5, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5; ctx.stroke();
  }

  /* cruza */
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx-R, cy); ctx.lineTo(cx+R, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy-R); ctx.lineTo(cx, cy+R); ctx.stroke();

  /* posição da bolha */
  const range = 15;
  const bx = cx + Math.max(-1, Math.min(1, ALIGN.roll  / range)) * R * 0.75;
  const by = cy + Math.max(-1, Math.min(1, ALIGN.pitch / range)) * R * 0.75;
  const dist = Math.sqrt(ALIGN.pitch**2 + ALIGN.roll**2);
  const col  = feedbackColor(dist, 0.4, 2.0);

  /* sombra da bolha */
  ctx.fillStyle = col + '20';
  ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI*2); ctx.fill();

  /* bolha */
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI*2); ctx.fill();

  /* ponto central (target) */
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(29,158,117,0.6)'; ctx.fill();

  /* textos */
  setText('pitch-val', ALIGN.pitch.toFixed(2) + '°');
  setText('roll-val',  ALIGN.roll.toFixed(2)  + '°');
  colorEl('pitch-val', col);
  colorEl('roll-val',  col);

  const ns = document.getElementById('nivel-status');
  if (ns) {
    ns.textContent = dist < 0.4 ? 'Nivelado' : dist < 2 ? 'Quase nivelado' : 'Fora de nível';
    ns.style.color = col;
  }
}

/* ── Bússola polar ── */
function drawCompass() {
  const c = document.getElementById('cv-compass');
  if (!c) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const cx = W/2, cy = H/2, R = Math.min(W,H)/2 - 6;

  ctx.clearRect(0, 0, W, H);

  /* fundo */
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.fillStyle = '#0a0f1e'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke();

  /* graduações e labels */
  const DIRS = ['N','NE','L','SE','S','SO','O','NO'];
  for (let i = 0; i < 8; i++) {
    const a  = (i * 45 - 90) * Math.PI / 180;
    const r1 = R - 3, r2 = R - 12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a)*r1, cy + Math.sin(a)*r1);
    ctx.lineTo(cx + Math.cos(a)*(i%2===0?r2:R-7), cy + Math.sin(a)*(i%2===0?r2:R-7));
    ctx.strokeStyle = i%2===0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = i%2===0 ? 1 : 0.5;
    ctx.stroke();

    if (i%2===0) {
      ctx.fillStyle = i===0 ? '#E24B4A' : 'rgba(255,255,255,0.3)';
      ctx.font = (i===0 ? '500 ' : '') + '9px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lr = R - 22;
      ctx.fillText(DIRS[i], cx + Math.cos(a)*lr, cy + Math.sin(a)*lr);
    }
  }

  /* seta norte magnético (âmbar) */
  drawCompassArrow(ctx, cx, cy, ALIGN.heading, R * 0.72, '#EF9F27', '#374151');

  /* seta norte verdadeiro (verde) + linha tracejada */
  const nt = getNorthTrue();
  const ta = (nt - 90) * Math.PI / 180;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(ta);
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(0, -R*0.65); ctx.lineTo(0, R*0.65);
  ctx.strokeStyle = 'rgba(29,158,117,0.2)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  drawCompassArrow(ctx, cx, cy, nt, R * 0.80, '#1D9E75', null);

  /* ponto do polo celeste */
  const pax = cx + Math.cos(ta) * R * 0.48;
  const pay = cy + Math.sin(ta) * R * 0.48;
  ctx.beginPath(); ctx.arc(pax, pay, 5, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.beginPath(); ctx.arc(pax, pay, 2, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();

  /* centro */
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();

  /* legenda */
  ctx.font = '9px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#EF9F27';
  ctx.fillText(`▲ N mag ${Math.round(ALIGN.heading)}°`, 5, H - 18);
  ctx.fillStyle = '#1D9E75';
  ctx.fillText(`▲ N real ${Math.round(nt)}°`, 5, H - 5);

  const azErr = getAzError();
  ctx.textAlign = 'right';
  ctx.fillStyle = feedbackColor(Math.abs(azErr), 1.0, 5.0);
  ctx.fillText(`Δ ${azErr > 0 ? '+' : ''}${azErr.toFixed(1)}°`, W - 5, H - 5);
}

function drawCompassArrow(ctx, cx, cy, headingDeg, len, colorHead, colorTail) {
  const a = (headingDeg - 90) * Math.PI / 180;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(a);
  /* cabeça */
  ctx.beginPath();
  ctx.moveTo(0, -len); ctx.lineTo(5, -len+16); ctx.lineTo(0, -len+12); ctx.lineTo(-5, -len+16);
  ctx.closePath();
  ctx.fillStyle = colorHead; ctx.fill();
  /* cauda */
  if (colorTail) {
    ctx.beginPath();
    ctx.moveTo(0, len); ctx.lineTo(4, len-14); ctx.lineTo(0, len-10); ctx.lineTo(-4, len-14);
    ctx.closePath();
    ctx.fillStyle = colorTail; ctx.fill();
  }
  ctx.restore();
}

/* ══════════════════════════════════════════════
   SIMULAÇÃO
   ══════════════════════════════════════════════ */

function simAlign(preset) {
  switch (preset) {
    case 'perfect': ALIGN._rawPitch = 0.05;  ALIGN._rawRoll = 0.08;  ALIGN._rawHeading = ALIGN.decMag; break;
    case 'close':   ALIGN._rawPitch = -1.1;  ALIGN._rawRoll = 0.6;   ALIGN._rawHeading = ALIGN.decMag - 4; break;
    case 'off':     ALIGN._rawPitch = 4.5;   ALIGN._rawRoll = -3.2;  ALIGN._rawHeading = 40; break;
    case 'random':
      ALIGN._rawPitch   = (Math.random() - 0.5) * 14;
      ALIGN._rawRoll    = (Math.random() - 0.5) * 10;
      ALIGN._rawHeading = Math.random() * 360;
      break;
  }
  ALIGN._dirty = true;
  scheduleAlignRender();
}

/* Ruído de simulação quando simMode === true */
(function simLoop() {
  if (ALIGN.simMode) {
    ALIGN._rawPitch   += (Math.random() - 0.5) * 0.03;
    ALIGN._rawRoll    += (Math.random() - 0.5) * 0.025;
    ALIGN._rawHeading += (Math.random() - 0.5) * 0.10;
    ALIGN._dirty = true;
    scheduleAlignRender();
  }
  setTimeout(simLoop, 120);
})();

/* Estado inicial */
simAlign('off');

/* ══════════════════════════════════════════════
   UTILITÁRIOS CANVAS / DOM
   ══════════════════════════════════════════════ */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

function setText(id, t) {
  const e = document.getElementById(id);
  if (e && e.textContent !== t) e.textContent = t;
}

function colorEl(id, color) {
  const e = document.getElementById(id);
  if (e) e.style.color = color;
}

/* ══════════════════════════════════════════════
   EXPOSIÇÃO GLOBAL (usada por app.js)
   ══════════════════════════════════════════════ */

// applyAlignData e simAlign já estão no escopo global
// renderAlign é chamado por app.js quando muda de aba
function renderAlign() {
  ALIGN._dirty = true;
  scheduleAlignRender();
}
