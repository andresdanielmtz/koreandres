/** The two halves of the app. The board answers "when am I doing this"; cards
 *  answer "what is there". Persisted, so a reload reopens where you were. */
export type Section = 'board' | 'cards'

export const SECTION_KEY = 'itinerary.section'

export const storedSection = (): Section =>
  localStorage.getItem(SECTION_KEY) === 'cards' ? 'cards' : 'board'
