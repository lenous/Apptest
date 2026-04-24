# Aplikace Výroba – Požadavky

> **Legenda stavů:**
> - 💡 **Nápad** – otevřeno k diskuzi
> - ✅ **Schváleno** – připraveno ke kódování
> - 🔨 **Implementováno** – hotovo v kódu
> - ⏸ **Odloženo** – zatím neřešíme
> - ❓ **Otázka** – čeká se na upřesnění
>
> Tento dokument je živý. Nejdřív doladíme návrh, teprve pak kódujeme.

---

## 0. Vize a cíl

Mobilní (iOS) + tablet aplikace pro řízení elektronické výroby (osazovna PCB).
- **Role:** operátor (view + feedback), dispečer (zakládá zakázky, dokumenty), admin (vše).
- **Platforma:** iOS (Expo/React Native) + případně iPad pro „Mé stanoviště".
- **Backend:** Supabase (EU region, Frankfurt) – viz §8.

---

## 1. Stanoviště a výrobní tok

### 1.1 Seznam stanovišť (12) ✅
| # | Stanoviště |
|---|---|
| 1 | Sklad |
| 2 | Automaty (SMT) |
| 3 | AOI kontrola |
| 4 | RTG |
| 5 | Oprava po AOI / kontrola |
| 6 | Osazování |
| 7 | Pájení (vlna / selektivní / ruční) |
| 8 | Oprava + kontrola po pájení |
| 9 | Programování |
| 10 | Lakování |
| 11 | Výstupní kontrola |
| 12 | Balení |

### 1.2 Zakázka může být na více stanovištích najednou ✅
- Každé stanoviště má svůj vlastní stav (čeká / probíhá / hotovo / problém / přeskočeno).

### 1.3 Ne všechny zakázky prochází všemi stanovišti ✅
- **Produkt** má šablonu „použitá stanoviště" (`applicable_stations`).
- Při založení zakázky se automaticky aplikuje.
- **Dispečer / admin / vedoucí** může stanoviště v detailu zakázky kdykoli zapnout/vypnout.
- Operátor vidí jen stanoviště, která se ho reálně týkají.

### 1.4 Automaty (6 kusů) ✅
Alfa · Beta · Gama · Delta · Eta · Theta – přiřazení na stanoviště 2 (Automaty).

### 1.5 Stanoviště 7 – Pájení ✅
- Volba typu: vlna / selektivní / ruční.
- Při vlně zobrazit **číslo programu** (z produktu nebo override na zakázce).

---

## 2. Zakázka

### 2.1 Identifikace ✅
- **Číslo:** 6-místné čistě numerické (např. `260321`) – auto-generuje se, lze přepsat.
- **QR kód** automaticky (pro tisk štítku).

### 2.2 Typ výroby ✅
- `new` – Nová (zakázka je pro nový výrobek)
- `repeat` – Opakovaná (už se někdy vyráběla → automaticky přitáhni dokumenty)
- `revision` – Revize (změna existujícího výrobku → dispečer nahraje nové doky)

### 2.3 Povinná pole při založení ✅
- Číslo zakázky
- Typ výroby
- Zákazník *(autocomplete)*
- Produkt / kód *(autocomplete vázané na zákazníka)*
- Množství (ks)
- Priorita (nízká / normální / vysoká / urgentní)

### 2.4 Volitelná pole ✅
- Datum zakázky (default dnes)
- Termín dodání
- Přiřazený automat
- Číslo programu (vlna) – override
- Název / popis / interní poznámky

### 2.5 Autocomplete zákazníci / produkty ✅
- Aplikace si pamatuje zákazníky globálně.
- Produkty vázané na konkrétního zákazníka.
- Při volbě existujícího produktu se přednastaví název a program vlny.

### 2.6 Chytré dokumenty ✅
- **Opakovaná zakázka** → zkopíruje všechny dokumenty z knihovny produktu.
- **Nová / revize** → zobrazí upozornění „nahraj nové dokumenty".
- V knihovně produktu (`product_documents`) žijí BOM, výkres, průvodní list a další.

### 2.7 Skrývání / mazání ✅
- Dokončené zakázky lze **skrýt** (soft-delete přes `hidden_at`) – long-press v seznamu.
- Filtry: Aktivní / Skryté / Vše.
- Smazání natvrdo jen admin (otázka: potřebujeme? ❓).

### 2.8 Počty kusů ✅
- Na každém stanovišti operátor zapíše: OK / na opravu / zmetek.
- Sumace přes celou zakázku se počítá pro KPI (FPY = First Pass Yield).

---

## 3. Dokumenty

