import { useMemo, useState } from 'react'
import { api } from './api'
import type { Antwort, Daten, Frage, Status } from './types'

const ST: Record<Status, string> = { offen: 'Offen', klaerung: 'In Klärung', beantwortet: 'Beantwortet' }
const fmtD = (d: string | null) => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' : '')
const heute = () => new Date().toISOString().slice(0, 10)
function vor(iso: string | null) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'gerade eben'
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`
  return `vor ${Math.floor(s / 86400)} Tg.`
}
const hat = (w: unknown) => (Array.isArray(w) ? w.length > 0 : w !== null && w !== undefined && w !== '')

interface Props { daten: Daten; token: string; neuLaden: () => Promise<void> }

export default function Katalog({ daten, token, neuLaden }: Props) {
  const intern = daten.zugang.intern
  const [sel, setSel] = useState<string | null>(null)
  const [flt, setFlt] = useState<'alle' | Status>('alle')
  const [rolle, setRolle] = useState('Alle')
  const [offen, setOffen] = useState<Set<string>>(new Set())
  const [meldung, setMeldung] = useState<string | null>(null)

  const antw = useMemo(() => new Map(daten.antworten.map(a => [a.frage_id, a])), [daten.antworten])
  const sichtbar = useMemo(
    () => daten.fragen.filter(f => f.sichtbar && (rolle === 'Alle' || f.rolle === rolle)),
    [daten.fragen, rolle],
  )
  const st = (f: Frage): Status => antw.get(f.id)?.status ?? 'offen'
  const pct = (l: Frage[]) => (l.length ? Math.round((l.filter(f => st(f) === 'beantwortet').length / l.length) * 100) : 0)

  const bereich = daten.bereiche.find(b => b.id === sel) ?? daten.bereiche[0]
  const liste = bereich ? sichtbar.filter(f => f.bereich_id === bereich.id) : []
  const gezeigt = liste.filter(f => flt === 'alle' || st(f) === flt)
  const gesperrt = !!bereich && bereich.status === 'freigegeben' && !intern

  async function tun(fn: () => Promise<unknown>) {
    try { setMeldung(null); await fn(); await neuLaden() }
    catch (e) { setMeldung(e instanceof Error ? e.message : 'Speichern nicht möglich') }
  }

  if (!bereich) {
    return <div className="grid"><main><div className="empty"><b>Noch keine Fragen im Katalog</b>Sobald Fragen angelegt sind, erscheinen sie hier.</div></main></div>
  }

  const blockiert = intern
    ? daten.fragen.filter(f => f.blockiert && st(f) !== 'beantwortet' && f.sichtbar).sort((a, b) => (a.frist ?? 'z') < (b.frist ?? 'z') ? -1 : 1).slice(0, 5)
    : []
  const zaehl = (k: Status) => liste.filter(f => st(f) === k).length

  return (
    <div className="grid">
      <nav aria-label="Themenbereiche">
        <p className="h">Themenbereiche</p>
        <div className="list">
          {daten.bereiche.map(b => {
            const l = sichtbar.filter(f => f.bereich_id === b.id)
            return (
              <button key={b.id} className="sec" aria-current={b.id === bereich.id} onClick={() => { setSel(b.id); setFlt('alle') }}>
                <div className="r"><span>{b.kuerzel} · {b.titel}</span><em>{l.filter(f => st(f) === 'beantwortet').length}/{l.length}</em></div>
                <div className="bar"><i style={{ width: pct(l) + '%' }} /></div>
                {b.status === 'freigegeben' && <span className="tag ok">Freigegeben</span>}
              </button>
            )
          })}
        </div>
      </nav>

      <main>
        <h1>{bereich.titel}</h1>
        <p className="sub">{bereich.untertitel}</p>
        <div className="toolbar">
          <div className="chips">
            {(['alle', 'offen', 'klaerung', 'beantwortet'] as const).map(k => (
              <button key={k} className="chip" aria-pressed={flt === k} onClick={() => setFlt(k)}>
                {k === 'alle' ? `Alle · ${liste.length}` : `${ST[k]} · ${zaehl(k)}`}
              </button>
            ))}
          </div>
          {intern && (
            <label className="rolle">Ansicht als
              <select value={rolle} onChange={e => setRolle(e.target.value)}>
                <option>Alle</option>
                {daten.rollen.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
          )}
        </div>
        {gesperrt && <p className="note">Dieser Bereich ist freigegeben{bereich.freigegeben_von ? ` von ${bereich.freigegeben_von}` : ''}. Änderungen sind gesperrt.</p>}
        {meldung && <p className="note late-t" role="alert">{meldung}</p>}
        {gezeigt.map(f => (
          <Karte key={f.id} f={f} a={antw.get(f.id)} gesperrt={gesperrt} offen={offen.has(f.id)}
            kommentare={daten.kommentare.filter(k => k.frage_id === f.id)}
            eltern={f.bedingung ? daten.fragen.find(x => x.id === f.bedingung!.frage_id)?.nummer : undefined}
            toggle={() => setOffen(s => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n })}
            speichern={w => tun(() => api.antwort(token, f.id, w))}
            klaerung={an => tun(() => api.klaerung(token, f.id, an))}
            kommentieren={t => tun(() => api.kommentar(token, f.id, t))} />
        ))}
        {!gezeigt.length && <div className="empty"><b>Keine Fragen in dieser Ansicht</b>Wähle einen anderen Status oder Bereich.</div>}
      </main>

      <aside>
        <div className="box">
          <p className="h">Bereich {bereich.kuerzel}</p>
          <div className="big">{pct(liste)} %<small>beantwortet</small></div>
          <div className="rows">{(Object.keys(ST) as Status[]).map(k => <div className="row" key={k}><span>{ST[k]}</span><b>{zaehl(k)}</b></div>)}</div>
          <p className="state">{bereich.status === 'freigegeben' ? `Freigegeben${bereich.freigegeben_von ? ' von ' + bereich.freigegeben_von : ''}, ${vor(bereich.freigegeben_am)}` : 'Noch nicht freigegeben'}</p>
          {intern && (
            <div className="acts">
              <button className="btn pri block" onClick={() => tun(() => api.freigabe(token, bereich.id, bereich.status !== 'freigegeben'))}>
                {bereich.status === 'freigegeben' ? 'Freigabe zurücknehmen' : 'Bereich freigeben'}
              </button>
            </div>
          )}
        </div>
        {intern && (
          <div className="box">
            <p className="h">Blockiert andere Gewerke</p>
            {blockiert.length
              ? blockiert.map(f => (
                <div className="blk" key={f.id}><span className="id">{f.nummer}</span>
                  <span>{f.text.length > 52 ? f.text.slice(0, 50) + '…' : f.text}<br /><span className="w">wartet: {f.blockiert}{f.frist ? ` · bis ${fmtD(f.frist)}` : ''}</span></span></div>))
              : <div className="log">Keine offenen Fragen blockieren Folgearbeiten.</div>}
          </div>
        )}
      </aside>
    </div>
  )
}

interface KarteProps {
  f: Frage; a?: Antwort; gesperrt: boolean; offen: boolean; eltern?: string
  kommentare: Daten['kommentare']; toggle: () => void
  speichern: (w: unknown) => void; klaerung: (an: boolean) => void; kommentieren: (t: string) => void
}

function Karte({ f, a, gesperrt, offen, eltern, kommentare, toggle, speichern, klaerung, kommentieren }: KarteProps) {
  const status: Status = a?.status ?? 'offen'
  const wert = a?.wert ?? null
  const spaet = status !== 'beantwortet' && !!f.frist && f.frist < heute()
  const [text, setText] = useState('')
  const sperr = gesperrt

  return (
    <article className={`q${f.bedingung ? ' sub' : ''}${spaet ? ' late' : ''}`}>
      <div className="qh">
        <span className="id">{f.nummer}</span>
        <div className="qt">
          {eltern && <><span className="follow">Folgefrage zu {eltern}</span><br /></>}
          {f.text}{f.hinweis && <small>{f.hinweis}</small>}
        </div>
        <span className={`st ${status === 'beantwortet' ? 'done' : status === 'klaerung' ? 'clar' : 'open'}`}>{ST[status]}</span>
      </div>
      <div className="ans">
        {f.typ === 'auswahl' && f.optionen.map(o => (
          <button key={o} className="opt" aria-pressed={wert === o} disabled={sperr} onClick={() => speichern(wert === o ? null : o)}>{o}</button>))}
        {f.typ === 'mehrfach' && f.optionen.map(o => {
          const cur = Array.isArray(wert) ? (wert as string[]) : []
          return <button key={o} className="opt" aria-pressed={cur.includes(o)} disabled={sperr}
            onClick={() => speichern(cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o])}>{o}</button>
        })}
        {f.typ === 'zahl' && <>
          <input key={`${f.id}:${String(wert)}`} type="number" defaultValue={hat(wert) ? String(wert) : ''} disabled={sperr} placeholder="Zahl eingeben" aria-label={`Antwort zu ${f.nummer}`}
            onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (wert ?? null)) speichern(v) }} />
          {f.einheit && <span className="u">{f.einheit}</span>}</>}
        {f.typ === 'datum' && <input key={`${f.id}:${String(wert)}`} type="date" defaultValue={typeof wert === 'string' ? wert : ''} disabled={sperr} aria-label={`Antwort zu ${f.nummer}`}
          onBlur={e => { const v = e.target.value || null; if (v !== (wert ?? null)) speichern(v) }} />}
        {f.typ === 'text' && <textarea key={`${f.id}:${String(wert)}`} rows={2} defaultValue={typeof wert === 'string' ? wert : ''} disabled={sperr} placeholder="Antwort eingeben …" aria-label={`Antwort zu ${f.nummer}`}
          onBlur={e => { const v = e.target.value.trim() || null; if (v !== (wert ?? null)) speichern(v) }} />}
      </div>
      <div className="meta">
        <span className="who"><i />{f.rolle}</span>
        {f.frist && <span className={spaet ? 'late-t' : ''}>Frist {fmtD(f.frist)}{spaet ? ' · überfällig' : ''}</span>}
        {a?.bearbeitet_von && hat(wert) && <span>Zuletzt {a.bearbeitet_von}, {vor(a.bearbeitet_am)}</span>}
        <span className="sp">
          <button className="linkbtn" disabled={sperr} onClick={() => klaerung(status !== 'klaerung')}>{status === 'klaerung' ? 'Klärung beenden' : 'Klärungsbedarf melden'}</button>
          <button className="linkbtn" onClick={toggle}>Kommentare{kommentare.length ? ` (${kommentare.length})` : ''}</button>
        </span>
      </div>
      {offen && (
        <div className="thread">
          {kommentare.map(k => <div className="cm" key={k.id}><b>{k.autor}</b><span>{vor(k.created_at)}</span><p>{k.text}</p></div>)}
          {!kommentare.length && <div className="cm"><span style={{ margin: 0 }}>Noch keine Kommentare.</span></div>}
          <form className="cmform" onSubmit={e => { e.preventDefault(); if (text.trim()) { kommentieren(text.trim()); setText('') } }}>
            <input value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Kommentar oder Rückfrage schreiben" aria-label={`Kommentar zu ${f.nummer}`} />
            <button className="btn" type="submit">Senden</button>
          </form>
        </div>
      )}
    </article>
  )
}
