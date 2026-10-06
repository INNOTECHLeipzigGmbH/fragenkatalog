export type Typ = 'auswahl' | 'mehrfach' | 'zahl' | 'text' | 'datum'
export type Status = 'offen' | 'klaerung' | 'beantwortet'

export interface Zugang { name: string; firma: string | null; rolle: string; intern: boolean }
export interface Bereich {
  id: string; kuerzel: string; titel: string; untertitel: string | null; pos: number
  status: 'offen' | 'freigegeben'; freigegeben_von: string | null; freigegeben_am: string | null
}
export interface Bedingung { frage_id: string; werte: string[] }
export interface Frage {
  id: string; bereich_id: string; nummer: string; text: string; hinweis: string | null
  typ: Typ; optionen: string[]; einheit: string | null; rolle: string; frist: string | null
  blockiert?: string | null; bedingung?: Bedingung | null; pos: number; sichtbar: boolean
}
export interface Antwort { frage_id: string; wert: unknown; status: Status; bearbeitet_von: string | null; bearbeitet_am: string | null }
export interface Kommentar { id: string; frage_id: string; autor: string; rolle: string | null; text: string; created_at: string }
export interface Daten {
  zugang: Zugang
  katalog: { id: string; titel: string; phase: string | null }
  bereiche: Bereich[]; fragen: Frage[]; antworten: Antwort[]; kommentare: Kommentar[]; rollen: string[]
}
export interface ZugangRow {
  id: string; name: string; firma: string | null; email: string | null; rolle: string
  token: string; aktiv: boolean; letzter_zugriff: string | null
}
