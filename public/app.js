/* =================================================
   AstroControl — app.js
   Lógica principal: tabs, montagem, rede,
   WebSocket bridge, handlers de mensagens
   ================================================= */

'use strict';

/* ── Config ── */
var BRIDGE_HOST = window.location.hostname || 'astropi.local';
var BRIDGE_PORT = parseInt(window.location.port) || 3000;
var SENSOR_PORT = 8765;
var currentRate = 16;
var ws          = null;
var sensorWs    = null;
var reconnTimer = null;
var apOn        = false;

/* mapa driver-name → chave frontend */
var DRIVER_MAP = {
  mount:       'indi_eqmod_telescope',
  camera:      'indi_canon_ccd',
  focuser:     'indi_moonlite',
  filterwheel: 'indi_efw',
  rotator:     'indi_simulator_rotator',
  gps:         'indi_gpsd',
  adxl:        'python_bridge'
};

/* ══════════════════════════════════════
   NAVEGAÇÃO
   ══════════════════════════════════════ */
function sw(id, el) {
  document.querySelectorAll('.panel, .novnc-panel').forEach(function(p) {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });

  var panel = document.getElementById('p-' + id);
  if (panel) { panel.style.display = 'flex'; panel.classList.add('active'); }
  if (el)    el.classList.add('active');

  if (id === 'align')   renderAlign();
  if (id === 'network') sendBridge({ type: 'network_status' });
  if (id === 'drivers') sendBridge({ type: 'network_status' }); /* atualiza dots */
}

/* ══════════════════════════════════════
   RELÓGIO UTC
   ══════════════════════════════════════ */
