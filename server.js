/* =================================================
   AstroControl — server.js
   Backend Node.js:
   - Serve a PWA estática
   - WebSocket bridge para o frontend
   - Proxy INDI XML completo (porta 7624)
   - Resolução de nomes via Simbad
   - API de rede (nmcli)
   - API de drivers (INDI Web Manager)
   ================================================= */

'use strict';

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const net       = require('net');
const { exec }  = require('child_process');
const path      = require('path');

const PORT        = 3000;
const INDI_HOST   = '127.0.0.1';
const INDI_PORT   = 7624;
const PUBLIC_DIR  = path.join(__dirname, 'public');

/* ── Express ── */
const app    = express();
const server = http.createServer(app);
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

/* ── WebSocket Server ── */
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (client) => {
  console.log('[WS] Frontend conectado');
  const session = { indiSocket: null, indiBuffer: '' };
  session.indiSocket = connectIndi(client, session);

  client.on('message', (raw) => {
    try { handleClientMessage(client, session, JSON.parse(raw)); }
    catch (e) { console.error('[WS] Msg inválida:', e.message); }
  });

  client.on('close', () => {
    if (session.indiSocket) session.indiSocket.destroy();
  });

  setTimeout(() => {
    broadcastNetworkStatus(client);
    broadcastDriverStatus(client);
  }, 800);
});

/* ══════════════════════════════════════
   INDI — CONEXÃO
   ══════════════════════════════════════ */
function connectIndi(wsClient, session) {
  const socket = new net.Socket();
  socket.setEncoding('utf8');
  session.indiBuffer = '';
  let reconnTimer = null;

  socket.connect(INDI_PORT, INDI_HOST, () => {
    send(wsClient, { type: 'log', text: '<span class="ok">[OK]</span> indiserver :7624' });
    socket.write('<getProperties version="1.7"/>\n');
  });

  socket.on('data', (chunk) => {
    session.indiBuffer += chunk;
    processIndiBuffer(session, wsClient);
  });

  socket.on('error', (err) => {
    send(wsClient, { type: 'log', text: '<span class="er">[ER]</span> INDI: ' + err.message });
  });

  socket.on('close', () => {
    send(wsClient, { type: 'log', text: '<span class="wn">[--]</span> INDI desconectado — reconectando em 5s' });
    clearTimeout(reconnTimer);
    reconnTimer = setTimeout(() => {
      if (wsClient.readyState === WebSocket.OPEN)
        session.indiSocket = connectIndi(wsClient, session);
    }, 5000);
  });

  return socket;
}

/* ══════════════════════════════════════
   INDI — PARSER XML
   ══════════════════════════════════════ */
const ROOT_TAGS = [
  'defNumberVector','defTextVector','defSwitchVector','defLightVector','defBLOBVector',
  'setNumberVector','setTextVector','setSwitchVector','setLightVector','setBLOBVector',
  'newNumberVector','newTextVector','newSwitchVector',
  'delProperty','message','getProperties'
];

function processIndiBuffer(session, wsClient) {
  let buf = session.indiBuffer;
  let pos = 0;

  while (pos < buf.length) {
    let tagStart = -1;
    let tagName  = null;

    for (const t of ROOT_TAGS) {
      const idx = buf.indexOf('<' + t, pos);
      if (idx !== -1 && (tagStart === -1 || idx < tagStart)) {
        tagStart = idx;
        tagName  = t;
      }
    }
    if (tagStart === -1) break;

    const selfClose = buf.indexOf('/>', tagStart);
    const fullClose = buf.indexOf('</' + tagName + '>', tagStart);
    let msgEnd = -1;

    if (selfClose !== -1 && (fullClose === -1 || selfClose < fullClose)) {
      msgEnd = selfClose + 2;
    } else if (fullClose !== -1) {
      msgEnd = fullClose + ('</' + tagName + '>').length;
    } else {
      break; /* incompleto, aguarda mais dados */
    }

    parseIndiMessage(buf.substring(tagStart, msgEnd), tagName, wsClient);
    pos = msgEnd;
  }

  session.indiBuffer = buf.substring(pos);
}

