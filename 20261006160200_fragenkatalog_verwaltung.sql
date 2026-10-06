create function public.fk_katalog_speichern(p_token text, p_titel text, p_phase text) returns void
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge;
begin
  z := public.fk_intern(p_token);
  update public.fragenkatalog_kataloge set titel = coalesce(p_titel, titel), phase = p_phase, updated_at = now()
  where id = z.katalog_id;
end $$;

create function public.fk_bereich_speichern(p_token text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; v_id text;
begin
  z := public.fk_intern(p_token);
  if coalesce(btrim(p->>'kuerzel'), '') = '' then raise exception 'Kürzel fehlt'; end if;
  if coalesce(p->>'id', '') <> '' then
    update public.fragenkatalog_bereiche
       set kuerzel = btrim(p->>'kuerzel'), titel = coalesce(p->>'titel', ''), untertitel = nullif(p->>'untertitel', ''),
           pos = coalesce((p->>'pos')::int, pos), updated_at = now()
     where id = p->>'id' and katalog_id = z.katalog_id returning id into v_id;
    if v_id is null then raise exception 'Bereich nicht gefunden'; end if;
  else
    insert into public.fragenkatalog_bereiche (katalog_id, kuerzel, titel, untertitel, pos)
    values (z.katalog_id, btrim(p->>'kuerzel'), coalesce(p->>'titel', ''), nullif(p->>'untertitel', ''),
            coalesce((p->>'pos')::int, (select coalesce(max(pos), 0) + 10 from public.fragenkatalog_bereiche where katalog_id = z.katalog_id)))
    returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.fk_freigabe_setzen(p_token text, p_bereich_id text, p_freigegeben boolean) returns void
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge;
begin
  z := public.fk_intern(p_token);
  update public.fragenkatalog_bereiche
     set status = case when p_freigegeben then 'freigegeben' else 'offen' end,
         freigegeben_von = case when p_freigegeben then z.name else null end,
         freigegeben_am  = case when p_freigegeben then now() else null end,
         updated_at = now()
   where id = p_bereich_id and katalog_id = z.katalog_id;
end $$;

create function public.fk_frage_speichern(p_token text, p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; b public.fragenkatalog_bereiche; v_id text; v_nr text; v_n int;
begin
  z := public.fk_intern(p_token);
  select * into b from public.fragenkatalog_bereiche where id = p->>'bereich_id' and katalog_id = z.katalog_id;
  if not found then raise exception 'Bereich nicht gefunden'; end if;
  if coalesce(btrim(p->>'text'), '') = '' then raise exception 'Fragetext fehlt'; end if;
  if coalesce(btrim(p->>'rolle'), '') = '' or p->>'rolle' = 'intern' then raise exception 'Zuständige Rolle fehlt'; end if;
  if coalesce(p->>'id', '') <> '' then
    update public.fragenkatalog_fragen
       set bereich_id = b.id, text = btrim(p->>'text'), hinweis = nullif(p->>'hinweis', ''),
           typ = coalesce(p->>'typ', 'text'), optionen = coalesce(p->'optionen', '[]'::jsonb),
           einheit = nullif(p->>'einheit', ''), rolle = btrim(p->>'rolle'),
           frist = nullif(p->>'frist', '')::date, blockiert = nullif(p->>'blockiert', ''),
           bedingung = case when p->'bedingung' = 'null'::jsonb then null else p->'bedingung' end,
           nummer = coalesce(nullif(btrim(p->>'nummer'), ''), nummer), updated_at = now()
     where id = p->>'id' and katalog_id = z.katalog_id returning id into v_id;
    if v_id is null then raise exception 'Frage nicht gefunden'; end if;
  else
    v_nr := nullif(btrim(p->>'nummer'), '');
    if v_nr is null then
      select coalesce(max(substring(nummer from '^.*-(\d+)$')::int), 0) + 1 into v_n
        from public.fragenkatalog_fragen where bereich_id = b.id;
      v_nr := b.kuerzel || '-' || lpad(v_n::text, 2, '0');
    end if;
    insert into public.fragenkatalog_fragen
      (katalog_id, bereich_id, nummer, text, hinweis, typ, optionen, einheit, rolle, frist, blockiert, bedingung, pos)
    values (z.katalog_id, b.id, v_nr, btrim(p->>'text'), nullif(p->>'hinweis', ''), coalesce(p->>'typ', 'text'),
            coalesce(p->'optionen', '[]'::jsonb), nullif(p->>'einheit', ''), btrim(p->>'rolle'),
            nullif(p->>'frist', '')::date, nullif(p->>'blockiert', ''),
            case when p->'bedingung' = 'null'::jsonb then null else p->'bedingung' end,
            (select coalesce(max(pos), 0) + 10 from public.fragenkatalog_fragen where bereich_id = b.id))
    returning id into v_id;
  end if;
  return v_id;
end $$;

create function public.fk_zugaenge_laden(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge;
begin
  z := public.fk_intern(p_token);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.rolle, x.name)
                   from public.fragenkatalog_zugaenge x where x.katalog_id = z.katalog_id), '[]'::jsonb);
