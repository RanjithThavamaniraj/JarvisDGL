-- Pit Wall Architecture: Phase 1 Schema Migration
-- Run this in your Supabase SQL Editor

-- 1. Create Core Tables

CREATE TABLE public.discord_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    total_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.drivers (
    id TEXT PRIMARY KEY, -- e.g., 'Antonelli', 'Hamilton'
    name TEXT NOT NULL
);

CREATE TABLE public.predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.discord_users(id) ON DELETE CASCADE,
    driver_id TEXT NOT NULL REFERENCES public.drivers(id),
    event_id TEXT NOT NULL, -- e.g., 'RaceWeek_2026_25'
    prediction_type TEXT NOT NULL, -- e.g., 'RACE_WIN'
    points_awarded INTEGER, -- Null until race is resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, event_id, prediction_type)
);

-- 2. Apply Row Level Security (RLS)

ALTER TABLE public.discord_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- 3. Security Policies
-- Note: Service Role Key (used by Jarvis Server) inherently bypasses RLS.
-- We explicitly define public read-only access for data exposed to the frontend without auth.

CREATE POLICY "Allow public read access" ON public.discord_users FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON public.predictions FOR SELECT USING (true);
