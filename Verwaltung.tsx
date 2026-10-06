import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Daten, Frage, Typ, ZugangRow } from './types'

const TYPEN: Record<Typ, string> = { auswahl: 'Auswahl', mehrfach: 'Mehrfachauswahl', zahl: 'Zahl', text: 'Freitext', datum: 'Datum' }
interface Props { daten: Daten; token: string; neuLaden: () => Promise<void> }

export default function Verwaltung({ daten, token, neuLaden }: Props) {
  const [meldung, setMeldung] = useState<string | null>(null)
  async function tun(fn: () => Promise<unknown>, ok?: string) {
    try { setMeldung(null); await fn(); await neuLaden(); if (ok) setMeldung(ok) }
    catch (e) { setMeldung(e instanceof Error ? e.message : 'Fehler') }
  }
  return (
    <div className="verw">
      {meldung && <p className="note" role="status">{meldung}</p>}
      <KatalogForm daten={daten} token={token} tun={tun} />
      <BereicheForm daten={daten} token={token} tun={tun} />
      <FragenForm daten={daten} token={token} tun={tun} />
      <Zugaenge daten={daten} token={token} tun={tun} />
    </div>
  )
}

type Tun = (fn: () => Promise<unknown>, ok?: string) => Promise<void>
interface SubProps { daten: Daten; token: string; tun: Tun }

function KatalogForm({ daten, token, tun }: SubProps) {
  const [titel, setTitel] = useState(daten.katalog.titel)
  const [phase, setPhase] = useState(daten.katalog.phase ?? '')
  return (
    <section className="panel">
      <h2>Katalog</h2>
      <form className="row2" onSubmit={e => { e.preventDefault(); tun(() => api.katalog(token, titel, phase), 'Gespeichert') }}>
        <label>Titel<input value={titel} onChange={e => setTitel(e.target.value)} placeholder="Projektname" /></label>
        <label>Phase<input value={phase} onChange={e => setPhase(e.target.value)} placeholder="z. B. Auftragsklärung" /></label>
        <button className="btn pri" type="submit">Speichern</button>
      </form>
    </section>
  )
}

function BereicheForm({ daten, token, tun }: SubProps) {
  const [neu, setNeu] = useState({ kuerzel: '', titel: '', untertitel: '' })
  return (
    <section className="panel">
      <h2>Bereiche</h2>
      {daten.bereiche.map(b => <BereichZeile key={b.id} b={b} token={token} tun={tun} />)}
      <form className="row3" onSubmit={e => { e.preventDefault(); tun(async () => { await api.bereichSpeichern(token, neu); setNeu({ kuerzel: '', titel: '', untertitel: '' }) }) }}>
        <label>Kürzel<input value={neu.kuerzel} onChange={e => setNeu({ ...neu, kuerzel: e.target.value })} placeholder="A" maxLength={4} required /></label>
        <label>Titel<input value={neu.titel} onChange={e => setNeu({ ...neu, titel: e.target.value })} placeholder="Neuer Bereich" required /></label>
        <label>Untertitel<input value={neu.untertitel} onChange={e => setNeu({ ...neu, untertitel: e.target.value })} /></label>
        <button className="btn pri" type="submit">Bereich anlegen</button>
      </form>
    </section>
  )
}

function BereichZeile({ b, token, tun }: { b: Daten['bereiche'][number]; token: string; tun: Tun }) {
  const [v, setV] = useState({ kuerzel: b.kuerzel, titel: b.titel, untertitel: b.untertitel ?? '' })
  const [frage, setFrage] = useState(false)
  return (
    <form className="row3 zeile" onSubmit={e => { e.preventDefault(); tun(() => api.bereichSpeichern(token, { id: b.id, ...v, pos: b.pos })) }}>
      <label>Kürzel<input value={v.kuerzel} onChange={e => setV({ ...v, kuerzel: e.target.value })} maxLength={4} /></label>
      <label>Titel<input value={v.titel} onChange={e => setV({ ...v, titel: e.target.value })} /></label>
      <label>Untertitel<input value={v.untertitel} onChange={e => setV({ ...v, untertitel: e.target.value })} /></label>
      <div className="btns">
        <button className="btn" type="submit">Speichern</button>
        {frage
          ? <><button className="btn danger" type="button" onClick={() => tun(() => api.bereichLoeschen(token, b.id))}>Wirklich löschen (inkl. Fragen)</button>
              <button className="btn" type="button" onClick={() => setFrage(false)}>Abbrechen</button></>
          : <button className="btn" type="button" onClick={() => setFrage(true)}>Löschen</button>}
      </div>
    </form>
  )
}

const leer = (rolle: string, bereich: string) => ({
  id: '', bereich_id: bereich, text: '', hinweis: '', typ: 'auswahl' as Typ, optionen: '', einheit: '',
  rolle, frist: '', blockiert: '', bedFrage: '', bedWerte: '',
})