function parseIndiMessage(xml, tag, wsClient) {
  const device = xmlAttr(xml, 'device');
  const name   = xmlAttr(xml, 'name');
  const state  = xmlAttr(xml, 'state');

  switch (tag) {
    case 'defNumberVector':
    case 'setNumberVector': {
      const nums = xmlChildren(xml, 'oneNumber', 'defNumber');

      if (name === 'EQUATORIAL_EOD_COORD' || name === 'EQUATORIAL_COORD') {
        const ra  = nums.find(n => n.name === 'RA');
        const dec = nums.find(n => n.name === 'DEC');
        const data = {};
        if (ra)  data.ra  = formatRA(parseFloat(ra.value));
        if (dec) data.dec = formatDec(parseFloat(dec.value));
        if (Object.keys(data).length) send(wsClient, { type: 'mount', data });
      }

      if (name === 'HORIZONTAL_COORD') {
        const alt = nums.find(n => n.name === 'ALT');
        const az  = nums.find(n => n.name === 'AZ');
        const data = {};
        if (alt) data.alt = parseFloat(alt.value).toFixed(1);
        if (az)  data.az  = parseFloat(az.value).toFixed(1);
        if (Object.keys(data).length) send(wsClient, { type: 'mount', data });
      }
      break;
    }

    case 'defSwitchVector':
    case 'setSwitchVector': {
      const sw = xmlChildren(xml, 'oneSwitch', 'defSwitch');

      if (name === 'CONNECTION') {
        const connected = sw.some(s => s.name === 'CONNECT' && s.value === 'On');
        const key = deviceKey(device);
        if (key) send(wsClient, { type: 'driver_state', key, connected, state });
      }

      if (name === 'TELESCOPE_PARK') {
        const parked = sw.some(s => s.name === 'PARK' && s.value === 'On');
        send(wsClient, { type: 'mount_park', parked });
      }

      if (name === 'TELESCOPE_TRACK_MODE') {
        const active = sw.find(s => s.value === 'On');
        if (active) send(wsClient, { type: 'tracking_mode', mode: active.name });
      }
      break;
    }

    case 'defTextVector':
    case 'setTextVector': {
      if (name === 'CONNECTION' || name === 'DEVICE_PORT') {
        const key = deviceKey(device);
        if (key) send(wsClient, {
          type: 'log',
          text: '<span class="ok">[OK]</span> ' + (device || 'Dispositivo') + ' conectado'
        });
      }
      break;
    }

    case 'message': {
      const msg = xmlAttr(xml, 'message');
      const ts  = xmlAttr(xml, 'timestamp');
      if (msg) {
        const prefix = device ? device + ': ' : '';
        send(wsClient, {
          type: 'log',
          text: `<span class="dim">[${ts || '--'}]</span> ${prefix}${msg}`
        });
      }
      break;
    }

    case 'delProperty': {
      if (device) send(wsClient, {
        type: 'log',
        text: '<span class="wn">[--]</span> Removido: ' + device
      });
      break;
    }
  }
}

/* ── XML helpers ── */
function xmlAttr(xml, name) {
  const m = xml.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : null;
}

function xmlChildren(xml, ...tags) {
  const res = [];
  for (const tag of tags) {
    const re = new RegExp('<' + tag + '([^>]*)>([\\s\\S]*?)<\\/' + tag + '>', 'g');
    let m;
    while ((m = re.exec(xml)) !== null) {
      res.push({
        name:  (m[1].match(/name="([^"]*)"/) || [])[1] || '',
        value: m[2].trim()
      });
    }
  }
  return res;
}

/* ── Mapeia dispositivo INDI → chave frontend ── */
function deviceKey(device) {
  if (!device) return null;
  const d = device.toLowerCase();
  if (d.includes('telescope') || d.includes('eqmod') || d.includes('mount')) return 'mount';
  if (d.includes('ccd') || d.includes('camera') || d.includes('canon'))      return 'camera';
  if (d.includes('focuser') || d.includes('moonlite'))                        return 'focuser';
  if (d.includes('filter') || d.includes('efw'))                              return 'filterwheel';
  if (d.includes('rotat'))                                                     return 'rotator';
  if (d.includes('gps') || d.includes('gpsd'))                                return 'gps';
  return null;
}

