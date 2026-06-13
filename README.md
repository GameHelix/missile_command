# Missile Command

A retro arcade game built with Next.js and TypeScript. Defend a row of cities from
incoming enemy missiles by launching interceptors that detonate into expanding blasts.

## How to Play

- Enemy missiles fall from the top of the screen toward your cities.
- **Click anywhere** above the ground to launch an interceptor from your central base.
  It travels to your click point and detonates into an expanding blast.
- Any enemy missile caught inside a blast radius is destroyed (+25 points).
- A missile that reaches a city destroys it. Lose all six cities and it's game over.
- Each cleared wave brings more and faster missiles. Surviving cities earn bonus points.
- Press **Restart** to play again.

## Tech Stack

- [Next.js](https://nextjs.org/) (App Router)
- TypeScript
- HTML5 Canvas + `requestAnimationFrame` game loop
- Tailwind CSS

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to play.

## Build

```bash
npm run build
npm start
```
