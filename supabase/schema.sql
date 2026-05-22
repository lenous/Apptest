-- ============================================================
-- PRODUCTION APP – Supabase Schema v3
-- Spusť v Supabase SQL Editoru (Dashboard → SQL Editor → New Query)
-- ============================================================

-- ── Profiles (rozšíření auth.users) ──────────────────────────
CREATE TABLE public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name      TEXT,
  role           TEXT NOT NULL DEFAULT 'operator'
                   CHECK (role IN ('operator', 'tpv', 'dispatcher', 'management', 'admin')),
  pin_code       TEXT,                    -- 4-místný PIN pro tabletové přihlášení
  default_station SMALLINT,               -- Výchozí stanoviště operátora (pro "Mé stanoviště")
  qualifications TEXT[],                  -- Kvalifikace (např. ['pajeni_vlna','aoi'])
  push_token     TEXT,                    -- Expo push token pro notifikace
  dark_mode      BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Stanoviště ────────────────────────────────────────────────
CREATE TABLE public.stations (
  id           SMALLINT PRIMARY KEY,
  name         TEXT NOT NULL,
  order_index  SMALLINT NOT NULL
);

INSERT INTO public.stations (id, name, order_index) VALUES
  (1,  'Sklad',                             1),
  (2,  'Automaty',                          2),
  (3,  'AOI kontrola',                      3),
  (4,  'RTG',                               4),
  (5,  'Oprava po AOI / kontrola',          5),
  (6,  'Osazování',                         6),
  (7,  'Pájení',                            7),
  (8,  'Oprava+kontrola po pájení',         8),
  (9,  'Programování',                      9),
  (10, 'Lakování',                         10),
  (11, 'Výstupní kontrola',                11),
  (12, 'Balení',                           12),
  (13, 'Testování',                        13);

-- ── Automaty ──────────────────────────────────────────────────
CREATE TABLE public.machines (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  active  BOOLEAN DEFAULT true
);

INSERT INTO public.machines (id, name) VALUES
  ('alfa',  'Alfa'),
  ('beta',  'Beta'),
  ('gama',  'Gama'),
  ('delta', 'Delta'),
  ('eta',   'Eta'),
  ('theta', 'Theta');

-- ── Zákazníci (autocomplete) ──────────────────────────────────
CREATE TABLE public.customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  ico         TEXT,
  contact     TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Produkty (autocomplete na úrovni zákazníka) ───────────────
CREATE TABLE public.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,            -- Katalogové číslo / revize
  name          TEXT NOT NULL,
  revision      TEXT,
  wave_program  TEXT,                     -- Číslo programu pro pájení vlnou
  selective_wave_program TEXT,            -- Číslo programu pro selektivní vlnu
  test_flow     TEXT NOT NULL DEFAULT 'output_control'
                  CHECK (test_flow IN ('none','output_control','separate_station')),
  applicable_stations SMALLINT[] DEFAULT ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::SMALLINT[],
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (customer_id, code)
);

