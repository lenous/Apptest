-- ============================================================
-- PRODUCTION APP – Supabase Schema v3
-- Spusť v Supabase SQL Editoru (Dashboard → SQL Editor → New Query)
-- ============================================================

-- ── Profiles (rozšíření auth.users) ──────────────────────────
CREATE TABLE public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name      TEXT,
  role           TEXT NOT NULL DEFAULT 'operator'
                   CHECK (role IN ('operator', 'dispatcher', 'admin')),
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
  (12, 'Balení',                           12);

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
  technology       TEXT NOT NULL DEFAULT 'leadfree'
                     CHECK (technology IN ('lead', 'leadfree')),
  stencil_number   TEXT,
  quantity         INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  priority         TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  order_date       DATE DEFAULT CURRENT_DATE,
  due_date         DATE,
  machine_id       TEXT REFERENCES public.machines(id),
  wave_program     TEXT,                    -- Override programu vlnového pájení
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

  -- Vlož záznamy pro všech 12 stanovišť, u těch mimo seznam nastav applicable=false
  INSERT INTO public.order_stations (order_id, station_id, applicable)
  SELECT
    NEW.id,
    s.id,
    CASE
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
ALTER TABLE public.stations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines             ENABLE ROW LEVEL SECURITY;

-- Jednoduché politiky: autentizovaní uživatelé mají plný přístup (zpřísni dle rolí v produkci)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','customers','products','product_documents','orders','order_stations',
    'checklist_templates','checklist_runs','documents','notes','audit_log',
    'notifications','bom_checks','stations','machines'
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
  12 AS stations_total,
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
    HAVING COUNT(*) FILTER (WHERE os.status = 'completed') = 12
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.kpi_fpy(p_from DATE, p_to DATE)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT ROUND(100.0 * SUM(qty_ok) / NULLIF(SUM(qty_ok + qty_rework + qty_scrap), 0), 1)
  FROM public.order_stations
  WHERE completed_at::date BETWEEN p_from AND p_to;
$$;