### 3.1 Typy ✅
- BOM (Excel)
- Výkres (PDF / JPG)
- Průvodní list (PDF)
- Ostatní

### 3.2 Knihovna produktu ✅
- U produktu se archivují dokumenty napříč zakázkami.
- Při opakované zakázce se automaticky přitáhnou.
- Verzování (`product_documents.version`).

### 3.3 Úložiště ✅ – varianta A
- **Supabase Storage** v EU regionu (Frankfurt).
- Privátní buckety: `order-documents`, `product-library`, `note-attachments`.
- Přístup přes **signed URL** s platností 1 hod.
- TLS 1.3 šifrovaná komunikace.

### 3.4 NDA ochrana ✅
- Row Level Security na všech tabulkách.
- 2FA povinné pro dispečera/admina (nastavit v Supabase).
- Audit log zaznamenává přístup ke změnám.
- Doporučení: při opravdu citlivých věcech rozdělit/anonymizovat.
- **Otevřeno:** chceš přidat plné E2E šifrování (klíč jen u klienta)? ❓ → zatím NE (odloženo)

---

## 4. Poznámky a zpětná vazba

### 4.1 Typy ✅
- `note` – Poznámka
- `change_request` – Žádost o úpravu
- `issue` – Problém

### 4.2 Kam patří ✅
- K zakázce
- K zakázce + stanovišti
- **K produktu** (napříč zakázkami) – znalostní báze

### 4.3 Přílohy ✅
- Fotky (z fotoaparátu nebo galerie)
- Hlasová poznámka *(k prodiskutování – nutné? 💡)*

### 4.4 Přímo na stanovišti ✅
- Formulář je součást detailu stanoviště (ne samostatná obrazovka).

---

## 5. Notifikace

### 5.1 Typy ✅
- Problém na stanovišti
- Blížící se termín
- Nová zakázka
- Zmínka (@někdo)
- Změna (úprava zakázky, dokumentu)

### 5.2 Priority ✅
- `low` – info (šedá)
- `normal` – běžná (modrá)
- `high` – důležité (červená)

### 5.3 Akce ✅
- Kliknutím → přejít na zakázku + označit přečtené
- **Mazání** jednotlivě (X) nebo hromadně (smazat přečtené)
- **Změna priority** dlouhým stiskem
- Filtr Vše / Nepřečtené / Důležité
- Realtime příchod

### 5.4 Push notifikace 💡
- Expo Push – OTEVŘENO, neřešili jsme.
- **Otázka:** chceš push na iPhone / iPad (i mimo aplikaci)? ❓

---

## 6. Role a přístup

**5 rolí** s oddělenými rozhraními:

### 6.1 Operátor (`operator`) ✅
- Vidí jen **Mé stanoviště** + detail zakázky (pro své stanoviště).
- Mění stavy, zapisuje počty OK/oprava/zmetek, přidává poznámky + fotky.
- **Vidí jen stanoviště, na která má kvalifikaci** (§11 kvalifikace).
- Nemá: dashboard vedení, KPI, správa zakázek, dokumenty pro nahrávání.
- Hlavní taby: **Mé stanoviště / Zakázky (read-only) / Notifikace / Profil**

### 6.2 TPV – Technická příprava výroby (`tpv`) ✅ NOVÁ ROLE
- Připravuje a spravuje **dokumentaci pro výrobu**.
- Nahrává BOM, výkresy, průvodní listy – k zakázkám i do **knihovny produktu**.
- Upravuje šablonu produktu: `applicable_stations`, číslo programu vlny.
- Může zakládat produkty, přiřazovat dokumenty.
- **Nezakládá** zakázky (to dělá dispečer), **nemění** stavy výroby.
- Hlavní taby: **Produkty / Zakázky / Dokumenty / Notifikace / Profil**

### 6.3 Dispečer / vedoucí výroby (`dispatcher`) ✅
- Operativní řízení výroby.
- Vše co operátor +
- Zakládá zakázky, edituje zákazníky / produkty.
- Nahrává dokumenty k zakázce (spolu s TPV).
- Zapíná/vypíná stanoviště pro zakázku.
- Skrývá dokončené zakázky.
- Hlavní taby: **Přehled / Mé stanoviště / Zakázky / Notifikace / Profil**

### 6.4 Vedení (`management`) ✅ NOVÁ ROLE
- Čte, nerozhoduje operativně. Přehled pro rozhodování.
- **KPI dashboard** (OTD, FPY, vytížení strojů, top problémové produkty).
- **PDF export** statistik.
- Vidí všechny zakázky, audit log.
- **Nezakládá** zakázky, **neupravuje** stanoviště.
- Dark mode ✅
- Hlavní taby: **KPI / Zakázky (read-only) / Reporty / Profil**

