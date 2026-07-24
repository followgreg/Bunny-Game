/* pitch.js — Pitch game: audio engine + rotary dial */
(function (global) {
  'use strict';

  // ── Audio context ────────────────────────────────────────────────────────────
  var _audioCtx = null;

  function getAudioContext() {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  }

  // ── Target tone ──────────────────────────────────────────────────────────────
  var _targetOsc = null;

  function stopTargetTone() {
    if (_targetOsc) {
      try { _targetOsc.stop(); } catch (e) {}
      _targetOsc = null;
    }
  }

  function playTargetTone(frequency, duration) {
    duration = duration !== undefined ? duration : 3.0;
    stopTargetTone();
    var ctx = getAudioContext();
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.6, ctx.currentTime + duration - 0.08);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    _targetOsc = osc;
    osc.onended = function () { if (_targetOsc === osc) _targetOsc = null; };
  }

  // ── Live dial tone ───────────────────────────────────────────────────────────
  var _liveOsc  = null;
  var _liveGain = null;

  function startLiveTone(frequency) {
    stopLiveTone();
    var ctx = getAudioContext();
    _liveOsc  = ctx.createOscillator();
    _liveGain = ctx.createGain();
    _liveOsc.type = 'sine';
    _liveOsc.frequency.setValueAtTime(frequency, ctx.currentTime);
    _liveGain.gain.setValueAtTime(0.4, ctx.currentTime);
    _liveOsc.connect(_liveGain);
    _liveGain.connect(ctx.destination);
    _liveOsc.start();
  }

  function updateLiveToneFrequency(frequency) {
    if (_liveOsc) {
      _liveOsc.frequency.setValueAtTime(frequency, getAudioContext().currentTime);
    }
  }

  function stopLiveTone() {
    if (_liveOsc) {
      var ctx = getAudioContext();
      _liveGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
      _liveOsc.stop(ctx.currentTime + 0.05);
      _liveOsc  = null;
      _liveGain = null;
    }
  }

  // ── Frequency generation ─────────────────────────────────────────────────────
  var LOG_MIN = Math.log(80);
  var LOG_MAX = Math.log(1200);

  function generateTargetFrequency() {
    return Math.round(Math.exp(LOG_MIN + Math.random() * (LOG_MAX - LOG_MIN)));
  }

  function generateSession() {
    return [generateTargetFrequency(), generateTargetFrequency(), generateTargetFrequency()];
  }

  // ── Scoring ──────────────────────────────────────────────────────────────────
  function scoreAccuracy(targetHz, playerHz) {
    var cents = Math.abs(1200 * Math.log2(playerHz / targetHz));
    return Math.max(0, Math.round(100 - (cents / 12)));
  }

  // ── Frequency ↔ normalized position ─────────────────────────────────────────
  function normToFreq(t) {
    return Math.round(Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN)));
  }

  function freqToNorm(hz) {
    return (Math.log(hz) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  }

  // ── Dial drawing (Canvas) ────────────────────────────────────────────────────
  // Knob uses 270° sweep: min at -135° (7 o'clock), max at +135° (5 o'clock)
  var DIAL_RANGE   = 270;  // degrees
  var DIAL_MIN_DEG = -135; // degrees from 12 o'clock, clockwise
  var DIAL_MAX_DEG =  135;

  var _canvas    = null;
  var _logW      = 0;  // logical (CSS) canvas size — set in setupCanvas
  var _hzEl      = null;
  var _dialPos   = 0.5; // normalized 0–1; 0.5 = geometric mean (~310 Hz)
  var _dragging  = false;
  var _lastAngle = null;

  function _toCanvasAngle(degFromTop) {
    // canvas arc: 0 = right, CW. Offset -90° to make 0 = top.
    return (degFromTop - 90) * Math.PI / 180;
  }

  function _drawDial(pos) {
    if (!_canvas) return;
    var ctx = _canvas.getContext('2d');
    var cx  = _logW / 2;
    var cy  = _logW / 2;
    var knobR  = cx * 0.82;
    var trackR = cx * 0.70;

    ctx.clearRect(0, 0, _logW, _logW);

    var curDeg = DIAL_MIN_DEG + pos * DIAL_RANGE;
    var canMin = _toCanvasAngle(DIAL_MIN_DEG);
    var canMax = _toCanvasAngle(DIAL_MAX_DEG);
    var canCur = _toCanvasAngle(curDeg);

    // Outer ambient glow
    var grd = ctx.createRadialGradient(cx, cy, knobR * 0.5, cx, cy, knobR * 1.35);
    grd.addColorStop(0, 'rgba(57,255,20,0)');
    grd.addColorStop(1, 'rgba(57,255,20,0.06)');
    ctx.beginPath();
    ctx.arc(cx, cy, knobR * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Knob body
    ctx.beginPath();
    ctx.arc(cx, cy, knobR, 0, Math.PI * 2);
    ctx.fillStyle = '#141414';
    ctx.fill();
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Track groove (full 270° arc)
    ctx.beginPath();
    ctx.arc(cx, cy, trackR, canMin, canMax);
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Active arc (green portion from min to current)
    if (pos > 0.003) {
      // Glow behind the active arc
      ctx.beginPath();
      ctx.arc(cx, cy, trackR, canMin, canCur);
      ctx.strokeStyle = 'rgba(57,255,20,0.15)';
      ctx.lineWidth = 28;
      ctx.lineCap = 'round';
      ctx.stroke();
      // Main active arc
      ctx.beginPath();
      ctx.arc(cx, cy, trackR, canMin, canCur);
      ctx.strokeStyle = '#39FF14';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Needle
    var curRad   = curDeg * Math.PI / 180;
    var needleR  = knobR * 0.60;
    var nx = cx + needleR * Math.sin(curRad);
    var ny = cy - needleR * Math.cos(curRad);

    // Needle glow
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = 'rgba(57,255,20,0.22)';
    ctx.lineWidth   = 16;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Needle body
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#39FF14';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Centre dot
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#39FF14';
    ctx.fill();

    // Min/max tick marks on the knob rim
    [DIAL_MIN_DEG, DIAL_MAX_DEG].forEach(function (deg) {
      var r = deg * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx + knobR * 0.87 * Math.sin(r), cy - knobR * 0.87 * Math.cos(r));
      ctx.lineTo(cx + knobR * 0.98 * Math.sin(r), cy - knobR * 0.98 * Math.cos(r));
      ctx.strokeStyle = '#404040';
      ctx.lineWidth   = 2;
      ctx.lineCap     = 'butt';
      ctx.stroke();
    });
  }

  function _setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var rect = _canvas.getBoundingClientRect();
    _logW = rect.width;
    _canvas.width  = Math.round(rect.width  * dpr);
    _canvas.height = Math.round(rect.height * dpr);
    _canvas.getContext('2d').scale(dpr, dpr);
  }

  function _updateHzDisplay() {
    if (_hzEl) _hzEl.textContent = normToFreq(_dialPos) + ' Hz';
  }

  // ── Drag interaction ─────────────────────────────────────────────────────────
  function _angleFromCenter(clientX, clientY) {
    var rect = _canvas.getBoundingClientRect();
    var dx = clientX - (rect.left + rect.width  / 2);
    var dy = clientY - (rect.top  + rect.height / 2);
    return Math.atan2(dy, dx); // −π to π
  }

  function _dragStart(clientX, clientY) {
    _dragging   = true;
    _lastAngle  = _angleFromCenter(clientX, clientY);
    startLiveTone(normToFreq(_dialPos));
  }

  function _dragMove(clientX, clientY) {
    if (!_dragging) return;
    var angle = _angleFromCenter(clientX, clientY);

    // Delta angle with wrap-around correction
    var delta = angle - _lastAngle;
    if (delta >  Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    _lastAngle = angle;

    // Accumulate position, clamped to [0, 1]
    _dialPos = Math.max(0, Math.min(1, _dialPos + delta / (DIAL_RANGE * Math.PI / 180)));

    _drawDial(_dialPos);
    _updateHzDisplay();
    updateLiveToneFrequency(normToFreq(_dialPos));
  }

  function _dragEnd() {
    if (!_dragging) return;
    _dragging = false;
    stopLiveTone();
  }

  // ── Public dial API ──────────────────────────────────────────────────────────
  function initDial(canvas, hzEl) {
    _canvas = canvas;
    _hzEl   = hzEl;

    _setupCanvas();
    resetDial();

    // Mouse
    canvas.addEventListener('mousedown', function (e) {
      e.preventDefault();
      _dragStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
      _dragMove(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', _dragEnd);

    // Touch (passive:false lets us call preventDefault to block scroll)
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      _dragStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    window.addEventListener('touchmove', function (e) {
      if (_dragging) {
        e.preventDefault();
        _dragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    window.addEventListener('touchend', _dragEnd);
  }

  function resetDial() {
    _dialPos = 0.5; // geometric centre of log range ≈ 310 Hz
    if (_canvas) _drawDial(_dialPos);
    _updateHzDisplay();
  }

  function getDialFrequency() {
    return normToFreq(_dialPos);
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  global.Pitch = {
    // Audio engine
    getAudioContext:          getAudioContext,
    playTargetTone:           playTargetTone,
    stopTargetTone:           stopTargetTone,
    startLiveTone:            startLiveTone,
    updateLiveToneFrequency:  updateLiveToneFrequency,
    stopLiveTone:             stopLiveTone,
    generateTargetFrequency:  generateTargetFrequency,
    generateSession:          generateSession,
    scoreAccuracy:            scoreAccuracy,
    // Dial
    initDial:                 initDial,
    resetDial:                resetDial,
    getDialFrequency:         getDialFrequency,
    normToFreq:               normToFreq,
    freqToNorm:               freqToNorm,
  };

}(window));
