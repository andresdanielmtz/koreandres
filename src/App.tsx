import { lazy, Suspense, useEffect, useState } from 'react'
import { Board } from './components/Board'
import { SideNav } from './components/SideNav'
import { SECTION_KEY, storedSection, type Section } from './lib/section'
import { useCards } from './cards/state/useCards'
import { useItinerary } from './state/useItinerary'
import { useTheme } from './state/useTheme'
import './styles.css'

/* Card mode carries three.js and its own stylesheet. Split out so a session
   that never opens it never downloads either. */
const CardsView = lazy(() =>
  import('./cards/components/CardsView').then((m) => ({ default: m.CardsView })),
)

export default function App() {
  const theme = useTheme()
  const [section, setSection] = useState<Section>(storedSection)
  const itinerary = useItinerary()
  // Nothing in card mode loads — no Supabase probe, no billed search — until
  // the section is opened for the first time.
  const cards = useCards(section === 'cards')

  useEffect(() => {
    localStorage.setItem(SECTION_KEY, section)
  }, [section])

  return (
    <div className="shell">
      <SideNav
        section={section}
        onSection={setSection}
        theme={theme.mode}
        onTheme={theme.setMode}
      />

      {section === 'cards' ? (
        <Suspense fallback={<div className="boot">Loading cards…</div>}>
          <CardsView cards={cards} />
        </Suspense>
      ) : itinerary.snapshot ? (
        <Board itinerary={itinerary} snapshot={itinerary.snapshot} theme={theme} />
      ) : (
        <div className="boot">{itinerary.loading ? 'Loading board…' : 'No board available.'}</div>
      )}
    </div>
  )
}