function updateClock() {
  var d = new Date();
  var el = document.getElementById('utc');
  if (el) el.textContent =
    String(d.getUTCHours()).padStart(2,'0') + ':' +
    String(d.getUTCMinutes()).padStart(2,'0') + ':' +
    String(d.getUTCSeconds()).padStart(2,'0') + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

/* ══════════════════════════════════════
   WEBSOCKET — BRIDGE
   ══════════════════════════════════════ */
function connectBridge() {
  clearTimeout(reconnTimer);
  try {
    ws = new WebSocket('ws://' + BRIDGE_HOST + ':' + BRIDGE_PORT + '/ws');
  } catch(e) {
    setDot('pi', 'dx');
    reconnTimer = setTimeout(connectBridge, 6000);
    return;
  }

  ws.onopen = function() {
    setDot('pi', 'dg');
    logAdd('<span class="ok">[OK]</span> Bridge conectado');
  };

  ws.onmessage = function(evt) {
    try { handleMsg(JSON.parse(evt.data)); } catch(e) {}
  };

  ws.onerror = function() {
    setDot('pi', 'dx');
    setDot('indi', 'dx');
  };

  ws.onclose = function() {
    setDot('pi', 'dx');
    setDot('indi', 'dx');
    reconnTimer = setTimeout(connectBridge, 6000);
  };
}

function sendBridge(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

/* ══════════════════════════════════════
   HANDLER DE MENSAGENS DO SERVIDOR
   ══════════════════════════════════════ */
function handleMsg(msg) {
  switch (msg.type) {

    case 'mount':
      setDot('indi', 'dg');
      if (msg.data.ra)  setText('m-ra',  msg.data.ra);
      if (msg.data.dec) setText('m-dec', msg.data.dec);
      if (msg.data.alt) setText('m-alt', msg.data.alt + '°');
      if (msg.data.az)  setText('m-az',  msg.data.az  + '°');
      break;

    case 'mount_park':
      setText('goto-status', msg.parked ? 'Montagem em park' : 'Montagem desestacionada');
      break;

    case 'tracking_mode':
      /* sincroniza botão de tracking */
      var modeLabels = {
        TRACK_SIDEREAL:'Sideral', TRACK_SOLAR:'Solar', TRACK_LUNAR:'Lunar'
      };
      var label = modeLabels[msg.mode];
      if (label) {
        document.querySelectorAll('.trk button').forEach(function(b) {
          b.classList.toggle('active', b.textContent.trim() === label);
        });
      }
      break;

    case 'driver_state':
      updateDriverDot(msg.key, msg.connected, false);
      break;

    case 'status':
      if (msg.data.indiserver) setDot('indi', 'dg');
      if (msg.data.drivers) {
        msg.data.drivers.forEach(function(d) {
          var key = driverNameToKey(d.name);
          if (key) updateDriverDot(key, d.connected, d.error);
        });
      }
      break;

    case 'goto_result':
      var el = document.getElementById('goto-status');
      if (!el) break;
      if (msg.success === null) {
        el.style.color = '#EF9F27';
        el.textContent = msg.message;
      } else if (msg.success) {
        el.style.color = '#5DCAA5';
        el.textContent = '✓ ' + msg.message;
      } else {
        el.style.color = '#E24B4A';
        el.textContent = '✗ ' + msg.message;
      }
      break;

    case 'network':
      applyNetworkData(msg.data);
      break;

    case 'log':
      logAdd(msg.text);
      break;
  }
}

/* ══════════════════════════════════════
   WEBSOCKET — SENSORES (Python bridge)
   ══════════════════════════════════════ */
function connectSensors() {
  try {
    sensorWs = new WebSocket('ws://' + BRIDGE_HOST + ':' + SENSOR_PORT);
  } catch(e) {
    setTimeout(connectSensors, 10000);
    return;
  }

  sensorWs.onopen = function() {
    setDot('gps', 'dg');
    var note = document.querySelector('.sim-note');
    if (note) note.textContent = 'Dados reais do Python bridge ativos';
  };

  sensorWs.onmessage = function(evt) {
    try {
      var data = JSON.parse(evt.data);
      applyAlignData(data);
      setDot('gps', data.fix ? 'dg' : 'da');
    } catch(e) {}
  };

  sensorWs.onclose = function() {
    setDot('gps', 'dx');
    setTimeout(connectSensors, 10000);
  };
}

/* ══════════════════════════════════════
   MONTAGEM — CONTROLES
   ══════════════════════════════════════ */
function setRate(el, rate) {
  document.querySelectorAll('.rb').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  currentRate = rate;
  sendBridge({ type: 'slew_rate', rate: rate });
}

function jp(dir) {
  var jb = document.getElementById('j' + dir);
  if (jb) jb.classList.add('pr');
  sendBridge({ type: 'slew_start', direction: dir, rate: currentRate });
}

function jr(dir) {
  var jb = document.getElementById('j' + dir);
  if (jb) jb.classList.remove('pr');
  sendBridge({ type: 'slew_stop', direction: dir });
}

function jStop() {
  ['N','S','E','W'].forEach(function(d) {
    var jb = document.getElementById('j' + d);
    if (jb) jb.classList.remove('pr');
    sendBridge({ type: 'slew_stop', direction: d });
  });
}

function setTrk(el, mode) {
  document.querySelectorAll('.trk button').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  sendBridge({ type: 'tracking', mode: mode });
}

function doGotoName() {
  var name = (document.getElementById('goto-name') || {}).value || '';
  name = name.trim();
  if (!name) return;
  sendBridge({ type: 'goto_name', name: name });
}

function doGotoCoords() {
  var ra  = (document.getElementById('goto-ra')  || {}).value || '';
  var dec = (document.getElementById('goto-dec') || {}).value || '';
  if (!ra.trim() || !dec.trim()) return;
  sendBridge({ type: 'goto_coords', ra: ra.trim(), dec: dec.trim() });
}

function syncMount() {
  sendBridge({ type: 'sync' });
}

function parkMount() {
  sendBridge({ type: 'park' });
}

/* ══════════════════════════════════════
   DRIVERS
   ══════════════════════════════════════ */
function toggleDriver(key) {
  var tog = document.getElementById('tog-' + key);
  if (!tog) return;
  var willOn = !tog.classList.contains('on');
  tog.classList.toggle('on', willOn);
  updateDriverDot(key, false, false); /* pendente */
  sendBridge({
    type:   willOn ? 'driver_start' : 'driver_stop',
    driver: DRIVER_MAP[key] || key
  });
}

function updateDriverDot(key, connected, error) {
  var dot = document.getElementById('dot-' + key);
  var tog = document.getElementById('tog-' + key);
  if (!dot) return;
  dot.className = 'dot ' + (error ? 'dr' : connected ? 'dg' : 'dx');
  if (tog) tog.classList.toggle('on', connected);
}

function driverNameToKey(name) {
  var n = (name || '').toLowerCase();
  for (var key in DRIVER_MAP) {
    if (DRIVER_MAP[key] && n.includes(DRIVER_MAP[key].toLowerCase())) return key;
  }
  /* fallback por palavras-chave */
  if (n.includes('eqmod') || n.includes('telescope') || n.includes('mount')) return 'mount';
  if (n.includes('canon') || n.includes('ccd') || n.includes('camera'))      return 'camera';
  if (n.includes('moonlite') || n.includes('focuser'))                        return 'focuser';
  if (n.includes('efw') || n.includes('filter'))                              return 'filterwheel';
  if (n.includes('rotat'))                                                     return 'rotator';
  if (n.includes('gps'))                                                       return 'gps';
  return null;
}

function logAdd(html) {
  var log = document.getElementById('indi-log');
  if (!log) return;
  var div = document.createElement('div');
  div.innerHTML = html;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.removeChild(log.firstChild);
}

/* ══════════════════════════════════════
   noVNC / TERMINAL
   ══════════════════════════════════════ */
function connectVNC(frameId, statusId, port) {
  var frame  = document.getElementById(frameId);
  var status = document.getElementById(statusId);
  if (!frame) return;
  var url = 'http://' + BRIDGE_HOST + ':' + port +
            '/vnc_lite.html?autoconnect=1&reconnect=1&resize=scale';
  frame.innerHTML = '<iframe src="' + url + '" style="width:100%;height:100%;border:none;background:#000"></iframe>';
  if (status) status.textContent = 'Conectado';
}

function showAuth(type) {
  var box = document.getElementById('auth-' + type);
  if (box) box.style.display = 'block';
}

function doAuth(type) {
  var errEl = document.getElementById('err-' + type);
  if (errEl) errEl.textContent = '';

  if (type === 'terminal') {
    var user = (document.getElementById('user-terminal') || {}).value || '';
    var pwd  = (document.getElementById('pwd-terminal')  || {}).value || '';
    if (!user.trim() || !pwd) {
      if (errEl) errEl.textContent = 'Preencha usuário e senha.';
      return;
    }
    var frame  = document.getElementById('term-frame');
    var status = document.getElementById('term-status');
    /* ttyd com Basic Auth na URL */
    var url = 'http://' + encodeURIComponent(user.trim()) + ':' +
              encodeURIComponent(pwd) + '@' + BRIDGE_HOST + ':7681';
    frame.innerHTML = '<iframe src="' + url + '" style="width:100%;height:100%;border:none;background:#000"></iframe>';
    if (status) status.textContent = 'Conectado';

  } else if (type === 'desktop') {
    var pwd = (document.getElementById('pwd-desktop') || {}).value || '';
    if (!pwd) {
      if (errEl) errEl.textContent = 'Digite a senha VNC.';
      return;
    }
    var frame  = document.getElementById('vnc-d-frame');
    var status = document.getElementById('vnc-d-status');
    var url = 'http://' + BRIDGE_HOST + ':6082/vnc_lite.html?autoconnect=1&reconnect=1&resize=scale&password=' +
              encodeURIComponent(pwd);
    frame.innerHTML = '<iframe src="' + url + '" style="width:100%;height:100%;border:none;background:#000"></iframe>';
    if (status) status.textContent = 'Conectado';
  }
}

/* ══════════════════════════════════════
   REDE
   ══════════════════════════════════════ */
function toggleAP() {
  apOn = !apOn;
  var tog = document.getElementById('ap-tog');
  var sub = document.getElementById('ap-sub');
  var inf = document.getElementById('ap-info');
  if (tog) tog.classList.toggle('on', apOn);
  if (sub) sub.textContent = apOn ? 'Ativo · SSID: AstroPi' : 'Desativado · sobe automaticamente sem WiFi';
  if (inf) inf.style.opacity = apOn ? '1' : '0.3';
  sendBridge({ type: 'ap_toggle', enable: apOn });
}

function applyNetworkData(data) {
  if (!data) return;
  setText('net-mode',   data.mode   || '--');
  setText('net-ip',     data.ip     || '--');
  setText('net-ssid',   data.ssid   || '--');
  setText('net-signal', data.signal || '--');

  apOn = !!data.ap_active;
  var tog = document.getElementById('ap-tog');
  var sub = document.getElementById('ap-sub');
  var inf = document.getElementById('ap-info');
  var cli = document.getElementById('ap-clients');
  if (tog) tog.classList.toggle('on', apOn);
  if (sub) sub.textContent = apOn ? 'Ativo · SSID: AstroPi' : 'Desativado · sobe automaticamente sem WiFi';
  if (inf) inf.style.opacity = apOn ? '1' : '0.3';
  if (cli && data.ap_clients !== undefined) cli.textContent = String(data.ap_clients);
  setDot('ap', apOn ? 'dg' : 'dx');

  /* dots dos serviços */
  var svc = data.services || {};
  Object.keys(svc).forEach(function(k) {
    var dot = document.getElementById('svc-dot-' + k);
    if (dot) dot.className = 'dot ' + (svc[k] ? 'dg' : 'dx');
  });
}

/* ══════════════════════════════════════
   UTILIDADES
   ══════════════════════════════════════ */
function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setDot(id, cls) {
  var el = document.getElementById('st-' + id);
  if (!el) return;
  var dot = el.querySelector('.dot');
  if (dot) dot.className = 'dot ' + cls;
}

/* ══════════════════════════════════════
   SERVICE WORKER
   ══════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function() {});
}

/* ══════════════════════════════════════
   INIT
   ══════════════════════════════════════ */
/* esconde painéis inativos */
document.querySelectorAll('.panel, .novnc-panel').forEach(function(p) {
  if (!p.classList.contains('active')) p.style.display = 'none';
});

connectBridge();
connectSensors();
