# Snapie Jump

Endless vertical bouncer starring Snapie the blue cyber bee. Canvas + requestAnimationFrame, fixed 120 Hz physics step.

- `gameId`: `snapie-jump` · `gameVersion`: `1.0.0`
- Results follow the shared `SnapieResult` contract, plus `meta: { height, honey, isNewBest }`.
  `stage` = hundreds of metres reached, plus one (1-based, so a run under 100 m is stage 1), `stagesCleared` = 100 m milestones passed, `durationMs` excludes paused time.

## React

```tsx
<SnapieJump playerName={user.name} sessionId={match.id} onResult={(r) => submit(r)} onBackToArcade={() => nav("/")} />
```

## Plain JS

```ts
const game = mountSnapieJump(el, { sessionId, playerName, onResult });
game.pause(); game.resume(); game.reset(); game.destroy();
```

## iframe embedding

Every event is posted to `window.parent` as `{ source: "snapie-game", gameId: "snapie-jump", event }`
(`ready`, `run-start`, `hud`, `stage-clear`, `game-over`). The host can send
`{ target: "snapie-jump", command: "start" | "pause" | "resume" | "reset" }`.
Query params on `/`: `?player=NAME&session=ID&embed=1` (embed hides the page chrome).

## Security

Results are unverified browser claims. The Snapie backend must issue signed single-use session tickets,
validate plausibility (score vs height vs duration), and award idempotently by `sessionId`.
