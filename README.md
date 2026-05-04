# Aplikace pro výrobu

Mobilní aplikace pro řízení výroby DPS postavená na Expo/React Native. Repozitář obsahuje také HTML prototyp `preview-v5-interactive.html`, který slouží jako rychlá vizuální a funkční reference.

## Co je hotové

- Role: Operátor, TPV, Mistr, Vedení a Admin.
- Operátor vidí zakázky podle svého výchozího pracoviště.
- Mistr a Vedení mají stejná práva pro řízení zakázek.
- Admin má správu uživatelů, rolí a kvalifikací pracovišť.
- Nová zakázka podporuje číslo bez `#`, typ výroby, technologii OLOVO/BEZOLOVO a planžetu pro opakované zakázky.
- Stanoviště podporuje zápis OK/Oprava/Zmetek v kompaktním mobilním rozložení.
- Dashboard má klikací filtry aktivních zakázek, problémů a zakázek po termínu.

## Spuštění

```powershell
npm install
npm run web
```

Pro mobilní testování:

```powershell
npm start
```

## Konfigurace

Vytvoř `.env` podle `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Databázové schéma je v `supabase/schema.sql`.

## Prototyp

GitHub Pages vstup je `index.html` a přesměruje na:

```text
preview-v5-interactive.html
```

Prototyp zůstává v repozitáři jako návrhová reference. Hlavní vývoj aplikace běží v Expo obrazovkách ve složce `app/`.