### 6.5 Admin (`admin`) ✅
- Technická správa systému.
- Vše z rolí výše +
- Správa **uživatelů** (pozvánky, role, kvalifikace, reset hesla).
- Správa **produktů**: `applicable_stations`, knihovna dokumentů.
- Správa **šablon checklistů** per stanoviště.
- **Hard-delete zakázek** (jediný, kdo to smí).
- Audit log viewer.
- Dark mode ✅
- Hlavní taby: **KPI / Zakázky / Správa (users/produkty/šablony) / Audit / Profil**

### 6.6 Přihlášení ✅
- Email + heslo (nikoli PIN – kvůli NDA).
- **Zapamatování přihlášení** – token v SecureStore.
- **Biometrický unlock** (Face ID / Touch ID) – aplikace se po spuštění odemkne otiskem/obličejem, jinak přihlášení heslem.
- **Automatické odhlášení po 8 hodinách nečinnosti** ✅ (pracovní směna)

---

## 7. Obrazovky

### 7.1 Přehled (dispečer/admin) ✅
- Statistiky: aktivní / problém / po termínu / celkem
- Barevný okraj karty dle termínu (červená/oranžová/zelená)
- Filtr Aktivní / Skryté / Vše
- Offline banner

### 7.2 Mé stanoviště (operátor) ✅
- Fronta zakázek pro moje stanoviště
- Přepínač stanovišť nahoře (kdo má víc kvalifikací)
- Stav: ve frontě / probíhá / problém

### 7.3 Zakázky ✅
- Hledání: číslo zakázky / zákazník / produkt / název
- Filtry Aktivní/Skryté/Vše
- Long-press → skrýt/obnovit

### 7.4 Detail zakázky ✅
- 3 záložky: **Stanoviště** / **Dokumenty** / **Poznámky**
- Časová osa stanovišť + zapnutí/vypnutí long-pressem
- Badge typu výroby, termínu, priority

### 7.5 Detail stanoviště ✅
- Aktuální stav + akce (Zahájit / Dokončit / Problém / Přeskočit / Reset)
- U stanoviště 7: typ pájení + program vlny
- Počty OK / oprava / zmetek
- Poznámky inline
- *(Budoucnost:* checklist ✅ v DB, UI chybí)*

### 7.6 Nová zakázka ✅
- Autocomplete zákazník → autocomplete produkt
- Typ výroby + informační box o dokumentech
- Množství, datum, priorita, automat, program vlny

### 7.7 Notifikace ✅
- Viz §5

### 7.8 Profil ✅
- Jméno, role, odhlášení
- **Budoucnost:** default stanoviště, kvalifikace, PIN, dark mode – v schéma existuje, UI chybí.

### 7.9 Preview-only (zatím jen HTML, neimplementováno v apce)
- **QR skener** (otevření zakázky naskenováním štítku) – 💡 stojí za implementaci?
- **KPI dashboard** (OTD, FPY, vytížení strojů) – pro vedení 💡
- **Audit log** obrazovka – pro admina 💡
- **PDF report** zakázky (printable) – pro finální reporting 💡
- **BOM / sklad** obrazovka – kontrola materiálu

---

## 8. Integrace

### 8.1 LUPA NET ⏸ – ODLOŽENO
Prozatím nedotýkáme. Až budeme připraveni, doplní se.

### 8.2 ERP obecně 💡
- Import zakázek z CSV? XLSX? Řešit až s konkrétním požadavkem.

---

## 9. Rozhodnutí (zodpovězené otázky)

| # | Otázka | Rozhodnutí |
|---|---|---|
| 1 | Push notifikace na iPhone | ✅ ANO – Expo Push |
| 2 | Přihlášení | ✅ email/heslo + zapamatovat + **Face ID / Touch ID** (biometrický unlock) – PIN odstraněn |
| 3 | Hlasové poznámky | ❌ NE – stačí text + foto |
| 4 | Mazání zakázek | ✅ **Hard-delete jen admin**; ostatní: skrytí po dokončení. Data zůstávají v DB, jen se nezobrazují. |
| 5 | QR skener | ⏸ později; **QR kód generovat už teď** (je v DB) – skener jako další fáze |
| 6 | KPI dashboard pro vedení | ✅ TEĎ |
| 7 | Oddělené rozhraní admin × vedení × operátor | ✅ TEĎ – viz §6 nové role |
| 8 | PDF export statistik | ✅ TEĎ |
| 9 | BOM kontrola skladu | ❌ sklad nekontroluje – kontrola BOM se přesouvá **na automat (stanoviště 2) nebo dál** |
| 10 | Časomíra na stanovišti | ✅ **řídí systém** – automaticky start/stop podle změny stavu |
| 11 | Kvalifikace operátorů | ✅ TEĎ – operátor vidí jen stanoviště, na která je kvalifikovaný |
| 12 | Dark mode | ✅ jen pro vedení a admin |

