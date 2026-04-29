'use strict';

const WebSocket = require('ws');

const { handleMsg } = require('./router');
const { createIndiConn } = require('../indi/connection');
const { DEVICE_STATE } = require('../indi/state');

const { emit } = require('../utils/emit');

const {
  refreshNet,
} = require('../services/network');

const {
  refreshDrivers,
} = require('../services/drivers');

const CFG = require('../config/config');

/* Sessões */
const SESSIONS = new WeakMap();

/* Init WS */
function initWebSocket(server) {
  const wss = new WebSocket.Server({
    server,
    path: '/ws'
  });

  wss.on('connection', (ws, req) => {
    console.log(`[WS] +cliente ${req.socket.remoteAddress}`);

    const session = {
      ws,
      alive: true,
      indiSocket: null,
      indiBuffer: '',
      cmdQueue: [],
    };

    SESSIONS.set(ws, session);

    /* INDI */
    session.indiSocket = createIndiConn(session);

    /* WS handlers */
    ws.on('pong', () => {
      session.alive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === 'ping') {
          emit(ws, 'pong', { ts: msg.ts });
          return;
        }

        handleMsg(session, msg);

      } catch (e) {
        console.error('[WS msg]', e.message);
      }
    });

    ws.on('close', () => {
      console.log('[WS] -cliente');
      if (session.indiSocket) session.indiSocket.destroy();
    });

    ws.on('error', (e) => {
      console.error('[WS err]', e.message);
    });

    /* Estado inicial */
    setTimeout(() => {
      emit(ws, 'full_state', { devices: DEVICE_STATE });
      refreshNet(ws);
      refreshDrivers(ws);
    }, 500);
  });

  /* Heartbeat */
  const hbInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const s = SESSIONS.get(ws);
      if (!s) return;

      if (!s.alive) {
        ws.terminate();
        return;
      }

      s.alive = false;
      ws.ping();
    });
  }, CFG.HEARTBEAT_MS);

  /* Limpa o heartbeat quando o servidor fechar */
  wss.on('close', () => clearInterval(hbInterval));

  return { wss, hbInterval };
}

module.exports = initWebSocket;