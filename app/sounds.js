"use strict";
/*
 * Car Doctor - example sounds.
 *
 * Every sound is made right here with the Web Audio API (oscillators and
 * filtered noise), so there are no audio files to download, nothing to
 * license, and it works offline. They're rough examples to help someone
 * say "yes, it sounds like that", not recordings.
 */

let AUDIO = null;      // created on the first tap (phones require a tap)
let playing = null;    // { stop(), button } for the sound playing now

function audioContext() {
  if (!AUDIO) AUDIO = new (window.AudioContext || window.webkitAudioContext)();
  if (AUDIO.state === "suspended") AUDIO.resume();
  return AUDIO;
}

// White noise, reused by several sounds.
let NOISE = null;
function noise(ac) {
  if (!NOISE) {
    NOISE = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = NOISE.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = NOISE;
  src.loop = true;
  return src;
}

function filter(ac, type, freq, q = 1) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gainNode(ac, value = 0) {
  const g = ac.createGain();
  g.gain.value = value;
  return g;
}

// A short burst of filtered noise: clicks, ticks, rattles.
function burst(ac, out, t, { freq = 2500, q = 3, len = 0.015, level = 0.8, type = "bandpass" } = {}) {
  const src = noise(ac);
  const f = filter(ac, type, freq, q);
  const g = gainNode(ac);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + len + 0.02);
}

// A low "thump" for clunks.
function thump(ac, out, t, level = 1) {
  const o = ac.createOscillator();
  const g = gainNode(ac);
  o.type = "sine";
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.32);
  burst(ac, out, t, { freq: 350, q: 0.8, len: 0.08, level: level * 0.7, type: "lowpass" });
}

// A steady tone with optional pitch glide and wobble (squeals, whines, hums).
function tone(ac, out, t, dur, { type = "sine", from = 440, to = from, wobble = 0, wobbleRate = 6, level = 0.3, lowpass = 0 } = {}) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.linearRampToValueAtTime(to, t + dur);
  if (wobble) {
    const lfo = ac.createOscillator();
    const depth = gainNode(ac, wobble);
    lfo.frequency.value = wobbleRate;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  const g = gainNode(ac);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.08);
  g.gain.setValueAtTime(level, t + dur - 0.15);
  g.gain.linearRampToValueAtTime(0, t + dur);
  let node = o;
  if (lowpass) node = node.connect(filter(ac, "lowpass", lowpass, 0.7));
  node.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return g;
}

// Makes a gain "pulse" up and down (wub-wub, cranking strokes).
function pulse(ac, param, t, dur, rate, depth) {
  const lfo = ac.createOscillator();
  const g = gainNode(ac, depth);
  lfo.frequency.value = rate;
  lfo.connect(g).connect(param);
  lfo.start(t);
  lfo.stop(t + dur);
}

// Each sound: (audio context, output, start time) -> length in seconds.
const SOUNDS = {
  fast_click(ac, out, t) {
    for (let i = 0; i < 26; i++) burst(ac, out, t + i * 0.075, { freq: 2200, len: 0.02, level: 0.9 });
    return 2.1;
  },
  one_click(ac, out, t) {
    burst(ac, out, t + 0.25, { freq: 1600, q: 2, len: 0.05, level: 1 });
    thump(ac, out, t + 0.25, 0.5);
    return 1.6;
  },
  crank(ac, out, t) {
    const g = tone(ac, out, t, 2.6, { type: "sawtooth", from: 170, to: 180, level: 0.22, lowpass: 900 });
    pulse(ac, g.gain, t, 2.6, 4.5, 0.12);
    return 2.7;
  },
  slow_crank(ac, out, t) {
    const g = tone(ac, out, t, 2.6, { type: "sawtooth", from: 110, to: 95, level: 0.22, lowpass: 700 });
    pulse(ac, g.gain, t, 2.6, 2.2, 0.14);
    return 2.7;
  },
  grind(ac, out, t) {
    const src = noise(ac);
    const f = filter(ac, "bandpass", 900, 1.4);
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(4 * x); }
    shaper.curve = curve;
    const g = gainNode(ac);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.2);
    g.gain.setValueAtTime(0.35, t + 2.2);
    g.gain.linearRampToValueAtTime(0, t + 2.5);
    pulse(ac, g.gain, t, 2.5, 7, 0.15);
    src.connect(f).connect(shaper).connect(g).connect(out);
    src.start(t);
    src.stop(t + 2.6);
    tone(ac, out, t, 2.5, { type: "sawtooth", from: 70, to: 55, level: 0.08, lowpass: 300 });
    return 2.6;
  },
  squeal(ac, out, t) {
    tone(ac, out, t, 2, { from: 2900, to: 2750, wobble: 40, level: 0.12 });
    tone(ac, out, t, 2, { from: 5800, to: 5500, wobble: 80, level: 0.03 });
    return 2.1;
  },
  belt_squeal(ac, out, t) {
    tone(ac, out, t, 2.2, { type: "square", from: 2100, to: 1500, wobble: 60, wobbleRate: 9, level: 0.05, lowpass: 3500 });
    return 2.3;
  },
  hum(ac, out, t) {
    const g = tone(ac, out, t, 3, { type: "sawtooth", from: 85, to: 120, level: 0.3, lowpass: 380 });
    pulse(ac, g.gain, t, 3, 3, 0.12);
    return 3.1;
  },
  tick(ac, out, t) {
    for (let i = 0; i < 26; i++) burst(ac, out, t + i * 0.09, { freq: 4200, q: 5, len: 0.012, level: 0.7, type: "bandpass" });
    tone(ac, out, t, 2.4, { type: "sawtooth", from: 45, to: 45, level: 0.05, lowpass: 200 });
    return 2.5;
  },
  clunk(ac, out, t) {
    thump(ac, out, t + 0.2, 1);
    thump(ac, out, t + 1.2, 0.8);
    return 1.8;
  },
  rattle(ac, out, t) {
    let at = t;
    while (at < t + 2.2) {
      burst(ac, out, at, { freq: 3200, q: 4, len: 0.02, level: 0.3 + Math.random() * 0.5 });
      at += 0.025 + Math.random() * 0.04;
    }
    return 2.3;
  },
  chain_rattle(ac, out, t) {
    let at = t;
    while (at < t + 2.4) {
      const fade = 1 - (at - t) / 2.6;
      burst(ac, out, at, { freq: 2600, q: 3, len: 0.02, level: (0.3 + Math.random() * 0.5) * fade });
      at += 0.02 + Math.random() * 0.03;
    }
    tone(ac, out, t, 3, { type: "sawtooth", from: 40, to: 38, level: 0.07, lowpass: 200 });
    return 3.1;
  },
  whine(ac, out, t) {
    tone(ac, out, t, 2.4, { from: 650, to: 1150, wobble: 6, level: 0.12 });
    tone(ac, out, t, 2.4, { from: 1300, to: 2300, level: 0.03 });
    return 2.5;
  },
  hiss(ac, out, t) {
    const src = noise(ac);
    const f = filter(ac, "highpass", 4200, 0.7);
    const g = gainNode(ac);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.3);
    g.gain.setValueAtTime(0.18, t + 1.9);
    g.gain.linearRampToValueAtTime(0, t + 2.2);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + 2.3);
    return 2.3;
  },
  cv_click(ac, out, t) {
    let gap = 0.3;
    let at = t;
    while (at < t + 2.4) {
      burst(ac, out, at, { freq: 1800, q: 3, len: 0.03, level: 0.9 });
      at += gap;
      gap = Math.max(0.09, gap * 0.85);
    }
    return 2.5;
  },
  chirp(ac, out, t) {
    for (let i = 0; i < 6; i++) tone(ac, out, t + i * 0.38, 0.12, { from: 2300, to: 1700, level: 0.12 });
    return 2.4;
  },
};

