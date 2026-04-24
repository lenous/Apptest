# Výroba – Nastavení (v3)

## 1. Supabase projekt

1. Jděte na [supabase.com](https://supabase.com) → **New project**
   - **Region: Frankfurt (EU Central)** nebo Londýn – kvůli NDA a GDPR vyberte **EU region**. Změna později není možná, musel by se založit nový projekt.
2. Dashboard → **SQL Editor** → vložte obsah `supabase/schema.sql` → **Run**
3. Dashboard → **Authentication → Users** → vytvořte uživatele (email + heslo)
4. V tabulce `profiles` nastavte role a doplňte:
   - `role` – `operator` / `dispatcher` / `admin`
   - `pin_code` – 4-místný PIN pro přihlášení na sdíleném tabletu
   - `default_station` – ID výchozího stanoviště (1–12) pro „Mé stanoviště"
   - `qualifications` – pole kvalifikací (`{'pajeni_vlna','aoi'}`)

## 2. Konfigurace aplikace

```bash
cp .env.example .env
```

Vyplňte v `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

## 3. Instalace a spuštění

```bash
npm install
npx expo start
```

Pro iOS testování: **Expo Go** (QR), nebo `eas build --platform ios` pro TestFlight.

## 4. Struktura projektu

```
app/
  (auth)/login.tsx          – přihlášení
  (tabs)/
    index.tsx               – dashboard (statistiky, barvy termínů, offline banner)
    orders.tsx              – seznam + vyhledávání (číslo/zákazník/produkt)
    profile.tsx             – profil uživatele
  order/
    new.tsx                 – nová zakázka (autocomplete zákazník/produkt, typ výroby, množství)
    [id]/
      index.tsx             – detail (stanoviště / dokumenty / poznámky)
      station/[stationId].tsx – stanoviště (stav, počty OK/oprava/zmetek, poznámky)
      upload.tsx            – nahrát dokument
      note.tsx              – přidat poznámku
      document/[docId].tsx  – prohlížeč

lib/
  supabase.ts               – klient
  types.ts                  – TypeScript typy (v3 schéma)
  catalog.ts                – autocomplete zákazníci/produkty + kopie dokumentů z knihovny

constants/stations.ts       – stanoviště, automaty, PRIORITY/DEADLINE/NOTIF konfigurace
context/AuthContext.tsx     – autentizace
supabase/schema.sql         – DB schéma v3 (zákazníci, produkty, checklisty, audit, notifikace, …)
preview.html                – HTML náhled UI v3 (13 obrazovek)
```

## 5. Databázový model (v3)

| Tabulka | Popis |
|---|---|
| `orders` | Zakázky (6-místné číslo, typ `new/repeat/revision`, množství, QR, `hidden_at`) |
| `customers` | Katalog zákazníků (autocomplete) |
| `products` | Katalog produktů vázaných na zákazníka (kód, revize, program vlny) |
| `product_documents` | Knihovna dokumentů produktu – při opakované zakázce se zkopíruje |
| `order_stations` | Stav na každém ze 12 stanovišť + počty OK/oprava/zmetek |
| `documents` | BOM, výkresy, průvodní listy zakázky |
| `notes` | Poznámky – k zakázce nebo produktu, foto/hlas |
| `checklist_templates` / `checklist_runs` | Checklisty na stanovištích |
| `audit_log` | Historie všech akcí |
| `notifications` | Push/in-app notifikace |
| `bom_checks` | Ověření materiálu ve skladu |
| `profiles` | Uživatelé (role, PIN, kvalifikace, push token) |
| `stations`, `machines` | Číselníky (12 stanovišť, 6 automatů) |

## 6. Stavy a typy

| Stav stanoviště | | Typ výroby | | Priorita | | Stav termínu |
|---|---|---|---|---|---|---|
| `waiting` | Čeká | `new` | Nová | `low` | Nízká | `overdue` – po termínu |
| `in_progress` | Probíhá | `repeat` | Opakovaná | `normal` | Normální | `soon` – do 3 dnů |
| `completed` | Dokončeno | `revision` | Revize | `high` | Vysoká | `ok` – v termínu |
| `issue` | Problém | | | `urgent` | Urgentní | `none` – bez termínu |
| `skipped` | Přeskočeno | | | | | |

## 7. Chytré chování

- **Opakovaná zakázka** → automaticky zkopíruje všechny dokumenty z knihovny produktu (`product_documents` → `documents`).
- **Nová / revize** → dispečer musí dokumenty nahrát (aplikace zobrazí upozornění).
- **Pájení vlnou** (stanoviště 7, typ `vlna`) → zobrazí číslo programu z `products.wave_program` nebo `orders.wave_program` (override).
- **Dashboard** – karty jsou obarveny podle stavu termínu (červená/oranžová/zelená).
- **Skrytí** zakázky dlouhým stiskem v seznamu (jen dispečer/admin).
- **Audit log** – každá změna stavu stanoviště se zapisuje.

## 8. Realtime & offline

- Dashboard se automaticky aktualizuje přes Supabase Realtime.
- Offline detekce přes `@react-native-community/netinfo` – banner „Offline".
- Soubory v bucketu `order-documents` / `product-library` / `note-attachments` přes signed URL (1 h).

## 9. Bezpečnost dokumentace (NDA)

Aplikace je nakonfigurovaná tak, že **data zůstávají v EU** (Frankfurt). Doporučená opatření pro NDA-citlivé soubory:

1. **EU region** – zvol při založení Supabase projektu (viz bod 1).
2. **Private bucket** – všechny tři storage buckety (`order-documents`, `product-library`, `note-attachments`) jsou v schématu nastaveny jako `public=false`. Přístup jen přes signed URL s 1 h platností.
3. **RLS (Row Level Security)** – zapnuto pro všechny tabulky. Anonymní přístup není možný.
4. **TLS 1.3** – všechna komunikace mezi aplikací a Supabase je šifrovaná.
5. **Silná hesla + 2FA** – na Supabase účtu dispečera/admina **zapněte 2FA** (Dashboard → Account → Security).
6. **Audit log** – tabulka `audit_log` zaznamenává každou změnu stavu; SELECT kdo kdy co udělal.
7. **Doporučení pro citlivé výkresy**: pokud BOM nebo výkresy obsahují obchodní tajemství klienta, nahrávat pouze anonymizované nebo rozdělené soubory. O plné E2E šifrování (klíč jen u operátora) si řekněte – přidám.
8. **Backup** – Supabase Pro plán má Point-in-Time Recovery; u Free plánu ruční záloha přes Dashboard → Database → Backups.

**Nastavení 2FA** (doporučeno před ostrým provozem):
- Dashboard → Organization → Settings → Security → Enforce MFA for all members.

**Omezení přístupu podle IP** (placený plán):
- Settings → Add-ons → Network Restrictions → povolit jen IP firmy.

## 10. Nastavení PIN přihlášení (volitelné)

Pro sdílené tablety: v `profiles.pin_code` nastavte 4-místný kód. V budoucí verzi přidá obrazovka PIN keypad (viz `preview.html`, screen „PIN login").