-- ── Knihovna dokumentů k produktu (auto-load pro opakované zakázky) ──
CREATE TABLE public.product_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL
                 CHECK (doc_type IN ('bom', 'drawing', 'routing_sheet', 'other')),
  file_name    TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_size    BIGINT,
  mime_type    TEXT,
  version      INT DEFAULT 1,
  uploaded_by  UUID REFERENCES auth.users(id),
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Zakázky ───────────────────────────────────────────────────
CREATE TABLE public.orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     CHAR(6) NOT NULL UNIQUE
                     CHECK (order_number ~ '^[0-9]{6}$'),
  customer_id      UUID REFERENCES public.customers(id),
  product_id       UUID REFERENCES public.products(id),
  name             TEXT NOT NULL,           -- Název zakázky / popis
  description      TEXT,
  production_type  TEXT NOT NULL DEFAULT 'new'
                     CHECK (production_type IN ('new', 'repeat', 'revision')),
  quantity         INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  priority         TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  order_date       DATE DEFAULT CURRENT_DATE,
  due_date         DATE,
  machine_id       TEXT REFERENCES public.machines(id),
  wave_program     TEXT,                    -- Override programu vlnového pájení
  selective_wave_program TEXT,               -- Override programu selektivní vlny
  test_flow        TEXT NOT NULL DEFAULT 'output_control'
                     CHECK (test_flow IN ('none','output_control','separate_station')),
  qr_code          TEXT UNIQUE,             -- QR pro tisk štítku
  hidden_at        TIMESTAMPTZ,             -- Soft-delete / skrytí dokončené zakázky
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orders_hidden ON public.orders(hidden_at) WHERE hidden_at IS NULL;
CREATE INDEX idx_orders_due ON public.orders(due_date);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_product ON public.orders(product_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-generuj QR kód z čísla zakázky
CREATE OR REPLACE FUNCTION public.set_qr_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.qr_code IS NULL THEN
    NEW.qr_code := 'ORD-' || NEW.order_number;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_set_qr
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_qr_code();

-- ── Stav zakázky na každém stanovišti ────────────────────────
CREATE TABLE public.order_stations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  station_id      SMALLINT NOT NULL REFERENCES public.stations(id),
  status          TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'in_progress', 'completed', 'issue', 'skipped')),
  soldering_type  TEXT CHECK (soldering_type IN ('vlna', 'selektivni', 'rucni')),
  applicable      BOOLEAN NOT NULL DEFAULT true,  -- zda toto stanoviště zakázka potřebuje
  qty_ok          INT DEFAULT 0,
  qty_rework      INT DEFAULT 0,
  qty_scrap       INT DEFAULT 0,
  qty_received    INT NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  operator_id     UUID REFERENCES auth.users(id),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (order_id, station_id)
);

CREATE INDEX idx_order_stations_status ON public.order_stations(status);
CREATE INDEX idx_order_stations_operator ON public.order_stations(operator_id);

CREATE TRIGGER order_stations_updated_at
  BEFORE UPDATE ON public.order_stations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_order_stations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  app_stations SMALLINT[];
BEGIN
  -- Pokud má produkt vlastní seznam stanovišť, použij ho
  IF NEW.product_id IS NOT NULL THEN
    SELECT applicable_stations INTO app_stations
    FROM public.products WHERE id = NEW.product_id;
  END IF;

  -- Vlož záznamy pro všechna stanoviště. Testování (13) je aktivní jen pro test_flow=separate_station.
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
  FROM public.stations s;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.create_order_stations();

-- ── Checklisty stanoviště ────────────────────────────────────
CREATE TABLE public.checklist_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  SMALLINT REFERENCES public.stations(id),
  product_id  UUID REFERENCES public.products(id), -- NULL = pro všechny
  title       TEXT NOT NULL,
  items       JSONB NOT NULL,           -- [{id, label, required}]
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.checklist_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_station_id   UUID NOT NULL REFERENCES public.order_stations(id) ON DELETE CASCADE,
  template_id        UUID REFERENCES public.checklist_templates(id),
  completed_items    JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_by       UUID REFERENCES auth.users(id),
  completed_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Dokumenty zakázky ────────────────────────────────────────
CREATE TABLE public.documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  source_product_doc_id UUID REFERENCES public.product_documents(id), -- původ z knihovny
  doc_type     TEXT NOT NULL
                 CHECK (doc_type IN ('bom', 'drawing', 'routing_sheet', 'other')),
  file_name    TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  file_size    BIGINT,
  mime_type    TEXT,
  uploaded_by  UUID REFERENCES auth.users(id),
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Poznámky a zpětná vazba ───────────────────────────────────
CREATE TABLE public.notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES public.products(id) ON DELETE CASCADE, -- poznámky k produktu
  station_id   SMALLINT REFERENCES public.stations(id),
  note_type    TEXT NOT NULL DEFAULT 'note'
                 CHECK (note_type IN ('note', 'change_request', 'issue')),
  content      TEXT NOT NULL,
  photo_paths  TEXT[],                    -- cesty k fotkám (attachment)
  voice_path   TEXT,                      -- hlasová poznámka
  resolved     BOOLEAN DEFAULT false,
  author_id    UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  CHECK (order_id IS NOT NULL OR product_id IS NOT NULL)
);

