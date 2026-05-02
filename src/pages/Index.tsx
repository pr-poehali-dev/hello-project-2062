import { useEffect, useRef, useState, useCallback } from "react";

type GameMode = "menu" | "campaign_select" | "sandbox_select" | "multiplayer_select" | "playing";
type WeaponType = "asteroid" | "laser" | "nuke" | "blackhole";
type PlaySubMode = "campaign" | "sandbox" | "multiplayer";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  radius: number; color: string; alpha: number;
  life: number; maxLife: number;
  type: "debris" | "dust" | "fire";
  mass: number;
}

interface Planet {
  x: number; y: number; radius: number;
  health: number; maxHealth: number;
  color: string; atmosphereColor: string; name: string;
  planetType: string;
  mass: number;
  craters: { x: number; y: number; r: number; depth: number }[];
  cracks: { x1: number; y1: number; x2: number; y2: number; width: number }[];
  chunks: { x: number; y: number; vx: number; vy: number; r: number; angle: number; va: number; color: string; alpha: number }[];
  destroyed: boolean;
  shakeX: number; shakeY: number;
  textureCanvas: HTMLCanvasElement | null;
  rotation: number;
}

interface Star {
  x: number; y: number; size: number; brightness: number; twinkle: number;
  vx: number; vy: number; layer: number; // layer 0=far 1=mid 2=near
}

interface CampaignLevel {
  id: number; name: string; description: string;
  planetName: string; planetRadius: number; planetHealth: number;
  planetColor: string; atmosphereColor: string; planetType: string;
  weapons: WeaponType[]; completed: boolean; stars: number;
}

const CAMPAIGN_LEVELS: CampaignLevel[] = [
  { id: 1, name: "Красная угроза", description: "Уничтожьте Марс, пока его атмосфера не заряжена", planetName: "Марс", planetRadius: 80, planetHealth: 300, planetColor: "#c1440e", atmosphereColor: "#ff6b35", planetType: "mars", weapons: ["asteroid"], completed: false, stars: 0 },
  { id: 2, name: "Ледяная твердь", description: "Лёд Европы выдержит лазер. Нужно что-то мощнее", planetName: "Европа", planetRadius: 70, planetHealth: 500, planetColor: "#b8d4e8", atmosphereColor: "#e0f0ff", planetType: "ice", weapons: ["asteroid", "laser"], completed: false, stars: 0 },
  { id: 3, name: "Великан", description: "Юпитер — газовый гигант. Потребуется ядерный удар", planetName: "Юпитер", planetRadius: 130, planetHealth: 1200, planetColor: "#c88b3a", atmosphereColor: "#ffb347", planetType: "gas", weapons: ["asteroid", "laser", "nuke"], completed: false, stars: 0 },
  { id: 4, name: "Тёмная материя", description: "Сингулярность поглотит всё. Чёрная дыра против Нептуна", planetName: "Нептун", planetRadius: 100, planetHealth: 800, planetColor: "#3f6fbf", atmosphereColor: "#6a9fd8", planetType: "neptune", weapons: ["asteroid", "laser", "nuke", "blackhole"], completed: false, stars: 0 },
  { id: 5, name: "Конец Света", description: "Земля. Финальная цель. Уничтожьте колыбель человечества", planetName: "Земля", planetRadius: 90, planetHealth: 1000, planetColor: "#2e7d32", atmosphereColor: "#81c784", planetType: "earth", weapons: ["asteroid", "laser", "nuke", "blackhole"], completed: false, stars: 0 },
];

const WEAPONS = {
  asteroid: { name: "Астероид", damage: 80, icon: "⚫", description: "Классический удар" },
  laser: { name: "Лазер", damage: 120, icon: "🔴", description: "Точечный удар" },
  nuke: { name: "Ядерный удар", damage: 300, icon: "☢️", description: "Массовое разрушение" },
  blackhole: { name: "Чёрная дыра", damage: 500, icon: "🌑", description: "Абсолютное уничтожение" },
};

const SANDBOX_PLANETS = [
  { planetName: "Марс", planetRadius: 80, planetHealth: 500, planetColor: "#c1440e", atmosphereColor: "#ff6b35", planetType: "mars" },
  { planetName: "Земля", planetRadius: 90, planetHealth: 700, planetColor: "#2e7d32", atmosphereColor: "#81c784", planetType: "earth" },
  { planetName: "Юпитер", planetRadius: 130, planetHealth: 1500, planetColor: "#c88b3a", atmosphereColor: "#ffb347", planetType: "gas" },
  { planetName: "Луна", planetRadius: 60, planetHealth: 250, planetColor: "#aaaaaa", atmosphereColor: "#cccccc", planetType: "moon" },
  { planetName: "Кристальный", planetRadius: 75, planetHealth: 600, planetColor: "#00bcd4", atmosphereColor: "#80deea", planetType: "crystal" },
];

// ── Процедурная генерация текстуры планеты ──────────────────────────────────
function noise2d(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.3) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise2d(x * freq, y * freq, seed + i) * amp;
    max += amp; amp *= 0.5; freq *= 2.1;
  }
  return val / max;
}

