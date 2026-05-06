-- Migration v4: přidání qty_received do order_stations (§13 dílčí toky)
-- Spusťte v Supabase SQL editoru

ALTER TABLE order_stations
  ADD COLUMN IF NOT EXISTS qty_received INTEGER NOT NULL DEFAULT 0;

-- Komentář pro dokumentaci
COMMENT ON COLUMN order_stations.qty_received IS
  'Počet ks přijatých z předchozího stanoviště (§13 dílčí toky). Nabíhá postupně.';

-- Vypočítaná WIP hodnota (view helper)
-- qty_wip = qty_received - (qty_ok + qty_rework + qty_scrap)
-- Tuto hodnotu počítáme v aplikaci.
