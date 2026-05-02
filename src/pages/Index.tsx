import { useEffect, useRef, useState, useCallback } from "react";
import Icon from "@/components/ui/icon";

type GameMode = "menu" | "campaign" | "sandbox" | "multiplayer";
type WeaponType = "asteroid" | "laser" | "nuke" | "blackhole";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  type: "debris" | "dust" | "fire" | "shockwave";
  mass: number;
}

interface Planet {
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  color: string;
  atmosphereColor: string;
  name: string;
  mass: number;
  craters: { x: number; y: number; r: number; depth: number }[];
  cracks: { x1: number; y1: number; x2: number; y2: number; width: number }[];
  chunks: { x: number; y: number; vx: number; vy: number; r: number; angle: number; va: number; color: string; alpha: number }[];
  destroyed: boolean;
  shakeX: number;
  shakeY: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkle: number;
}

interface CampaignLevel {
  id: number;
  name: string;
  description: string;
  planetName: string;
  planetRadius: number;
  planetHealth: number;
  planetColor: string;
  atmosphereColor: string;
  weapons: WeaponType[];
  completed: boolean;
  stars: number;
}

const CAMPAIGN_LEVELS: CampaignLevel[] = [
  { id: 1, name: "Красная угроза", description: "Уничтожьте Марс, пока его атмосфера не заряжена", planetName: "Марс", planetRadius: 80, planetHealth: 300, planetColor: "#c1440e", atmosphereColor: "#ff6b35", weapons: ["asteroid"], completed: false, stars: 0 },
  { id: 2, name: "Ледяная твердь", description: "Лёд Европы выдержит лазер. Нужно что-то мощнее", planetName: "Европа", planetRadius: 70, planetHealth: 500, planetColor: "#b8d4e8", atmosphereColor: "#e0f0ff", weapons: ["asteroid", "laser"], completed: false, stars: 0 },
  { id: 3, name: "Великан", description: "Юпитер — газовый гигант. Потребуется ядерный удар", planetName: "Юпитер", planetRadius: 130, planetHealth: 1200, planetColor: "#c88b3a", atmosphereColor: "#ffb347", weapons: ["asteroid", "laser", "nuke"], completed: false, stars: 0 },
  { id: 4, name: "Тёмная материя", description: "Сингулярность поглотит всё. Чёрная дыра против Нептуна", planetName: "Нептун", planetRadius: 100, planetHealth: 800, planetColor: "#3f6fbf", atmosphereColor: "#6a9fd8", weapons: ["asteroid", "laser", "nuke", "blackhole"], completed: false, stars: 0 },
  { id: 5, name: "Конец Света", description: "Земля. Финальная цель. Уничтожьте колыбель человечества", planetName: "Земля", planetRadius: 90, planetHealth: 1000, planetColor: "#2e7d32", atmosphereColor: "#81c784", weapons: ["asteroid", "laser", "nuke", "blackhole"], completed: false, stars: 0 },
];

const WEAPONS = {
  asteroid: { name: "Астероид", damage: 80, icon: "⚫", color: "#8B7355", cost: 1, description: "Классический удар" },
  laser: { name: "Лазер", damage: 120, icon: "🔴", color: "#ff0040", cost: 2, description: "Точечный удар" },
  nuke: { name: "Ядерный удар", damage: 300, icon: "☢️", color: "#39ff14", cost: 3, description: "Массовое разрушение" },
  blackhole: { name: "Чёрная дыра", damage: 500, icon: "🌑", color: "#6600cc", cost: 5, description: "Абсолютное уничтожение" },
};

function createStars(count: number, w: number, h: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    size: Math.random() * 2 + 0.5,
    brightness: Math.random(),
    twinkle: Math.random() * Math.PI * 2,
  }));
}

