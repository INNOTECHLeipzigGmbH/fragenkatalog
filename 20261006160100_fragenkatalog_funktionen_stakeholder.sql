create function public.fk_zugang(p_token text) returns public.fragenkatalog_zugaenge
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge;
begin
  select * into z from public.fragenkatalog_zugaenge where token = p_token and aktiv;
  if not found then raise exception 'Ungültiger Zugang' using errcode = '28000'; end if;
  return z;
end $$;

create function public.fk_intern(p_token text) returns public.fragenkatalog_zugaenge
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge;
begin
  z := public.fk_zugang(p_token);
  if z.rolle <> 'intern' then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  return z;
end $$;

create function public.fk_bedingung_erfuellt(p_bedingung jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_bedingung is null or p_bedingung = 'null'::jsonb then true
    else exists (
      select 1 from public.fragenkatalog_antworten a
      where a.frage_id = p_bedingung->>'frage_id'
        and a.wert is not null
        and case
              when jsonb_typeof(a.wert) = 'array'
                then exists (select 1 from jsonb_array_elements_text(a.wert) e
                             where e in (select jsonb_array_elements_text(p_bedingung->'werte')))
              else (a.wert #>> '{}') in (select jsonb_array_elements_text(p_bedingung->'werte'))
            end
    )
  end
$$;

create function public.fk_frage_zugriff(z public.fragenkatalog_zugaenge, p_frage_id text, p_schreiben boolean)
returns public.fragenkatalog_fragen
language plpgsql security definer set search_path = public as $$
declare f public.fragenkatalog_fragen; b public.fragenkatalog_bereiche;
begin
  select * into f from public.fragenkatalog_fragen where id = p_frage_id and katalog_id = z.katalog_id;
  if not found then raise exception 'Frage nicht gefunden'; end if;
  if z.rolle <> 'intern' and (f.rolle <> z.rolle or not public.fk_bedingung_erfuellt(f.bedingung)) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_schreiben and z.rolle <> 'intern' then
    select * into b from public.fragenkatalog_bereiche where id = f.bereich_id;
    if b.status = 'freigegeben' then raise exception 'Dieser Bereich ist freigegeben und gesperrt'; end if;
  end if;
  return f;
end $$;

-- ---------- RPC: Stakeholder ----------

create function public.fk_laden(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; intern boolean; res jsonb;
begin
  z := public.fk_zugang(p_token);
  intern := z.rolle = 'intern';
  update public.fragenkatalog_zugaenge set letzter_zugriff = now() where id = z.id;
  select jsonb_build_object(
    'zugang', jsonb_build_object('name', z.name, 'firma', z.firma, 'rolle', z.rolle, 'intern', intern),
    'katalog', (select jsonb_build_object('id', k.id, 'titel', k.titel, 'phase', k.phase)
                from public.fragenkatalog_kataloge k where k.id = z.katalog_id),
    'bereiche', coalesce((select jsonb_agg(to_jsonb(b) order by b.pos, b.kuerzel)
                from public.fragenkatalog_bereiche b
                where b.katalog_id = z.katalog_id
                  and (intern or exists (select 1 from public.fragenkatalog_fragen f
                                         where f.bereich_id = b.id and f.rolle = z.rolle
                                           and public.fk_bedingung_erfuellt(f.bedingung)))), '[]'::jsonb),
    'fragen', coalesce((select jsonb_agg(
                  (case when intern then to_jsonb(f) else to_jsonb(f) - 'blockiert' - 'bedingung' end)
                  || jsonb_build_object('sichtbar', public.fk_bedingung_erfuellt(f.bedingung))
                  order by f.pos, f.nummer)
                from public.fragenkatalog_fragen f
                where f.katalog_id = z.katalog_id
                  and (intern or (f.rolle = z.rolle and public.fk_bedingung_erfuellt(f.bedingung)))), '[]'::jsonb),
    'antworten', coalesce((select jsonb_agg(to_jsonb(a))
                from public.fragenkatalog_antworten a
                join public.fragenkatalog_fragen f on f.id = a.frage_id
                where f.katalog_id = z.katalog_id and (intern or f.rolle = z.rolle)), '[]'::jsonb),
    'kommentare', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
                from public.fragenkatalog_kommentare c
                join public.fragenkatalog_fragen f on f.id = c.frage_id
                where f.katalog_id = z.katalog_id and (intern or f.rolle = z.rolle)), '[]'::jsonb),
    'rollen', case when intern then coalesce((select jsonb_agg(distinct r) from (
                  select rolle as r from public.fragenkatalog_fragen where katalog_id = z.katalog_id
                  union select rolle from public.fragenkatalog_zugaenge
                        where katalog_id = z.katalog_id and rolle <> 'intern') s), '[]'::jsonb)
              else '[]'::jsonb end
  ) into res;
  return res;
end $$;

create function public.fk_antwort_speichern(p_token text, p_frage_id text, p_wert jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; f public.fragenkatalog_fragen; leer boolean; wer text;
begin
  z := public.fk_zugang(p_token);
  f := public.fk_frage_zugriff(z, p_frage_id, true);
  if length(coalesce(p_wert::text, '')) > 20000 then raise exception 'Antwort zu lang'; end if;
  leer := p_wert is null or p_wert in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
  wer := z.name || coalesce(' (' || nullif(z.firma, '') || ')', '');
  insert into public.fragenkatalog_antworten (frage_id, wert, status, bearbeitet_von)
  values (f.id, case when leer then null else p_wert end, case when leer then 'offen' else 'beantwortet' end, wer)
  on conflict (frage_id) do update
    set wert = excluded.wert, status = excluded.status,
        bearbeitet_von = excluded.bearbeitet_von, bearbeitet_am = now(), updated_at = now();
end $$;

create function public.fk_klaerung_setzen(p_token text, p_frage_id text, p_an boolean) returns void
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; f public.fragenkatalog_fragen; wer text;
begin
  z := public.fk_zugang(p_token);
  f := public.fk_frage_zugriff(z, p_frage_id, true);
  wer := z.name || coalesce(' (' || nullif(z.firma, '') || ')', '');
  insert into public.fragenkatalog_antworten (frage_id, status, bearbeitet_von)
  values (f.id, case when p_an then 'klaerung' else 'offen' end, wer)
  on conflict (frage_id) do update
    set status = case when p_an then 'klaerung' when fragenkatalog_antworten.wert is null then 'offen' else 'beantwortet' end,
        bearbeitet_von = excluded.bearbeitet_von, bearbeitet_am = now(), updated_at = now();
end $$;

create function public.fk_kommentar_hinzufuegen(p_token text, p_frage_id text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; f public.fragenkatalog_fragen;
begin
  z := public.fk_zugang(p_token);
  f := public.fk_frage_zugriff(z, p_frage_id, false);
  if p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 2000 then
    raise exception 'Kommentar leer oder zu lang';
  end if;
  insert into public.fragenkatalog_kommentare (frage_id, autor, rolle, text)
  values (f.id, z.name || coalesce(' (' || nullif(z.firma, '') || ')', ''), z.rolle, btrim(p_text));
end $$;

-- ---------- RPC: Verwaltung (nur Rolle 'intern') ----------

revoke all on function public.fk_zugang(text), public.fk_intern(text), public.fk_bedingung_erfuellt(jsonb),
  public.fk_frage_zugriff(public.fragenkatalog_zugaenge, text, boolean) from public, anon, authenticated;

revoke all on function
  public.fk_laden(text),
  public.fk_antwort_speichern(text, text, jsonb),
  public.fk_klaerung_setzen(text, text, boolean),
  public.fk_kommentar_hinzufuegen(text, text, text)
  from public, anon, authenticated;

grant execute on function
  public.fk_laden(text),
  public.fk_antwort_speichern(text, text, jsonb),
  public.fk_klaerung_setzen(text, text, boolean),
  public.fk_kommentar_hinzufuegen(text, text, text)
  to anon, authenticated;
