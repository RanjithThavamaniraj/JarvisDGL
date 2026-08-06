# DGL Announcements

Jarvis reacts to Daddy Gaming Lobby website events. The website is the source of truth.

## Pipeline

```
Website inserts community_activity
        ↓
Supabase Realtime (postgres_changes INSERT)
        ↓
Dispatcher (handler registry)
        ↓
Type-specific handler
        ↓
Discord DGL channel
```

Jarvis is **read-only** against Supabase (anon key). Idempotency is stored locally in `dgl-announcements-state.json`.

## Supported activity types (Phase J1 + J2)

| `activity_type` | Handler file |
| --- | --- |
| `tournament_published` | `handlers/tournament-published.js` |
| `giveaway_created` | `handlers/giveaway-created.js` |
| `giveaway_completed` | `handlers/giveaway-completed.js` |
| `giveaway_reminder` | `handlers/giveaway-reminder.js` |

## Adding a future handler

1. Create `handlers/<kebab-name>.js` (e.g. `registration-opened.js`)
2. Register it in `dispatcher.js` → `HANDLERS` under the snake_case key
3. Optionally add the constant in `types.js` → `ACTIVITY_TYPES`

Planned (not implemented):

- `registration_opened` → `registration-opened.js`
- `registration_closed` → `registration-closed.js`
- `tournament_started` → `tournament-started.js`
- `tournament_completed` → `tournament-completed.js`
- `tournament_cancelled` → `tournament-cancelled.js`
- `tournament_featured` → `tournament-featured.js`

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `ENABLE_DGL_ANNOUNCEMENTS` | yes | `true` to enable |
| `DGL_ANNOUNCEMENTS_CHANNEL_ID` | yes | Discord channel for DGL posts |
| `SUPABASE_URL` | yes | Same project as the DGL website |
| `SUPABASE_ANON_KEY` | yes | Anon/public key (not service role) |
| `DGL_COMMUNITY_ACTIVITY_TABLE` | no | Default `community_activity` |
| `DGL_CATCHUP_LIMIT` | no | Default `50` |
| `DGL_CATCHUP_INTERVAL_MS` | no | Default `300000` (5 min) |

## Supabase requirements (website project)

1. Realtime enabled for `community_activity` (publication).
2. RLS allows **anon SELECT** on rows Jarvis should see.
3. INSERT events must be visible to the anon Realtime subscription.

## Expected row shape

Minimum:

- `id` (uuid) — idempotency key
- `activity_type` (or `type`)
- `created_at`
- `payload` (JSON) — handler-specific fields only; no Jarvis DB lookups

## Isolation

This module does not import or modify MotoGP/F1/Community Predictions code.
