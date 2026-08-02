# DGL Announcements (Phase J1)

Jarvis reacts to Daddy Gaming Lobby website events. The website is the source of truth.

**Phase J1 scope:** `tournament_published` only — end-to-end Realtime → Discord.

## Behaviour

```
Website inserts community_activity
        ↓
Supabase Realtime (postgres_changes INSERT)
        ↓
Dispatcher (filters type)
        ↓
tournament-published handler
        ↓
Discord DGL channel
```

Jarvis is **read-only** against Supabase (anon key). Idempotency is stored locally in `dgl-announcements-state.json`.

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
2. RLS allows **anon SELECT** on rows Jarvis should see (or a secure public read policy for announcement-worthy rows).
3. INSERT events must be visible to the anon Realtime subscription.

## Expected row shape

Minimum:

- `id` (uuid) — idempotency key
- `activity_type` (or `type`) = `tournament_published`
- `created_at`

Optional payload (`payload` / `metadata` / `data`):

- `name` / `tournament_name`
- `game` / `game_name`
- `starts_at` / `start_time`
- `url` / `tournament_url`

## Isolation

This module does not import or modify MotoGP/F1/Community Predictions code.

## Phase J2 (not implemented)

Additional activity handlers, service-role acknowledgement writes, richer tournament lookups.
