import { Board } from './components/Board'
import { useItinerary } from './state/useItinerary'
import './styles.css'

export default function App() {
  const itinerary = useItinerary()

  if (!itinerary.snapshot) {
    return <div className="boot">{itinerary.loading ? 'Loading board…' : 'No board available.'}</div>
  }

  return <Board itinerary={itinerary} snapshot={itinerary.snapshot} />
}
