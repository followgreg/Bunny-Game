/* pitch.js — Pitch game audio engine + scoring */
(function (global) {
  'use strict';

  // ── Audio context (lazy, created on first user gesture) ────────────────────
  var _audioCtx = null;

  function getAudioContext() {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume();
    }
    return _audioCtx;
  }

  // ── Target tone ────────────────────────────────────────────────────────────
  var _targetOscillator = null;

  function stopTargetTone() {
    if (_targetOscillator) {
      try { _targetOscillator.stop(); } catch (e) {}
      _targetOscillator = null;
    }
  }

  function playTargetTone(frequency, duration) {
    duration = duration !== undefined ? duration : 3.0;
    stopTargetTone();

    var ctx = getAudioContext();
    var oscillator = ctx.createOscillator();
    var gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Smooth attack/release to avoid clicks
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.6, ctx.currentTime + duration - 0.08);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);

    _targetOscillator = oscillator;

    oscillator.onended = function () {
      if (_targetOscillator === oscillator) _targetOscillator = null;
    };
  }

  // ── Live dial tone ─────────────────────────────────────────────────────────
  var _liveOscillator = null;
  var _liveGain = null;

  function startLiveTone(frequency) {
    stopLiveTone();
    var ctx = getAudioContext();
    _liveOscillator = ctx.createOscillator();
    _liveGain = ctx.createGain();
    _liveOscillator.type = 'sine';
    _liveOscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    _liveGain.gain.setValueAtTime(0.4, ctx.currentTime);
    _liveOscillator.connect(_liveGain);
    _liveGain.connect(ctx.destination);
    _liveOscillator.start();
  }

  function updateLiveToneFrequency(frequency) {
    if (_liveOscillator) {
      _liveOscillator.frequency.setValueAtTime(frequency, getAudioContext().currentTime);
    }
  }

  function stopLiveTone() {
    if (_liveOscillator) {
      var ctx = getAudioContext();
      _liveGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
      _liveOscillator.stop(ctx.currentTime + 0.05);
      _liveOscillator = null;
      _liveGain = null;
    }
  }

  // ── Frequency generation ───────────────────────────────────────────────────
  function generateTargetFrequency() {
    var logMin = Math.log(80);
    var logMax = Math.log(1200);
    var logFreq = logMin + Math.random() * (logMax - logMin);
    return Math.round(Math.exp(logFreq));
  }

  function generateSession() {
    return [
      generateTargetFrequency(),
      generateTargetFrequency(),
      generateTargetFrequency()
    ];
  }

  // ── Scoring ────────────────────────────────────────────────────────────────
  function scoreAccuracy(targetHz, playerHz) {
    var cents = Math.abs(1200 * Math.log2(playerHz / targetHz));
    return Math.max(0, Math.round(100 - (cents / 12)));
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  global.Pitch = {
    getAudioContext:          getAudioContext,
    playTargetTone:           playTargetTone,
    stopTargetTone:           stopTargetTone,
    startLiveTone:            startLiveTone,
    updateLiveToneFrequency:  updateLiveToneFrequency,
    stopLiveTone:             stopLiveTone,
    generateTargetFrequency:  generateTargetFrequency,
    generateSession:          generateSession,
    scoreAccuracy:            scoreAccuracy,
  };

}(window));
