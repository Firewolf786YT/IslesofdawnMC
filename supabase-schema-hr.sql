-- =============================================================================
-- IslesOfDawnMC — HR Portal Schema
-- Run these statements in your Supabase SQL Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Staff Files — one record per staff member being onboarded or active
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_files (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  minecraft_username text        NOT NULL,
  user_id           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  discord           text,
  email             text,
  applied_role_id   text,        -- application role id (e.g. "support-team")
  assigned_role     text,        -- role pill value (e.g. "helper", "moderator")
  application_id    text,        -- id from application_submissions
  onboarding        jsonb       NOT NULL DEFAULT '{
    "interviewScheduled": false,
    "interviewDate": "",
    "interviewComplete": false,
    "interviewStatus": "pending",
    "interviewNotes": "",
    "onboardingSetup": false,
    "portalGuided": false,
    "workflowExplained": false,
    "onboardingComplete": false,
    "approvedAt": null,
    "deniedAt": null
  }'::jsonb,
  notes             text        DEFAULT '',
  is_active         boolean     DEFAULT false,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2. Staff Feedback — positive / neutral / negative feedback entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_feedback (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_file_id  uuid        NOT NULL REFERENCES public.staff_files(id) ON DELETE CASCADE,
  author         text        NOT NULL,
  type           text        NOT NULL DEFAULT 'neutral', -- positive | neutral | negative
  content        text        NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 3. Staff Disciplinary Actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_disciplinary (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_file_id  uuid        NOT NULL REFERENCES public.staff_files(id) ON DELETE CASCADE,
  type           text        NOT NULL DEFAULT 'verbal_warning',
    -- verbal_warning | written_warning | suspension | demotion | other
  reason         text        NOT NULL,
  issued_by      text        NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 4. Staff Activity Log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_activity (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_file_id  uuid        NOT NULL REFERENCES public.staff_files(id) ON DELETE CASCADE,
  type           text        NOT NULL DEFAULT 'note',
    -- note | absence | meeting | promotion | other
  content        text        NOT NULL,
  logged_by      text        NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 5. Application Lockouts — prevents re-applying for 2 weeks after denial
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_lockouts (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  minecraft_username text        NOT NULL,
  locked_until       timestamptz NOT NULL,
  reason             text        DEFAULT 'Application denied',
  created_at         timestamptz DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- 6. Staff LOA Requests — request time away from duties
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_loa_requests (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_file_id     uuid        NOT NULL REFERENCES public.staff_files(id) ON DELETE CASCADE,
  requester_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason            text        NOT NULL,
  start_date        date,
  end_date          date,
  status            text        NOT NULL DEFAULT 'pending', -- pending | approved | denied
  manager_note      text        DEFAULT '',
  reviewed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz DEFAULT now() NOT NULL,
  updated_at        timestamptz DEFAULT now() NOT NULL
);

-- =============================================================================
-- Row-Level Security (RLS) — enable after reviewing for your setup
-- =============================================================================

ALTER TABLE public.staff_files        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_feedback      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_disciplinary  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_loa_requests  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper function — returns true if the calling user has a management role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_management_user()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'manager', 'owner')
  );
$$;

-- ---------------------------------------------------------------------------
-- Policies: staff_files
-- ---------------------------------------------------------------------------
-- Management can do anything
CREATE POLICY "management_all_on_staff_files"
  ON public.staff_files FOR ALL
  USING (public.is_management_user())
  WITH CHECK (public.is_management_user());

-- Staff member can read their own file
CREATE POLICY "staff_read_own_file"
  ON public.staff_files FOR SELECT
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Policies: staff_feedback
-- ---------------------------------------------------------------------------
CREATE POLICY "management_all_on_staff_feedback"
  ON public.staff_feedback FOR ALL
  USING (public.is_management_user())
  WITH CHECK (public.is_management_user());

CREATE POLICY "staff_read_own_feedback"
  ON public.staff_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_files sf
      WHERE sf.id = staff_file_id AND sf.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: staff_disciplinary
-- ---------------------------------------------------------------------------
CREATE POLICY "management_all_on_staff_disciplinary"
  ON public.staff_disciplinary FOR ALL
  USING (public.is_management_user())
  WITH CHECK (public.is_management_user());

CREATE POLICY "staff_read_own_disciplinary"
  ON public.staff_disciplinary FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_files sf
      WHERE sf.id = staff_file_id AND sf.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: staff_activity
-- ---------------------------------------------------------------------------
CREATE POLICY "management_all_on_staff_activity"
  ON public.staff_activity FOR ALL
  USING (public.is_management_user())
  WITH CHECK (public.is_management_user());

CREATE POLICY "staff_read_own_activity"
  ON public.staff_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_files sf
      WHERE sf.id = staff_file_id AND sf.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Policies: application_lockouts
-- ---------------------------------------------------------------------------
-- Anyone can read (needed by the public apply page to check lockouts)
CREATE POLICY "public_read_lockouts"
  ON public.application_lockouts FOR SELECT
  USING (true);

-- Management can insert/update/delete lockouts
CREATE POLICY "management_write_lockouts"
  ON public.application_lockouts FOR ALL
  USING (public.is_management_user())
  WITH CHECK (public.is_management_user());

-- ---------------------------------------------------------------------------
-- Policies: staff_loa_requests
-- ---------------------------------------------------------------------------
CREATE POLICY "management_all_on_staff_loa_requests"
  ON public.staff_loa_requests FOR ALL
  USING (public.is_management_user())
  WITH CHECK (public.is_management_user());

CREATE POLICY "staff_read_own_loa_requests"
  ON public.staff_loa_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_files sf
      WHERE sf.id = staff_file_id AND sf.user_id = auth.uid()
    )
  );

CREATE POLICY "staff_insert_own_loa_requests"
  ON public.staff_loa_requests FOR INSERT
  WITH CHECK (
    requester_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff_files sf
      WHERE sf.id = staff_file_id AND sf.user_id = auth.uid()
    )
  );

-- =============================================================================
-- Indexes (optional but recommended for performance)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_staff_files_minecraft_username
  ON public.staff_files (lower(minecraft_username));

CREATE INDEX IF NOT EXISTS idx_staff_files_user_id
  ON public.staff_files (user_id);

CREATE INDEX IF NOT EXISTS idx_staff_feedback_file_id
  ON public.staff_feedback (staff_file_id);

CREATE INDEX IF NOT EXISTS idx_staff_disciplinary_file_id
  ON public.staff_disciplinary (staff_file_id);

CREATE INDEX IF NOT EXISTS idx_staff_activity_file_id
  ON public.staff_activity (staff_file_id);

CREATE INDEX IF NOT EXISTS idx_lockouts_username_expiry
  ON public.application_lockouts (lower(minecraft_username), locked_until);

CREATE INDEX IF NOT EXISTS idx_staff_loa_requests_file_id
  ON public.staff_loa_requests (staff_file_id);

CREATE INDEX IF NOT EXISTS idx_staff_loa_requests_status_created
  ON public.staff_loa_requests (status, created_at DESC);
