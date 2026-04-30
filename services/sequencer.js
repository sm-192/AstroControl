'use strict';

const { emit, log } = require('../utils/emit');
const { indiCameraCapture, indiCameraAbort } = require('../indi/commands/camera');
const { indiFilterSet } = require('../indi/commands/filterwheel');
const { phd2Dither } = require('./phd2');

const SEQUENCES = new WeakMap();

function seqFor(session) {
  let seq = SEQUENCES.get(session);
  if (!seq) {
    seq = {
      queue: [],
      running: false,
      paused: false,
      currentIndex: -1,
      frameInItem: 0,
      doneFrames: 0,
      totalFrames: 0,
      awaitingFrame: false,
      status: 'Pronto',
      timer: null,
    };
    SEQUENCES.set(session, seq);
  }
  return seq;
}

function publicSeq(seq) {
  return {
    queue: seq.queue,
    running: seq.running,
    paused: seq.paused,
    currentIndex: seq.currentIndex,
    frameInItem: seq.frameInItem,
    doneFrames: seq.doneFrames,
    totalFrames: seq.totalFrames,
    awaitingFrame: seq.awaitingFrame,
    status: seq.status,
  };
}

function emitSequence(session) {
  emit(session.ws, 'sequence_update', publicSeq(seqFor(session)));
}

function recomputeTotals(seq) {
  seq.totalFrames = seq.queue.reduce((sum, item) => sum + item.count, 0);
}

function normalizeItem(raw = {}) {
  return {
    id: raw.id || `seq_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    target: String(raw.target || 'Alvo').trim() || 'Alvo',
    type: raw.type || 'Light',
    exposure: Math.max(0.001, Number(raw.exposure) || 1),
    gain: Math.max(0, Number(raw.gain) || 100),
    count: Math.max(1, Math.round(Number(raw.count) || 1)),
    delay: Math.max(0, Number(raw.delay) || 0),
    filterSlot: raw.filterSlot ? Math.max(1, Math.round(Number(raw.filterSlot))) : null,
    ditherEvery: Math.max(0, Math.round(Number(raw.ditherEvery) || 0)),
    done: 0,
  };
}

function addSequenceItem(session, item) {
  const seq = seqFor(session);
  if (seq.running) {
    log(session.ws, 'wn', 'Sequência: pare a execução antes de editar a fila');
    emitSequence(session);
    return;
  }

  seq.queue.push(normalizeItem(item));
  recomputeTotals(seq);
  seq.status = 'Fila atualizada';
  emitSequence(session);
}

function removeSequenceItem(session, id) {
  const seq = seqFor(session);
  if (seq.running) return;
  seq.queue = seq.queue.filter(item => item.id !== id);
  recomputeTotals(seq);
  seq.status = 'Item removido';
  emitSequence(session);
}

function clearSequence(session) {
  const seq = seqFor(session);
  if (seq.running) return;
  seq.queue = [];
  seq.currentIndex = -1;
  seq.frameInItem = 0;
  seq.doneFrames = 0;
  seq.totalFrames = 0;
  seq.awaitingFrame = false;
  seq.status = 'Fila vazia';
  emitSequence(session);
}

function startSequence(session) {
  const seq = seqFor(session);
  if (seq.running) return;
  if (seq.queue.length === 0) {
    seq.status = 'Fila vazia';
    emitSequence(session);
    return;
  }

  seq.running = true;
  seq.paused = false;
  seq.currentIndex = 0;
  seq.frameInItem = 0;
  seq.doneFrames = 0;
  seq.awaitingFrame = false;
  seq.queue.forEach(item => { item.done = 0; });
  recomputeTotals(seq);
  log(session.ws, 'ok', 'Sequência iniciada');
  emitSequence(session);
  shootNext(session);
}

function stopSequence(session, abort = true) {
  const seq = seqFor(session);
  clearTimeout(seq.timer);
  seq.running = false;
  seq.paused = false;
  seq.awaitingFrame = false;
  seq.status = 'Parada';
  if (abort) indiCameraAbort(session);
  log(session.ws, 'wn', 'Sequência parada');
  emitSequence(session);
}

function currentItem(seq) {
  return seq.queue[seq.currentIndex] || null;
}

async function shootNext(session) {
  const seq = seqFor(session);
  if (!seq.running || seq.awaitingFrame) return;

  let item = currentItem(seq);
  while (item && item.done >= item.count) {
    seq.currentIndex += 1;
    seq.frameInItem = 0;
    item = currentItem(seq);
  }

  if (!item) {
    seq.running = false;
    seq.awaitingFrame = false;
    seq.status = 'Concluída';
    log(session.ws, 'ok', 'Sequência concluída');
    emitSequence(session);
    return;
  }

  if (item.filterSlot && item.done === 0) {
    indiFilterSet(session, item.filterSlot);
  }

  seq.status = `${item.target} · ${item.type} ${item.done + 1}/${item.count}`;
  seq.awaitingFrame = true;
  emitSequence(session);
  indiCameraCapture(session, item.exposure, item.gain);
}

async function notifySequenceFrame(session) {
  const seq = seqFor(session);
  if (!seq.running || !seq.awaitingFrame) return;

  const item = currentItem(seq);
  if (!item) return;

  seq.awaitingFrame = false;
  item.done += 1;
  seq.frameInItem = item.done;
  seq.doneFrames += 1;
  seq.status = `${item.target} · recebido ${item.done}/${item.count}`;
  emitSequence(session);

  const shouldDither = item.ditherEvery > 0 &&
    seq.doneFrames < seq.totalFrames &&
    seq.doneFrames % item.ditherEvery === 0;

  if (shouldDither) {
    seq.status = 'Dither em andamento';
    emitSequence(session);
    await phd2Dither(session.ws, { amount: 3, pixels: 1.5, time: 8, timeout: 60 });
  }

  const delayMs = item.delay * 1000;
  clearTimeout(seq.timer);
  seq.timer = setTimeout(() => shootNext(session), delayMs);
}

module.exports = {
  addSequenceItem,
  removeSequenceItem,
  clearSequence,
  startSequence,
  stopSequence,
  emitSequence,
  notifySequenceFrame,
};
