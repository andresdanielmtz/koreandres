type Props = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const IconPlus = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
)

export const IconNote = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <path d="M5.5 6.5h5M5.5 9.5h3" />
  </svg>
)

export const IconRoute = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <circle cx="4" cy="12" r="1.8" />
    <circle cx="12" cy="4" r="1.8" />
    <path d="M5.8 12h3.4a2.6 2.6 0 0 0 0-5.2H6.8a2.6 2.6 0 0 1 0-5.2" />
  </svg>
)

export const IconTrash = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2" />
  </svg>
)

export const IconCopy = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
    <path d="M10.5 5.5v-1a1.6 1.6 0 0 0-1.6-1.6H4.1A1.6 1.6 0 0 0 2.5 4.5v4.4a1.6 1.6 0 0 0 1.6 1.6h1" />
  </svg>
)

export const IconLink = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 1 0-3.7-3.7l-.9.9" />
    <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 1 0 3.7 3.7l.9-.9" />
  </svg>
)

export const IconArrow = ({ size = 12 }: Props) => (
  <svg {...base(size)} strokeWidth={1.8}>
    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
  </svg>
)

export const IconChevron = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <path d="m5.5 6.5 2.5 3 2.5-3" />
  </svg>
)

export const IconCalendar = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.8" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </svg>
)

export const IconExternal = ({ size = 12 }: Props) => (
  <svg {...base(size)}>
    <path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5v2.9a1.1 1.1 0 0 1-1.1 1.1H4.1A1.1 1.1 0 0 1 3 12.4V6.1A1.1 1.1 0 0 1 4.1 5H7" />
  </svg>
)

export const IconMinus = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <path d="M3.5 8h9" />
  </svg>
)

export const IconSun = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.4M8 13.1v1.4M2.4 2.4l1 1M12.6 12.6l1 1M1.5 8h1.4M13.1 8h1.4M2.4 13.6l1-1M12.6 3.4l1-1" />
  </svg>
)

export const IconMoon = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <path d="M13.2 9.6A5.7 5.7 0 0 1 6.4 2.8a5.7 5.7 0 1 0 6.8 6.8Z" />
  </svg>
)

export const IconAuto = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <rect x="2" y="3" width="12" height="8.5" rx="1.6" />
    <path d="M5.5 13.5h5" />
  </svg>
)

export const IconTarget = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="1.6" />
  </svg>
)
