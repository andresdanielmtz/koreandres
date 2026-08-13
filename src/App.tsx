import { useEffect, useState } from 'react'
import { Board } from './components/Board'
import { SideNav } from './components/SideNav'
import { SECTION_KEY, storedSection, type Section } from './lib/section'
import { useItinerary } from './state/useItinerary'
import { useTheme } from './state/useTheme'
import './styles.css'

export default function App() {
  const theme = useTheme()
  const [section, setSection] = useState<Section>(storedSection)
  const itinerary = useItinerary()

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
        <div className="boot">Cards</div>
      ) : itinerary.snapshot ? (
        <Board itinerary={itinerary} snapshot={itinerary.snapshot} theme={theme} />
      ) : (
        <div className="boot">{itinerary.loading ? 'Loading board…' : 'No board available.'}</div>
      )}
    </div>
  )
}
