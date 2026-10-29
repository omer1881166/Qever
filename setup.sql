-- =====================================================
-- Live Event Gallery - Complete Supabase Setup Script
-- =====================================================
-- Run this script in the Supabase SQL Editor:
-- Supabase Dashboard -> Your Project -> SQL Editor -> New Query -> Run
-- =====================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Halls Table
CREATE TABLE IF NOT EXISTS public.halls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    storage_bucket TEXT DEFAULT 'event-photos',
    logo_url TEXT,
    theme TEXT DEFAULT 'balanced',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Events Table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE,
    event_name TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Face Encodings Table (Optional: used for AI search indexing)
CREATE TABLE IF NOT EXISTS public.face_encodings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hall_id UUID REFERENCES public.halls(id) ON DELETE CASCADE,
    photo_path TEXT NOT NULL,
    embedding TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

ALTER TABLE public.halls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_encodings ENABLE ROW LEVEL SECURITY;

-- --- Halls Policies ---
DROP POLICY IF EXISTS "Allow public read access to halls" ON public.halls;
CREATE POLICY "Allow public read access to halls"
ON public.halls FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow owners to insert halls" ON public.halls;
CREATE POLICY "Allow owners to insert halls"
ON public.halls FOR INSERT
WITH CHECK (auth.uid() = owner_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow owners to update halls" ON public.halls;
CREATE POLICY "Allow owners to update halls"
ON public.halls FOR UPDATE
USING (auth.uid() = owner_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow owners to delete halls" ON public.halls;
CREATE POLICY "Allow owners to delete halls"
ON public.halls FOR DELETE
USING (auth.uid() = owner_id OR auth.role() = 'authenticated');

-- --- Events Policies ---
DROP POLICY IF EXISTS "Allow public read access to events" ON public.events;
CREATE POLICY "Allow public read access to events"
ON public.events FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow authenticated to insert events" ON public.events;
CREATE POLICY "Allow authenticated to insert events"
ON public.events FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated to update events" ON public.events;
CREATE POLICY "Allow authenticated to update events"
ON public.events FOR UPDATE
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated to delete events" ON public.events;
CREATE POLICY "Allow authenticated to delete events"
ON public.events FOR DELETE
USING (auth.role() = 'authenticated');

-- --- Face Encodings Policies ---
DROP POLICY IF EXISTS "Allow public read access to face_encodings" ON public.face_encodings;
CREATE POLICY "Allow public read access to face_encodings"
ON public.face_encodings FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Allow authenticated to manage face_encodings" ON public.face_encodings;
CREATE POLICY "Allow authenticated to manage face_encodings"
ON public.face_encodings FOR ALL
USING (auth.role() = 'authenticated');

-- =====================================================
-- Storage Bucket & Storage Policies
-- =====================================================

-- Ensure the public bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-photos', 'event-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies for 'event-photos'
DROP POLICY IF EXISTS "Allow public read access to event photos" ON storage.objects;
CREATE POLICY "Allow public read access to event photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-photos');

DROP POLICY IF EXISTS "Allow authenticated uploads to event photos" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to event photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'event-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated updates to event photos" ON storage.objects;
CREATE POLICY "Allow authenticated updates to event photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'event-photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated deletes to event photos" ON storage.objects;
CREATE POLICY "Allow authenticated deletes to event photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'event-photos' AND auth.role() = 'authenticated');

-- =====================================================
-- Quick Example: How to insert a hall manually
-- =====================================================
-- 1. Check your Auth User UID in Supabase -> Authentication -> Users
-- 2. Run the query below with your user ID:
--
-- INSERT INTO public.halls (name, slug, owner_id)
-- VALUES ('Grand Ballroom', 'ballroom-1', '<YOUR_USER_UID_HERE>');
