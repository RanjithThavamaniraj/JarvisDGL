# Reddit publishing (JarvisDGL)

Phase 1 automatically creates a discussion thread in **r/MotoGPTamil** whenever Jarvis opens a MotoGP Community Prediction on Discord.

## Architecture

```
Scheduler
  → Create Prediction
  → Discord Publisher
  → Reddit Publisher
```

- One prediction object is created per race weekend.
- Discord and Reddit publishers are independent; a failure in one does not block the other.
- Only MotoGP predictions are published to Reddit in this phase.

## Reddit app creation

1. Sign in to [Reddit](https://www.reddit.com) with the bot account (must be a moderator of r/MotoGPTamil).
2. Open [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps).
3. Click **create another app…** (or **create app**).
4. Choose **script** as the app type.
5. Set:
   - **name:** `JarvisDGL`
   - **redirect uri:** `http://localhost:8080` (required but unused for script apps)
6. Create the app and note:
   - **client ID** — the string under the app name
   - **client secret** — labeled *secret*
7. Add the bot account as a moderator of r/MotoGPTamil if it is not already.

## Required environment variables

Add these to `.env` on the server (see `.env.example`):

| Variable | Description |
| --- | --- |
| `REDDIT_CLIENT_ID` | Script app client ID |
| `REDDIT_CLIENT_SECRET` | Script app secret |
| `REDDIT_USERNAME` | Bot Reddit username |
| `REDDIT_PASSWORD` | Bot Reddit password |
| `REDDIT_USER_AGENT` | e.g. `JarvisDGL/1.0` |
| `REDDIT_SUBREDDIT` | `MotoGPTamil` |

Optional:

| Variable | Description |
| --- | --- |
| `PIT_WALL_URL` | Link in thread body (default: `https://pit-wall-sable.vercel.app`) |

Reddit credentials are optional for the bot to start. If they are missing, Discord predictions still run and Reddit publishing is skipped with a log line.

## OAuth flow

Jarvis uses Reddit’s **script** OAuth grant (password flow) via [snoowrap](https://github.com/not-an-aardvark/snoowrap):

- `clientId` + `clientSecret` identify the app
- `username` + `password` authenticate the bot account
- `userAgent` must be set per Reddit API rules

No browser redirect is involved. snoowrap obtains and refreshes access tokens automatically on the first API call.

## Thread format

- **Title:** `🏁 {GP short name} Community Predictions` (GP name from MotoGP schedule data)
- **Body:** contender list from prediction candidates + PitWall link

`redditPostId` and `redditPostedAt` are stored on the prediction event in `predictions.json`.

## Duplicate protection

`redditPostId` in `predictions.json` is the **primary source of truth**.

1. **Verify stored ID** — If `redditPostId` is set, Jarvis fetches that submission directly from Reddit. If it still exists, publishing stops with `[Reddit] Existing thread verified.`
2. **Recover missing ID** — Only when `redditPostId` is absent, Jarvis scans the newest submissions in r/MotoGPTamil for a matching Community Prediction thread (same title, posted today or within the current race weekend). If found, it saves `redditPostId` immediately with `[Reddit] Existing thread recovered.`
3. **Create new thread** — Only when no stored ID exists and no matching thread can be recovered.

`redditPostId` is written to `predictions.json` immediately after recovery or a successful post (via atomic `upsertEvent` → `save`), so it survives PM2 restarts, VM reboots, git pulls, and reconcile ticks.

The 10-minute reconcile job retries Reddit only when `redditPostId` is missing. It never reposts when the ID is already stored.

## Oracle deployment

On the Oracle VM where JarvisDGL runs:

1. Pull the latest code:

   ```bash
   cd ~/JarvisDGL
   git pull
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Add Reddit variables to `.env` (do not commit `.env`):

   ```bash
   nano .env
   ```

4. Restart the bot with PM2:

   ```bash
   pm2 restart jarvisdgl
   ```

   If the process name differs, list processes first:

   ```bash
   pm2 list
   ```

5. Confirm logs:

   ```bash
   pm2 logs jarvisdgl --lines 50
   ```

   Look for `[Reddit]` lines on the next MotoGP prediction open.

## PM2 restart

After any `.env` or code change:

```bash
pm2 restart jarvisdgl
pm2 save
```

## Local testing

1. Copy `.env.example` to `.env` and fill Reddit credentials.
2. Ensure `motogp-cache.json` reflects the current race weekend.
3. Start the bot:

   ```bash
   node index.js
   ```

4. Trigger a reconcile (startup runs one after ~5 seconds), or temporarily call the scheduler from a small script:

   ```bash
   node -e "
   require('dotenv').config();
   const { publishRedditPrediction } = require('./src/reddit/publisher');
   const event = {
     sport: 'motogp',
     eventName: 'Grand Prix of the Netherlands',
     eventId: 'test_local',
     raceStart: new Date().toISOString(),
     candidates: [
       { displayName: 'Marc Marquez' },
       { displayName: 'Francesco Bagnaia' }
     ]
   };
   publishRedditPrediction(event).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
   "
   ```

5. Verify the thread on r/MotoGPTamil and check console output for `[Reddit] Posted successfully.`

**Dry-run duplicate check:** run the publisher twice with the same event; the second run should log `[Reddit] Duplicate thread found.`

## Production testing

1. Deploy env vars on Oracle and restart PM2.
2. Wait for Friday 6 PM IST cron or the 10-minute reconcile during an active MotoGP race weekend.
3. Confirm:
   - Discord poll appears in the MotoGP channel
   - Reddit thread appears in r/MotoGPTamil
   - `predictions.json` contains `redditPostId` for the event
4. Reconcile again; confirm no duplicate Reddit thread is created.
5. Temporarily break `REDDIT_PASSWORD` and confirm Discord polls still open while Reddit logs `[Reddit] Publish failed: ...`.

## Out of scope (Phase 1)

- Reading Reddit comments
- Polls, vote aggregation, cross-posting
- Multiple subreddits
- AI summaries, auto-locking, editing posts
