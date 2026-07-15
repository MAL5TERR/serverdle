# Serverdle

A daily Wordle-style guessing game for a Discord server — guess today's mystery member using attribute clues (join year, interest, favorite, status, role).

Single static HTML page. No backend, no build step, no dependencies.

## Run locally

Just open `index.html` in a browser, or serve it:

```bash
npx serve .
```

## Edit the member list

All data lives in the `people` array near the top of the `<script>` tag in `index.html`:

```js
const people = [
  { name: "Ali", joinYear: 2021, interest: "Gaming", favorite: "Valorant", status: "Active", role: "Admin" },
  // ...
];
```

Add, remove, or edit entries directly. The daily answer is picked deterministically from the current date, so it rotates automatically at midnight (UTC-based on `Date.now()`) and stays the same for every player on a given day.

## Deploy

This repo is set up to deploy straight to Netlify:

1. Push to GitHub
2. In Netlify: **Add new site → Import an existing project**
3. Connect this repo
4. Build command: *(none)* — Publish directory: `/`
5. Deploy

Every push to `main` auto-redeploys.

## Discord bot integration (planned)

The game exposes a result hook for future bot integration:

- `window.getServerdleResult()` — returns `{ date, answer, won, attemptsUsed, maxAttempts, guesses }` at any time
- `serverdle:finished` — a `CustomEvent` fired the moment a game ends (win or loss), with the same data in `event.detail`

To connect a bot, add a fetch call inside `emitResult()` in `index.html` pointing at your bot's webhook/API endpoint once it exists.

## Notes

- Progress is stored per-player in `localStorage`, keyed to the current day — refreshing won't reset an in-progress game.
- No shared leaderboard yet (would need a small backend/DB to track results across players).