/* ── Formata RA/Dec ── */
function formatRA(ra) {
  if (ra === null || isNaN(ra)) return '--';
  const h = Math.floor(ra);
  const m = Math.floor((ra - h) * 60);
  const s = Math.round(((ra - h) * 60 - m) * 60);
  return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

function formatDec(dec) {
  if (dec === null || isNaN(dec)) return '--';
  const sign = dec >= 0 ? '+' : '-';
  const abs  = Math.abs(dec);
  const d    = Math.floor(abs);
  const m    = Math.floor((abs - d) * 60);
  const s    = Math.round(((abs - d) * 60 - m) * 60);
  return `${sign}${d}° ${String(m).padStart(2,"0")}' ${String(s).padStart(2,"0")}"`;
}

/* ══════════════════════════════════════
   INDI — COMANDOS
   ══════════════════════════════════════ */
function indiWrite(session, xml) {
  const s = session.indiSocket;
  if (s && !s.destroyed && s.writable) { s.write(xml + '\n'); return true; }
  return false;
}

function indiSlew(session, dir, start) {
  const isNS   = dir === 'N' || dir === 'S';
  const prop   = isNS ? 'TELESCOPE_MOTION_NS' : 'TELESCOPE_MOTION_WE';
  const motion = { N:'MOTION_NORTH', S:'MOTION_SOUTH', W:'MOTION_WEST', E:'MOTION_EAST' };
  const opp    = { N:'MOTION_SOUTH', S:'MOTION_NORTH', W:'MOTION_EAST', E:'MOTION_WEST' };
  indiWrite(session,
    `<newSwitchVector device="Telescope Simulator" name="${prop}">` +
    `<oneSwitch name="${motion[dir]}">${start?'On':'Off'}</oneSwitch>` +
    `<oneSwitch name="${opp[dir]}">Off</oneSwitch>` +
    `</newSwitchVector>`);
}

function indiSlewRate(session, rate) {
  const idx = rate <= 1 ? 0 : rate <= 2 ? 0 : rate <= 8 ? 1 : rate <= 16 ? 2 : 3;
  const names = ['SLEW_GUIDE','SLEW_CENTERING','SLEW_FIND','SLEW_MAX'];
  const sw = names.map((n,i) => `<oneSwitch name="${n}">${i===idx?'On':'Off'}</oneSwitch>`).join('');
  indiWrite(session, `<newSwitchVector device="Telescope Simulator" name="TELESCOPE_SLEW_RATE">${sw}</newSwitchVector>`);
}

function indiGoto(session, ra, dec) {
  indiWrite(session,
    `<newSwitchVector device="Telescope Simulator" name="ON_COORD_SET">` +
    `<oneSwitch name="TRACK">On</oneSwitch>` +
    `<oneSwitch name="SLEW">Off</oneSwitch>` +
    `<oneSwitch name="SYNC">Off</oneSwitch>` +
    `</newSwitchVector>`);
  indiWrite(session,
    `<newNumberVector device="Telescope Simulator" name="EQUATORIAL_EOD_COORD">` +
    `<oneNumber name="RA">${ra}</oneNumber>` +
    `<oneNumber name="DEC">${dec}</oneNumber>` +
    `</newNumberVector>`);
}

function indiSync(session) {
  indiWrite(session,
    `<newSwitchVector device="Telescope Simulator" name="ON_COORD_SET">` +
    `<oneSwitch name="SYNC">On</oneSwitch>` +
    `<oneSwitch name="TRACK">Off</oneSwitch>` +
    `<oneSwitch name="SLEW">Off</oneSwitch>` +
    `</newSwitchVector>`);
}

function indiPark(session, park) {
  indiWrite(session,
    `<newSwitchVector device="Telescope Simulator" name="TELESCOPE_PARK">` +
    `<oneSwitch name="${park?'PARK':'UNPARK'}">On</oneSwitch>` +
    `</newSwitchVector>`);
}

function indiTracking(session, mode) {
  if (mode === 'None') {
    indiWrite(session,
      `<newSwitchVector device="Telescope Simulator" name="TELESCOPE_TRACK_STATE">` +
      `<oneSwitch name="TRACK_OFF">On</oneSwitch>` +
      `<oneSwitch name="TRACK_ON">Off</oneSwitch>` +
      `</newSwitchVector>`);
    return;
  }
  const modeMap = { Sidereal:'TRACK_SIDEREAL', Solar:'TRACK_SOLAR', Lunar:'TRACK_LUNAR' };
  indiWrite(session,
    `<newSwitchVector device="Telescope Simulator" name="TELESCOPE_TRACK_STATE">` +
    `<oneSwitch name="TRACK_ON">On</oneSwitch>` +
    `<oneSwitch name="TRACK_OFF">Off</oneSwitch>` +
    `</newSwitchVector>`);
  indiWrite(session,
    `<newSwitchVector device="Telescope Simulator" name="TELESCOPE_TRACK_MODE">` +
    `<oneSwitch name="${modeMap[mode]||'TRACK_SIDEREAL'}">On</oneSwitch>` +
    `</newSwitchVector>`);
}

/* ── Resolve nome de objeto via Simbad TAP ── */
function resolveObjectName(name, callback) {
  const sql = `SELECT ra,dec FROM basic JOIN ident ON oidref=oid WHERE id='${name.replace(/'/g,"\\'")}' LIMIT 1`;
  const qpath = '/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=text&QUERY=' + encodeURIComponent(sql);

  const req = http.request({ hostname:'simbad.u-strasbg.fr', port:80, path:qpath, method:'GET', timeout:8000 }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try {
        const lines = data.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
        if (lines.length >= 2) {
          const parts = lines[lines.length-1].split(',');
          if (parts.length >= 2) {
            const ra  = parseFloat(parts[0].trim()) / 15;
            const dec = parseFloat(parts[1].trim());
            if (!isNaN(ra) && !isNaN(dec)) { callback(null, { ra, dec }); return; }
          }
        }
        callback(new Error('Objeto não encontrado: ' + name));
      } catch(e) { callback(e); }
    });
  });
  req.on('error', callback);
  req.on('timeout', () => { req.destroy(); callback(new Error('Timeout: ' + name)); });
  req.end();
}

