/* =================================================
   AstroControl — alignment.js
   Canvas: barra de latitude, barra de declinação,
   nível de bolha 2D, bússola polar
   ================================================= */

var alignState = {
  pitch:   4.5,
  roll:    -3.2,
  heading: 40,
  lat:     -19.92,
  decMag:  -21.4
};

/* ── Utilidades ── */
function getNorthTrue() {
  return ((alignState.heading - alignState.decMag) % 360 + 360) % 360;
}

function getAzError() {
  var nt = getNorthTrue();
  var err = nt % 360;
  if (err > 180) err -= 360;
  return err;
}

function alignColor(abs, threshOk, threshWarn) {
  if (abs < threshOk)   return '#1D9E75';
  if (abs < threshWarn) return '#EF9F27';
  return '#E24B4A';
}

/* ── Barra vertical (latitude / pitch) ── */
function drawBarLat(pitch, targetLat) {
  var c = document.getElementById('cv-bar-lat');
  if (!c) return;
  var ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  var cx = W / 2, tw = 10, tt = 8, tb = H - 8, th = tb - tt;

  /* trilho */
  ctx.fillStyle = '#0a0f1e';
  ctx.beginPath(); ctx.roundRect(cx - tw/2, tt, tw, th, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5; ctx.stroke();

  /* linha de referência (alvo) */
  var cy2 = tt + th / 2;
  ctx.beginPath();
  ctx.moveTo(cx - tw/2 - 4, cy2);
  ctx.lineTo(cx + tw/2 + 4, cy2);
  ctx.strokeStyle = 'rgba(29,158,117,0.5)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);

  /* marcador */
  var off = (pitch / 30) * th / 2;
  var my = Math.max(tt + 6, Math.min(tb - 6, cy2 + off));
  var col = alignColor(Math.abs(pitch), 0.3, 1.5);

  ctx.fillStyle = col + '25';
  ctx.beginPath(); ctx.arc(cx, my, 9, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, my, 4, 0, Math.PI*2); ctx.fill();

  /* label de referência */
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.font = '7px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(targetLat.toFixed(1) + '°', cx, cy2 - 6);

  /* valor atual */
  var valEl = document.getElementById('lat-bar-val');
  if (valEl) {
    valEl.textContent = (targetLat + pitch).toFixed(2) + '°';
    valEl.style.color = col;
  }
}

/* ── Barra horizontal (declinação magnética / azimute) ── */
function drawBarDec(azErr, targetDec) {
  var c = document.getElementById('cv-bar-dec');
  if (!c) return;
  var ctx = c.getContext('2d'), W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);

  var cy = H / 2, th = 10, tl = 8, tr = W - 8, tw = tr - tl, cx2 = tl + tw / 2;

  /* trilho */
  ctx.fillStyle = '#0a0f1e';
  ctx.beginPath(); ctx.roundRect(tl, cy - th/2, tw, th, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5; ctx.stroke();

  /* linha de referência */
  ctx.beginPath();
  ctx.moveTo(cx2, cy - th/2 - 4);
  ctx.lineTo(cx2, cy + th/2 + 4);
  ctx.strokeStyle = 'rgba(29,158,117,0.5)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);

  /* marcador */
  var off = (azErr / 30) * tw / 2;
  var mx = Math.max(tl + 6, Math.min(tr - 6, cx2 + off));
  var col = alignColor(Math.abs(azErr), 1, 5);

  ctx.fillStyle = col + '25';
  ctx.beginPath(); ctx.arc(mx, cy, 9, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(mx, cy, 4, 0, Math.PI*2); ctx.fill();

  /* label */
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.font = '7px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(targetDec.toFixed(1) + '°', cx2 + 12, cy - 7);

  var valEl = document.getElementById('dec-bar-val');
  if (valEl) {
    valEl.textContent = 'desvio: ' + (azErr > 0 ? '+' : '') + azErr.toFixed(2) + '°';
    valEl.style.color = col;
  }
}

/* ── Nível de bolha 2D ── */
function drawNivel2D(pitch, roll) {
  var c = document.getElementById('cv-nivel');
  if (!c) return;
  var ctx = c.getContext('2d'), W = c.width, H = c.height, cx = W/2, cy = H/2, R = 48;
  ctx.clearRect(0, 0, W, H);

  /* fundo */
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.fillStyle = '#0a0f1e'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();

  /* anéis */
  for (var i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.arc(cx, cy, R * i / 3.5, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.5; ctx.stroke();
  }

  /* cruza */
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

  /* bolha */
  var bx = cx + Math.max(-1, Math.min(1, roll  / 15)) * R * 0.72;
  var by = cy + Math.max(-1, Math.min(1, pitch / 15)) * R * 0.72;
  var dist = Math.sqrt(pitch * pitch + roll * roll);
  var col = alignColor(dist, 0.4, 2);

  ctx.fillStyle = col + '20';
  ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI*2); ctx.fill();

  /* ponto central */
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(29,158,117,0.5)'; ctx.fill();

  /* atualiza textos */
  var pv = document.getElementById('pitch-val');
  var rv = document.getElementById('roll-val');
  var ns = document.getElementById('nivel-status');
  if (pv) { pv.textContent = pitch.toFixed(2) + '°'; pv.style.color = col; }
  if (rv) { rv.textContent = roll.toFixed(2) + '°';  rv.style.color = col; }
  if (ns) {
    ns.textContent = dist < 0.4 ? 'Nivelado' : dist < 2 ? 'Quase nivelado' : 'Fora de nível';
    ns.style.color = col;
  }
}

/* ── Bússola polar ── */
function drawCompass(heading, northTrue) {
  var c = document.getElementById('cv-compass');
  if (!c) return;
  var ctx = c.getContext('2d'), W = c.width, H = c.height, cx = W/2, cy = H/2, R = 82;
  ctx.clearRect(0, 0, W, H);

  /* fundo */
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.fillStyle = '#0a0f1e'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke();

  /* tiques e labels */
  var dirs = ['N','NE','L','SE','S','SO','O','NO'];
  for (var i = 0; i < 8; i++) {
    var a = (i * 45 - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10));
    ctx.lineTo(cx + Math.cos(a) * (R - 3),  cy + Math.sin(a) * (R - 3));
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = i % 2 === 0 ? 1 : 0.5;
    ctx.stroke();

    if (i % 2 === 0) {
      ctx.fillStyle = i === 0 ? '#E24B4A' : 'rgba(255,255,255,0.28)';
      ctx.font = (i === 0 ? '500 ' : '') + '9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dirs[i], cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20));
    }
  }

  /* seta norte magnético (âmbar) */
  var ma = (heading - 90) * Math.PI / 180;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ma);
  ctx.beginPath();
  ctx.moveTo(0, -56); ctx.lineTo(4, -44); ctx.lineTo(0, -48); ctx.lineTo(-4, -44);
  ctx.closePath(); ctx.fillStyle = '#EF9F27'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 56); ctx.lineTo(4, 44); ctx.lineTo(0, 48); ctx.lineTo(-4, 44);
  ctx.closePath(); ctx.fillStyle = '#374151'; ctx.fill();
  ctx.restore();

  /* seta norte verdadeiro (verde) + linha tracejada */
  var ta = (northTrue - 90) * Math.PI / 180;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ta);
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(0, -48); ctx.lineTo(0, 48);
  ctx.strokeStyle = 'rgba(29,158,117,0.2)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, -62); ctx.lineTo(3, -50); ctx.lineTo(0, -54); ctx.lineTo(-3, -50);
  ctx.closePath(); ctx.fillStyle = '#1D9E75'; ctx.fill();
  ctx.restore();

  /* ponto do polo celeste */
  var pax = cx + Math.cos(ta) * 38, pay = cy + Math.sin(ta) * 38;
  ctx.beginPath(); ctx.arc(pax, pay, 5, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.beginPath(); ctx.arc(pax, pay, 1.5, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();

  /* centro */
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();

  /* legenda */
  ctx.font = '9px system-ui'; ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#EF9F27';
  ctx.fillText('▲ N mag ' + Math.round(heading) + '°', 5, H - 16);
  ctx.fillStyle = '#1D9E75';
  ctx.fillText('▲ N real ' + Math.round(northTrue) + '°', 5, H - 4);

  var d = Math.abs(northTrue % 360);
  d = Math.min(d, 360 - d);
  ctx.textAlign = 'right';
  ctx.fillStyle = alignColor(d, 2, 8);
  ctx.fillText('Δ ' + d.toFixed(1) + '°', W - 5, H - 4);
}

/* ── Feedback geral ── */
function getAlignFeedback() {
  var nt = getNorthTrue();
  var az = Math.abs(nt % 360); if (az > 180) az = 360 - az;
  var p = Math.abs(alignState.pitch), r = Math.abs(alignState.roll);

  if (p < 0.3 && r < 0.3 && az < 1)
    return { c: '#1D9E75', bg: '#08140a', bc: '#1D9E75', t: 'Excelente — pronto para plate solve.' };

  if (p < 1.5 && r < 1.5 && az < 5) {
    var pts = [];
    if (az >= 1) pts.push('azimute ' + az.toFixed(1) + '°');
    if (p >= 0.3) pts.push('pitch ' + p.toFixed(1) + '°');
    if (r >= 0.3) pts.push('roll ' + r.toFixed(1) + '°');
    return { c: '#EF9F27', bg: '#120e00', bc: '#EF9F27', t: 'Quase lá — ' + pts.join(', ') + '.' };
  }

  var pts = [];
  if (az >= 5) pts.push('gire ' + (nt > 180 ? 'horário' : 'anti-horário') + ' (' + az.toFixed(0) + '°)');
  if (p >= 1.5) pts.push('incline ' + (alignState.pitch > 0 ? 'frente' : 'trás') + ' (' + p.toFixed(1) + '°)');
  if (r >= 1.5) pts.push('nível lateral (' + r.toFixed(1) + '°)');
  return { c: '#E24B4A', bg: '#120606', bc: '#E24B4A', t: 'Desalinhado — ' + pts.join('; ') + '.' };
}

/* ── Render completo da aba alinhamento ── */
function renderAlign() {
  var nt = getNorthTrue();
  var azErr = getAzError();

  drawBarLat(alignState.pitch, alignState.lat);
  drawBarDec(azErr, alignState.decMag);
  drawNivel2D(alignState.pitch, alignState.roll);
  drawCompass(alignState.heading, nt);

  var northEl = document.getElementById('a-north');
  if (northEl) northEl.textContent = Math.round(nt) + '°';

  var latEl   = document.getElementById('a-lat');
  var decEl   = document.getElementById('a-decmag');
  if (latEl)  latEl.textContent  = alignState.lat.toFixed(2) + '°';
  if (decEl)  decEl.textContent  = alignState.decMag.toFixed(1) + '°';

  var fb  = getAlignFeedback();
  var bar = document.getElementById('a-fb');
  var dot = document.getElementById('a-dot');
  var txt = document.getElementById('a-txt');
  if (bar) { bar.style.background = fb.bg; bar.style.borderColor = fb.bc + '44'; }
  if (dot) dot.style.background = fb.c;
  if (txt) { txt.style.color = fb.c; txt.textContent = fb.t; }
}

/* ── Simulação ── */
function simAlign(preset) {
  switch (preset) {
    case 'perfect': alignState.pitch = 0.05; alignState.roll = 0.08; alignState.heading = 21.4; break;
    case 'close':   alignState.pitch = -1.1; alignState.roll = 0.6;  alignState.heading = 15;   break;
    case 'off':     alignState.pitch = 4.5;  alignState.roll = -3.2; alignState.heading = 40;   break;
    case 'random':
      alignState.pitch   = (Math.random() - 0.5) * 12;
      alignState.roll    = (Math.random() - 0.5) * 8;
      alignState.heading = Math.random() * 360;
      break;
  }
  renderAlign();
}

/* ── Ruído de simulação (substitua pelo WebSocket real) ── */
function alignNoiseTick() {
  alignState.pitch   += (Math.random() - 0.5) * 0.025;
  alignState.roll    += (Math.random() - 0.5) * 0.02;
  alignState.heading += (Math.random() - 0.5) * 0.08;

  var panel = document.getElementById('p-align');
  if (panel && panel.classList.contains('active')) renderAlign();
}

/* ── Atualização via WebSocket do Python bridge ── */
function applyAlignData(data) {
  /* data = { pitch, roll, heading, lat, lon, decMag } */
  if (data.pitch   !== undefined) alignState.pitch   = data.pitch;
  if (data.roll    !== undefined) alignState.roll    = data.roll;
  if (data.heading !== undefined) alignState.heading = data.heading;
  if (data.lat     !== undefined) alignState.lat     = data.lat;
  if (data.decMag  !== undefined) alignState.decMag  = data.decMag;
  renderAlign();
}

/* inicializa com preset 'off' e ruído de simulação */
simAlign('off');
setInterval(alignNoiseTick, 150);