// Friendly names for screen readers and the button label.
const SOUND_NAMES = {
  fast_click: "fast clicking", one_click: "one loud click", crank: "cranking", slow_crank: "slow cranking",
  grind: "grinding", squeal: "squealing", belt_squeal: "belt squeal", hum: "humming", tick: "ticking",
  clunk: "clunking", rattle: "rattling", chain_rattle: "startup rattle", whine: "whining", hiss: "hissing",
  cv_click: "clicking while turning", chirp: "squeak-chirp",
};

// Which example sound fits each problem (only ones with a typical sound).
const CAUSE_SOUND = {
  dead_battery: "fast_click", bad_starter: "one_click", fuel_delivery_problem: "crank",
  worn_brake_pads: "squeal", bad_wheel_bearing: "hum", worn_serpentine_belt: "belt_squeal",
  exhaust_leak: "tick", timing_chain_problem: "chain_rattle", worn_cv_axle: "cv_click",
  power_steering_problem: "whine", vacuum_leak: "hiss", worn_u_joint: "chirp", bad_motor_mounts: "clunk",
  worn_suspension: "clunk", catalytic_converter_problem: "rattle", bad_alternator: "whine",
  collapsed_lifter: "tick", cvt_problem: "whine", differential_problem: "hum", turbo_problem: "whine",
};

function stopSound() {
  if (!playing) return;
  playing.stop();
  playing = null;
}

function playSound(name, button) {
  const same = playing && playing.button === button;
  stopSound();
  if (same || !SOUNDS[name]) return; // second tap = stop
  const ac = audioContext();
  const out = gainNode(ac, 0.9);
  out.connect(ac.destination);
  const length = SOUNDS[name](ac, out, ac.currentTime + 0.05);
  button.classList.add("is-playing");
  button.setAttribute("aria-pressed", "true");
  const timer = setTimeout(() => { if (playing && playing.button === button) stopSound(); }, (length + 0.2) * 1000);
  playing = {
    button,
    stop() {
      clearTimeout(timer);
      out.gain.setTargetAtTime(0, ac.currentTime, 0.02);
      setTimeout(() => out.disconnect(), 120);
      button.classList.remove("is-playing");
      button.setAttribute("aria-pressed", "false");
    },
  };
}

// A small round "listen" button. Plays the example; tap again to stop.
function soundButton(name, { label = true } = {}) {
  const btn = el("button", {
    class: "listen" + (label ? "" : " icon-only"), type: "button", "aria-pressed": "false",
    "aria-label": `Play an example of ${SOUND_NAMES[name] || "this sound"}`,
    onclick: (e) => { e.stopPropagation(); playSound(name, btn); },
  },
  el("span", { class: "listen-icon", "aria-hidden": "true" }, el("span"), el("span"), el("span")),
  label ? el("span", { class: "listen-text" }, "Listen") : null);
  return btn;
}
