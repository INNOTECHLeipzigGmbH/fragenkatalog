-- Enthält DELETE-Statements: die Supabase-Anbindung verlangt dafür eine Bestätigung.
create function public.fk_bereich_loeschen(p_token text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge;
begin
  z := public.fk_intern(p_token);
  delete from public.fragenkatalog_bereiche where id = p_id and katalog_id = z.katalog_id;
end $$;

create function public.fk_frage_loeschen(p_token text, p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare z public.fragenkatalog_zugaenge;
begin
  z := public.fk_intern(p_token);
  delete from public.fragenkatalog_fragen where id = p_id and katalog_id = z.katalog_id;
end $$;

revoke all on function
  public.fk_bereich_loeschen(text, text),
  public.fk_frage_loeschen(text, text)
  from public, anon, authenticated;

grant execute on function
  public.fk_bereich_loeschen(text, text),
  public.fk_frage_loeschen(text, text)
  to anon, authenticated;
