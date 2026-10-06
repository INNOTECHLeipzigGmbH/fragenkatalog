# Fragenkatalog

Online-Fragenkatalog für Auftraggeber und weitere Stakeholder (INNOTECH Leipzig GmbH).
Vite + React + TypeScript, Daten in Supabase (Projekt „Protokoll“, Tabellen mit Präfix `fragenkatalog_`).

## Funktionsweise

- Jede Person erhält einen **persönlichen Zugangslink** (`https://…/?z=<Code>`). Die **Rolle** des Zugangs
  (z. B. Auftraggeber, Betreiber, Versorgungsträger, Fachplaner) bestimmt, welche Fragen sichtbar sind.
- Die Rolle **`intern`** öffnet die Verwaltung: Bereiche, Fragen und Zugänge anlegen, Bereiche freigeben.
- Antworten, Klärungsbedarf und Kommentare werden pro Frage gespeichert. Freigegebene Bereiche sind für
  Stakeholder gesperrt.
- Folgefragen erscheinen nur, wenn die Antwort auf eine Elternfrage passt (serverseitig ausgewertet).

## Sicherheitsmodell

Die Tabellen haben RLS aktiviert und **bewusst keine Policies**. Der öffentliche (anon) Schlüssel kann daher nichts
direkt lesen oder schreiben. Der gesamte Zugriff läuft über `SECURITY DEFINER`-Funktionen (`fk_*`), die den
Zugangscode prüfen und Rolle sowie Freigabestatus serverseitig erzwingen. Das weicht vom sonst im Projekt üblichen
`allow_all`-Muster ab, weil hier externe Personen zugreifen.

Der Zugangscode ist wie ein Passwort zu behandeln: Link erneuern oder Zugang deaktivieren in der Verwaltung.

## Einrichtung

```bash
cp .env.example .env.local   # URL und öffentlicher Schlüssel des Supabase-Projekts
npm install
npm run dev
```

Build: `npm run build` (Ausgabe in `dist/`, statisch hostbar, Single-Page ohne Routing).

## Datenbank

Migrationen liegen in `supabase/migrations/` und sind in dieser Reihenfolge einzuspielen:

1. `…_tabellen.sql` – Tabellen, RLS, Rechte
2. `…_funktionen_stakeholder.sql` – Laden, Antworten, Klärung, Kommentare
3. `…_verwaltung.sql` – Katalog, Bereiche, Fragen, Zugänge, Freigabe
4. `…_loeschfunktionen.sql` – Bereich und Frage löschen (enthält DELETE, braucht Bestätigung)

Den ersten Verwaltungszugang legt man einmalig per SQL an (neuer Katalog plus Zugang mit Rolle `intern`):

```sql
with k as (insert into public.fragenkatalog_kataloge (titel) values ('Neuer Fragenkatalog') returning id)
insert into public.fragenkatalog_zugaenge (katalog_id, name, firma, rolle)
select id, 'Vorname Nachname', 'Firma', 'intern' from k returning token;
```

## Struktur

```
src/api.ts          RPC-Aufrufe
src/App.tsx         Zugang (Token), Kopfzeile, Umschalter Katalog/Verwaltung
src/Katalog.tsx     Bereiche, Fragenkarten, Antworten, Kommentare, Freigabe
src/Verwaltung.tsx  Katalog, Bereiche, Fragen, Zugänge
supabase/migrations Datenbankschema und Funktionen
```
