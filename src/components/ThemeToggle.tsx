import type { ThemeMode } from '../state/useTheme'
import { IconAuto, IconMoon, IconSun } from './icons'

const OPTIONS: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'light', label: 'Light', icon: <IconSun size={13} /> },
  { mode: 'dark', label: 'Dark', icon: <IconMoon size={13} /> },
  { mode: 'system', label: 'Match system', icon: <IconAuto size={13} /> },
]

type Props = {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
}

export function ThemeToggle({ mode, onChange }: Props) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={mode === o.mode}
          aria-label={o.label}
          title={o.label}
          data-active={mode === o.mode ? '' : undefined}
          onClick={() => onChange(o.mode)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  )
}