/* ── Parse de coordenadas do usuário ── */
function parseRA(str) {
  if (!str) return null;
  str = str.trim();
  if (/^[\d.]+$/.test(str)) return parseFloat(str);
  const m = str.match(/(\d+)[h:\s]+(\d+)[m:\s]*(\d*\.?\d*)/i);
  if (m) return parseInt(m[1]) + parseInt(m[2]||0)/60 + parseFloat(m[3]||0)/3600;
  return null;
}

function parseDec(str) {
  if (!str) return null;
  str = str.trim();
  if (/^[+-]?[\d.]+$/.test(str)) return parseFloat(str);
  const sign = str.startsWith('-') ? -1 : 1;
  const m = str.match(/(\d+)[°d:\s]+(\d+)['"m:\s]*(\d*\.?\d*)/i);
  if (m) return sign * (parseInt(m[1]) + parseInt(m[2]||0)/60 + parseFloat(m[3]||0)/3600);
  return null;
}

/* ══════════════════════════════════════
   HANDLER DE MENSAGENS DO FRONTEND
   ══════════════════════════════════════ */
function handleClientMessage(wsClient, session, msg) {
  switch (msg.type) {
    case 'slew_start':   indiSlew(session, msg.direction, true);  break;
    case 'slew_stop':    indiSlew(session, msg.direction, false); break;
    case 'slew_rate':    indiSlewRate(session, msg.rate);         break;
    case 'tracking':     indiTracking(session, msg.mode);         break;
    case 'sync':         indiSync(session); send(wsClient, { type:'goto_result', success:true, message:'Sync enviado' }); break;
    case 'park':         indiPark(session, true);  send(wsClient, { type:'goto_result', success:true, message:'Park enviado' }); break;
    case 'unpark':       indiPark(session, false); break;
    case 'driver_start': startDriver(wsClient, msg.driver); break;
    case 'driver_stop':  stopDriver(wsClient, msg.driver);  break;
    case 'ap_toggle':    toggleAP(wsClient, msg.enable);    break;
    case 'network_status': broadcastNetworkStatus(wsClient); break;

    case 'goto_name':
      send(wsClient, { type:'goto_result', success:null, message:'Resolvendo ' + msg.name + '...' });
      resolveObjectName(msg.name, (err, coords) => {
        if (err) { send(wsClient, { type:'goto_result', success:false, message:err.message }); return; }
        indiGoto(session, coords.ra, coords.dec);
        send(wsClient, { type:'goto_result', success:true,
          message: msg.name + ' → ' + formatRA(coords.ra) + ' / ' + formatDec(coords.dec) });
      });
      break;

    case 'goto_coords': {
      const ra  = parseRA(msg.ra);
      const dec = parseDec(msg.dec);
      if (ra === null || dec === null) {
        send(wsClient, { type:'goto_result', success:false, message:'Coordenadas inválidas' });
        break;
      }
      indiGoto(session, ra, dec);
      send(wsClient, { type:'goto_result', success:true,
        message:'GoTo → ' + formatRA(ra) + ' / ' + formatDec(dec) });
      break;
    }
  }
}

/* ══════════════════════════════════════
   DRIVERS — INDI Web Manager
   ══════════════════════════════════════ */
function indiWebReq(method, path, callback) {
  const req = http.request(
    { hostname:'127.0.0.1', port:8624, path, method, timeout:4000 },
    (res) => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { callback(null, JSON.parse(out)); }
        catch(e) { callback(null, out); }
      });
    }
  );
  req.on('error', callback);
  req.on('timeout', () => { req.destroy(); callback(new Error('timeout')); });
  req.end();
}

