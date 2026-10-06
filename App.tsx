import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Daten } from './types'
import Katalog from './Katalog'
import Verwaltung from './Verwaltung'

const KEY = 'fk-zugang'
const safe = {
  get: () => { try { return localStorage.getItem(KEY) } catch { return null } },
  set: (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* ignorieren */ } },
  del: () => { try { localStorage.removeItem(KEY) } catch { /* ignorieren */ } },
}

function startToken(): string | null {
  const url = new URL(window.location.href)
  const z = url.searchParams.get('z')
  if (z) {
    safe.set(z)
    url.searchParams.delete('z')
    window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash)
    return z
  }
  return safe.get()
}

export default function App() {
  const [token, setToken] = useState<string | null>(startToken)
  const [daten, setDaten] = useState<Daten | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [ansicht, setAnsicht] = useState<'katalog' | 'verwaltung'>('katalog')
  const [eingabe, setEingabe] = useState('')

  const laden = useCallback(async () => {
    if (!token) return
    try {
      setDaten(await api.laden(token))
      setFehler(null)
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Fehler'
      if (/Ungültiger Zugang/.test(m)) { safe.del(); setToken(null); setDaten(null) }
      else setFehler(m)
    }
  }, [token])

  useEffect(() => {
    laden()
    const t = window.setInterval(() => { if (!document.hidden) laden() }, 30000)
    return () => window.clearInterval(t)
  }, [laden])

  if (!token) {
    return (
      <div className="login">
        <h1>Fragenkatalog</h1>
        <p>Bitte öffne den persönlichen Zugangslink, den du von INNOTECH erhalten hast. Alternativ kannst du den Zugangscode hier einfügen.</p>
        <form onSubmit={e => { e.preventDefault(); const v = eingabe.trim(); if (v) { safe.set(v); setToken(v) } }}>
          <input aria-label="Zugangscode" value={eingabe} onChange={e => setEingabe(e.target.value)} placeholder="Zugangscode" autoComplete="off" />
          <button className="btn pri" type="submit">Öffnen</button>
        </form>
      </div>
    )
  }
  if (!daten) return <div className="login"><p>{fehler ?? 'Katalog wird geladen …'}</p></div>

  return (
    <>
      <header className="top">
        <div className="brand">
          <div className="eyebrow">Fragenkatalog</div>
          <h2 className="pname">{daten.katalog.titel || 'Fragenkatalog'}</h2>
          <div className="pphase">{daten.katalog.phase ? `Phase: ${daten.katalog.phase} · ` : ''}{daten.zugang.name}{daten.zugang.firma ? `, ${daten.zugang.firma}` : ''} ({daten.zugang.intern ? 'Verwaltung' : daten.zugang.rolle})</div>
        </div>
        {daten.zugang.intern && (
          <div className="seg" role="group" aria-label="Ansicht">
            <button aria-pressed={ansicht === 'katalog'} onClick={() => setAnsicht('katalog')}>Katalog</button>
            <button aria-pressed={ansicht === 'verwaltung'} onClick={() => setAnsicht('verwaltung')}>Verwaltung</button>
          </div>
        )}
      </header>
      {fehler && <p className="note late-t" role="alert">{fehler}</p>}
      {ansicht === 'verwaltung' && daten.zugang.intern
        ? <Verwaltung daten={daten} token={token} neuLaden={laden} />
        : <Katalog daten={daten} token={token} neuLaden={laden} />}
    </>
  )
}
