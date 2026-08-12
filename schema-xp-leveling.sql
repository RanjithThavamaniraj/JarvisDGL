-- JarvisDGL XP / Leveling (optional secondary feature)
-- Completely separate from prediction points (discord_users.total_points).
-- Run this in the Supabase SQL Editor before enabling ENABLE_XP_LEVELING.

-- 1. Dedicated member levels table
CREATE TABLE IF NOT EXISTS public.discord_member_levels (
    discord_user_id TEXT PRIMARY KEY,
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    messages_count INTEGER NOT NULL DEFAULT 0 CHECK (messages_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS discord_member_levels_xp_idx
    ON public.discord_member_levels (xp DESC);

CREATE INDEX IF NOT EXISTS discord_member_levels_level_idx
    ON public.discord_member_levels (level DESC);

-- 2. RLS (service role bypasses; public read mirrors existing conventions)
ALTER TABLE public.discord_member_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.discord_member_levels;
CREATE POLICY "Allow public read access"
    ON public.discord_member_levels
    FOR SELECT
    USING (true);

-- 3. Level helpers — MUST stay in sync with xp-leveling/levels.js
--    xp_required(level) = 30*(level-1)^2 + 70*(level-1)
--    level_from_xp(xp)   = floor((-70 + sqrt(4900 + 120*xp)) / 60) + 1

CREATE OR REPLACE FUNCTION public.xp_level_from_total(p_xp INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_xp IS NULL OR p_xp <= 0 THEN 1
        ELSE GREATEST(
            1,
            FLOOR(((-70 + SQRT(4900 + 120 * p_xp::DOUBLE PRECISION)) / 60))::INTEGER + 1
        )
    END;
$$;

-- 4. Atomic award: single round-trip upsert + increment (no SELECT→UPDATE race)
CREATE OR REPLACE FUNCTION public.award_discord_member_xp(
    p_discord_user_id TEXT,
    p_xp_delta INTEGER
)
RETURNS TABLE (
    discord_user_id TEXT,
    xp INTEGER,
    level INTEGER,
    messages_count INTEGER,
    previous_xp INTEGER,
    previous_level INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_prev_xp INTEGER;
    v_new_xp INTEGER;
    v_new_level INTEGER;
    v_messages INTEGER;
BEGIN
    IF p_discord_user_id IS NULL OR length(trim(p_discord_user_id)) = 0 THEN
        RAISE EXCEPTION 'discord_user_id required';
    END IF;

    IF p_xp_delta IS NULL OR p_xp_delta <= 0 THEN
        RAISE EXCEPTION 'xp_delta must be positive';
    END IF;

    INSERT INTO public.discord_member_levels AS dml (
        discord_user_id,
        xp,
        level,
        messages_count
    )
    VALUES (
        p_discord_user_id,
        p_xp_delta,
        public.xp_level_from_total(p_xp_delta),
        1
    )
    ON CONFLICT (discord_user_id) DO UPDATE
    SET
        xp = dml.xp + EXCLUDED.xp,
        level = public.xp_level_from_total(dml.xp + EXCLUDED.xp),
        messages_count = dml.messages_count + 1,
        updated_at = timezone('utc'::text, now())
    RETURNING
        dml.xp,
        dml.xp - p_xp_delta,
        dml.level,
        dml.messages_count
    INTO v_new_xp, v_prev_xp, v_new_level, v_messages;

    IF v_prev_xp < 0 THEN
        v_prev_xp := 0;
    END IF;

    discord_user_id := p_discord_user_id;
    xp := v_new_xp;
    level := v_new_level;
    messages_count := v_messages;
    previous_xp := v_prev_xp;
    previous_level := public.xp_level_from_total(v_prev_xp);
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.award_discord_member_xp(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_discord_member_xp(TEXT, INTEGER) TO service_role;
