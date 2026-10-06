import { createClient } from '@supabase/supabase-js'
import type { Daten, ZugangRow } from './types'

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const api = {
  laden: (t: string) => rpc<Daten>('fk_laden', { p_token: t }),
  antwort: (t: string, frageId: string, wert: unknown) =>
    rpc<void>('fk_antwort_speichern', { p_token: t, p_frage_id: frageId, p_wert: wert }),
  klaerung: (t: string, frageId: string, an: boolean) =>
    rpc<void>('fk_klaerung_setzen', { p_token: t, p_frage_id: frageId, p_an: an }),
  kommentar: (t: string, frageId: string, text: string) =>
    rpc<void>('fk_kommentar_hinzufuegen', { p_token: t, p_frage_id: frageId, p_text: text }),
  // Verwaltung (Rolle "intern")
  katalog: (t: string, titel: string, phase: string) =>
    rpc<void>('fk_katalog_speichern', { p_token: t, p_titel: titel, p_phase: phase || null }),
  bereichSpeichern: (t: string, p: Record<string, unknown>) => rpc<string>('fk_bereich_speichern', { p_token: t, p }),
  bereichLoeschen: (t: string, id: string) => rpc<void>('fk_bereich_loeschen', { p_token: t, p_id: id }),
  freigabe: (t: string, bereichId: string, frei: boolean) =>
    rpc<void>('fk_freigabe_setzen', { p_token: t, p_bereich_id: bereichId, p_freigegeben: frei }),
  frageSpeichern: (t: string, p: Record<string, unknown>) => rpc<string>('fk_frage_speichern', { p_token: t, p }),
  frageLoeschen: (t: string, id: string) => rpc<void>('fk_frage_loeschen', { p_token: t, p_id: id }),
  zugaenge: (t: string) => rpc<ZugangRow[]>('fk_zugaenge_laden', { p_token: t }),
  zugangSpeichern: (t: string, p: Record<string, unknown>) => rpc<ZugangRow>('fk_zugang_speichern', { p_token: t, p }),
  tokenErneuern: (t: string, id: string) => rpc<string>('fk_zugang_token_erneuern', { p_token: t, p_id: id }),
}
