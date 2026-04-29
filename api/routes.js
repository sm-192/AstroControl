/**
 * API Routes — AstroControl
 * Versão modular, fiel ao server original
 */

'use strict';

const express = require('express');
const router  = express.Router();

const CFG = require('../config/config');
const sh   = require('../utils/exec');
const { createToken, getToken } = require('../utils/tokens');

/* ══════════════════════════════════════════════
   AUTH — TERMINAL (via POST)
   ══════════════════════════════════════════════ */

/**
 * POST /api/auth/terminal
 * Body: { user, password }
 */
router.post('/api/auth/terminal', (req, res) => {
  const { user, password } = req.body || {};

  if (!user || !password) {
    return res.status(400).json({ error: 'user e password obrigatórios' });
  }

  // Validação via su (igual ao server original)
  const child = require('child_process').spawn(
    'su',
    ['-c', 'exit 0', user],
    { stdio: ['pipe', 'ignore', 'ignore'] }
  );

  child.stdin.write(password + '\n');
  child.stdin.end();

  child.on('close', (code) => {
    if (code !== 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // 🔐 Criação de token (modularizado)
    const token = createToken(user, CFG.TOKEN_TTL_MS);

    res.json({
      token,
      ttl: CFG.TOKEN_TTL_MS,
    });
  });
});

/* ══════════════════════════════════════════════
   VERIFY TOKEN
   ══════════════════════════════════════════════ */

/**
 * GET /api/auth/verify?token=xxx
 */
router.get('/api/auth/verify', (req, res) => {
  const token = req.query.token;

  const t = getToken(token);

  if (!t) {
    return res.status(401).end();
  }

  res.json({ user: t.user });
});

/* ══════════════════════════════════════════════
   SERIAL PORTS (Linux / Raspberry Pi)
   ══════════════════════════════════════════════ */

/**
 * GET /api/ports
 */
router.get('/api/ports', async (req, res) => {
  try {
    const out = await sh('ls /dev/ttyUSB* /dev/ttyACM* /dev/ttyAMA* 2>/dev/null');
    const ports = out.split('\n').filter(Boolean);

    res.json({ ports });
  } catch (e) {
    res.json({ ports: [] });
  }
});

/* ══════════════════════════════════════════════
   FALLBACK — SPA (index.html)
   ══════════════════════════════════════════════ */

router.get('*', (req, res) => {
  res.sendFile(require('path').join(CFG.PUBLIC_DIR, 'index.html'));
});

module.exports = router;