---

## 10. Kvalifikace operátorů ✅

- Každý operátor má v profilu `qualifications: string[]` – např. `['aoi','pajeni_vlna','lakovani']`.
- Admin přiřazuje kvalifikace v obrazovce „Správa uživatelů".
- **Mé stanoviště** filtruje podle kvalifikací – operátor vidí jen stanoviště, na která smí.
- Přepínač stanovišť nahoře ukáže **jen jeho stanoviště**, ne všech 12.
- Návrh seznamu kvalifikací (= ID stanovišť nebo podtypů):
  - `sklad`
  - `automat` (každý operátor automatu)
  - `aoi`
  - `rtg`
  - `oprava_aoi`
  - `osazovani`
  - `pajeni_vlna`
  - `pajeni_selektivni`
  - `pajeni_rucni`
  - `oprava_pajeni`
  - `programovani`
  - `lakovani`
  - `vystupni_kontrola`
  - `baleni`
- Seznam odsouhlasen ✅

---

## 11. Časomíra – řízeno systémem ✅

- Při přechodu stanoviště do `in_progress` → zapíše se `started_at` (už funguje).
- Při přechodu do `completed` → zapíše se `completed_at` (už funguje).
- Zobrazení doby zpracování = `completed_at − started_at`.
- Žádná ruční stopka.
- **Podklad pro KPI:** průměrný čas na stanovišti, porovnání mezi operátory/produkty.

---

## 12. BOM – příprava vs. kontrola ✅

**Příprava BOM dokumentu:**
- BOM, výkresy a průvodní list připravují **TPV, dispečer (vedoucí), admin**.
- Ukládají se do knihovny produktu → přiřazují k zakázce.

**Kontrola materiálu dle BOM:**
- **Sklad (stanoviště 1) BOM NEKONTROLUJE** – jen vychystá materiál.
- Kontrola materiálu se dělá **od stanoviště 2 (Automat) dál** – typicky operátor automatu nebo osazování při přípravě stroje.
- Tabulka `bom_checks` zůstává, vyplňuje ji operátor na daném stanovišti.

---

## 13. Dílčí množství a tok mezi stanovišti ✅ NOVÉ – ZÁSADNÍ

### 13.1 Princip
- Zakázka o **1000 ks** neputuje jako jeden blok.
- Operátor může **dílčí části předávat dál**, zatímco zbytek ještě dělá.
- Příklad:
  - Automat udělá 900 ks → **800 ks jde na AOI**, 100 ks zůstává na automatu.
  - AOI začne kontrolovat 800 ks, po 200 ks → **200 ks jde na ruční osazení**.
  - Mezitím automat doběhne zbylých 100 ks → přesune je na AOI atd.
- Zakázka **zmizí ze stanoviště** až když **celkový počet zpracovaný (OK + zmetek) = celkové množství zakázky**.

### 13.2 Datový model – návrh
Na tabulku `order_stations` (stav zakázky na stanovišti) přidat:

| Pole | Typ | Význam |
|---|---|---|
| `qty_received` | INT | kolik ks už dorazilo z předchozího stanoviště (nabíhá postupně) |
| `qty_ok` | INT | kolik ks stanoviště pustilo dál v pořádku *(už existuje)* |
| `qty_rework` | INT | ks, které šly na opravu *(už existuje)* |
| `qty_scrap` | INT | ks zmetků *(už existuje)* |
| `qty_wip` | computed | = qty_received − (qty_ok + qty_rework + qty_scrap); „rozpracováno na stanovišti" |

**Pravidla:**
- `qty_ok + qty_rework + qty_scrap <= qty_received` (nesmí zpracovat víc, než přišlo)
- Status `completed` = (qty_ok + qty_scrap) ≥ `orders.quantity` **a zároveň** `qty_wip` = 0 *(zohledňuje přeskočené; rework vrací kus zpět do oběhu)*