function createPlanet(x: number, y: number, level: CampaignLevel): Planet {
  return {
    x, y,
    radius: level.planetRadius,
    health: level.planetHealth,
    maxHealth: level.planetHealth,
    color: level.planetColor,
    atmosphereColor: level.atmosphereColor,
    name: level.planetName,
    mass: level.planetRadius * 100,
    craters: [],
    cracks: [],
    chunks: [],
    destroyed: false,
    shakeX: 0,
    shakeY: 0,
  };
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const stateRef = useRef({
    particles: [] as Particle[],
    planet: null as Planet | null,
    stars: [] as Star[],
    time: 0,
    blackholeActive: false,
    blackholeX: 0,
    blackholeY: 0,
    blackholeRadius: 0,
    shockwaves: [] as { x: number; y: number; r: number; maxR: number; alpha: number }[],
    laserBeam: null as { x1: number; y1: number; x2: number; y2: number; alpha: number; width: number } | null,
    weaponAmmo: { asteroid: 10, laser: 5, nuke: 2, blackhole: 1 } as Record<WeaponType, number>,
    score: 0,
  });

  const [gameMode, setGameMode] = useState<GameMode>("menu");
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>("asteroid");
  const [campaignLevels, setCampaignLevels] = useState<CampaignLevel[]>(CAMPAIGN_LEVELS);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [planetHealth, setPlanetHealth] = useState(100);
  const [score, setScore] = useState(0);
  const [ammo, setAmmo] = useState<Record<WeaponType, number>>({ asteroid: 10, laser: 5, nuke: 2, blackhole: 1 });
  const [gameOver, setGameOver] = useState(false);
  const [victory, setVictory] = useState(false);
  const [sandboxPlanetType, setSandboxPlanetType] = useState(0);
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  const [p2score, setP2score] = useState(0);
  const [isP2Turn, setIsP2Turn] = useState(false);
  const [multiRound, setMultiRound] = useState(1);
  const [multiPlanet, setMultiPlanet] = useState(0);

  const SANDBOX_PLANETS = [
    { planetName: "Марс", planetRadius: 80, planetHealth: 500, planetColor: "#c1440e", atmosphereColor: "#ff6b35" },
    { planetName: "Земля", planetRadius: 90, planetHealth: 700, planetColor: "#2e7d32", atmosphereColor: "#81c784" },
    { planetName: "Юпитер", planetRadius: 130, planetHealth: 1500, planetColor: "#c88b3a", atmosphereColor: "#ffb347" },
    { planetName: "Лунная база", planetRadius: 60, planetHealth: 250, planetColor: "#aaaaaa", atmosphereColor: "#cccccc" },
    { planetName: "Кристальный мир", planetRadius: 75, planetHealth: 600, planetColor: "#00bcd4", atmosphereColor: "#80deea" },
  ];

  const initPlanet = useCallback((levelData: typeof CAMPAIGN_LEVELS[0], canvasW: number, canvasH: number) => {
    const p = createPlanet(canvasW / 2, canvasH / 2, levelData);
    stateRef.current.planet = p;
    stateRef.current.particles = [];
    stateRef.current.blackholeActive = false;
    stateRef.current.shockwaves = [];
    stateRef.current.laserBeam = null;
    stateRef.current.score = 0;
    setScore(0);
    setPlanetHealth(100);
    setGameOver(false);
    setVictory(false);
  }, []);

  const spawnParticles = (x: number, y: number, count: number, weapon: WeaponType, planetColor: string) => {
    const s = stateRef.current;
    const rgb = hexToRgb(planetColor);
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
          ? `rgb(${255}, ${Math.floor(Math.random() * 150 + 50)}, 0)`
          : `rgb(${rgb.r + Math.floor(Math.random() * 40 - 20)}, ${rgb.g + Math.floor(Math.random() * 40 - 20)}, ${rgb.b + Math.floor(Math.random() * 40 - 20)})`,
        alpha: 1,
        life: 60 + Math.random() * 120,
        maxLife: 60 + Math.random() * 120,
        type,
        mass: Math.random() * 2 + 0.5,
      });
    }
  };

  const applyDamage = useCallback((clickX: number, clickY: number, weapon: WeaponType) => {
    const s = stateRef.current;
    const planet = s.planet;
    if (!planet || planet.destroyed) return;

    const dx = clickX - planet.x;
    const dy = clickY - planet.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const w = WEAPONS[weapon];
    let actualDamage = w.damage;

    if (dist > planet.radius * 1.5) return;

    if (weapon === "asteroid") {
      const impact = Math.max(0, 1 - dist / (planet.radius * 1.2));
      actualDamage *= (0.5 + impact * 0.5);
      planet.craters.push({ x: dx, y: dy, r: 15 + Math.random() * 20, depth: impact });
      spawnParticles(clickX, clickY, 40, weapon, planet.color);
      planet.shakeX = (Math.random() - 0.5) * 20;
      planet.shakeY = (Math.random() - 0.5) * 20;
      s.shockwaves.push({ x: clickX, y: clickY, r: 10, maxR: 80, alpha: 0.8 });
    } else if (weapon === "laser") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      s.laserBeam = {
        x1: Math.random() > 0.5 ? 0 : canvas.width,
        y1: 0,
        x2: clickX, y2: clickY,
        alpha: 1, width: 6
      };
      planet.craters.push({ x: dx, y: dy, r: 8 + Math.random() * 12, depth: 1 });
      spawnParticles(clickX, clickY, 60, weapon, planet.color);
      planet.shakeX = (Math.random() - 0.5) * 15;
      planet.shakeY = (Math.random() - 0.5) * 15;
    } else if (weapon === "nuke") {
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * planet.radius * 0.8;
        planet.craters.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, r: 20 + Math.random() * 30, depth: 1 });
        const cx = planet.x + Math.cos(angle) * r;
        const cy = planet.y + Math.sin(angle) * r;
        s.shockwaves.push({ x: cx, y: cy, r: 5, maxR: 120, alpha: 1 });
        spawnParticles(cx, cy, 30, weapon, planet.color);
      }
      planet.shakeX = (Math.random() - 0.5) * 40;
      planet.shakeY = (Math.random() - 0.5) * 40;
      spawnParticles(clickX, clickY, 150, weapon, planet.color);
    } else if (weapon === "blackhole") {
      s.blackholeActive = true;
      s.blackholeX = clickX;
      s.blackholeY = clickY;
      s.blackholeRadius = 0;
      spawnParticles(clickX, clickY, 200, weapon, planet.color);
    }

    if (planet.health > 0) {
      const cracks = Math.floor(actualDamage / 50) + 1;
      for (let c = 0; c < cracks; c++) {
        const angle = Math.random() * Math.PI * 2;
        const len = 20 + Math.random() * 60;
        planet.cracks.push({
          x1: dx, y1: dy,
          x2: dx + Math.cos(angle) * len,
          y2: dy + Math.sin(angle) * len,
          width: 1 + Math.random() * 2,
        });
      }
    }

    planet.health = Math.max(0, planet.health - actualDamage);
    const pct = (planet.health / planet.maxHealth) * 100;
    setPlanetHealth(pct);

    const gained = Math.floor(actualDamage * 2);
    s.score += gained;
    setScore(s.score);

    if (planet.health <= 0 && !planet.destroyed) {
      planet.destroyed = true;
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * planet.radius * 0.6 + planet.radius * 0.2;
        planet.chunks.push({
          x: planet.x + Math.cos(angle) * r * 0.5,
          y: planet.y + Math.sin(angle) * r * 0.5,
          vx: Math.cos(angle) * (Math.random() * 4 + 1),
          vy: Math.sin(angle) * (Math.random() * 4 + 1),
          r: Math.random() * 30 + 15,
          angle: 0,
          va: (Math.random() - 0.5) * 0.1,
          color: planet.color,
          alpha: 1,
        });
      }
      spawnParticles(planet.x, planet.y, 300, "nuke", planet.color);
      s.shockwaves.push({ x: planet.x, y: planet.y, r: 10, maxR: 300, alpha: 1 });
      setTimeout(() => setVictory(true), 2000);
    }
  }, []);

  const drawScene = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = stateRef.current;
    s.time++;

    ctx.fillStyle = "#000008";
    ctx.fillRect(0, 0, w, h);

    // Stars
    s.stars.forEach(star => {
      star.twinkle += 0.03;
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(star.twinkle)) * star.brightness;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    });

    // Nebula background
    const nebula = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, w * 0.5);
    nebula.addColorStop(0, "rgba(20, 0, 50, 0.15)");
    nebula.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, w, h);

    const planet = s.planet;

    // Blackhole effect
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

      // Accretion disk
      for (let i = 0; i < 3; i++) {
        const diskGrad = ctx.createRadialGradient(s.blackholeX, s.blackholeY, s.blackholeRadius * 0.9, s.blackholeX, s.blackholeY, s.blackholeRadius * (1.5 + i * 0.3));
        diskGrad.addColorStop(0, `rgba(${150 + i * 30}, ${50}, ${200}, 0.6)`);
        diskGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = diskGrad;
        ctx.beginPath();
        ctx.arc(s.blackholeX, s.blackholeY, s.blackholeRadius * (1.5 + i * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }

      if (planet && !planet.destroyed) {
        const bx = s.blackholeX - planet.x;
        const by = s.blackholeY - planet.y;
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
      ctx.strokeStyle = `rgba(255, 200, 100, ${sw.alpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // Laser beam
    if (s.laserBeam) {
      s.laserBeam.alpha -= 0.04;
      if (s.laserBeam.alpha <= 0) {
        s.laserBeam = null;
      } else {
        const lb = s.laserBeam;
        ctx.save();
        ctx.shadowColor = "#ff0040";
        ctx.shadowBlur = 30;
        ctx.strokeStyle = `rgba(255, 0, 64, ${lb.alpha})`;
        ctx.lineWidth = lb.width;
        ctx.beginPath();
        ctx.moveTo(lb.x1, lb.y1);
        ctx.lineTo(lb.x2, lb.y2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${lb.alpha * 0.8})`;
        ctx.lineWidth = lb.width * 0.3;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Planet
    if (planet) {
      const shakeFade = 0.85;
      planet.shakeX *= shakeFade;
      planet.shakeY *= shakeFade;
      const px = planet.x + planet.shakeX;
      const py = planet.y + planet.shakeY;

      if (!planet.destroyed) {
        // Atmosphere glow
        const healthRatio = planet.health / planet.maxHealth;
        const atmoRadius = planet.radius * 1.3;
        const atmoGrad = ctx.createRadialGradient(px, py, planet.radius * 0.8, px, py, atmoRadius);
        atmoGrad.addColorStop(0, `rgba(${hexToRgb(planet.atmosphereColor).r}, ${hexToRgb(planet.atmosphereColor).g}, ${hexToRgb(planet.atmosphereColor).b}, ${0.3 * healthRatio})`);
        atmoGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = atmoGrad;
        ctx.beginPath();
        ctx.arc(px, py, atmoRadius, 0, Math.PI * 2);
        ctx.fill();

        // Planet body
        const planetGrad = ctx.createRadialGradient(px - planet.radius * 0.3, py - planet.radius * 0.3, planet.radius * 0.1, px, py, planet.radius);
        const rgb = hexToRgb(planet.color);
        planetGrad.addColorStop(0, `rgb(${Math.min(255, rgb.r + 80)}, ${Math.min(255, rgb.g + 80)}, ${Math.min(255, rgb.b + 80)})`);
        planetGrad.addColorStop(0.5, planet.color);
        planetGrad.addColorStop(1, `rgb(${Math.floor(rgb.r * 0.3)}, ${Math.floor(rgb.g * 0.3)}, ${Math.floor(rgb.b * 0.3)})`);
        ctx.fillStyle = planetGrad;
        ctx.beginPath();
        ctx.arc(px, py, planet.radius, 0, Math.PI * 2);
        ctx.fill();

        // Surface texture bands
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, planet.radius, 0, Math.PI * 2);
        ctx.clip();
        for (let b = -planet.radius; b < planet.radius; b += planet.radius * 0.15) {
          ctx.fillStyle = `rgba(0,0,0,0.08)`;
          ctx.fillRect(px - planet.radius, py + b, planet.radius * 2, planet.radius * 0.08);
        }
        ctx.restore();

        // Craters
        planet.craters.forEach(crater => {
          const cx = px + crater.x;
          const cy = py + crater.y;
          const cRgb = hexToRgb(planet.color);
          const craterGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, crater.r);
          craterGrad.addColorStop(0, `rgba(0,0,0,${0.6 * crater.depth})`);
          craterGrad.addColorStop(0.7, `rgba(${Math.floor(cRgb.r * 0.5)}, ${Math.floor(cRgb.g * 0.5)}, ${Math.floor(cRgb.b * 0.5)}, ${0.4 * crater.depth})`);
          craterGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = craterGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, crater.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx - crater.r * 0.2, cy - crater.r * 0.2, crater.r * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,0.05)`;
          ctx.fill();
        });

        // Cracks
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, planet.radius, 0, Math.PI * 2);
        ctx.clip();
        planet.cracks.forEach(crack => {
          ctx.beginPath();
          ctx.moveTo(px + crack.x1, py + crack.y1);
          ctx.lineTo(px + crack.x2, py + crack.y2);
          ctx.strokeStyle = `rgba(0,0,0,0.7)`;
          ctx.lineWidth = crack.width;
          ctx.stroke();
          ctx.strokeStyle = `rgba(255,100,0,0.3)`;
          ctx.lineWidth = crack.width * 0.5;
          ctx.stroke();
        });
        ctx.restore();

        // Highlight
        const hlGrad = ctx.createRadialGradient(px - planet.radius * 0.4, py - planet.radius * 0.4, 0, px - planet.radius * 0.4, py - planet.radius * 0.4, planet.radius * 0.6);
        hlGrad.addColorStop(0, "rgba(255,255,255,0.15)");
        hlGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hlGrad;
        ctx.beginPath();
        ctx.arc(px, py, planet.radius, 0, Math.PI * 2);
        ctx.fill();

        // Fire on damage
        if (healthRatio < 0.5) {
          for (let f = 0; f < 3; f++) {
            const fa = Math.random() * Math.PI * 2;
            const fr = planet.radius * 0.8;
            spawnParticles(px + Math.cos(fa) * fr, py + Math.sin(fa) * fr, 1, "asteroid", "#ff4400");
          }
        }

        // Planet name
        ctx.font = "bold 16px 'Exo 2', sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(planet.name, px, py + planet.radius + 25);
      }

      // Chunks (after destruction)
      planet.chunks = planet.chunks.filter(ch => ch.alpha > 0.05);
      planet.chunks.forEach(ch => {
        ch.x += ch.vx;
        ch.y += ch.vy;
        ch.vy += 0.05;
        ch.angle += ch.va;
        ch.alpha -= 0.005;
        ch.vx *= 0.999;
        ctx.save();
        ctx.translate(ch.x, ch.y);
        ctx.rotate(ch.angle);
        ctx.globalAlpha = ch.alpha;
        const chGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, ch.r);
        const rgb = hexToRgb(ch.color);
        chGrad.addColorStop(0, `rgb(${rgb.r + 50}, ${rgb.g + 50}, ${rgb.b + 50})`);
        chGrad.addColorStop(1, `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
        ctx.fillStyle = chGrad;
        ctx.beginPath();
        const sides = 5 + Math.floor(Math.random() * 3);
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          const rr = ch.r * (0.7 + Math.random() * 0.3);
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }

    // Particles
    s.particles = s.particles.filter(p => p.life > 0);
    s.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05 * p.mass;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.life--;
      p.alpha = p.life / p.maxLife;

      if (s.blackholeActive && planet) {
        const dx = s.blackholeX - p.x;
        const dy = s.blackholeY - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1;
        const pull = 200 / (d * d) * s.blackholeRadius;
        p.vx += (dx / d) * pull;
        p.vy += (dy / d) * pull;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      if (p.type === "fire") {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 15;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      if (stateRef.current.stars.length === 0 || stateRef.current.stars.length < 200) {
        stateRef.current.stars = createStars(200, canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      drawScene(ctx, canvas.width, canvas.height);
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [drawScene]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameMode !== "campaign" && gameMode !== "sandbox" && gameMode !== "multiplayer") return;
    if (gameOver || victory) return;
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
  }, [gameMode, selectedWeapon, gameOver, victory, applyDamage]);

  const startCampaignLevel = (levelIdx: number) => {
    const level = campaignLevels[levelIdx];
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCurrentLevel(levelIdx);
    setGameMode("campaign");
    const ammoMap: Record<WeaponType, number> = { asteroid: 8, laser: 4, nuke: 2, blackhole: 1 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    setSelectedWeapon("asteroid");
    initPlanet(level, canvas.width || 800, canvas.height || 600);
  };

  const startSandbox = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pl = SANDBOX_PLANETS[sandboxPlanetType];
    setGameMode("sandbox");
    const ammoMap: Record<WeaponType, number> = { asteroid: 999, laser: 999, nuke: 999, blackhole: 999 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    initPlanet(pl as CampaignLevel, canvas.width || 800, canvas.height || 600);
  };

  const startMultiplayer = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pl = SANDBOX_PLANETS[multiPlanet];
    setGameMode("multiplayer");
    setIsP2Turn(false);
    setMultiRound(1);
    setScore(0);
    setP2score(0);
    const ammoMap: Record<WeaponType, number> = { asteroid: 5, laser: 3, nuke: 2, blackhole: 1 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    initPlanet(pl as CampaignLevel, canvas.width || 800, canvas.height || 600);
  };

  const switchMultiPlayer = () => {
    if (isP2Turn) {
      setP2score(prev => prev + score);
      setScore(0);
      stateRef.current.score = 0;
    } else {
      setScore(0);
      stateRef.current.score = 0;
    }
    setIsP2Turn(p => !p);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pl = SANDBOX_PLANETS[multiPlanet];
    const ammoMap: Record<WeaponType, number> = { asteroid: 5, laser: 3, nuke: 2, blackhole: 1 };
    stateRef.current.weaponAmmo = ammoMap;
    setAmmo({ ...ammoMap });
    setMultiRound(r => r + 1);
    initPlanet(pl as CampaignLevel, canvas.width || 800, canvas.height || 600);
  };

  const handleVictory = () => {
    if (gameMode === "campaign") {
      const newLevels = [...campaignLevels];
      const stars = planetHealth < 20 ? 3 : planetHealth < 50 ? 2 : 1;
      newLevels[currentLevel] = { ...newLevels[currentLevel], completed: true, stars };
      if (currentLevel + 1 < newLevels.length) newLevels[currentLevel + 1] = { ...newLevels[currentLevel + 1] };
      setCampaignLevels(newLevels);
    }
    setGameMode("menu");
    stateRef.current.planet = null;
    stateRef.current.particles = [];
    stateRef.current.chunks = [];
    stateRef.current.blackholeActive = false;
  };

  const healthColor = planetHealth > 60 ? "#39ff14" : planetHealth > 30 ? "#ffb347" : "#ff0040";

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative font-exo">
      {/* Canvas always rendered */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onClick={handleCanvasClick}
        style={{ cursor: (gameMode === "campaign" || gameMode === "sandbox" || gameMode === "multiplayer") ? "crosshair" : "default" }}
      />

      {/* MAIN MENU */}
      {gameMode === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="text-center mb-12">
            <div className="text-7xl font-black tracking-widest text-white mb-2" style={{ fontFamily: "'Orbitron', monospace", textShadow: "0 0 40px #6600cc, 0 0 80px #3300aa" }}>
              PLANETUS
            </div>
            <div className="text-lg tracking-[0.5em] text-purple-300 uppercase" style={{ fontFamily: "'Exo 2', sans-serif" }}>
              Разрушитель Миров
            </div>
          </div>

          <div className="flex flex-col gap-4 w-64">
            <button
              onClick={() => setGameMode("campaign")}
              className="group relative px-8 py-4 text-white font-bold tracking-widest uppercase transition-all duration-300"
              style={{
                fontFamily: "'Exo 2', sans-serif",
                background: "linear-gradient(135deg, rgba(102,0,204,0.3), rgba(30,0,80,0.8))",
                border: "1px solid rgba(150,0,255,0.5)",
                boxShadow: "0 0 20px rgba(102,0,204,0.3)",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 40px rgba(102,0,204,0.8)"; e.currentTarget.style.borderColor = "rgba(200,0,255,1)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 20px rgba(102,0,204,0.3)"; e.currentTarget.style.borderColor = "rgba(150,0,255,0.5)"; }}
            >
              ⚔ Кампания
            </button>
            <button
              onClick={() => setGameMode("sandbox")}
              className="group relative px-8 py-4 text-white font-bold tracking-widest uppercase transition-all duration-300"
              style={{
                fontFamily: "'Exo 2', sans-serif",
                background: "linear-gradient(135deg, rgba(0,80,150,0.3), rgba(0,20,60,0.8))",
                border: "1px solid rgba(0,150,255,0.5)",
                boxShadow: "0 0 20px rgba(0,100,200,0.3)",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 40px rgba(0,150,255,0.8)"; e.currentTarget.style.borderColor = "rgba(0,200,255,1)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 20px rgba(0,100,200,0.3)"; e.currentTarget.style.borderColor = "rgba(0,150,255,0.5)"; }}
            >
              🔬 Песочница
            </button>
            <button
              onClick={() => setShowMultiplayerLobby(true)}
              className="group relative px-8 py-4 text-white font-bold tracking-widest uppercase transition-all duration-300"
              style={{
                fontFamily: "'Exo 2', sans-serif",
                background: "linear-gradient(135deg, rgba(150,80,0,0.3), rgba(60,20,0,0.8))",
                border: "1px solid rgba(255,150,0,0.5)",
                boxShadow: "0 0 20px rgba(200,100,0,0.3)",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 0 40px rgba(255,150,0,0.8)"; e.currentTarget.style.borderColor = "rgba(255,200,0,1)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 0 20px rgba(200,100,0,0.3)"; e.currentTarget.style.borderColor = "rgba(255,150,0,0.5)"; }}
            >
              👥 Мультиплеер
            </button>
          </div>
        </div>
      )}

      {/* CAMPAIGN MODE */}
      {gameMode === "campaign" && !stateRef.current.planet && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/70">
          <div className="text-white text-3xl font-black mb-8 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>КАМПАНИЯ</div>
          <div className="grid grid-cols-1 gap-3 w-full max-w-lg px-4">
            {campaignLevels.map((level, idx) => {
              const unlocked = idx === 0 || campaignLevels[idx - 1].completed;
              return (
                <button
                  key={level.id}
                  onClick={() => unlocked && startCampaignLevel(idx)}
                  disabled={!unlocked}
                  className="flex items-center gap-4 px-6 py-4 text-left transition-all duration-300"
                  style={{
                    background: unlocked ? "linear-gradient(135deg, rgba(50,0,100,0.6), rgba(10,0,30,0.9))" : "rgba(20,20,20,0.8)",
                    border: `1px solid ${unlocked ? "rgba(150,0,255,0.4)" : "rgba(60,60,60,0.4)"}`,
                    opacity: unlocked ? 1 : 0.4,
                    cursor: unlocked ? "pointer" : "not-allowed",
                  }}
                >
                  <div className="w-12 h-12 rounded-full flex-shrink-0" style={{ background: level.planetColor, boxShadow: `0 0 15px ${level.atmosphereColor}` }} />
                  <div className="flex-1">
                    <div className="text-white font-bold" style={{ fontFamily: "'Exo 2', sans-serif" }}>{level.name}</div>
                    <div className="text-purple-300 text-sm">{level.description}</div>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3].map(s => (
                      <span key={s} className="text-lg">{s <= level.stars ? "⭐" : "☆"}</span>
                    ))}
                  </div>
                  {level.completed && <span className="text-green-400 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
          <button onClick={() => setGameMode("menu")} className="mt-6 text-purple-400 hover:text-white transition-colors text-sm tracking-widest">
            ← НАЗАД
          </button>
        </div>
      )}

      {/* SANDBOX MODE SETUP */}
      {gameMode === "sandbox" && !stateRef.current.planet && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/70">
          <div className="text-white text-3xl font-black mb-8 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>ПЕСОЧНИЦА</div>
          <div className="bg-black/60 border border-blue-500/30 p-8 rounded-lg max-w-md w-full mx-4">
            <div className="text-blue-300 text-sm mb-4 tracking-widest uppercase">Выберите планету</div>
            <div className="grid grid-cols-1 gap-2 mb-6">
              {SANDBOX_PLANETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setSandboxPlanetType(i)}
                  className="flex items-center gap-3 px-4 py-3 transition-all"
                  style={{
                    background: sandboxPlanetType === i ? "rgba(0,100,200,0.4)" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${sandboxPlanetType === i ? "rgba(0,200,255,0.8)" : "rgba(0,100,200,0.3)"}`,
                  }}
                >
                  <div className="w-8 h-8 rounded-full" style={{ background: p.planetColor, boxShadow: `0 0 10px ${p.atmosphereColor}` }} />
                  <span className="text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>{p.planetName}</span>
                  <span className="text-blue-300 text-xs ml-auto">HP: {p.planetHealth}</span>
                </button>
              ))}
            </div>
            <div className="text-blue-300/60 text-xs mb-6">Боеприпасы не ограничены • Все оружия доступны</div>
            <button onClick={startSandbox} className="w-full py-3 text-white font-bold tracking-widest uppercase" style={{ background: "linear-gradient(135deg, rgba(0,100,200,0.5), rgba(0,50,150,0.9))", border: "1px solid rgba(0,200,255,0.5)" }}>
              НАЧАТЬ РАЗРУШЕНИЕ
            </button>
          </div>
          <button onClick={() => setGameMode("menu")} className="mt-6 text-blue-400 hover:text-white transition-colors text-sm tracking-widest">
            ← НАЗАД
          </button>
        </div>
      )}

      {/* MULTIPLAYER LOBBY */}
      {showMultiplayerLobby && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/70">
          <div className="text-white text-3xl font-black mb-8 tracking-widest" style={{ fontFamily: "'Orbitron', monospace" }}>МУЛЬТИПЛЕЕР</div>
          <div className="bg-black/60 border border-orange-500/30 p-8 rounded-lg max-w-md w-full mx-4">
            <div className="text-orange-300 text-sm mb-4 tracking-widest uppercase">Режим двух игроков • Hot-seat</div>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 p-3 border border-orange-500/30 text-center">
                <div className="text-2xl">👨‍🚀</div>
                <div className="text-orange-300 text-sm">Игрок 1</div>
              </div>
              <div className="flex-1 p-3 border border-yellow-500/30 text-center">
                <div className="text-2xl">👩‍🚀</div>
                <div className="text-yellow-300 text-sm">Игрок 2</div>
              </div>
            </div>
            <div className="text-orange-300 text-sm mb-3 tracking-widest uppercase">Выберите планету</div>
            <div className="grid grid-cols-1 gap-2 mb-6">
              {SANDBOX_PLANETS.slice(0, 3).map((p, i) => (
                <button
                  key={i}
                  onClick={() => setMultiPlanet(i)}
                  className="flex items-center gap-3 px-4 py-3 transition-all"
                  style={{
                    background: multiPlanet === i ? "rgba(200,100,0,0.4)" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${multiPlanet === i ? "rgba(255,200,0,0.8)" : "rgba(200,100,0,0.3)"}`,
                  }}
                >
                  <div className="w-8 h-8 rounded-full" style={{ background: p.planetColor }} />
                  <span className="text-white" style={{ fontFamily: "'Exo 2', sans-serif" }}>{p.planetName}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setShowMultiplayerLobby(false); startMultiplayer(); }} className="w-full py-3 text-white font-bold tracking-widest uppercase mb-3" style={{ background: "linear-gradient(135deg, rgba(200,100,0,0.5), rgba(100,40,0,0.9))", border: "1px solid rgba(255,200,0,0.5)" }}>
              НАЧАТЬ БОЙ
            </button>
          </div>
          <button onClick={() => setShowMultiplayerLobby(false)} className="mt-4 text-orange-400 hover:text-white transition-colors text-sm tracking-widest">
            ← НАЗАД
          </button>
        </div>
      )}

      {/* IN-GAME HUD */}
      {(gameMode === "campaign" || gameMode === "sandbox" || gameMode === "multiplayer") && stateRef.current.planet && !victory && !gameOver && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 px-6 py-3 flex items-center justify-between" style={{ background: "linear-gradient(to bottom, rgba(0,0,10,0.9), transparent)" }}>
            <div className="flex items-center gap-4">
              <button onClick={() => { setGameMode("menu"); stateRef.current.planet = null; stateRef.current.particles = []; stateRef.current.blackholeActive = false; }} className="text-white/50 hover:text-white transition-colors text-sm tracking-widest">
                ← МЕНЮ
              </button>
              {gameMode === "campaign" && (
                <div className="text-purple-300 text-sm tracking-widest" style={{ fontFamily: "'Exo 2', sans-serif" }}>
                  УРОВЕНЬ {currentLevel + 1}: {campaignLevels[currentLevel]?.name}
                </div>
              )}
              {gameMode === "sandbox" && <div className="text-blue-300 text-sm tracking-widest">🔬 ПЕСОЧНИЦА</div>}
              {gameMode === "multiplayer" && (
                <div className="text-orange-300 text-sm tracking-widest">
                  {isP2Turn ? "👩‍🚀 ИГРОК 2" : "👨‍🚀 ИГРОК 1"} • РАУНД {multiRound}
                </div>
              )}
            </div>
            <div className="flex items-center gap-6">
              {gameMode === "multiplayer" && (
                <div className="flex gap-4 text-sm">
                  <span className="text-orange-300">P1: {isP2Turn ? score : stateRef.current.score}</span>
                  <span className="text-yellow-300">P2: {p2score}</span>
                </div>
              )}
              <div className="text-yellow-300 font-bold text-lg" style={{ fontFamily: "'Orbitron', monospace" }}>
                {score.toLocaleString()} pts
              </div>
            </div>
          </div>

          {/* Health bar */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 w-64">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>СТРУКТУРА ПЛАНЕТЫ</span>
              <span>{Math.round(planetHealth)}%</span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${planetHealth}%`,
                  background: `linear-gradient(to right, ${healthColor}, ${healthColor}88)`,
                  boxShadow: `0 0 10px ${healthColor}`,
                }}
              />
            </div>
          </div>

          {/* Weapons panel */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-3">
            {(Object.keys(WEAPONS) as WeaponType[]).map(w => {
              const weapon = WEAPONS[w];
              const selected = selectedWeapon === w;
              const hasAmmo = ammo[w] > 0;
              return (
                <button
                  key={w}
                  onClick={() => setSelectedWeapon(w)}
                  disabled={!hasAmmo}
                  className="flex flex-col items-center p-3 transition-all duration-200"
                  style={{
                    background: selected ? `rgba(102,0,204,0.5)` : "rgba(0,0,20,0.7)",
                    border: `2px solid ${selected ? "rgba(200,0,255,0.9)" : "rgba(100,100,150,0.3)"}`,
                    minWidth: 70,
                    opacity: hasAmmo ? 1 : 0.35,
                    boxShadow: selected ? "0 0 20px rgba(150,0,255,0.6)" : "none",
                    transform: selected ? "translateY(-4px)" : "none",
                  }}
                >
                  <div className="text-2xl mb-1">{weapon.icon}</div>
                  <div className="text-white text-xs font-bold whitespace-nowrap" style={{ fontFamily: "'Exo 2', sans-serif" }}>{weapon.name}</div>
                  <div className="text-purple-300 text-xs mt-1">
                    {gameMode === "sandbox" ? "∞" : ammo[w]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Multiplayer switch turn button */}
          {gameMode === "multiplayer" && (
            <div className="absolute bottom-32 right-6 z-10">
              <button onClick={switchMultiPlayer} className="px-4 py-2 text-white text-sm font-bold tracking-widest" style={{ background: "rgba(200,100,0,0.4)", border: "1px solid rgba(255,200,0,0.5)" }}>
                ПЕРЕДАТЬ ХОД →
              </button>
            </div>
          )}
        </>
      )}

      {/* VICTORY SCREEN */}
      {victory && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/60">
          <div className="text-center p-10" style={{ background: "rgba(0,0,10,0.95)", border: "1px solid rgba(150,0,255,0.5)", boxShadow: "0 0 60px rgba(100,0,200,0.4)" }}>
            <div className="text-5xl mb-4">💥</div>
            <div className="text-4xl font-black text-white mb-2" style={{ fontFamily: "'Orbitron', monospace", textShadow: "0 0 30px #6600cc" }}>
              УНИЧТОЖЕНО!
            </div>
            <div className="text-purple-300 mb-6" style={{ fontFamily: "'Exo 2', sans-serif" }}>
              Планета превращена в обломки
            </div>
            <div className="text-yellow-300 text-2xl font-bold mb-8" style={{ fontFamily: "'Orbitron', monospace" }}>
              {score.toLocaleString()} очков
            </div>
            <div className="flex gap-4 justify-center">
              {gameMode === "campaign" && currentLevel + 1 < campaignLevels.length && (
                <button onClick={() => { handleVictory(); setTimeout(() => startCampaignLevel(currentLevel + 1), 100); }} className="px-6 py-3 text-white font-bold tracking-widest" style={{ background: "linear-gradient(135deg, rgba(102,0,204,0.5), rgba(50,0,120,0.9))", border: "1px solid rgba(200,0,255,0.6)" }}>
                  СЛЕДУЮЩИЙ →
                </button>
              )}
              <button onClick={handleVictory} className="px-6 py-3 text-white/70 font-bold tracking-widest" style={{ border: "1px solid rgba(100,100,150,0.4)" }}>
                В МЕНЮ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
