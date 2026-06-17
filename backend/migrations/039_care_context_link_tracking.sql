-- =============================================================================
-- Care Context Link Tracking — 2026-06-17
-- Adds link_status and linked_at columns to emr_care_contexts so the EMR can
-- track whether each Care Context has been successfully pushed to ABDM via the
-- HIP-initiated link API (hip/v3/link/carecontext).
-- =============================================================================

BEGIN;

-- ── emr_care_contexts: add ABDM link tracking columns ────────────────────────
ALTER TABLE emr_care_contexts
  ADD COLUMN IF NOT EXISTS link_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (link_status IN ('pending', 'linked', 'failed')),
  ADD COLUMN IF NOT EXISTS linked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_error  TEXT;

-- Index for finding unlinked care contexts (background retry queue)
CREATE INDEX IF NOT EXISTS idx_care_ctx_link_status
  ON emr_care_contexts(link_status)
  WHERE link_status IN ('pending', 'failed');

-- Back-fill: care contexts already confirmed via link sessions are 'linked'
-- (hip_link_sessions status='confirmed' means the patient confirmed the OTP)
UPDATE emr_care_contexts cc
SET link_status = 'linked',
    linked_at   = NOW()
WHERE EXISTS (
  SELECT 1 FROM hip_link_sessions hls
  WHERE hls.status = 'confirmed'
    AND hls.care_contexts::text LIKE '%' || cc.reference_number || '%'
);

COMMIT;
