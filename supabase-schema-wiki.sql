-- =============================================================================
-- IslesOfDawnMC Wiki Schema (shell)
-- Staff can submit pages, management approves/denies, public sees approved pages.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.wiki_articles (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  title            text        NOT NULL,
  slug             text        NOT NULL UNIQUE,
  excerpt          text        DEFAULT '',
  content          text        NOT NULL,
  status           text        NOT NULL DEFAULT 'pending', -- pending | approved | denied
  author_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name      text        DEFAULT '',
  reviewer_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name    text        DEFAULT '',
  review_note      text        DEFAULT '',
  reviewed_at      timestamptz,
  published_at     timestamptz,
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.wiki_articles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Management full access
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "management_all_on_wiki_articles" ON public.wiki_articles;
CREATE POLICY "management_all_on_wiki_articles"
  ON public.wiki_articles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'manager', 'owner')
    )
  );

-- ---------------------------------------------------------------------------
-- Staff can create pending submissions tied to themselves
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_insert_own_pending_wiki_articles" ON public.wiki_articles;
CREATE POLICY "staff_insert_own_pending_wiki_articles"
  ON public.wiki_articles FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('builder', 'event_team', 'media', 'qa_tester', 'helper', 'moderator', 'developer', 'admin', 'manager', 'owner')
    )
  );

-- Staff can read only their own submissions
DROP POLICY IF EXISTS "staff_read_own_wiki_articles" ON public.wiki_articles;
CREATE POLICY "staff_read_own_wiki_articles"
  ON public.wiki_articles FOR SELECT
  USING (
    author_user_id = auth.uid()
  );

-- Staff can update their own submissions (used for edit + resubmit)
DROP POLICY IF EXISTS "staff_update_own_wiki_articles" ON public.wiki_articles;
CREATE POLICY "staff_update_own_wiki_articles"
  ON public.wiki_articles FOR UPDATE
  USING (
    author_user_id = auth.uid()
  )
  WITH CHECK (
    author_user_id = auth.uid()
  );

-- Public can read approved wiki articles only
DROP POLICY IF EXISTS "public_read_approved_wiki_articles" ON public.wiki_articles;
CREATE POLICY "public_read_approved_wiki_articles"
  ON public.wiki_articles FOR SELECT
  USING (status = 'approved');

CREATE INDEX IF NOT EXISTS idx_wiki_articles_status_created
  ON public.wiki_articles (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_articles_author_created
  ON public.wiki_articles (author_user_id, created_at DESC);