### 13.3 Automatické přechody ✅
- Když operátor na stanovišti N zapíše `qty_ok += X` a stiskne **„Předat dál"**, systém:
  1. Najde **další aktivní stanoviště** v pořadí (skipne `applicable=false`).
  2. Zvýší jeho `qty_received += X`.
  3. Pokud nebylo nic na stanovišti, přejde do `waiting` → `in_progress` automaticky.
  4. Notifikuje operátora dalšího stanoviště *(pokud má nastavené `default_station`)*.

### 13.4 Obrazovky – co se změní
- **Mé stanoviště** – karta zakázky ukáže:
  - „Přišlo: 800 / 1000"
  - „Zpracováno: 200 (OK 190, oprava 5, zmetek 5)"
  - „Rozpracováno: 600"
- **Detail stanoviště** – místo jednoho tlačítka „Dokončit" bude:
  - Přičíst počet ks (OK / oprava / zmetek)
  - **„Předat dalších X ks"** → konkrétní množství
- **Oprava (rework)** ✅ – desky se NEVRACÍ zpět na původní stanoviště:
  - Chyba na **AOI (3)** → jde na **Oprava po AOI (5)** → **manuální kontrola** → dál.
  - Chyba po **pájení (7)** → **Oprava + kontrola po pájení (8)** → dál.
  - Operátor opravárenského stanoviště ručně potvrdí, že kontrola proběhla.
- **Timeline zakázky** – zobrazí „plovoucí" tok (jak ks putují).

### 13.5 Rozhodnutí ✅
- **(a)** Skip vypnutých stanovišť ✅ – automaticky přeskočí stanoviště s `applicable=false` a předá rovnou další aktivní.
- **(b)** Minimální dávka = **1 ks** ✅ – umožněno pro malé série.
- **(c)** Stanoviště vidí „ještě přijde X ks" ✅ – vypočítáno jako `orders.quantity − Σ(qty_received do tohoto + všech dalších stanovišť)`. Help pro plánování.
- **(d)** Oprava viz §13.4 – **desky se nevracejí**, jedou přes Opravárenská stanoviště 5 / 8.
- **(e)** **Manuální „Předat dál"** ✅ – operátor vždy potvrdí počet ks a cílové stanoviště tlačítkem. Bez automatického přeskoku po zápisu qty_ok.

---

## 14. Technický backlog (až po schválení návrhu)

Po odsouhlasení požadavků se do kódu dodělají:
- **Role `tpv` + `management`** – přidat do DB schéma + RLS.
- **Dílčí toky (§13)** – `qty_received` + „Předat dál" + auto-transition.
- **KPI dashboard** – obrazovka pro vedení + admina.
- **PDF export statistik** – expo-print nebo generovat na serveru.
- **Správa uživatelů** (admin) – pozvat, role, kvalifikace, reset hesla.
- **Správa produktu** (admin) – applicable_stations, knihovna dokumentů.
- **Správa šablon checklistů** (admin).
- **Filtr stanovišť podle kvalifikací** (§10).
- **Expo Push notifikace** (iPhone).
- **Biometrický unlock** (Face ID / Touch ID) – expo-local-authentication.
- **Zapamatování přihlášení** – token v expo-secure-store.
- **Dark mode** – pro role `management` a `admin`.
- **QR kód u zakázky** – generování štítku (QR již v DB).
- **Zobrazení časů zpracování** – odvození z `started_at`/`completed_at`.
- **Hard-delete** pro admina + oddělená akce od skrývání.
- **Deadline alert** – notifikace X dnů před termínem (Supabase cron/trigger).
- **Audit log viewer** pro admina.
- **Automatické přechody** – např. po AOI se zakázka přesune do „Opravy" (diskutovat).

---

## 11. Co už je hotovo v kódu (stav k dnešku)

🔨 Schéma v3 (orders, customers, products, order_stations s applicable, audit_log, notifications s priority, bom_checks, checklist_templates atd.)
🔨 TypeScript typy + konstanty
🔨 Autocomplete helpery (`lib/catalog.ts`)
🔨 Obrazovky: Login, Dashboard, Orders, Nová zakázka, Detail zakázky, Detail stanoviště, Upload, Document viewer, Note, Profile, **Mé stanoviště**, **Notifikace**
🔨 HTML preview v3 s 13 obrazovkami
🔨 SETUP.md s postupem

---

## 12. Historie změn

- **v3 (aktuální)** – autocomplete, typy výroby, počty OK/rework/scrap, audit log, notifikace s prioritou, applicable stanoviště, Mé stanoviště obrazovka, hide/soft-delete
- **v2** – 6-místné číslo, hledání, smart docs, produkt/zákazník autocomplete (jen v preview)
- **v1** – základní zakázky, 12 stanovišť, dokumenty, poznámky
