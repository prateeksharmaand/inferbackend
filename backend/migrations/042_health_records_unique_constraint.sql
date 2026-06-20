-- Remove duplicate health records keeping only the latest per (transaction_id, care_context_reference)
DELETE FROM health_records hr1
WHERE hr1.id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY transaction_id, care_context_reference ORDER BY received_at DESC) AS rn
    FROM health_records
  ) t WHERE rn > 1
);

-- Add unique constraint so ON CONFLICT DO NOTHING works correctly
ALTER TABLE health_records
  ADD CONSTRAINT health_records_txn_ref_unique
  UNIQUE (transaction_id, care_context_reference);
