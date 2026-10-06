-- Fragenkatalog für Auftraggeber und Stakeholder
-- Zugriff ausschließlich über RPC-Funktionen mit persönlichem Zugangstoken.
-- Die Tabellen haben RLS aktiviert und bewusst KEINE Policies: anon/authenticated
-- können nichts direkt lesen oder schreiben.

create table public.fragenkatalog_kataloge (
  id          text primary key default gen_random_uuid()::text,
  projekt_id  text references public.kaufland_status(id) on delete set null,
  titel       text not null default '',
  phase       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.fragenkatalog_bereiche (
  id              text primary key default gen_random_uuid()::text,
  katalog_id      text not null references public.fragenkatalog_kataloge(id) on delete cascade,
  kuerzel         text not null,
  titel           text not null default '',
  untertitel      text,
  pos             integer not null default 0,
  status          text not null default 'offen' check (status in ('offen','freigegeben')),
  freigegeben_von text,
  freigegeben_am  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (katalog_id, kuerzel)
);

create table public.fragenkatalog_fragen (
  id          text primary key default gen_random_uuid()::text,
  katalog_id  text not null references public.fragenkatalog_kataloge(id) on delete cascade,
  bereich_id  text not null references public.fragenkatalog_bereiche(id) on delete cascade,
  nummer      text not null,
  text        text not null,
  hinweis     text,
  typ         text not null default 'text' check (typ in ('auswahl','mehrfach','zahl','text','datum')),
  optionen    jsonb not null default '[]'::jsonb,
  einheit     text,
  rolle       text not null,
  frist       date,
  blockiert   text,
  bedingung   jsonb,
  pos         integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (katalog_id, nummer)
);
create index fragenkatalog_fragen_bereich_idx on public.fragenkatalog_fragen(bereich_id);

create table public.fragenkatalog_antworten (
  frage_id        text primary key references public.fragenkatalog_fragen(id) on delete cascade,
  wert            jsonb,
  status          text not null default 'offen' check (status in ('offen','klaerung','beantwortet')),
  bearbeitet_von  text,
  bearbeitet_am   timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.fragenkatalog_kommentare (
  id          uuid primary key default gen_random_uuid(),
  frage_id    text not null references public.fragenkatalog_fragen(id) on delete cascade,
  autor       text not null,
  rolle       text,
  text        text not null,
  created_at  timestamptz not null default now()
);
create index fragenkatalog_kommentare_frage_idx on public.fragenkatalog_kommentare(frage_id);

create table public.fragenkatalog_zugaenge (
  id              text primary key default gen_random_uuid()::text,
  katalog_id      text not null references public.fragenkatalog_kataloge(id) on delete cascade,
  name            text not null,
  firma           text,
  email           text,
  rolle           text not null,  -- 'intern' = Verwaltung, sonst Stakeholder-Rolle
  token           text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  aktiv           boolean not null default true,
  letzter_zugriff timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.fragenkatalog_kataloge   enable row level security;
alter table public.fragenkatalog_bereiche   enable row level security;
alter table public.fragenkatalog_fragen     enable row level security;
alter table public.fragenkatalog_antworten  enable row level security;
alter table public.fragenkatalog_kommentare enable row level security;
alter table public.fragenkatalog_zugaenge   enable row level security;

revoke all on table public.fragenkatalog_kataloge, public.fragenkatalog_bereiche,
  public.fragenkatalog_fragen, public.fragenkatalog_antworten,
  public.fragenkatalog_kommentare, public.fragenkatalog_zugaenge from anon, authenticated;