function FragenForm({ daten, token, tun }: SubProps) {
  const rollen = daten.rollen
  const [bereich, setBereich] = useState(daten.bereiche[0]?.id ?? '')
  const [f, setF] = useState(leer(rollen[0] ?? '', bereich))
  const [loesch, setLoesch] = useState<string | null>(null)
  const liste = daten.fragen.filter(x => x.bereich_id === bereich)
  const nummerVon = (id: string) => daten.fragen.find(x => x.id === id)?.nummer ?? id

  function bearbeiten(x: Frage) {
    setF({
      id: x.id, bereich_id: x.bereich_id, text: x.text, hinweis: x.hinweis ?? '', typ: x.typ, optionen: x.optionen.join(', '),
      einheit: x.einheit ?? '', rolle: x.rolle, frist: x.frist ?? '', blockiert: x.blockiert ?? '',
      bedFrage: x.bedingung?.frage_id ?? '', bedWerte: x.bedingung?.werte.join(', ') ?? '',
    })
    window.scrollTo({ top: document.getElementById('frage-form')?.offsetTop ?? 0, behavior: 'smooth' })
  }
  function speichern(e: React.FormEvent) {
    e.preventDefault()
    const teilen = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean)
    tun(async () => {
      await api.frageSpeichern(token, {
        id: f.id || undefined, bereich_id: f.bereich_id, text: f.text, hinweis: f.hinweis, typ: f.typ,
        optionen: f.typ === 'auswahl' || f.typ === 'mehrfach' ? teilen(f.optionen) : [],
        einheit: f.typ === 'zahl' ? f.einheit : '', rolle: f.rolle, frist: f.frist, blockiert: f.blockiert,
        bedingung: f.bedFrage && f.bedWerte ? { frage_id: f.bedFrage, werte: teilen(f.bedWerte) } : null,
      })
      setF(leer(f.rolle, f.bereich_id))
    }, f.id ? 'Frage gespeichert' : 'Frage angelegt')
  }

  return (
    <section className="panel">
      <h2>Fragen</h2>
      {!daten.bereiche.length && <p className="sub">Lege zuerst einen Bereich an.</p>}
      <label className="rolle">Bereich
        <select value={bereich} onChange={e => { setBereich(e.target.value); setF(leer(f.rolle, e.target.value)) }}>
          {daten.bereiche.map(b => <option key={b.id} value={b.id}>{b.kuerzel} · {b.titel}</option>)}
        </select>
      </label>
      <div className="fliste">
        {liste.map(x => (
          <div className="zeile" key={x.id}>
            <span className="id">{x.nummer}</span>
            <span className="ft">{x.text}<small>{x.rolle} · {TYPEN[x.typ]}{x.bedingung ? ` · nur wenn ${nummerVon(x.bedingung.frage_id)} = ${x.bedingung.werte.join('/')}` : ''}</small></span>
            <span className="btns">
              <button className="btn" onClick={() => bearbeiten(x)}>Bearbeiten</button>
              {loesch === x.id
                ? <><button className="btn danger" onClick={() => { setLoesch(null); tun(() => api.frageLoeschen(token, x.id)) }}>Wirklich löschen</button><button className="btn" onClick={() => setLoesch(null)}>Abbrechen</button></>
                : <button className="btn" onClick={() => setLoesch(x.id)}>Löschen</button>}
            </span>
          </div>
        ))}
        {!liste.length && !!daten.bereiche.length && <p className="sub">In diesem Bereich gibt es noch keine Fragen.</p>}
      </div>

      {!!daten.bereiche.length && (
        <form id="frage-form" className="addform" onSubmit={speichern}>
          <h3 className="full">{f.id ? `Frage ${nummerVon(f.id)} bearbeiten` : 'Neue Frage'}</h3>
          <label className="full">Frage<input value={f.text} onChange={e => setF({ ...f, text: e.target.value })} required /></label>
          <label className="full">Hinweis (optional)<input value={f.hinweis} onChange={e => setF({ ...f, hinweis: e.target.value })} placeholder="Warum fragen wir das, was hängt davon ab?" /></label>
          <label>Bereich<select value={f.bereich_id} onChange={e => setF({ ...f, bereich_id: e.target.value })}>
            {daten.bereiche.map(b => <option key={b.id} value={b.id}>{b.kuerzel} · {b.titel}</option>)}</select></label>
          <label>Antwortart<select value={f.typ} onChange={e => setF({ ...f, typ: e.target.value as Typ })}>
            {(Object.keys(TYPEN) as Typ[]).map(t => <option key={t} value={t}>{TYPEN[t]}</option>)}</select></label>
          {(f.typ === 'auswahl' || f.typ === 'mehrfach') && <label className="full">Optionen (mit Komma getrennt)<input value={f.optionen} onChange={e => setF({ ...f, optionen: e.target.value })} placeholder="Ja, Nein, Unklar" /></label>}
          {f.typ === 'zahl' && <label>Einheit<input value={f.einheit} onChange={e => setF({ ...f, einheit: e.target.value })} placeholder="m², €, kW" /></label>}
          <label>Zuständige Rolle<input list="rollen" value={f.rolle} onChange={e => setF({ ...f, rolle: e.target.value })} required placeholder="z. B. Auftraggeber" /></label>
          <label>Frist<input type="date" value={f.frist} onChange={e => setF({ ...f, frist: e.target.value })} /></label>
          <label className="full">Blockiert (optional, nur intern sichtbar)<input value={f.blockiert} onChange={e => setF({ ...f, blockiert: e.target.value })} placeholder="z. B. Kostenschätzung" /></label>
          <label>Nur anzeigen, wenn Frage …<select value={f.bedFrage} onChange={e => setF({ ...f, bedFrage: e.target.value })}>
            <option value="">immer anzeigen</option>
            {daten.fragen.filter(x => x.id !== f.id).map(x => <option key={x.id} value={x.id}>{x.nummer} · {x.text.slice(0, 40)}</option>)}</select></label>
          {f.bedFrage && <label>… eine dieser Antworten hat<input value={f.bedWerte} onChange={e => setF({ ...f, bedWerte: e.target.value })} placeholder="Ja, Teilweise" /></label>}
          <datalist id="rollen">{rollen.map(r => <option key={r} value={r} />)}</datalist>
          <div className="fa"><button className="btn pri" type="submit">{f.id ? 'Änderungen speichern' : 'Frage hinzufügen'}</button>
            {f.id && <button className="btn" type="button" onClick={() => setF(leer(f.rolle, f.bereich_id))}>Abbrechen</button>}</div>
        </form>
      )}
    </section>
  )
}