end $$;

create function public.fk_zugang_speichern(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; r public.fragenkatalog_zugaenge;
begin
  z := public.fk_intern(p_token);
  if coalesce(btrim(p->>'name'), '') = '' or coalesce(btrim(p->>'rolle'), '') = '' then
    raise exception 'Name und Rolle sind erforderlich';
  end if;
  if coalesce(p->>'id', '') <> '' then
    if p->>'id' = z.id and (btrim(p->>'rolle') <> 'intern' or coalesce((p->>'aktiv')::boolean, true) = false) then
      raise exception 'Der eigene Verwaltungszugang kann nicht herabgestuft oder deaktiviert werden';
    end if;
    update public.fragenkatalog_zugaenge
       set name = btrim(p->>'name'), firma = nullif(p->>'firma', ''), email = nullif(p->>'email', ''),
           rolle = btrim(p->>'rolle'), aktiv = coalesce((p->>'aktiv')::boolean, aktiv)
     where id = p->>'id' and katalog_id = z.katalog_id returning * into r;
    if not found then raise exception 'Zugang nicht gefunden'; end if;
  else
    insert into public.fragenkatalog_zugaenge (katalog_id, name, firma, email, rolle)
    values (z.katalog_id, btrim(p->>'name'), nullif(p->>'firma', ''), nullif(p->>'email', ''), btrim(p->>'rolle'))
    returning * into r;
  end if;
  return to_jsonb(r);
end $$;

create function public.fk_zugang_token_erneuern(p_token text, p_id text) returns text
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge; v_neu text;
begin
  z := public.fk_intern(p_token);
  v_neu := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.fragenkatalog_zugaenge set token = v_neu where id = p_id and katalog_id = z.katalog_id;
  if not found then raise exception 'Zugang nicht gefunden'; end if;
  return v_neu;
end $$;

revoke all on function
  public.fk_katalog_speichern(text, text, text),
  public.fk_bereich_speichern(text, jsonb),
  public.fk_freigabe_setzen(text, text, boolean),
  public.fk_frage_speichern(text, jsonb),
  public.fk_zugaenge_laden(text),
  public.fk_zugang_speichern(text, jsonb),
  public.fk_zugang_token_erneuern(text, text)
  from public, anon, authenticated;

grant execute on function
  public.fk_katalog_speichern(text, text, text),
  public.fk_bereich_speichern(text, jsonb),
  public.fk_freigabe_setzen(text, text, boolean),
  public.fk_frage_speichern(text, jsonb),
  public.fk_zugaenge_laden(text),
  public.fk_zugang_speichern(text, jsonb),
  public.fk_zugang_token_erneuern(text, text)
  to anon, authenticated;