function generatePlanetTexture(radius: number, planetType: string, color: string): HTMLCanvasElement {
  const size = radius * 2;
  const tc = document.createElement("canvas");
  tc.width = size; tc.height = size;
  const ctx = tc.getContext("2d")!;
  const seed = color.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const cx = radius, cy = radius;

  if (planetType === "gas") {
    // Горизонтальные полосы Юпитера
    const rgb = hexToRgbFn(color);
    for (let y = 0; y < size; y++) {
      const bandPhase = fbm(0, y / size * 4, seed) * 2 - 1;
      const turbulence = fbm(bandPhase * 3, y / size * 8, seed + 10) * 0.15;
      const r2 = rgb.r + Math.floor(bandPhase * 60 + turbulence * 40);
      const g2 = rgb.g + Math.floor(bandPhase * 30 + turbulence * 20);
      const b2 = rgb.b + Math.floor(bandPhase * 20 + turbulence * 10);
      ctx.fillStyle = `rgb(${clamp(r2, 0, 255)},${clamp(g2, 0, 255)},${clamp(b2, 0, 255)})`;
      ctx.fillRect(0, y, size, 1);
    }
    // Большое красное пятно
    const spotX = cx + radius * 0.3;
    const spotY = cy + radius * 0.1;
    const spotGrad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, radius * 0.22);
    spotGrad.addColorStop(0, "rgba(180,60,20,0.9)");
    spotGrad.addColorStop(0.5, "rgba(200,80,30,0.6)");
    spotGrad.addColorStop(1, "rgba(200,80,30,0)");
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.ellipse(spotX, spotY, radius * 0.22, radius * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

  } else if (planetType === "earth") {
    // Океан
    ctx.fillStyle = "#1a5276";
    ctx.fillRect(0, 0, size, size);
    // Континенты через fbm
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const nx = (px - cx) / radius;
        const ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.98) continue;
        const n = fbm(nx * 2.5 + 1, ny * 2.5 + 1, seed);
        if (n > 0.52) {
          const green = 40 + Math.floor(n * 120);
          ctx.fillStyle = `rgb(20,${green},30)`;
          ctx.fillRect(px, py, 1, 1);
        } else if (n > 0.48) {
          ctx.fillStyle = "#c2b280";
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }
    // Полярные шапки
    for (let px = 0; px < size; px++) {
      for (let py = 0; py < size; py++) {
        const nx = (px - cx) / radius;
        const ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.98) continue;
        const poleN = fbm(nx * 4, py / size * 2, seed + 99);
        if (py < size * 0.12 + poleN * size * 0.05) { ctx.fillStyle = "rgba(240,248,255,0.9)"; ctx.fillRect(px, py, 1, 1); }
        if (py > size * 0.88 - poleN * size * 0.04) { ctx.fillStyle = "rgba(240,248,255,0.85)"; ctx.fillRect(px, py, 1, 1); }
      }
    }

  } else if (planetType === "mars") {
    const rgb = hexToRgbFn(color);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const nx = (px - cx) / radius;
        const ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.98) continue;
        const n = fbm(nx * 3, ny * 3, seed);
        const r2 = rgb.r + Math.floor(n * 60 - 30);
        const g2 = rgb.g + Math.floor(n * 20 - 10);
        const b2 = rgb.b + Math.floor(n * 10 - 5);
        ctx.fillStyle = `rgb(${clamp(r2,0,255)},${clamp(g2,0,255)},${clamp(b2,0,255)})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
    // Valles Marineris (canyon)
    ctx.strokeStyle = "rgba(80,20,10,0.6)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.5, cy + radius * 0.05);
    ctx.bezierCurveTo(cx - radius * 0.2, cy - radius * 0.1, cx + radius * 0.2, cy + radius * 0.2, cx + radius * 0.55, cy + radius * 0.1);
    ctx.stroke();
    // Polar cap
    for (let px = 0; px < size; px++) {
      const pn = fbm(px / size * 6, 0, seed + 5);
      const capH = size * 0.1 + pn * size * 0.05;
      for (let py = 0; py < capH; py++) {
        const nx = (px - cx) / radius, ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.96) continue;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(px, py, 1, 1);
      }
    }

  } else if (planetType === "ice") {
    ctx.fillStyle = "#d0e8f0";
    ctx.fillRect(0, 0, size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const nx = (px - cx) / radius, ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.98) continue;
        const n = fbm(nx * 5, ny * 5, seed);
        if (n > 0.55) { ctx.fillStyle = `rgba(100,160,200,${(n - 0.55) * 2})`; ctx.fillRect(px, py, 1, 1); }
        if (n < 0.42) { ctx.fillStyle = `rgba(255,255,255,${(0.42 - n) * 3})`; ctx.fillRect(px, py, 1, 1); }
      }
    }
    // Ice cracks
    ctx.strokeStyle = "rgba(150,200,230,0.5)";
    for (let i = 0; i < 8; i++) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      let lx = cx + (Math.sin(i * 1.3) * radius * 0.7);
      let ly = cy + (Math.cos(i * 1.7) * radius * 0.7);
      ctx.moveTo(lx, ly);
      for (let s = 0; s < 5; s++) {
        lx += (Math.random() - 0.5) * radius * 0.4;
        ly += (Math.random() - 0.5) * radius * 0.4;
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    }

  } else if (planetType === "neptune") {
    for (let py = 0; py < size; py++) {
      const bandN = fbm(0, py / size * 6, seed) * 0.5;
      const rgb2 = { r: 20 + Math.floor(bandN * 40), g: 60 + Math.floor(bandN * 80), b: 160 + Math.floor(bandN * 95) };
      ctx.fillStyle = `rgb(${rgb2.r},${rgb2.g},${rgb2.b})`;
      ctx.fillRect(0, py, size, 1);
    }
    const stormGrad = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, 0, cx - radius * 0.2, cy - radius * 0.2, radius * 0.25);
    stormGrad.addColorStop(0, "rgba(180,220,255,0.7)");
    stormGrad.addColorStop(1, "rgba(180,220,255,0)");
    ctx.fillStyle = stormGrad;
    ctx.beginPath();
    ctx.ellipse(cx - radius * 0.2, cy - radius * 0.2, radius * 0.25, radius * 0.18, 0.3, 0, Math.PI * 2);
    ctx.fill();

  } else if (planetType === "moon") {
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const nx = (px - cx) / radius, ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.98) continue;
        const n = fbm(nx * 4, ny * 4, seed);
        const v = 120 + Math.floor(n * 80);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
    for (let i = 0; i < 10; i++) {
      const mcx = cx + (fbm(i, 0, seed) * 2 - 1) * radius * 0.7;
      const mcy = cy + (fbm(0, i, seed + 1) * 2 - 1) * radius * 0.7;
      const mr = 4 + fbm(i, i, seed + 2) * 12;
      const mg = ctx.createRadialGradient(mcx, mcy, 0, mcx, mcy, mr);
      mg.addColorStop(0, "rgba(60,60,60,0.8)");
      mg.addColorStop(0.6, "rgba(80,80,80,0.4)");
      mg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mcx, mcy, mr, 0, Math.PI * 2);
      ctx.fill();
    }

  } else if (planetType === "crystal") {
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const nx = (px - cx) / radius, ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.98) continue;
        const n = fbm(nx * 6, ny * 6, seed);
        const r2 = 0 + Math.floor(n * 80);
        const g2 = 150 + Math.floor(n * 80);
        const b2 = 180 + Math.floor(n * 75);
        ctx.fillStyle = `rgb(${r2},${g2},${b2})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
    // Crystal facets
    ctx.strokeStyle = "rgba(180,255,255,0.4)";
    for (let i = 0; i < 12; i++) {
      const a1 = (i / 12) * Math.PI * 2;
      const a2 = ((i + 0.5) / 12) * Math.PI * 2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius);
      ctx.lineTo(cx + Math.cos(a2) * radius * 0.8, cy + Math.sin(a2) * radius * 0.8);
      ctx.stroke();
    }
  } else {
    const rgb = hexToRgbFn(color);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const nx = (px - cx) / radius, ny = (py - cy) / radius;
        if (nx * nx + ny * ny > 0.98) continue;
        const n = fbm(nx * 3, ny * 3, seed);
        ctx.fillStyle = `rgb(${clamp(rgb.r + Math.floor(n * 60 - 30), 0, 255)},${clamp(rgb.g + Math.floor(n * 60 - 30), 0, 255)},${clamp(rgb.b + Math.floor(n * 60 - 30), 0, 255)})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
  return tc;
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function hexToRgbFn(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

// ── Web Audio ────────────────────────────────────────────────────────────────
function createAudio() {
  const AudioCtxCtor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtxCtor!();

  // мастер-гейн для фоновой музыки
  const musicGain = ctx.createGain();
  musicGain.gain.value = 0.18;
  musicGain.connect(ctx.destination);

  let musicNodes: AudioNode[] = [];
  let musicRunning = false;

  // ── Фоновая ambient-музыка: синтез из дрона + арпеджио ──
  function startMusic() {
    if (musicRunning) return;
    musicRunning = true;
    ctx.resume();

    // Дроновый слой — два детюнированных осциллятора
    const drone1 = ctx.createOscillator();
    const drone2 = ctx.createOscillator();
    const droneGain = ctx.createGain();
    const droneFilter = ctx.createBiquadFilter();
    drone1.type = "sine"; drone1.frequency.value = 55;
    drone2.type = "sine"; drone2.frequency.value = 55.4; // небольшой детюн — биения
    droneFilter.type = "lowpass"; droneFilter.frequency.value = 300;
    droneGain.gain.value = 0.5;
    drone1.connect(droneFilter); drone2.connect(droneFilter);
    droneFilter.connect(droneGain); droneGain.connect(musicGain);
    drone1.start(); drone2.start();
    musicNodes.push(drone1, drone2, droneGain, droneFilter);

    // Пульсирующий пад
    const pad = ctx.createOscillator();
    const padGain = ctx.createGain();
    const padFilter = ctx.createBiquadFilter();
    pad.type = "sawtooth"; pad.frequency.value = 110;
    padFilter.type = "bandpass"; padFilter.frequency.value = 400; padFilter.Q.value = 3;
    padGain.gain.value = 0;
    // LFO для пада — медленная пульсация
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.15; lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain); lfoGain.connect(padGain.gain);
    pad.connect(padFilter); padFilter.connect(padGain); padGain.connect(musicGain);
    lfo.start(); pad.start();
    musicNodes.push(pad, padGain, padFilter, lfo, lfoGain);

    // Арпеджио из высоких нот — космический звон
    const arpNotes = [220, 277, 330, 415, 440, 554, 660, 554, 440, 415, 330, 277];
    let arpIdx = 0;
    const playArp = () => {
      if (!musicRunning) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = arpNotes[arpIdx % arpNotes.length];
      arpIdx++;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
      osc.connect(g); g.connect(musicGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.8);
      setTimeout(playArp, 600 + Math.random() * 400);
    };
    playArp();

    // Тихий шум как "космическое эхо"
    const bufLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = (Math.random() * 2 - 1);
    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = noiseBuf; noiseNode.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass"; noiseFilter.frequency.value = 80; noiseFilter.Q.value = 0.5;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.06;
    noiseNode.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(musicGain);
    noiseNode.start();
    musicNodes.push(noiseNode, noiseFilter, noiseGain);
  }

  function stopMusic() {
    musicRunning = false;
    musicNodes.forEach(n => { try { (n as AudioScheduledSourceNode).stop?.(); } catch(e){ void e; } });
    musicNodes = [];
  }

  function setMusicVolume(v: number) {
    musicGain.gain.linearRampToValueAtTime(v, ctx.currentTime + 1.5);
  }

  // ── Музыка победы ─────────────────────────────────────────────────────────
  function playVictoryMusic() {
    stopMusic();
    const vGain = ctx.createGain();
    vGain.gain.value = 0;
    vGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.3);
    vGain.connect(ctx.destination);

    // Победный аккорд + мелодия
    const victoryMelody = [
      { freq: 523, t: 0, dur: 0.4 },
      { freq: 659, t: 0.15, dur: 0.4 },
      { freq: 784, t: 0.3, dur: 0.5 },
      { freq: 1047, t: 0.55, dur: 1.2 },
      { freq: 880, t: 0.8, dur: 0.4 },
      { freq: 784, t: 1.05, dur: 0.4 },
      { freq: 1047, t: 1.3, dur: 1.8 },
    ];
    victoryMelody.forEach(({ freq, t, dur }) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(0.4, ctx.currentTime + t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      o.connect(g); g.connect(vGain);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + dur + 0.1);
    });

    // Бас под мелодию
    const bassNotes = [130, 165, 196, 262];
    bassNotes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = freq;
      const t = i * 0.4;
      g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
      o.connect(g); g.connect(vGain);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });

    // Финальный аккорд с реверберацией (convolver)
    setTimeout(() => {
      const chord = [523, 659, 784, 1047];
      chord.forEach(freq => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.2, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);
        o.connect(g); g.connect(vGain);
        o.start(); o.stop(ctx.currentTime + 3);
      });
    }, 1600);
  }

  function playExplosion(size: number = 1) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * (8 - size * 2)) * (0.5 + size * 0.3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8 * size, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200 + size * 300;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start();
  }

  function playLaser() {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(2000, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  }

  function playNuke() {
    playExplosion(3);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1.2);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 1.2);
  }

  function playBlackhole() {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(40, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(10, ctx.currentTime + 2);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 2);
  }

  function playDestruction() {
    playExplosion(4);
    setTimeout(() => playExplosion(3), 200);
    setTimeout(() => playExplosion(2), 450);
  }

  return {
    playExplosion, playLaser, playNuke, playBlackhole, playDestruction,
    startMusic, stopMusic, setMusicVolume, playVictoryMusic,
    resume: () => ctx.resume(),
  };
}

// ── Звёзды ───────────────────────────────────────────────────────────────────
function createStars(count: number, w: number, h: number): Star[] {
  return Array.from({ length: count }, (_, i) => {
    const layer = i < count * 0.6 ? 0 : i < count * 0.85 ? 1 : 2;
    const speeds = [0.05, 0.15, 0.35];
    const angle = Math.random() * Math.PI * 2;
    const spd = speeds[layer] * (0.5 + Math.random() * 0.5);
    return {
      x: Math.random() * w, y: Math.random() * h,
      size: layer === 0 ? Math.random() * 1 + 0.3 : layer === 1 ? Math.random() * 1.5 + 0.5 : Math.random() * 2.5 + 1,
      brightness: 0.3 + Math.random() * 0.7,
      twinkle: Math.random() * Math.PI * 2,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd * 0.4 + 0.02, // лёгкий дрейф вниз
      layer,
    };
  });
}

function createPlanet(x: number, y: number, levelData: { planetRadius: number; planetHealth: number; planetColor: string; atmosphereColor: string; planetName: string; planetType: string }): Planet {
  const tc = generatePlanetTexture(levelData.planetRadius, levelData.planetType, levelData.planetColor);
  return {
    x, y,
    radius: levelData.planetRadius,
    health: levelData.planetHealth,
    maxHealth: levelData.planetHealth,
    color: levelData.planetColor,
    atmosphereColor: levelData.atmosphereColor,
    name: levelData.planetName,
    planetType: levelData.planetType,
    mass: levelData.planetRadius * 100,
    craters: [], cracks: [], chunks: [],
    destroyed: false, shakeX: 0, shakeY: 0,
    textureCanvas: tc,
    rotation: 0,
  };
}

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const audioRef = useRef<ReturnType<typeof createAudio> | null>(null);
  const stateRef = useRef({
    particles: [] as Particle[],
    planet: null as Planet | null,
    stars: [] as Star[],
    time: 0,
    blackholeActive: false,
    blackholeX: 0, blackholeY: 0, blackholeRadius: 0,
    shockwaves: [] as { x: number; y: number; r: number; maxR: number; alpha: number }[],
    laserBeam: null as { x1: number; y1: number; x2: number; y2: number; alpha: number; width: number } | null,
    weaponAmmo: { asteroid: 10, laser: 5, nuke: 2, blackhole: 1 } as Record<WeaponType, number>,
    score: 0,
    playSubMode: "campaign" as PlaySubMode,
  });

  const [gameMode, setGameMode] = useState<GameMode>("menu");
  const [playSubMode, setPlaySubMode] = useState<PlaySubMode>("campaign");
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>("asteroid");
  const [campaignLevels, setCampaignLevels] = useState<CampaignLevel[]>(CAMPAIGN_LEVELS);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [planetHealth, setPlanetHealth] = useState(100);
  const [score, setScore] = useState(0);
  const [ammo, setAmmo] = useState<Record<WeaponType, number>>({ asteroid: 10, laser: 5, nuke: 2, blackhole: 1 });
  const [victory, setVictory] = useState(false);
  const [sandboxPlanetType, setSandboxPlanetType] = useState(0);
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  const [p2score, setP2score] = useState(0);
  const [isP2Turn, setIsP2Turn] = useState(false);
  const [multiRound, setMultiRound] = useState(1);
  const [multiPlanet, setMultiPlanet] = useState(0);

  // Инициализация аудио при первом взаимодействии
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = createAudio();
    }
    audioRef.current.resume();
  }, []);

  const initPlanet = useCallback((levelData: typeof SANDBOX_PLANETS[0], canvasW: number, canvasH: number) => {
    const p = createPlanet(canvasW / 2, canvasH / 2, levelData);
    stateRef.current.planet = p;
    stateRef.current.particles = [];
    stateRef.current.blackholeActive = false;
    stateRef.current.shockwaves = [];
    stateRef.current.laserBeam = null;
    stateRef.current.score = 0;
    setScore(0);
    setPlanetHealth(100);
    setVictory(false);
  }, []);

  const spawnParticles = useCallback((x: number, y: number, count: number, weapon: WeaponType, planetColor: string) => {
    const s = stateRef.current;
    const rgb = hexToRgbFn(planetColor);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 8 + 2) * (weapon === "nuke" ? 3 : weapon === "blackhole" ? 5 : 1);
      const type: Particle["type"] = Math.random() < 0.3 ? "fire" : Math.random() < 0.5 ? "dust" : "debris";
      s.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 8 + 2,
        color: type === "fire"
          ? `rgb(255,${Math.floor(Math.random() * 150 + 50)},0)`
          : `rgb(${clamp(rgb.r + Math.floor(Math.random() * 40 - 20), 0, 255)},${clamp(rgb.g + Math.floor(Math.random() * 40 - 20), 0, 255)},${clamp(rgb.b + Math.floor(Math.random() * 40 - 20), 0, 255)})`,
        alpha: 1,
        life: 60 + Math.random() * 120,
        maxLife: 60 + Math.random() * 120,
        type, mass: Math.random() * 2 + 0.5,
      });
    }
  }, []);

  const applyDamage = useCallback((clickX: number, clickY: number, weapon: WeaponType) => {
    const s = stateRef.current;
    const planet = s.planet;
    if (!planet || planet.destroyed) return;

    const dx = clickX - planet.x;
    const dy = clickY - planet.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > planet.radius * 1.5) return;

    const wData = WEAPONS[weapon];
    let actualDamage = wData.damage;
    const audio = audioRef.current;

    if (weapon === "asteroid") {
      const impact = Math.max(0, 1 - dist / (planet.radius * 1.2));
      actualDamage *= (0.5 + impact * 0.5);
      planet.craters.push({ x: dx, y: dy, r: 15 + Math.random() * 20, depth: impact });
      spawnParticles(clickX, clickY, 40, weapon, planet.color);
      planet.shakeX = (Math.random() - 0.5) * 20;
      planet.shakeY = (Math.random() - 0.5) * 20;
      s.shockwaves.push({ x: clickX, y: clickY, r: 10, maxR: 80, alpha: 0.8 });
      audio?.playExplosion(1);
    } else if (weapon === "laser") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      s.laserBeam = { x1: Math.random() > 0.5 ? 0 : canvas.width, y1: 0, x2: clickX, y2: clickY, alpha: 1, width: 6 };
      planet.craters.push({ x: dx, y: dy, r: 8 + Math.random() * 12, depth: 1 });
      spawnParticles(clickX, clickY, 60, weapon, planet.color);
      planet.shakeX = (Math.random() - 0.5) * 15;
      planet.shakeY = (Math.random() - 0.5) * 15;
      audio?.playLaser();
    } else if (weapon === "nuke") {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * planet.radius * 0.8;
        planet.craters.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: 20 + Math.random() * 30, depth: 1 });
        const cx2 = planet.x + Math.cos(a) * r;
        const cy2 = planet.y + Math.sin(a) * r;
        s.shockwaves.push({ x: cx2, y: cy2, r: 5, maxR: 120, alpha: 1 });
        spawnParticles(cx2, cy2, 30, weapon, planet.color);
      }
      planet.shakeX = (Math.random() - 0.5) * 40;
      planet.shakeY = (Math.random() - 0.5) * 40;
      spawnParticles(clickX, clickY, 150, weapon, planet.color);
      audio?.playNuke();
    } else if (weapon === "blackhole") {
      s.blackholeActive = true;
      s.blackholeX = clickX; s.blackholeY = clickY; s.blackholeRadius = 0;
      spawnParticles(clickX, clickY, 200, weapon, planet.color);
      audio?.playBlackhole();
    }

    const cracks = Math.floor(actualDamage / 50) + 1;
    for (let c = 0; c < cracks; c++) {
      const a = Math.random() * Math.PI * 2;
      const len = 20 + Math.random() * 60;
      planet.cracks.push({ x1: dx, y1: dy, x2: dx + Math.cos(a) * len, y2: dy + Math.sin(a) * len, width: 1 + Math.random() * 2 });
    }

    planet.health = Math.max(0, planet.health - actualDamage);
    const pct = (planet.health / planet.maxHealth) * 100;
    setPlanetHealth(pct);
    s.score += Math.floor(actualDamage * 2);
    setScore(s.score);

    if (planet.health <= 0 && !planet.destroyed) {
      planet.destroyed = true;
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * planet.radius * 0.6 + planet.radius * 0.2;
        planet.chunks.push({
          x: planet.x + Math.cos(a) * r * 0.5,
          y: planet.y + Math.sin(a) * r * 0.5,
          vx: Math.cos(a) * (Math.random() * 4 + 1),
          vy: Math.sin(a) * (Math.random() * 4 + 1),
          r: Math.random() * 30 + 15,
          angle: 0, va: (Math.random() - 0.5) * 0.1,
          color: planet.color, alpha: 1,
        });
      }
      spawnParticles(planet.x, planet.y, 300, "nuke", planet.color);
      s.shockwaves.push({ x: planet.x, y: planet.y, r: 10, maxR: 300, alpha: 1 });
      audio?.playDestruction();
      audio?.setMusicVolume(0.04);
      setTimeout(() => { audioRef.current?.playVictoryMusic(); setVictory(true); }, 2000);
    }
  }, [spawnParticles]);

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = stateRef.current;
    s.time++;

    ctx.fillStyle = "#000008";
    ctx.fillRect(0, 0, w, h);

    // ── Движущиеся туманности (2 слоя, дрейфуют в разные стороны) ──
    const t = s.time;
    const nx1 = w * 0.25 + Math.sin(t * 0.0008) * w * 0.12;
    const ny1 = h * 0.3 + Math.cos(t * 0.0006) * h * 0.1;
    const neb1 = ctx.createRadialGradient(nx1, ny1, 0, nx1, ny1, w * 0.45);
    neb1.addColorStop(0, "rgba(30,0,70,0.18)");
    neb1.addColorStop(0.5, "rgba(10,0,40,0.08)");
    neb1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = neb1; ctx.fillRect(0, 0, w, h);

    const nx2 = w * 0.72 + Math.cos(t * 0.0007) * w * 0.1;
    const ny2 = h * 0.65 + Math.sin(t * 0.0009) * h * 0.08;
    const neb2 = ctx.createRadialGradient(nx2, ny2, 0, nx2, ny2, w * 0.35);
    neb2.addColorStop(0, "rgba(0,20,60,0.14)");
    neb2.addColorStop(0.5, "rgba(0,5,30,0.06)");
    neb2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = neb2; ctx.fillRect(0, 0, w, h);

    // Третья туманность — пурпурная, медленная
    const nx3 = w * 0.5 + Math.sin(t * 0.0004 + 1.2) * w * 0.2;
    const ny3 = h * 0.45 + Math.cos(t * 0.0005 + 0.8) * h * 0.15;
    const neb3 = ctx.createRadialGradient(nx3, ny3, 0, nx3, ny3, w * 0.38);
    neb3.addColorStop(0, "rgba(50,0,80,0.1)");
    neb3.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = neb3; ctx.fillRect(0, 0, w, h);

    // ── Движущиеся звёзды (параллакс) ──
    s.stars.forEach(star => {
      // движение
      star.x += star.vx;
      star.y += star.vy;
      // wrap around
      if (star.x < -5) star.x = w + 5;
      if (star.x > w + 5) star.x = -5;
      if (star.y < -5) star.y = h + 5;
      if (star.y > h + 5) star.y = -5;

      star.twinkle += 0.025 + star.layer * 0.01;
      const alpha = (0.35 + 0.65 * Math.abs(Math.sin(star.twinkle))) * star.brightness;
      // ближние звёзды — немного голубоватые, дальние — белые
      const hue = star.layer === 2 ? `rgba(200,220,255,${alpha})` : `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = hue;
      ctx.fill();
      // крест-блик для ярких близких звёзд
      if (star.layer === 2 && star.brightness > 0.75) {
        ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.3})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(star.x - star.size * 2.5, star.y);
        ctx.lineTo(star.x + star.size * 2.5, star.y);
        ctx.moveTo(star.x, star.y - star.size * 2.5);
        ctx.lineTo(star.x, star.y + star.size * 2.5);
        ctx.stroke();
      }
    });

    const planet = s.planet;

    // Blackhole
    if (s.blackholeActive) {
      s.blackholeRadius += 2;
      if (s.blackholeRadius > 80) s.blackholeRadius -= 0.5;
      const bGrad = ctx.createRadialGradient(s.blackholeX, s.blackholeY, 0, s.blackholeX, s.blackholeY, s.blackholeRadius * 3);
      bGrad.addColorStop(0, "rgba(0,0,0,1)");
      bGrad.addColorStop(0.3, "rgba(60,0,120,0.8)");
      bGrad.addColorStop(0.6, "rgba(120,0,180,0.4)");
      bGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(s.blackholeX, s.blackholeY, s.blackholeRadius * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.blackholeX, s.blackholeY, s.blackholeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const dg = ctx.createRadialGradient(s.blackholeX, s.blackholeY, s.blackholeRadius * 0.9, s.blackholeX, s.blackholeY, s.blackholeRadius * (1.5 + i * 0.3));
        dg.addColorStop(0, `rgba(${150 + i * 30},50,200,0.6)`);
        dg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.arc(s.blackholeX, s.blackholeY, s.blackholeRadius * (1.5 + i * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
      if (planet && !planet.destroyed) {
        const bx = s.blackholeX - planet.x, by = s.blackholeY - planet.y;
        const bd = Math.sqrt(bx * bx + by * by);
        const pull = Math.min(8, 5000 / (bd * bd + 1));
        planet.x += (bx / bd) * pull;
        planet.y += (by / bd) * pull;
      }
    }

    // Shockwaves
    s.shockwaves = s.shockwaves.filter(sw => sw.alpha > 0);
    s.shockwaves.forEach(sw => {
      sw.r += (sw.maxR - sw.r) * 0.08 + 2;
      sw.alpha -= 0.015;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,200,100,${sw.alpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // Laser
    if (s.laserBeam) {
      s.laserBeam.alpha -= 0.04;
      if (s.laserBeam.alpha <= 0) { s.laserBeam = null; }
      else {
        const lb = s.laserBeam;
        ctx.save();
        ctx.shadowColor = "#ff0040"; ctx.shadowBlur = 30;
        ctx.strokeStyle = `rgba(255,0,64,${lb.alpha})`;
        ctx.lineWidth = lb.width;
        ctx.beginPath(); ctx.moveTo(lb.x1, lb.y1); ctx.lineTo(lb.x2, lb.y2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${lb.alpha * 0.8})`;
        ctx.lineWidth = lb.width * 0.3;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Planet
    if (planet) {
      planet.shakeX *= 0.85; planet.shakeY *= 0.85;
      planet.rotation += 0.002;
      const px = planet.x + planet.shakeX;
      const py = planet.y + planet.shakeY;

      if (!planet.destroyed) {
        const healthRatio = planet.health / planet.maxHealth;

        // Atmosphere glow
        const rgb = hexToRgbFn(planet.atmosphereColor);
        const atmoGrad = ctx.createRadialGradient(px, py, planet.radius * 0.85, px, py, planet.radius * 1.35);
        atmoGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.35 * healthRatio})`);
        atmoGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = atmoGrad;
        ctx.beginPath(); ctx.arc(px, py, planet.radius * 1.35, 0, Math.PI * 2); ctx.fill();

        // Texture with rotation clipping
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, planet.radius, 0, Math.PI * 2);
        ctx.clip();
        if (planet.textureCanvas) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(planet.rotation);
          ctx.drawImage(planet.textureCanvas, -planet.radius, -planet.radius);
          ctx.restore();
        }

        // Craters overlay
        planet.craters.forEach(crater => {
          const craterGrad = ctx.createRadialGradient(
            px + crater.x, py + crater.y, 0,
            px + crater.x, py + crater.y, crater.r
          );
          craterGrad.addColorStop(0, `rgba(0,0,0,${0.65 * crater.depth})`);
          craterGrad.addColorStop(0.7, `rgba(0,0,0,${0.3 * crater.depth})`);
          craterGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = craterGrad;
          ctx.beginPath();
          ctx.arc(px + crater.x, py + crater.y, crater.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px + crater.x - crater.r * 0.2, py + crater.y - crater.r * 0.2, crater.r * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fill();
        });

        // Cracks
        planet.cracks.forEach(crack => {
          ctx.beginPath();
          ctx.moveTo(px + crack.x1, py + crack.y1);
          ctx.lineTo(px + crack.x2, py + crack.y2);
          ctx.strokeStyle = "rgba(0,0,0,0.75)";
          ctx.lineWidth = crack.width;
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,80,0,0.35)";
          ctx.lineWidth = crack.width * 0.5;
          ctx.stroke();
        });
        ctx.restore();

        // Specular highlight
        const hlGrad = ctx.createRadialGradient(px - planet.radius * 0.35, py - planet.radius * 0.35, 0, px - planet.radius * 0.35, py - planet.radius * 0.35, planet.radius * 0.65);
        hlGrad.addColorStop(0, "rgba(255,255,255,0.18)");
        hlGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.beginPath(); ctx.arc(px, py, planet.radius, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = hlGrad; ctx.fillRect(px - planet.radius, py - planet.radius, planet.radius * 2, planet.radius * 2);
        ctx.restore();

        // Shadow (terminator)
        const shadowGrad = ctx.createRadialGradient(px + planet.radius * 0.5, py + planet.radius * 0.3, planet.radius * 0.4, px + planet.radius * 0.5, py, planet.radius * 1.1);
        shadowGrad.addColorStop(0, "rgba(0,0,10,0.0)");
        shadowGrad.addColorStop(0.6, "rgba(0,0,10,0.35)");
        shadowGrad.addColorStop(1, "rgba(0,0,10,0.75)");
        ctx.save();
        ctx.beginPath(); ctx.arc(px, py, planet.radius, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = shadowGrad; ctx.fillRect(px - planet.radius, py - planet.radius, planet.radius * 2, planet.radius * 2);
        ctx.restore();

        // Cloud layer for earth/gas
        if ((planet.planetType === "earth" || planet.planetType === "gas") && healthRatio > 0.3) {
          ctx.save();
          ctx.globalAlpha = 0.25 * healthRatio;
          ctx.beginPath(); ctx.arc(px, py, planet.radius * 0.98, 0, Math.PI * 2); ctx.clip();
          ctx.translate(px, py);
          ctx.rotate(planet.rotation * 1.3);
          for (let ci = 0; ci < 5; ci++) {
            const ca = (ci / 5) * Math.PI * 2 + s.time * 0.001;
            const cr = planet.radius * (0.3 + noise2d(ci, s.time * 0.001, 42) * 0.5);
            const cw = planet.radius * 0.4;
            const ch = planet.radius * 0.12;
            const cx2 = Math.cos(ca) * cr;
            const cy2 = Math.sin(ca) * cr * 0.4;
            const cloudGrad = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, cw * 0.6);
            cloudGrad.addColorStop(0, "rgba(255,255,255,0.6)");
            cloudGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = cloudGrad;
            ctx.beginPath(); ctx.ellipse(cx2, cy2, cw, ch, ca + 0.5, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }

        // Fire on low health
        if (healthRatio < 0.4 && Math.random() < 0.3) {
          const fa = Math.random() * Math.PI * 2;
          spawnParticles(px + Math.cos(fa) * planet.radius * 0.85, py + Math.sin(fa) * planet.radius * 0.85, 1, "asteroid", "#ff4400");
        }

        // Planet name
        ctx.font = "bold 15px 'Exo 2', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.textAlign = "center";
        ctx.fillText(planet.name, px, py + planet.radius + 24);
      }

      // Chunks
      planet.chunks = planet.chunks.filter(ch => ch.alpha > 0.05);
      planet.chunks.forEach(ch => {
        ch.x += ch.vx; ch.y += ch.vy;
        ch.vy += 0.05; ch.angle += ch.va;
        ch.alpha -= 0.005; ch.vx *= 0.999;
        ctx.save();
        ctx.translate(ch.x, ch.y); ctx.rotate(ch.angle);
        ctx.globalAlpha = ch.alpha;
        const chRgb = hexToRgbFn(ch.color);
        const chGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, ch.r);
        chGrad.addColorStop(0, `rgb(${clamp(chRgb.r + 50, 0, 255)},${clamp(chRgb.g + 50, 0, 255)},${clamp(chRgb.b + 50, 0, 255)})`);
        chGrad.addColorStop(1, `rgb(${chRgb.r},${chRgb.g},${chRgb.b})`);
        ctx.fillStyle = chGrad;
        ctx.beginPath();
        const sides = 5;
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          const rr = ch.r * (0.7 + (i % 2) * 0.3);
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });
    }

    // Particles
    s.particles = s.particles.filter(p => p.life > 0);
    s.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.05 * p.mass;
      p.vx *= 0.99; p.vy *= 0.99;
      p.life--;
      p.alpha = p.life / p.maxLife;
      if (s.blackholeActive && planet) {
        const dx = s.blackholeX - p.x, dy = s.blackholeY - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1;
        const pull = 200 / (d * d) * s.blackholeRadius;
        p.vx += (dx / d) * pull; p.vy += (dy / d) * pull;
      }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      if (p.type === "fire") { ctx.shadowColor = p.color; ctx.shadowBlur = 15; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.01, p.radius * p.alpha), 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
      ctx.restore();
    });
  }, [spawnParticles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      if (stateRef.current.stars.length < 200)
        stateRef.current.stars = createStars(200, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    const loop = () => {
      drawScene(ctx, canvas.width, canvas.height);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("resize", resize); cancelAnimationFrame(animFrameRef.current); };
  }, [drawScene]);

  const goToMenu = useCallback(() => {
    stateRef.current.planet = null;
    stateRef.current.particles = [];
    stateRef.current.blackholeActive = false;
    stateRef.current.shockwaves = [];
    stateRef.current.laserBeam = null;
    setVictory(false);
    audioRef.current?.stopMusic();
    setGameMode("menu");
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    ensureAudio();
    if (gameMode !== "playing") return;
    if (victory) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const s = stateRef.current;
    if (s.weaponAmmo[selectedWeapon] <= 0) return;
    s.weaponAmmo[selectedWeapon]--;
    setAmmo({ ...s.weaponAmmo });
    applyDamage(x, y, selectedWeapon);
  }, [gameMode, selectedWeapon, victory, applyDamage, ensureAudio]);

  const startCampaignLevel = useCallback((levelIdx: number) => {
    ensureAudio();
    const level = campaignLevels[levelIdx];
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCurrentLevel(levelIdx);
    setPlaySubMode("campaign");
    stateRef.current.playSubMode = "campaign";
    const ammoMap: Record<WeaponType, number> = { asteroid: 8, laser: 4, nuke: 2, blackhole: 1 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    setSelectedWeapon("asteroid");
    initPlanet(level, canvas.width || 800, canvas.height || 600);
    setGameMode("playing");
    audioRef.current?.stopMusic();
    setTimeout(() => audioRef.current?.startMusic(), 300);
  }, [campaignLevels, initPlanet, ensureAudio]);

  const startSandbox = useCallback(() => {
    ensureAudio();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pl = SANDBOX_PLANETS[sandboxPlanetType];
    setPlaySubMode("sandbox");
    stateRef.current.playSubMode = "sandbox";
    const ammoMap: Record<WeaponType, number> = { asteroid: 999, laser: 999, nuke: 999, blackhole: 999 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    initPlanet(pl, canvas.width || 800, canvas.height || 600);
    setGameMode("playing");
    audioRef.current?.stopMusic();
    setTimeout(() => audioRef.current?.startMusic(), 300);
  }, [sandboxPlanetType, initPlanet, ensureAudio]);

  const startMultiplayer = useCallback(() => {
    ensureAudio();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pl = SANDBOX_PLANETS[multiPlanet];
    setPlaySubMode("multiplayer");
    stateRef.current.playSubMode = "multiplayer";
    setIsP2Turn(false); setMultiRound(1); setScore(0); setP2score(0);
    const ammoMap: Record<WeaponType, number> = { asteroid: 5, laser: 3, nuke: 2, blackhole: 1 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    initPlanet(pl, canvas.width || 800, canvas.height || 600);
    setGameMode("playing");
    audioRef.current?.stopMusic();
    setTimeout(() => audioRef.current?.startMusic(), 300);
  }, [multiPlanet, initPlanet, ensureAudio]);

  const switchMultiPlayer = useCallback(() => {
    if (isP2Turn) setP2score(prev => prev + stateRef.current.score);
    setScore(0); stateRef.current.score = 0;
    setIsP2Turn(p => !p);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pl = SANDBOX_PLANETS[multiPlanet];
    const ammoMap: Record<WeaponType, number> = { asteroid: 5, laser: 3, nuke: 2, blackhole: 1 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    setMultiRound(r => r + 1);
    initPlanet(pl, canvas.width || 800, canvas.height || 600);
  }, [isP2Turn, multiPlanet, initPlanet]);

  const handleVictory = useCallback((goNext = false) => {
    if (playSubMode === "campaign") {
      const newLevels = [...campaignLevels];
      const stars = planetHealth < 20 ? 3 : planetHealth < 50 ? 2 : 1;
      newLevels[currentLevel] = { ...newLevels[currentLevel], completed: true, stars };
      setCampaignLevels(newLevels);
      if (goNext && currentLevel + 1 < newLevels.length) {
        setTimeout(() => startCampaignLevel(currentLevel + 1), 100);
        setVictory(false);
        return;
      }
    }
    goToMenu();
  }, [playSubMode, campaignLevels, currentLevel, planetHealth, goToMenu, startCampaignLevel]);

  const healthColor = planetHealth > 60 ? "#39ff14" : planetHealth > 30 ? "#ffb347" : "#ff0040";

  const btnStyle = (accent: string) => ({
    background: `linear-gradient(180deg, ${accent}55 0%, ${accent}22 50%, ${accent}08 100%)`,
    border: `1px solid ${accent}bb`,
    borderBottom: `4px solid ${accent}ff`,
    boxShadow: `0 6px 24px ${accent}55, 0 2px 8px ${accent}33, inset 0 1px 0 ${accent}88`,
    fontFamily: "'Exo 2', sans-serif",
    textShadow: `0 0 12px ${accent}cc`,
    letterSpacing: "0.15em",
    transition: "all 0.12s ease",
  });

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative" style={{ fontFamily: "'Exo 2', sans-serif" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onClick={handleCanvasClick}
        style={{ cursor: gameMode === "playing" ? "crosshair" : "default" }}
      />

      {/* ── MAIN MENU ─────────────────────────────────────────────────────── */}
      {gameMode === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="text-center mb-12">
            <div className="text-7xl font-black tracking-widest text-white mb-2"
              style={{ fontFamily: "'Orbitron', monospace", textShadow: "0 0 40px #6600cc, 0 0 80px #3300aa" }}>
              PLANETUS
            </div>
            <div className="text-lg tracking-[0.5em] text-purple-300 uppercase">Разрушитель Миров</div>
          </div>
          <div className="flex flex-col gap-4 w-64">
            {[
              { label: "⚔ Кампания", accent: "#9900ff", onClick: () => setGameMode("campaign_select") },
              { label: "🔬 Песочница", accent: "#0099ff", onClick: () => setGameMode("sandbox_select") },
              { label: "👥 Мультиплеер", accent: "#ff9900", onClick: () => setGameMode("multiplayer_select") },
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick}
                className="px-8 py-4 text-white font-bold tracking-widest uppercase"
                style={btnStyle(btn.accent)}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px) scale(1.03)"; e.currentTarget.style.boxShadow = `0 10px 32px ${btn.accent}88, 0 4px 12px ${btn.accent}55, inset 0 1px 0 ${btn.accent}aa`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 6px 24px ${btn.accent}55, 0 2px 8px ${btn.accent}33, inset 0 1px 0 ${btn.accent}88`; }}
                onMouseDown={e => { e.currentTarget.style.transform = "translateY(3px)"; e.currentTarget.style.borderBottom = `1px solid ${btn.accent}ff`; }}
                onMouseUp={e => { e.currentTarget.style.transform = "translateY(-2px) scale(1.03)"; e.currentTarget.style.borderBottom = `4px solid ${btn.accent}ff`; }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CAMPAIGN SELECT ───────────────────────────────────────────────── */}
      {gameMode === "campaign_select" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/75">
          <div className="text-white text-3xl font-black mb-8 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>КАМПАНИЯ</div>
          <div className="grid grid-cols-1 gap-3 w-full max-w-lg px-4 overflow-y-auto max-h-[70vh]">
            {campaignLevels.map((level, idx) => {
              const unlocked = idx === 0 || campaignLevels[idx - 1].completed;
              return (
                <button key={level.id}
                  onClick={() => unlocked && startCampaignLevel(idx)}
                  disabled={!unlocked}
                  className="flex items-center gap-4 px-6 py-4 text-left transition-all duration-300"
                  style={{
                    background: unlocked ? "linear-gradient(135deg,rgba(50,0,100,0.6),rgba(10,0,30,0.9))" : "rgba(20,20,20,0.8)",
                    border: `1px solid ${unlocked ? "rgba(150,0,255,0.4)" : "rgba(60,60,60,0.4)"}`,
                    opacity: unlocked ? 1 : 0.4,
                    cursor: unlocked ? "pointer" : "not-allowed",
                  }}>
                  <div className="w-12 h-12 rounded-full flex-shrink-0"
                    style={{ background: level.planetColor, boxShadow: `0 0 15px ${level.atmosphereColor}` }} />
                  <div className="flex-1">
                    <div className="text-white font-bold">{level.name}</div>
                    <div className="text-purple-300 text-sm">{level.description}</div>
                  </div>
                  <div className="flex gap-1 text-lg">{[1,2,3].map(s => <span key={s}>{s <= level.stars ? "⭐" : "☆"}</span>)}</div>
                </button>
              );
            })}
          </div>
          <button onClick={() => setGameMode("menu")} className="mt-6 text-purple-400 hover:text-white transition-colors text-sm tracking-widest">← НАЗАД</button>
        </div>
      )}

      {/* ── SANDBOX SELECT ───────────────────────────────────────────────── */}
      {gameMode === "sandbox_select" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/75">
          <div className="text-white text-3xl font-black mb-8 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>ПЕСОЧНИЦА</div>
          <div className="bg-black/60 border border-blue-500/30 p-8 rounded-lg max-w-md w-full mx-4">
            <div className="text-blue-300 text-sm mb-4 tracking-widest uppercase">Выберите планету</div>
            <div className="grid grid-cols-1 gap-2 mb-6">
              {SANDBOX_PLANETS.map((p, i) => (
                <button key={i} onClick={() => setSandboxPlanetType(i)}
                  className="flex items-center gap-3 px-4 py-3 transition-all"
                  style={{
                    background: sandboxPlanetType === i ? "rgba(0,100,200,0.4)" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${sandboxPlanetType === i ? "rgba(0,200,255,0.8)" : "rgba(0,100,200,0.3)"}`,
                  }}>
                  <div className="w-8 h-8 rounded-full" style={{ background: p.planetColor, boxShadow: `0 0 10px ${p.atmosphereColor}` }} />
                  <span className="text-white">{p.planetName}</span>
                  <span className="text-blue-300 text-xs ml-auto">HP: {p.planetHealth}</span>
                </button>
              ))}
            </div>
            <div className="text-blue-300/50 text-xs mb-4">Боеприпасы не ограничены • Все оружия доступны</div>
            <button onClick={startSandbox} className="w-full py-3 text-white font-bold tracking-widest uppercase"
              style={{ background: "linear-gradient(180deg,rgba(0,160,255,0.5) 0%,rgba(0,80,180,0.3) 50%,rgba(0,40,120,0.15) 100%)", border: "1px solid rgba(0,200,255,0.7)", borderBottom: "4px solid rgba(0,200,255,1)", boxShadow: "0 6px 24px rgba(0,150,255,0.5), inset 0 1px 0 rgba(0,220,255,0.5)", textShadow: "0 0 12px rgba(0,200,255,0.9)" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 32px rgba(0,180,255,0.7), inset 0 1px 0 rgba(0,220,255,0.6)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,150,255,0.5), inset 0 1px 0 rgba(0,220,255,0.5)"; }}
              onMouseDown={e => { e.currentTarget.style.transform = "translateY(3px)"; e.currentTarget.style.borderBottom = "1px solid rgba(0,200,255,1)"; }}
              onMouseUp={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderBottom = "4px solid rgba(0,200,255,1)"; }}>
              НАЧАТЬ РАЗРУШЕНИЕ
            </button>
          </div>
          <button onClick={() => setGameMode("menu")} className="mt-6 text-blue-400 hover:text-white transition-colors text-sm tracking-widest">← НАЗАД</button>
        </div>
      )}

      {/* ── MULTIPLAYER SELECT ───────────────────────────────────────────── */}
      {gameMode === "multiplayer_select" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/75">
          <div className="text-white text-3xl font-black mb-8 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>МУЛЬТИПЛЕЕР</div>
          <div className="bg-black/60 border border-orange-500/30 p-8 rounded-lg max-w-md w-full mx-4">
            <div className="text-orange-300 text-sm mb-4 tracking-widest uppercase">Режим двух игроков · Hot-seat</div>
            <div className="flex gap-4 mb-6">
              <div className="flex-1 p-3 border border-orange-500/30 text-center"><div className="text-2xl">👨‍🚀</div><div className="text-orange-300 text-sm">Игрок 1</div></div>
              <div className="flex-1 p-3 border border-yellow-500/30 text-center"><div className="text-2xl">👩‍🚀</div><div className="text-yellow-300 text-sm">Игрок 2</div></div>
            </div>
            <div className="text-orange-300 text-sm mb-3 tracking-widest uppercase">Выберите планету</div>
            <div className="grid grid-cols-1 gap-2 mb-6">
              {SANDBOX_PLANETS.slice(0, 3).map((p, i) => (
                <button key={i} onClick={() => setMultiPlanet(i)}
                  className="flex items-center gap-3 px-4 py-3 transition-all"
                  style={{
                    background: multiPlanet === i ? "rgba(200,100,0,0.4)" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${multiPlanet === i ? "rgba(255,200,0,0.8)" : "rgba(200,100,0,0.3)"}`,
                  }}>
                  <div className="w-8 h-8 rounded-full" style={{ background: p.planetColor }} />
                  <span className="text-white">{p.planetName}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowMultiplayerLobby(false); startMultiplayer(); }}
              className="w-full py-3 text-white font-bold tracking-widest uppercase"
              style={{ background: "linear-gradient(180deg,rgba(255,160,0,0.5) 0%,rgba(200,80,0,0.3) 50%,rgba(120,40,0,0.15) 100%)", border: "1px solid rgba(255,200,0,0.7)", borderBottom: "4px solid rgba(255,200,0,1)", boxShadow: "0 6px 24px rgba(255,150,0,0.5), inset 0 1px 0 rgba(255,220,0,0.5)", textShadow: "0 0 12px rgba(255,200,0,0.9)" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 32px rgba(255,180,0,0.7), inset 0 1px 0 rgba(255,220,0,0.6)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 6px 24px rgba(255,150,0,0.5), inset 0 1px 0 rgba(255,220,0,0.5)"; }}
              onMouseDown={e => { e.currentTarget.style.transform = "translateY(3px)"; e.currentTarget.style.borderBottom = "1px solid rgba(255,200,0,1)"; }}
              onMouseUp={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderBottom = "4px solid rgba(255,200,0,1)"; }}>
              НАЧАТЬ БОЙ
            </button>
          </div>
          <button onClick={() => setGameMode("menu")} className="mt-4 text-orange-400 hover:text-white transition-colors text-sm tracking-widest">← НАЗАД</button>
        </div>
      )}

      {/* ── IN-GAME HUD ──────────────────────────────────────────────────── */}
      {gameMode === "playing" && !victory && (
        <>
          <div className="absolute top-0 left-0 right-0 z-10 px-6 py-3 flex items-center justify-between"
            style={{ background: "linear-gradient(to bottom,rgba(0,0,10,0.92),transparent)" }}>
            <div className="flex items-center gap-4">
              <button onClick={goToMenu} className="text-white/50 hover:text-white transition-colors text-sm tracking-widest">← МЕНЮ</button>
              {playSubMode === "campaign" && <div className="text-purple-300 text-sm tracking-widest">УР. {currentLevel + 1}: {campaignLevels[currentLevel]?.name}</div>}
              {playSubMode === "sandbox" && <div className="text-blue-300 text-sm tracking-widest">🔬 ПЕСОЧНИЦА</div>}
              {playSubMode === "multiplayer" && <div className="text-orange-300 text-sm tracking-widest">{isP2Turn ? "👩‍🚀 ИГРОК 2" : "👨‍🚀 ИГРОК 1"} · РАУ {multiRound}</div>}
            </div>
            <div className="flex items-center gap-6">
              {playSubMode === "multiplayer" && (
                <div className="flex gap-4 text-sm">
                  <span className="text-orange-300">P1: {isP2Turn ? 0 : score}</span>
                  <span className="text-yellow-300">P2: {p2score}</span>
                </div>
              )}
              <div className="text-yellow-300 font-bold text-lg" style={{ fontFamily: "'Orbitron', monospace" }}>{score.toLocaleString()} pts</div>
            </div>
          </div>

          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 w-64">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>СТРУКТУРА</span><span>{Math.round(planetHealth)}%</span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${planetHealth}%`, background: `linear-gradient(to right,${healthColor},${healthColor}88)`, boxShadow: `0 0 10px ${healthColor}` }} />
            </div>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-3">
            {(Object.keys(WEAPONS) as WeaponType[]).map(w => {
              const weapon = WEAPONS[w];
              const selected = selectedWeapon === w;
              const hasAmmo = ammo[w] > 0;
              return (
                <button key={w} onClick={() => { ensureAudio(); setSelectedWeapon(w); }}
                  disabled={!hasAmmo}
                  className="flex flex-col items-center p-3"
                  style={{
                    background: selected
                      ? "linear-gradient(180deg,rgba(180,0,255,0.55) 0%,rgba(100,0,200,0.35) 50%,rgba(50,0,120,0.2) 100%)"
                      : "linear-gradient(180deg,rgba(60,60,100,0.4) 0%,rgba(10,10,30,0.6) 100%)",
                    border: `1px solid ${selected ? "rgba(220,0,255,0.9)" : "rgba(100,100,150,0.3)"}`,
                    borderBottom: `3px solid ${selected ? "rgba(220,0,255,1)" : "rgba(80,80,130,0.5)"}`,
                    minWidth: 70, opacity: hasAmmo ? 1 : 0.3,
                    boxShadow: selected
                      ? "0 6px 20px rgba(150,0,255,0.7), inset 0 1px 0 rgba(200,0,255,0.5)"
                      : "0 3px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(150,150,200,0.15)",
                    transform: selected ? "translateY(-5px)" : "translateY(0)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseDown={e => { if (hasAmmo) { e.currentTarget.style.transform = "translateY(2px)"; e.currentTarget.style.borderBottom = `1px solid ${selected ? "rgba(220,0,255,1)" : "rgba(80,80,130,0.5)"}`; } }}
                  onMouseUp={e => { if (hasAmmo) { e.currentTarget.style.transform = selected ? "translateY(-5px)" : "translateY(0)"; e.currentTarget.style.borderBottom = `3px solid ${selected ? "rgba(220,0,255,1)" : "rgba(80,80,130,0.5)"}`; } }}
                >
                  <div className="text-2xl mb-1">{weapon.icon}</div>
                  <div className="text-white text-xs font-bold whitespace-nowrap">{weapon.name}</div>
                  <div className="text-purple-300 text-xs mt-1">{playSubMode === "sandbox" ? "∞" : ammo[w]}</div>
                </button>
              );
            })}
          </div>

          {playSubMode === "multiplayer" && (
            <div className="absolute bottom-32 right-6 z-10">
              <button onClick={switchMultiPlayer} className="px-4 py-2 text-white text-sm font-bold tracking-widest"
                style={{ background: "linear-gradient(180deg,rgba(255,160,0,0.45) 0%,rgba(180,80,0,0.25) 100%)", border: "1px solid rgba(255,200,0,0.6)", borderBottom: "3px solid rgba(255,200,0,0.9)", boxShadow: "0 4px 14px rgba(255,150,0,0.4), inset 0 1px 0 rgba(255,220,0,0.4)", textShadow: "0 0 8px rgba(255,200,0,0.8)" }}
                onMouseDown={e => { e.currentTarget.style.transform = "translateY(2px)"; e.currentTarget.style.borderBottom = "1px solid rgba(255,200,0,0.9)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderBottom = "3px solid rgba(255,200,0,0.9)"; }}>
                ПЕРЕДАТЬ ХОД →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── VICTORY ──────────────────────────────────────────────────────── */}
      {victory && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
          <div className="text-center p-10"
            style={{ background: "rgba(0,0,10,0.96)", border: "1px solid rgba(150,0,255,0.5)", boxShadow: "0 0 60px rgba(100,0,200,0.5)" }}>
            <div className="text-5xl mb-4">💥</div>
            <div className="text-4xl font-black text-white mb-2"
              style={{ fontFamily: "'Orbitron', monospace", textShadow: "0 0 30px #6600cc" }}>УНИЧТОЖЕНО!</div>
            <div className="text-purple-300 mb-4">Планета превращена в обломки</div>
            <div className="text-yellow-300 text-2xl font-bold mb-8" style={{ fontFamily: "'Orbitron', monospace" }}>
              {score.toLocaleString()} очков
            </div>
            <div className="flex gap-4 justify-center">
              {playSubMode === "campaign" && currentLevel + 1 < campaignLevels.length && (
                <button onClick={() => handleVictory(true)}
                  className="px-6 py-3 text-white font-bold tracking-widest"
                  style={{ background: "linear-gradient(180deg,rgba(180,0,255,0.55) 0%,rgba(80,0,180,0.3) 100%)", border: "1px solid rgba(200,0,255,0.7)", borderBottom: "4px solid rgba(200,0,255,1)", boxShadow: "0 6px 20px rgba(150,0,255,0.6), inset 0 1px 0 rgba(200,0,255,0.5)", textShadow: "0 0 10px rgba(200,0,255,0.9)" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
                  onMouseDown={e => { e.currentTarget.style.transform = "translateY(3px)"; e.currentTarget.style.borderBottom = "1px solid rgba(200,0,255,1)"; }}
                  onMouseUp={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderBottom = "4px solid rgba(200,0,255,1)"; }}>
                  СЛЕДУЮЩИЙ →
                </button>
              )}
              <button onClick={() => handleVictory(false)}
                className="px-6 py-3 text-white/70 font-bold tracking-widest"
                style={{ background: "linear-gradient(180deg,rgba(100,100,150,0.3) 0%,rgba(40,40,80,0.2) 100%)", border: "1px solid rgba(100,100,150,0.5)", borderBottom: "3px solid rgba(120,120,180,0.7)", boxShadow: "0 4px 14px rgba(80,80,120,0.4), inset 0 1px 0 rgba(150,150,200,0.3)" }}
                onMouseDown={e => { e.currentTarget.style.transform = "translateY(2px)"; e.currentTarget.style.borderBottom = "1px solid rgba(120,120,180,0.7)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderBottom = "3px solid rgba(120,120,180,0.7)"; }}>
                В МЕНЮ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}