function Zugaenge({ daten, token, tun }: SubProps) {
  const [liste, setListe] = useState<ZugangRow[]>([])
  const [neu, setNeu] = useState({ name: '', firma: '', email: '', rolle: '' })
  const [kopiert, setKopiert] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const laden = useCallback(async () => { try { setListe(await api.zugaenge(token)) } catch (e) { setFehler(e instanceof Error ? e.message : 'Fehler') } }, [token])
  useEffect(() => { laden() }, [laden])
  const link = (t: string) => `${window.location.origin}${window.location.pathname}?z=${t}`
  const zeit = (s: string | null) => (s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie')
  async function kopieren(z: ZugangRow) {
    try { await navigator.clipboard.writeText(link(z.token)); setKopiert(z.id); window.setTimeout(() => setKopiert(null), 2000) }
    catch { window.prompt('Zugangslink', link(z.token)) }
  }
  return (
    <section className="panel">
      <h2>Zugänge</h2>
      <p className="sub">Jede Person erhält einen persönlichen Link. Die Rolle bestimmt, welche Fragen sichtbar sind. Die Rolle „intern“ öffnet die Verwaltung.</p>
      {fehler && <p className="note late-t">{fehler}</p>}
      <div className="fliste">
        {liste.map(z => (
          <div className="zeile" key={z.id}>
            <span className="ft">{z.name}{z.firma ? `, ${z.firma}` : ''}<small>{z.rolle} · zuletzt {zeit(z.letzter_zugriff)}{z.aktiv ? '' : ' · deaktiviert'}</small></span>
            <span className="btns">
              <button className="btn" onClick={() => kopieren(z)}>{kopiert === z.id ? 'Kopiert' : 'Link kopieren'}</button>
              <button className="btn" onClick={() => tun(async () => { await api.zugangSpeichern(token, { ...z, aktiv: !z.aktiv }); await laden() })}>{z.aktiv ? 'Deaktivieren' : 'Aktivieren'}</button>
              <button className="btn" onClick={() => tun(async () => { await api.tokenErneuern(token, z.id); await laden() }, 'Neuer Link erzeugt, der alte ist ungültig')}>Link erneuern</button>
            </span>
          </div>
        ))}
      </div>
      <form className="row4" onSubmit={e => { e.preventDefault(); tun(async () => { await api.zugangSpeichern(token, neu); setNeu({ name: '', firma: '', email: '', rolle: '' }); await laden() }) }}>
        <label>Name<input value={neu.name} onChange={e => setNeu({ ...neu, name: e.target.value })} required /></label>
        <label>Firma<input value={neu.firma} onChange={e => setNeu({ ...neu, firma: e.target.value })} /></label>
        <label>E-Mail<input type="email" value={neu.email} onChange={e => setNeu({ ...neu, email: e.target.value })} /></label>
        <label>Rolle<input list="rollen2" value={neu.rolle} onChange={e => setNeu({ ...neu, rolle: e.target.value })} required placeholder="z. B. Betreiber" /></label>
        <datalist id="rollen2">{[...daten.rollen, 'intern'].map(r => <option key={r} value={r} />)}</datalist>
        <button className="btn pri" type="submit">Zugang anlegen</button>
      </form>
    </section>
  )
}
