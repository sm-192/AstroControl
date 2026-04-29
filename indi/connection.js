'use strict';

const net = require('net');
const WebSocket = require('ws');

const CFG = require('../config/config');

const { emit, log } = require('../utils/emit');

const { processIndiBuffer } = require('./parser');
const { interpret } = require('./interpreter');


/* ══════════════════════════════════════════════
   CONEXÃO INDI
   ══════════════════════════════════════════════ */

function createIndiConn(session) {
  const socket = new net.Socket();

  let backoff    = CFG.INDI_BACKOFF_INIT;
  let reconTimer = null;
  let destroyed  = false;

  socket.setEncoding('utf8');
  socket.setKeepAlive(true, 10000);

  socket.connect(CFG.INDI_PORT, CFG.INDI_HOST, () => {
    backoff = CFG.INDI_BACKOFF_INIT;

    emit(session.ws, 'indi_status', { connected: true });
    log(session.ws, 'ok', `indiserver :${CFG.INDI_PORT}`);

    socket.write('<getProperties version="1.7"/>\n');
    socket.write('<enableBLOB>Also</enableBLOB>\n');

    flushQueue(session);
  });

  socket.on('data', (chunk) => {
    session.indiBuffer += chunk;

    session.indiBuffer = processIndiBuffer(
      session.indiBuffer,
      (xml, tag) => {
        interpret(xml, tag, session);
      }
    );
  });

  socket.on('error', (err) => {
    emit(session.ws, 'indi_status', { connected: false });
    log(session.ws, 'er', `INDI: ${err.message}`);
  });

  socket.on('close', () => {
    if (destroyed) return;

    session.indiBuffer = ''; // limpa buffer para evitar corrupção na reconexão

    emit(session.ws, 'indi_status', { connected: false });

    log(
      session.ws,
      'wn',
      `INDI offline — reconecta em ${Math.round(backoff / 1000)}s`
    );

    reconTimer = setTimeout(() => {
      if (!destroyed && session.ws.readyState === WebSocket.OPEN) {
        session.indiSocket = createIndiConn(session);
      }
    }, backoff);

    backoff = Math.min(backoff * 1.5, CFG.INDI_BACKOFF_MAX);
  });

  /* override destroy */
  const origDestroy = socket.destroy.bind(socket);

  socket.destroy = () => {
    destroyed = true;
    clearTimeout(reconTimer);
    origDestroy();
  };

  return socket;
}


/* ══════════════════════════════════════════════
   FILA DE COMANDOS
   ══════════════════════════════════════════════ */

function flushQueue(session) {
  while (session.cmdQueue.length > 0) {
    const { xml } = session.cmdQueue[0];

    const s = session.indiSocket;

    if (s && !s.destroyed && s.writable) {
      s.write(xml + '\n');
      session.cmdQueue.shift();
    } else break;
  }
}

function indiWrite(session, xml, id) {
  const s = session.indiSocket;

  if (s && !s.destroyed && s.writable) {
    s.write(xml + '\n');
    return true;
  }

  if (id) {
    session.cmdQueue.push({ xml, id });
  }

  return false;
}


module.exports = {
  createIndiConn,
  indiWrite,
};