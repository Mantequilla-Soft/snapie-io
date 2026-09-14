# Snapie Blast SDK

An 8-bit NES-style shooting gallery, built to the Snapie Game Blueprint. Self-contained: no host router, no host CSS, no backend.

- `gameId`: `snapie-blast`
- `gameVersion`: exported as `GAME_VERSION`
- Internal resolution: 320x192, nearest-neighbour scaled
- Round: 60 seconds or 3 lives (one lost per missed shot), whichever ends first
- Up to 6 aliens on screen; speed and point multiplier ramp with the stage

## React

```tsx
import { useRef } from "react";
import { SnapieBlast, type SnapieControls, type SnapieResult } from "@/snapie-blast";

const ref = useRef<SnapieControls>(null);

<SnapieBlast
  ref={ref}
  playerName={user.name}
  sessionId={match.sessionId}
  autoStart
  showMenus={false}
  onResult={(r: SnapieResult) => submitToBackend(r)}
  onEvent={(e) => console.log(e.type)}
/>;

// ref.current?.pause() / .resume() / .reset() / .start(3) / .getHud()
```

## Plain DOM

```ts
import { mountSnapieBlast } from "@/snapie-blast";

const game = mountSnapieBlast(document.getElementById("game")!, {
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

`playerName`, `sessionId`, `startStage`, `autoStart`, `showMenus`, `showTouchControls`, `keyboard`, `maxWidth`, `onEvent`, `onResult`.

With `showMenus: false` the host draws its own shell; the canvas emits `hud` events so you can render your own HUD, and a click on the idle/ended canvas restarts the run.

## Events

`ready` → `run-start` → `hud` (twice per second and on every score change) → `stage-clear` → `game-over` or `win`.

`win` fires when the player survives the full 60 seconds; `game-over` fires when the third life is lost. Aliens that cross the screen cost 5 points, not a life.

## Controls

- Mouse / touch: click or tap inside the canvas to fire at that point
- Keyboard: arrows or WASD move the crosshair, Space/Enter fires (and starts/retries), P pauses

## Security — results are player claims

`onResult` is produced in the browser. It is an **unverified player claim**.

- Never award points straight from `onResult`.
- Issue a signed, single-use, expiring ticket bound to `{ sessionId, gameId, gameVersion, userId }` before the run, and verify it server-side alongside the result.
- Make payouts idempotent, keyed on `sessionId`.
- `replayToken` is a base64 input log (timestamp, x, y, hit flag) so server-side replay validation stays possible later.
