# SNAPIE: INFORMATION WAR — embeddable package

`gameId: "snapie-info-war"` · `gameVersion: "1.0.0"`

Self-contained SNES-style run-and-gun. Engine code lives in `src/game/`; this folder is the public surface.

## React

```tsx
import { useRef } from "react";
import { SnapieInfoWar, type SnapieControls } from "@/snapie-info-war";

const ref = useRef<SnapieControls>(null);
<SnapieInfoWar
  ref={ref}
  playerName="ANDRES"
  sessionId="abc123"
  startStage={1}
  autoStart={false}
  showMenus={false}          // host drives start/reset
  showTouchControls          // default: auto on touch devices
  maxWidth={1152}
  onEvent={(e) => console.log(e.type, e)}
  onResult={(r) => saveScore(r)}
/>;
ref.current?.start();  // pause(), resume(), reset(), getPhase(), getHud()
```

Options are read once on mount — change the component `key` to remount with new options.

## Vanilla DOM

```ts
import { mountSnapieInfoWar } from "@/snapie-info-war";
const game = mountSnapieInfoWar(document.getElementById("slot")!, { playerName: "ANDRES", autoStart: true });
game.pause(); game.resume(); game.destroy();
```

## Events (`SnapieEvent`)

| type | payload |
| --- | --- |
| `ready` | `sessionId`, `playerName` |
| `run-start` | `sessionId`, `stage` |
| `hud` | `hud: SnapieHud` (sent ~4×/s while playing, only when changed) |
| `stage-clear` | `stage`, `score` |
| `game-over` | `result: SnapieResult` (`won: false`) |
| `win` | `result: SnapieResult` (`won: true`) |

`onResult` fires once per run, on game-over or win.

## iframe embedding

URL: `/?embed=1&player=NAME&session=ID` — `embed=1` removes page chrome and fills the viewport.
In embed mode menus are hidden, so the host has to send `start`. Without `embed`, the normal title menu shows.

```html
<iframe id="snapie" src="https://YOUR-APP/?embed=1&player=ANDRES&session=abc123" allow="autoplay" style="width:100%;aspect-ratio:16/9;border:0"></iframe>
<script>
  const frame = document.getElementById("snapie");
  window.addEventListener("message", (e) => {
    if (e.origin !== "https://YOUR-APP") return;           // verify origin!
    if (e.data?.source === "snapie-game" && e.data.gameId === "snapie-info-war") console.log(e.data.event);
  });
  frame.contentWindow.postMessage({ target: "snapie-info-war", command: "start" }, "https://YOUR-APP");
</script>
```

Commands: `start` | `pause` | `resume` | `reset`.

## Security notes

- **Scores are reported by the player's own browser and can be faked.** Treat `SnapieResult` as untrusted. For leaderboards or prizes, check results on your server (plausible score for the `durationMs`, rate limits, one result per `sessionId`). `replayToken` is reserved for future server-side checks and isn't populated yet.
- Events are posted to `window.parent` with target origin `"*"` because the game can't know who embeds it. They contain no secrets, but **hosts must check `event.origin`** before trusting them.
- The game only accepts the four command strings listed above. Anything else is ignored, and nothing in a message is ever evaluated as code. Any page that can post to the iframe can pause or restart it, so only embed the game on pages you control.
- `player` and `session` query values are capped at 24 and 64 characters. They're used only as plain text and echoed back in results, never inserted as HTML.
- Progress, high score and settings are stored in `localStorage` (`snapie_save`) on the game's own origin.