function startDriver(wsClient, driver) {
  indiWebReq('POST', '/api/server/start/' + encodeURIComponent(driver), (err) => {
    send(wsClient, { type:'log', text: err
      ? '<span class="er">[ER]</span> Falha ao iniciar: ' + driver
      : '<span class="ok">[OK]</span> Driver iniciado: ' + driver });
    setTimeout(() => broadcastDriverStatus(wsClient), 1000);
  });
}

function stopDriver(wsClient, driver) {
  indiWebReq('POST', '/api/server/stop/' + encodeURIComponent(driver), () => {
    send(wsClient, { type:'log', text:'<span class="wn">[--]</span> Driver parado: ' + driver });
    setTimeout(() => broadcastDriverStatus(wsClient), 1000);
  });
}

function broadcastDriverStatus(wsClient) {
  indiWebReq('GET', '/api/server/status', (err, data) => {
    if (err || !data || typeof data !== 'object') return;
    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    send(wsClient, {
      type: 'status',
      data: {
        indiserver: data.status === 'running',
        drivers: drivers.map(d => ({
          name:      d.name || String(d),
          connected: d.state === 'Running' || d.connected === true,
          error:     d.state === 'Error'
        }))
      }
    });
  });
}

/* ══════════════════════════════════════
   REDE
   ══════════════════════════════════════ */
function checkPort(port) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(400);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error',   () => { s.destroy(); resolve(false); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.connect(port, '127.0.0.1');
  });
}

function execAsync(cmd) {
  return new Promise((resolve) => exec(cmd, (e, out) => resolve(out || '')));
}

async function broadcastNetworkStatus(wsClient) {
  const [ conOut, ip, wifiRaw, apClients ] = await Promise.all([
    execAsync('nmcli -t -f NAME,TYPE,STATE con show --active 2>/dev/null'),
    execAsync("hostname -I 2>/dev/null | awk '{print $1}'"),
    execAsync("nmcli -t -f IN-USE,SSID,SIGNAL dev wifi 2>/dev/null | grep '^\\*' | head -1"),
    execAsync("iw dev wlan0 station dump 2>/dev/null | grep -c Station || echo 0")
  ]);

  const apActive   = conOut.includes('AstroPi-AP');
  const wifiParts  = wifiRaw.trim().split(':');
  const ssid       = wifiParts[1] || '--';
  const rssi       = wifiParts[2] ? Math.round(-100 + parseInt(wifiParts[2]) / 2) + ' dBm' : '--';

  const svcPorts = { indiweb:8624, kstars:6080, phd2:6081, desktop:6082, ttyd:7681, gpsd:2947, bridge:3000 };
  const svcStatus = {};
  await Promise.all(Object.entries(svcPorts).map(async ([k,p]) => { svcStatus[k] = await checkPort(p); }));

  send(wsClient, {
    type: 'network',
    data: {
      mode:       apActive ? 'STA + AP' : 'STA',
      ip:         ip.trim() || '--',
      ssid,
      signal:     rssi,
      ap_active:  apActive,
      ap_clients: parseInt(apClients.trim()) || 0,
      services:   svcStatus
    }
  });
}

function toggleAP(wsClient, enable) {
  exec(enable ? 'nmcli con up AstroPi-AP' : 'nmcli con down AstroPi-AP', (err) => {
    send(wsClient, { type:'log', text: err
      ? '<span class="er">[ER]</span> AP: ' + err.message
      : '<span class="ok">[OK]</span> AP ' + (enable ? 'ativado' : 'desativado') });
    setTimeout(() => broadcastNetworkStatus(wsClient), 1500);
  });
}

/* ── Util ── */
function send(wsClient, msg) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN)
    try { wsClient.send(JSON.stringify(msg)); } catch(e) {}
}

/* ── Inicia ── */
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[AstroControl] http://0.0.0.0:${PORT}`);
  console.log(`[AstroControl] Acesse: http://astropi.local:${PORT}`);
});

process.on('uncaughtException', (err) => console.error('[AstroControl]', err.message));