-- ── Audit log ────────────────────────────────────────────────
CREATE TABLE public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  station_id  SMALLINT REFERENCES public.stations(id),
  actor_id    UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,              -- 'status_change','note_added','doc_uploaded',...
  payload     JSONB,                      -- libovolná dodatečná data
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_order ON public.audit_log(order_id, created_at DESC);

-- ── Notifikace ───────────────────────────────────────────────
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('issue','deadline','new_order','mention','change')),
  priority    TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low', 'normal', 'high')),
  title       TEXT NOT NULL,
  body        TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notif_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;

-- ── Materiál / BOM check ─────────────────────────────────────
CREATE TABLE public.bom_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  material_code    TEXT NOT NULL,
  material_name    TEXT,
  required_qty     NUMERIC NOT NULL,
  available_qty    NUMERIC,
  status           TEXT NOT NULL DEFAULT 'unknown'
                     CHECK (status IN ('ok','partial','missing','unknown')),
  checked_by       UUID REFERENCES auth.users(id),
  checked_at       TIMESTAMPTZ
);

-- ── Traceability: závady a výrobní eventy ─────────────────────
CREATE TABLE public.defect_types (
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

CREATE TABLE public.production_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES public.products(id),
  order_station_id UUID REFERENCES public.order_stations(id) ON DELETE SET NULL,
  station_id       SMALLINT REFERENCES public.stations(id),
  event_type       TEXT NOT NULL
                     CHECK (event_type IN ('aoi','manual_assembly','soldering','repair','testing','transfer','general')),
  result           TEXT NOT NULL
                     CHECK (result IN ('ok','nok','partial','pass','fail','retest','completed')),
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

CREATE INDEX idx_production_events_order ON public.production_events(order_id, created_at DESC);
CREATE INDEX idx_production_events_product ON public.production_events(product_id, created_at DESC);
CREATE INDEX idx_production_events_station ON public.production_events(station_id, created_at DESC);
CREATE INDEX idx_production_events_type ON public.production_events(event_type, created_at DESC);

CREATE TABLE public.production_event_defects (
  event_id       UUID NOT NULL REFERENCES public.production_events(id) ON DELETE CASCADE,
  defect_type_id UUID NOT NULL REFERENCES public.defect_types(id),
  qty            INT NOT NULL DEFAULT 1 CHECK (qty >= 0),
  note           TEXT,
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

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_stations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_checks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_event_defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines             ENABLE ROW LEVEL SECURITY;

-- Jednoduché politiky: autentizovaní uživatelé mají plný přístup (zpřísni dle rolí v produkci)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','customers','products','product_documents','orders','order_stations',
    'checklist_templates','checklist_runs','documents','notes','audit_log',
    'notifications','bom_checks','defect_types','production_events','production_event_defects','stations','machines'
  ])
  LOOP
    EXECUTE format('CREATE POLICY "auth read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Zápisová práva (kromě read-only: stations, machines)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','products','product_documents','orders','order_stations',
    'checklist_templates','checklist_runs','documents','notes','audit_log',
    'notifications','bom_checks'
  ])
  LOOP
    EXECUTE format('CREATE POLICY "auth insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "auth update" ON public.%I FOR UPDATE TO authenticated USING (true)', t);
  END LOOP;
END $$;

CREATE POLICY "auth insert" ON public.production_events
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth insert" ON public.production_event_defects
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Notifikace: uživatel vidí jen své + může je mazat a označit přečtené
CREATE POLICY "own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Storage bucket ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-documents', 'order-documents', false)
ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-library', 'product-library', false)
ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('note-attachments', 'note-attachments', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "auth upload orders" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('order-documents','product-library','note-attachments'));

CREATE POLICY "auth read orders" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id IN ('order-documents','product-library','note-attachments'));

-- ── Pomocná view: dashboard s výpočty ────────────────────────
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

-- ── KPI funkce ────────────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.kpi_fpy(p_from DATE, p_to DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT ROUND(100.0 * SUM(qty_ok) / NULLIF(SUM(qty_ok + qty_rework + qty_scrap), 0), 1)
  FROM public.order_stations
  WHERE completed_at::date BETWEEN p_from AND p_to;
$$;
