/* Sky Rush — tiny WebAudio sound effects.
   All sounds are synthesized beeps: no audio files, no network requests.
   The AudioContext is created lazily on the first user gesture, which is
   what browsers require before any sound can play. */
(function () {
  "use strict";

  var ctx = null;
  var muted = false;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === "suspended") { ctx.resume(); }
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return null; }
    ctx = new AC();
    return ctx;
  }

  /* One enveloped oscillator blip. */
  function beep(freq, duration, type, volume, when) {
    if (muted) { return; }
    var ac = ensureContext();
    if (!ac) { return; }
    var t0 = ac.currentTime + (when || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume || 0.18, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /* A short rising sweep, used for golden targets. */
  function sweep(fFrom, fTo, duration, volume) {
    if (muted) { return; }
    var ac = ensureContext();
    if (!ac) { return; }
    var t0 = ac.currentTime;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(fFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(fTo, t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume || 0.2, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  window.SkyAudio = {
    /* Call from any click/tap handler so the context is unlocked. */
    unlock: function () { ensureContext(); },

    hit: function (comboTier) {
      /* Pitch climbs a little as the combo multiplier grows. */
      var base = 520 + Math.min(comboTier, 5) * 60;
      beep(base, 0.09, "square", 0.10);
      beep(base * 1.5, 0.07, "sine", 0.12, 0.02);
    },

    golden: function () { sweep(700, 1500, 0.18, 0.22); },

    decoy: function () {
      beep(160, 0.22, "sawtooth", 0.20);
      beep(110, 0.26, "sawtooth", 0.16, 0.05);
    },

    miss: function () { beep(240, 0.05, "sine", 0.05); },

    tick: function () { beep(880, 0.06, "sine", 0.12); },

    start: function () {
      beep(523, 0.1, "triangle", 0.16);
      beep(659, 0.1, "triangle", 0.16, 0.1);
      beep(784, 0.14, "triangle", 0.18, 0.2);
    },

    end: function () {
      beep(784, 0.12, "triangle", 0.18);
      beep(659, 0.12, "triangle", 0.16, 0.12);
      beep(523, 0.22, "triangle", 0.18, 0.24);
    },

    toggleMute: function () {
      muted = !muted;
      return muted;
    },

    isMuted: function () { return muted; }
  };
})();
