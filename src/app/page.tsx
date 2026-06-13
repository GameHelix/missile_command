'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const WIDTH = 800;
const HEIGHT = 600;
const GROUND_Y = HEIGHT - 40;
const CITY_COUNT = 6;
const CITY_WIDTH = 50;
const BASE_X = WIDTH / 2;
const BLAST_MAX_RADIUS = 55;
const INTERCEPTOR_SPEED = 9;

type Vec = { x: number; y: number };

type Enemy = {
  pos: Vec;
  vel: Vec;
  target: Vec;
  alive: boolean;
};

type Interceptor = {
  pos: Vec;
  vel: Vec;
  target: Vec;
  exploded: boolean;
};

type Blast = {
  pos: Vec;
  radius: number;
  growing: boolean;
};

type City = {
  x: number;
  alive: boolean;
};

type GameStatus = 'ready' | 'playing' | 'over';

export default function MissileCommandGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<GameStatus>('ready');
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [citiesLeft, setCitiesLeft] = useState(CITY_COUNT);

  const stateRef = useRef({
    enemies: [] as Enemy[],
    interceptors: [] as Interceptor[],
    blasts: [] as Blast[],
    cities: [] as City[],
    wave: 1,
    score: 0,
    spawnQueue: 0,
    spawnTimer: 0,
    spawnInterval: 60,
    enemySpeed: 0.8,
    status: 'ready' as GameStatus,
  });

  const makeCities = useCallback((): City[] => {
    const cities: City[] = [];
    const slots = CITY_COUNT;
    const step = WIDTH / (slots + 1);
    for (let s = 0; s < slots; s++) {
      let x = step * (s + 1);
      // Nudge cities away from the central base.
      if (x > BASE_X - CITY_WIDTH && x < BASE_X + CITY_WIDTH) {
        x += x < BASE_X ? -step * 0.5 : step * 0.5;
      }
      cities.push({ x, alive: true });
    }
    return cities;
  }, []);

  const startWave = useCallback((waveNum: number) => {
    const s = stateRef.current;
    s.wave = waveNum;
    s.spawnQueue = 4 + waveNum * 2;
    s.spawnInterval = Math.max(20, 70 - waveNum * 5);
    s.spawnTimer = 0;
    s.enemySpeed = 0.7 + waveNum * 0.18;
    setWave(waveNum);
  }, []);

  const resetGame = useCallback(() => {
    const s = stateRef.current;
    s.enemies = [];
    s.interceptors = [];
    s.blasts = [];
    s.cities = makeCities();
    s.score = 0;
    s.status = 'playing';
    setScore(0);
    setCitiesLeft(CITY_COUNT);
    startWave(1);
    setStatus('playing');
  }, [makeCities, startWave]);

  const spawnEnemy = useCallback(() => {
    const s = stateRef.current;
    const aliveCities = s.cities.filter((c) => c.alive);
    if (aliveCities.length === 0) return;
    const startX = Math.random() * WIDTH;
    const targetCity = aliveCities[Math.floor(Math.random() * aliveCities.length)];
    const targetX = targetCity.x + (Math.random() - 0.5) * 20;
    const target = { x: targetX, y: GROUND_Y };
    const dx = target.x - startX;
    const dy = target.y;
    const dist = Math.hypot(dx, dy);
    const speed = s.enemySpeed;
    s.enemies.push({
      pos: { x: startX, y: 0 },
      vel: { x: (dx / dist) * speed, y: (dy / dist) * speed },
      target,
      alive: true,
    });
  }, []);

  const handleFire = useCallback((cx: number, cy: number) => {
    const s = stateRef.current;
    if (s.status !== 'playing') return;
    if (cy >= GROUND_Y) return;
    const start = { x: BASE_X, y: GROUND_Y };
    const dx = cx - start.x;
    const dy = cy - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    s.interceptors.push({
      pos: { ...start },
      vel: { x: (dx / dist) * INTERCEPTOR_SPEED, y: (dy / dist) * INTERCEPTOR_SPEED },
      target: { x: cx, y: cy },
      exploded: false,
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const update = () => {
      const s = stateRef.current;

      if (s.status === 'playing') {
        // Spawn enemies for the wave.
        if (s.spawnQueue > 0) {
          s.spawnTimer -= 1;
          if (s.spawnTimer <= 0) {
            spawnEnemy();
            s.spawnQueue -= 1;
            s.spawnTimer = s.spawnInterval;
          }
        }

        // Move interceptors.
        for (const it of s.interceptors) {
          if (it.exploded) continue;
          it.pos.x += it.vel.x;
          it.pos.y += it.vel.y;
          const d = Math.hypot(it.target.x - it.pos.x, it.target.y - it.pos.y);
          if (d <= INTERCEPTOR_SPEED) {
            it.exploded = true;
            s.blasts.push({ pos: { ...it.target }, radius: 4, growing: true });
          }
        }
        s.interceptors = s.interceptors.filter((it) => !it.exploded);

        // Grow / shrink blasts.
        for (const b of s.blasts) {
          if (b.growing) {
            b.radius += 1.6;
            if (b.radius >= BLAST_MAX_RADIUS) b.growing = false;
          } else {
            b.radius -= 1.2;
          }
        }
        s.blasts = s.blasts.filter((b) => b.radius > 0);

        // Move enemies.
        for (const e of s.enemies) {
          if (!e.alive) continue;
          e.pos.x += e.vel.x;
          e.pos.y += e.vel.y;

          // Blast collision.
          for (const b of s.blasts) {
            if (Math.hypot(e.pos.x - b.pos.x, e.pos.y - b.pos.y) <= b.radius) {
              e.alive = false;
              s.score += 25;
              setScore(s.score);
              break;
            }
          }

          // City hit.
          if (e.alive && e.pos.y >= GROUND_Y) {
            e.alive = false;
            let nearest: City | null = null;
            let best = Infinity;
            for (const c of s.cities) {
              if (!c.alive) continue;
              const d = Math.abs(c.x - e.pos.x);
              if (d < best) {
                best = d;
                nearest = c;
              }
            }
            if (nearest && best < CITY_WIDTH) {
              nearest.alive = false;
              s.blasts.push({ pos: { x: nearest.x, y: GROUND_Y }, radius: 4, growing: true });
              const left = s.cities.filter((c) => c.alive).length;
              setCitiesLeft(left);
            }
          }
        }
        s.enemies = s.enemies.filter((e) => e.alive);

        // Wave clear / game over checks.
        const aliveCities = s.cities.filter((c) => c.alive).length;
        if (aliveCities === 0 && s.enemies.length === 0) {
          s.status = 'over';
          setStatus('over');
        } else if (s.spawnQueue === 0 && s.enemies.length === 0) {
          // Bonus for surviving cities, advance wave.
          s.score += aliveCities * 50;
          setScore(s.score);
          startWave(s.wave + 1);
        }
      }

      // ----- Render -----
      ctx.fillStyle = '#05010f';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Stars.
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 50; i++) {
        const sx = (i * 137.5) % WIDTH;
        const sy = (i * 91.7) % (GROUND_Y - 30);
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      // Ground.
      ctx.fillStyle = '#1a0033';
      ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(0, GROUND_Y, WIDTH, 3);

      // Cities.
      for (const c of s.cities) {
        if (!c.alive) {
          ctx.fillStyle = '#3a1f1f';
          ctx.fillRect(c.x - CITY_WIDTH / 2, GROUND_Y - 8, CITY_WIDTH, 8);
          continue;
        }
        ctx.fillStyle = '#00e5ff';
        const bx = c.x - CITY_WIDTH / 2;
        ctx.fillRect(bx, GROUND_Y - 18, 10, 18);
        ctx.fillRect(bx + 14, GROUND_Y - 28, 10, 28);
        ctx.fillRect(bx + 28, GROUND_Y - 14, 10, 14);
        ctx.fillRect(bx + 40, GROUND_Y - 22, 10, 22);
      }

      // Base / turret.
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(BASE_X - 22, GROUND_Y);
      ctx.lineTo(BASE_X + 22, GROUND_Y);
      ctx.lineTo(BASE_X, GROUND_Y - 26);
      ctx.closePath();
      ctx.fill();

      // Enemy missiles + trails.
      for (const e of s.enemies) {
        ctx.strokeStyle = 'rgba(255,80,80,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.pos.x - e.vel.x * 8, e.pos.y - e.vel.y * 8);
        ctx.lineTo(e.pos.x, e.pos.y);
        ctx.stroke();
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath();
        ctx.arc(e.pos.x, e.pos.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Interceptors + trails.
      for (const it of s.interceptors) {
        ctx.strokeStyle = 'rgba(0,255,170,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(BASE_X, GROUND_Y);
        ctx.lineTo(it.pos.x, it.pos.y);
        ctx.stroke();
        ctx.fillStyle = '#aaffdd';
        ctx.beginPath();
        ctx.arc(it.pos.x, it.pos.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,255,170,0.9)';
        ctx.fillRect(it.target.x - 4, it.target.y - 1, 8, 2);
        ctx.fillRect(it.target.x - 1, it.target.y - 4, 2, 8);
      }

      // Blasts.
      for (const b of s.blasts) {
        const grad = ctx.createRadialGradient(b.pos.x, b.pos.y, 0, b.pos.x, b.pos.y, b.radius);
        grad.addColorStop(0, 'rgba(255,255,200,0.95)');
        grad.addColorStop(0.6, 'rgba(255,140,0,0.7)');
        grad.addColorStop(1, 'rgba(255,0,80,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(update);
    };

    raf = requestAnimationFrame(update);

    return () => cancelAnimationFrame(raf);
  }, [spawnEnemy, startWave]);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = WIDTH / rect.width;
      const scaleY = HEIGHT / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      handleFire(x, y);
    },
    [handleFire]
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-4 py-8 font-mono text-green-300">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-widest text-green-400 drop-shadow-[0_0_8px_#39ff14] sm:text-5xl">
          MISSILE COMMAND
        </h1>
        <p className="mt-2 text-sm text-green-500/80">
          Defend your cities from incoming missiles. Click to detonate interceptors.
        </p>
      </div>

      <div className="flex w-full max-w-3xl items-center justify-between rounded border border-green-700/50 bg-green-950/30 px-4 py-2 text-sm">
        <span>
          SCORE: <span className="text-yellow-300">{score}</span>
        </span>
        <span>
          WAVE: <span className="text-cyan-300">{wave}</span>
        </span>
        <span>
          CITIES:{' '}
          <span className="text-cyan-300">
            {citiesLeft}/{CITY_COUNT}
          </span>
        </span>
      </div>

      <div className="relative w-full max-w-3xl">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onClick={onCanvasClick}
          className="w-full cursor-crosshair rounded border-2 border-green-700/60 shadow-[0_0_25px_rgba(57,255,20,0.25)]"
          style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        />

        {status !== 'playing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded bg-black/80 text-center">
            {status === 'ready' ? (
              <>
                <h2 className="text-3xl font-bold text-green-400">READY?</h2>
                <p className="max-w-md px-4 text-sm text-green-300/80">
                  Click anywhere above the ground to launch an interceptor from your
                  central base. Time your blasts to catch falling missiles before they
                  hit your cities. Survive escalating waves!
                </p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-red-400 drop-shadow-[0_0_8px_#ff0000]">
                  GAME OVER
                </h2>
                <p className="text-green-300">
                  Final Score: <span className="text-yellow-300">{score}</span> · Reached
                  Wave <span className="text-cyan-300">{wave}</span>
                </p>
              </>
            )}
            <button
              onClick={resetGame}
              className="rounded border border-green-400 bg-green-500/10 px-6 py-2 font-bold tracking-wider text-green-300 transition hover:bg-green-500/30 hover:text-white"
            >
              {status === 'ready' ? 'START GAME' : 'RESTART'}
            </button>
          </div>
        )}
      </div>

      <div className="max-w-3xl text-center text-xs text-green-600/70">
        Tip: Detonate interceptors slightly ahead of incoming missiles — the blast radius
        lingers and destroys anything that flies through it.
      </div>
    </main>
  );
}
