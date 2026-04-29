'use strict';

const path = require('path');

/**
 * Configuração central do AstroControl
 * (100% fiel ao CFG do server original)
 */
const CFG = {
  PORT:              3000,

  INDI_HOST:         '127.0.0.1',
  INDI_PORT:         7624,

  INDIWEB_HOST:      '127.0.0.1',
  INDIWEB_PORT:      8624,

  PUBLIC_DIR:        path.join(__dirname, '../public'),

  HEARTBEAT_MS:      15000,

  INDI_BACKOFF_INIT: 2000,
  INDI_BACKOFF_MAX:  30000,

  SESAME_TIMEOUT_MS: 10000,

  TOKEN_TTL_MS:      300000,
};

module.exports = CFG;