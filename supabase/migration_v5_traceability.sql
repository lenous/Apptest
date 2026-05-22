-- Migration v5: dávková traceability, výrobní eventy, test flow a stanice Testování
-- Spusťte v Supabase SQL editoru po předchozích migracích.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('operator', 'tpv', 'dispatcher', 'management', 'admin'));

INSERT INTO public.stations (id, name, order_index)
VALUES (13, 'Testování', 13)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, order_index = EXCLUDED.order_index;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS selective_wave_program TEXT,
  ADD COLUMN IF NOT EXISTS test_flow TEXT NOT NULL DEFAULT 'output_control';

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_test_flow_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_test_flow_check CHECK (test_flow IN ('none','output_control','separate_station'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS selective_wave_program TEXT,
  ADD COLUMN IF NOT EXISTS test_flow TEXT NOT NULL DEFAULT 'output_control';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_test_flow_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_test_flow_check CHECK (test_flow IN ('none','output_control','separate_station'));

ALTER TABLE public.order_stations
  ADD COLUMN IF NOT EXISTS qty_received INTEGER NOT NULL DEFAULT 0;

INSERT INTO public.order_stations (order_id, station_id, applicable)
SELECT o.id, 13, o.test_flow = 'separate_station'
FROM public.orders o
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_stations os
  WHERE os.order_id = o.id AND os.station_id = 13
);

CREATE OR REPLACE FUNCTION public.create_order_stations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  app_stations SMALLINT[];
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT applicable_stations INTO app_stations
    FROM public.products WHERE id = NEW.product_id;
  END IF;

  INSERT INTO public.order_stations (order_id, station_id, applicable)
  SELECT
    NEW.id,
    s.id,
    CASE
      WHEN s.id = 13 THEN NEW.test_flow = 'separate_station'
      WHEN app_stations IS NULL THEN true
      WHEN s.id = ANY(app_stations) THEN true
      ELSE false
    END
  FROM public.stations s
  ON CONFLICT (order_id, station_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.defect_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  station_id  SMALLINT REFERENCES public.stations(id),
  event_type  TEXT CHECK (event_type IN ('aoi','manual_assembly','soldering','repair','testing','transfer','general')),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.defect_types (code, label, station_id, event_type) VALUES
  ('AOI_MISSING', 'Chybějící součástka', 3, 'aoi'),
  ('AOI_POLARITY', 'Špatná polarita', 3, 'aoi'),
  ('AOI_SOLDER', 'Podezřelý spoj', 3, 'aoi'),
  ('MANUAL_POSITION', 'Chyba ručního osazení', 6, 'manual_assembly'),
  ('SOLDER_BRIDGE', 'Můstek po pájení', 7, 'soldering'),
  ('SOLDER_COLD', 'Studený spoj', 7, 'soldering'),
  ('REPAIR_REOPENED', 'Oprava vyžaduje další zásah', NULL, 'repair'),
  ('TEST_FAIL', 'Selhání testu', NULL, 'testing')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.production_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES public.products(id),
  order_station_id UUID REFERENCES public.order_stations(id) ON DELETE SET NULL,
  station_id       SMALLINT REFERENCES public.stations(id),
  event_type       TEXT NOT NULL CHECK (event_type IN ('aoi','manual_assembly','soldering','repair','testing','transfer','general')),
  result           TEXT NOT NULL CHECK (result IN ('ok','nok','partial','pass','fail','retest','completed')),
  qty_total        INT NOT NULL DEFAULT 0 CHECK (qty_total >= 0),
  qty_ok           INT NOT NULL DEFAULT 0 CHECK (qty_ok >= 0),
  qty_nok          INT NOT NULL DEFAULT 0 CHECK (qty_nok >= 0),
  qty_rework       INT NOT NULL DEFAULT 0 CHECK (qty_rework >= 0),
  qty_scrap        INT NOT NULL DEFAULT 0 CHECK (qty_scrap >= 0),
  soldering_type   TEXT CHECK (soldering_type IN ('vlna','selektivni','rucni')),
  program_code     TEXT,
  repair_action    TEXT,
  measurement      JSONB NOT NULL DEFAULT '{}'::jsonb,
  note             TEXT,
  photo_paths      TEXT[],
  source_event_id  UUID REFERENCES public.production_events(id) ON DELETE SET NULL,
  actor_id         UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_events_order ON public.production_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_events_product ON public.production_events(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_events_station ON public.production_events(station_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_events_type ON public.production_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.production_event_defects (
  event_id        UUID NOT NULL REFERENCES public.production_events(id) ON DELETE CASCADE,
  defect_type_id  UUID NOT NULL REFERENCES public.defect_types(id),
  qty             INT NOT NULL DEFAULT 1 CHECK (qty >= 0),
  note            TEXT,
  PRIMARY KEY (event_id, defect_type_id)
);

CREATE OR REPLACE FUNCTION public.record_production_event(
  p_order_id UUID,
  p_order_station_id UUID,
  p_station_id SMALLINT,
  p_event_type TEXT,
  p_result TEXT,
  p_qty_total INT DEFAULT 0,
  p_qty_ok INT DEFAULT 0,
  p_qty_nok INT DEFAULT 0,
  p_qty_rework INT DEFAULT 0,
  p_qty_scrap INT DEFAULT 0,
  p_soldering_type TEXT DEFAULT NULL,
  p_program_code TEXT DEFAULT NULL,
  p_repair_action TEXT DEFAULT NULL,
  p_measurement JSONB DEFAULT '{}'::jsonb,
  p_note TEXT DEFAULT NULL,
  p_photo_paths TEXT[] DEFAULT NULL,
  p_source_event_id UUID DEFAULT NULL,
  p_defect_type_ids UUID[] DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_event_id UUID;
  v_product_id UUID;
  v_test_flow TEXT;
  v_order_qty INT;
  v_order_station public.order_stations%ROWTYPE;
  v_defect_id UUID;
  v_allowed BOOLEAN := false;
BEGIN
  IF COALESCE(p_qty_total, 0) < 0 OR COALESCE(p_qty_ok, 0) < 0 OR
     COALESCE(p_qty_nok, 0) < 0 OR COALESCE(p_qty_rework, 0) < 0 OR COALESCE(p_qty_scrap, 0) < 0 THEN
    RAISE EXCEPTION 'Množství nesmí být záporné';
  END IF;

  SELECT product_id, test_flow, quantity INTO v_product_id, v_test_flow, v_order_qty
  FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Zakázka neexistuje';
  END IF;

  IF p_order_station_id IS NOT NULL THEN
    SELECT * INTO v_order_station FROM public.order_stations WHERE id = p_order_station_id;
    IF NOT FOUND OR v_order_station.order_id <> p_order_id THEN
      RAISE EXCEPTION 'Stanoviště nepatří k zakázce';
    END IF;
  ELSE
    SELECT * INTO v_order_station
    FROM public.order_stations
    WHERE order_id = p_order_id AND station_id = p_station_id
    LIMIT 1;
  END IF;

  IF p_event_type = 'transfer' OR p_event_type = 'general' THEN
    v_allowed := true;
  ELSIF p_station_id = 3 AND p_event_type = 'aoi' THEN
    v_allowed := true;
  ELSIF p_station_id = 6 AND p_event_type = 'manual_assembly' THEN
    v_allowed := true;
  ELSIF p_station_id = 7 AND p_event_type = 'soldering' THEN
    v_allowed := true;
  ELSIF p_station_id IN (5, 8) AND p_event_type = 'repair' THEN
    v_allowed := true;
  ELSIF p_station_id = 11 AND p_event_type = 'testing' AND v_test_flow = 'output_control' THEN
    v_allowed := true;
  ELSIF p_station_id = 13 AND p_event_type = 'testing' AND v_test_flow = 'separate_station' THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Typ záznamu neodpovídá stanovišti nebo nastavení testování';
  END IF;

  IF v_order_station.id IS NOT NULL AND p_event_type <> 'transfer' THEN
    IF (COALESCE(v_order_station.qty_ok, 0) + COALESCE(p_qty_ok, 0) +
        COALESCE(v_order_station.qty_rework, 0) + COALESCE(p_qty_rework, 0) +
        COALESCE(v_order_station.qty_scrap, 0) + COALESCE(p_qty_scrap, 0)) >
       CASE
         WHEN COALESCE(v_order_station.qty_received, 0) > 0 THEN COALESCE(v_order_station.qty_received, 0)
         ELSE COALESCE(v_order_qty, 0)
       END THEN
      RAISE EXCEPTION 'Zpracované množství nesmí překročit přijaté množství';
    END IF;
  END IF;

  INSERT INTO public.production_events (
    order_id, product_id, order_station_id, station_id, event_type, result,
    qty_total, qty_ok, qty_nok, qty_rework, qty_scrap,
    soldering_type, program_code, repair_action, measurement, note,
    photo_paths, source_event_id, actor_id
  ) VALUES (
    p_order_id, v_product_id, COALESCE(v_order_station.id, p_order_station_id), p_station_id, p_event_type, p_result,
    COALESCE(p_qty_total, 0), COALESCE(p_qty_ok, 0), COALESCE(p_qty_nok, 0),
    COALESCE(p_qty_rework, 0), COALESCE(p_qty_scrap, 0),
    p_soldering_type, p_program_code, p_repair_action, COALESCE(p_measurement, '{}'::jsonb), p_note,
    p_photo_paths, p_source_event_id, auth.uid()
  )
  RETURNING id INTO v_event_id;

  IF p_defect_type_ids IS NOT NULL THEN
    FOREACH v_defect_id IN ARRAY p_defect_type_ids LOOP
      INSERT INTO public.production_event_defects (event_id, defect_type_id, qty)
      VALUES (v_event_id, v_defect_id, 1)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF v_order_station.id IS NOT NULL AND p_event_type <> 'transfer' THEN
    UPDATE public.order_stations
    SET
      qty_ok = qty_ok + COALESCE(p_qty_ok, 0),
      qty_rework = qty_rework + COALESCE(p_qty_rework, 0),
      qty_scrap = qty_scrap + COALESCE(p_qty_scrap, 0),
      soldering_type = COALESCE(p_soldering_type, soldering_type),
      status = CASE WHEN status = 'waiting' THEN 'in_progress' ELSE status END,
      started_at = COALESCE(started_at, now()),
      operator_id = auth.uid()
    WHERE id = v_order_station.id;
  END IF;

  INSERT INTO public.audit_log (order_id, station_id, actor_id, action, payload)
  VALUES (
    p_order_id, p_station_id, auth.uid(), 'production_event_recorded',
    jsonb_build_object('event_id', v_event_id, 'event_type', p_event_type, 'result', p_result)
  );

  RETURN v_event_id;
END;
$$;

ALTER TABLE public.defect_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_event_defects ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['defect_types','production_events','production_event_defects'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'auth read'
    ) THEN
      EXECUTE format('CREATE POLICY "auth read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['production_events','production_event_defects'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'auth insert'
    ) THEN
      EXECUTE format('CREATE POLICY "auth insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "auth update" ON public.production_events;
DROP POLICY IF EXISTS "auth update" ON public.production_event_defects;

CREATE OR REPLACE VIEW public.orders_dashboard AS
SELECT
  o.*,
  c.name AS customer_name,
  p.code AS product_code,
  p.name AS product_name,
  (SELECT COUNT(*) FROM public.order_stations os
    WHERE os.order_id = o.id AND os.status = 'completed') AS stations_done,
  (SELECT COUNT(*) FROM public.order_stations os
    WHERE os.order_id = o.id AND os.status = 'issue') AS stations_issue,
  (SELECT COUNT(*) FROM public.order_stations os
    WHERE os.order_id = o.id AND os.applicable = true) AS stations_total,
  CASE
    WHEN o.due_date IS NULL THEN 'none'
    WHEN o.due_date < CURRENT_DATE THEN 'overdue'
    WHEN o.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'soon'
    ELSE 'ok'
  END AS deadline_state
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
LEFT JOIN public.products  p ON p.id = o.product_id;

CREATE OR REPLACE FUNCTION public.kpi_otd(p_from DATE, p_to DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT ROUND(100.0 * AVG(
    CASE WHEN completed_max <= due_date THEN 1 ELSE 0 END
  ), 1)
  FROM (
    SELECT o.due_date, MAX(os.completed_at)::date AS completed_max
    FROM public.orders o
    JOIN public.order_stations os ON os.order_id = o.id
    WHERE o.due_date BETWEEN p_from AND p_to
    GROUP BY o.id, o.due_date
    HAVING COUNT(*) FILTER (WHERE os.status = 'completed' OR os.status = 'skipped')
      = COUNT(*) FILTER (WHERE os.applicable = true)
  ) x;
$$;
