'use strict';

const { exec } = require('child_process');

/* Exec shell com promise — rejeita em caso de erro */
function sh(cmd, timeout = 5000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, out) => {
      if (err) return reject(err);
      resolve((out || '').trim());
    });
  });
}

module.exports = {
  sh,
};