# Snapie Rush

A top-down, vertically scrolling arcade racer in the Snapie retro pixel universe.
Built to the Snapie Game Blueprint (section 11): sports car with a Snapie hood decal, fuel tank, five hazard
archetypes, five themed routes, near-miss scoring, keyboard + touch.

- `gameId`: `snapie-rush`
- `gameVersion`: `1.0.0`
- Internal resolution: 320x192, nearest-neighbour upscale, integer-snapped rendering.

This folder and `src/game/` are self-contained: no site routes, no global CSS, no backend.

## React

```tsx
import { useRef } from "react";
import { SnapieRush, type SnapieControls, type SnapieResult } from "@/components/games/snapie-rush";

const ref = useRef<SnapieControls>(null);

<SnapieRush
  ref={ref}
  playerName={user.name}
  sessionId={match.sessionId}
  autoStart
  showMenus={false}
  onResult={(r: SnapieResult) => submitToBackend(r)}
/>;

ref.current?.pause();
ref.current?.resume();
ref.current?.reset();
```

## Plain JS / any other host

```ts
import { mountSnapieRush } from "@/components/games/snapie-rush";

const game = mountSnapieRush(el, {
  sessionId,
  playerName,
  autoStart: true,
  onResult,
});

game.pause();
game.resume();
game.reset();
game.destroy();
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `playerName` | – | Stamped onto the result |
| `sessionId` | – | Opaque match id from the host |
| `startStage` | `0` | Route index to start on (0–4, 5 = hidden route) |
| `autoStart` | `false` | Begin the run as soon as it mounts |
| `showMenus` | `true` | `false` = host draws its own shell/HUD |
| `showTouchControls` | `"auto"` | `auto` detects coarse pointers |
| `keyboard` | `true` | Arrows / WASD (up = accelerate, down = brake), `P` pauses, Space starts |
| `maxWidth` | `640` | CSS max width of the cabinet |
| `onEvent` | – | `ready`, `run-start`, `hud`, `stage-clear`, `game-over`, `win` |
| `onResult` | – | Fires once per finished run with a `SnapieResult` |

## Gameplay

- Steer left/right. Hold up to boost a tier (higher multiplier, faster fuel burn) or down to brake hard; release and the car settles back to its automatic cruise speed.
- Fuel drains constantly — grab fuel cells. Empty tank ends the run even with hearts left.
- Hazards: slow truck, swerving car, oil slick (spin-out), block drone, rival rider
  (bump back for bonus points).
- Off-road = drag slowdown; hitting the barrier at high speed costs a heart.
- Score = distance x speed tier + fuel cells + near misses + stage-clear bonus.
- Five routes: Meadow Highway, Neon City, Canyon Run, Storm Coast, Orbital Ring.
  A hidden sixth route, Hive Core, unlocks at 30,000 cumulative score (stored on the device).

## Security

**Every result this game produces is an unverified player claim.** It is computed in the
browser and can be forged. Never award points, currency, or wager payouts straight from
`onResult`. The host backend must:

1. Issue a signed, single-use, expiring ticket bound to `{ sessionId, gameId, gameVersion, levelId, userId }`.
2. Verify signature, expiry, and single use when the result is posted back.
3. Validate the result itself (score/time/stage plausibility, or replay the `replayToken` input log).
4. Award idempotently, keyed on `sessionId`, with per-level and per-player caps.

`replayToken` carries a base64 input log so server-side replay validation stays possible later.
