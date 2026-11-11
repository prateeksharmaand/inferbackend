-- 035_dedupe_wallet_packs.sql
-- The startup seed re-inserted the 3 credit packs on every restart (no unique key), so the Wallet
-- page listed each pack dozens of times. Keep the oldest row per pack, repoint any orders, add a
-- unique key so it cannot happen again.
BEGIN;
WITH keep AS (
  SELECT DISTINCT ON (pack_name) pack_name, id FROM wallet_packs ORDER BY pack_name, created_at, id
)
UPDATE payment_orders po SET pack_id = k.id
  FROM wallet_packs w JOIN keep k ON k.pack_name = w.pack_name
 WHERE po.pack_id = w.id AND w.id <> k.id;
DELETE FROM wallet_packs w
 USING (SELECT DISTINCT ON (pack_name) pack_name, id FROM wallet_packs ORDER BY pack_name, created_at, id) k
 WHERE w.pack_name = k.pack_name AND w.id <> k.id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_packs_name ON wallet_packs (pack_name);
COMMIT;
