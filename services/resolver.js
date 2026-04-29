'use strict';

const http = require('http');
const CFG  = require('../config/config');

function resolveObject(name) {
  return new Promise((resolve, reject) => {

    const url = `http://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-ox?${encodeURIComponent(name)}`;

    const req = http.get(url, { timeout: CFG.SESAME_TIMEOUT_MS }, (res) => {
      let data = '';

      res.on('data', c => data += c);

      res.on('end', () => {
        const ram  = data.match(/<jradeg>([\d.]+)<\/jradeg>/);
        const decm = data.match(/<jdedeg>([+-]?[\d.]+)<\/jdedeg>/);

        if (ram && decm) {
          return resolve({
            ra: parseFloat(ram[1]) / 15,
            dec: parseFloat(decm[1])
          });
        }

        // 🔁 FALLBACK SIMBAD — escape SQL correto: '' para aspas simples
        const safeName = name.replace(/'/g, "''");
        const sql = `SELECT ra,dec FROM basic JOIN ident ON oidref=oid WHERE id='${safeName}' LIMIT 1`;

        const tap = `http://simbad.u-strasbg.fr/simbad/sim-tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=text&QUERY=${encodeURIComponent(sql)}`;

        http.get(tap, { timeout: CFG.SESAME_TIMEOUT_MS }, (r2) => {
          let d2 = '';

          r2.on('data', c => d2 += c);

          r2.on('end', () => {
            const lines = d2.trim().split('\n').filter(l => l && !l.startsWith('#'));

            if (lines.length >= 2) {
              const parts = lines[lines.length - 1].split(',');

              if (parts.length >= 2) {
                const raDeg = parseFloat(parts[0].trim());
                const dec   = parseFloat(parts[1].trim());

                if (!isNaN(raDeg) && !isNaN(dec)) {
                  return resolve({ ra: raDeg / 15, dec });
                }
              }
            }

            reject(new Error(`Objeto não encontrado: ${name}`));
          });

        }).on('error', reject)
          .on('timeout', () => reject(new Error('Timeout Simbad')));
      });

    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout Sesame: ${name}`));
    });
  });
}

module.exports = { resolveObject };