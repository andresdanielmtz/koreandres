import type { Section } from '../lib/section'
import type { ThemeMode } from '../state/useTheme'
import { IconBoard, IconCards } from './icons'
import { ThemeToggle } from './ThemeToggle'

const TABS: { section: Section; label: string; icon: React.ReactNode }[] = [
  { section: 'board', label: 'Board', icon: <IconBoard size={16} /> },
  { section: 'cards', label: 'Cards', icon: <IconCards size={16} /> },
]

type Props = {
  section: Section
  onSection: (section: Section) => void
  theme: ThemeMode
  onTheme: (mode: ThemeMode) => void
}

/* The one piece of chrome both sections share. The theme control lives down
   here rather than in the board's toolbar, which card mode doesn't have. */
export function SideNav({ section, onSection, theme, onTheme }: Props) {
  return (
    <nav className="sidenav" aria-label="Sections">
      <div className="sidenav-tabs">
        {TABS.map((t) => (
          <button
            key={t.section}
            type="button"
            className="sidenav-tab"
            aria-label={t.label}
            aria-current={section === t.section ? 'page' : undefined}
            title={t.label}
            data-active={section === t.section ? '' : undefined}
            onClick={() => onSection(t.section)}
          >
            {t.icon}
            <span className="sidenav-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="sidenav-foot">
        <ThemeToggle mode={theme} onChange={onTheme} />
      </div>
    </nav>
  )
}
