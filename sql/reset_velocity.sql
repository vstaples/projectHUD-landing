-- ============================================================
-- CMD101.5i — Reset velocity baseline
-- ============================================================
-- Bring updated_at back to created_at for every prospect, so the
-- velocity dial's 30/60-day windows start empty. The trigger from
-- CMD101.5h will repopulate updated_at on the next real PATCH.
--
-- Trigger note: this UPDATE will fire trg_prospects_set_updated_at,
-- which would force updated_at = now() and defeat the purpose.
-- DISABLE/ENABLE the trigger for the duration of this single statement.

ALTER TABLE prospects DISABLE TRIGGER trg_prospects_set_updated_at;

UPDATE prospects
   SET updated_at = created_at;

ALTER TABLE prospects ENABLE TRIGGER trg_prospects_set_updated_at;

-- Verify:
SELECT count(*) AS rows_total,
       count(*) FILTER (WHERE updated_at = created_at) AS rows_reset
  FROM prospects;