import {
  DATE_RIGHT,
  DAY_HEIGHT,
  DAY_STRIDE,
  GUTTER_W,
  LANE_W,
  LANE_X,
  PX_PER_MIN,
} from '../lib/constants'
import { dayTop, formatDayLabel, formatTime, formatWeekday } from '../lib/time'
import { IconPlus } from './icons'

const RULE_LEFT = -330
const RULE_RIGHT = LANE_X + LANE_W + 640

/** Hours that get a printed label; the rest are hairline ticks only.
 *  Midnight is omitted — the date header already marks that boundary. */
const LABELLED = [3, 6, 9, 12, 15, 18, 21]

type Props = {
  days: number
  startDate: string
  onAddDay: () => void
}

export function Rail({ days, startDate, onAddDay }: Props) {
  const total = dayTop(days)
  const dayList = Array.from({ length: days }, (_, i) => i)
  const hours = Array.from({ length: 23 }, (_, i) => i + 1)

  return (
    <div className="rail">
      <svg className="rail-lines" width="1" height="1" overflow="visible">
        {/* The spine. */}
        <line
          x1={0}
          y1={-56}
          x2={0}
          y2={total + 24}
          className="rail-spine"
          vectorEffect="non-scaling-stroke"
        />

        {dayList.map((d) => {
          const top = dayTop(d)
          return (
            <g key={d}>
              {/* Night shading — helps the eye find morning at a glance. */}
              <rect
                x={-GUTTER_W}
                y={top}
                width={RULE_RIGHT + GUTTER_W}
                height={7 * 60 * PX_PER_MIN}
                className="rail-night"
              />
              <rect
                x={-GUTTER_W}
                y={top + 21 * 60 * PX_PER_MIN}
                width={RULE_RIGHT + GUTTER_W}
                height={3 * 60 * PX_PER_MIN}
                className="rail-night"
              />

              {hours.map((h) => (
                <line
                  key={h}
                  x1={-GUTTER_W}
                  y1={top + h * 60 * PX_PER_MIN}
                  x2={RULE_RIGHT}
                  y2={top + h * 60 * PX_PER_MIN}
                  className="rail-tick"
                  data-major={h % 6 === 0 ? '' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Day boundary. */}
              <line
                x1={RULE_LEFT}
                y1={top}
                x2={RULE_RIGHT}
                y2={top}
                className="rail-day-rule"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
        })}

        <line
          x1={RULE_LEFT}
          y1={total - DAY_STRIDE + DAY_HEIGHT}
          x2={RULE_RIGHT}
          y2={total - DAY_STRIDE + DAY_HEIGHT}
          className="rail-day-rule"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {dayList.map((d) => (
        <div key={d}>
          <div className="day-head" style={{ top: dayTop(d) + 14, right: -DATE_RIGHT }}>
            <div className="day-weekday">{formatWeekday(startDate, d)}</div>
            <div className="day-date">{formatDayLabel(startDate, d)}</div>
          </div>

          {LABELLED.map((h) => (
            <div
              key={h}
              className="hour-label"
              style={{ top: dayTop(d) + h * 60 * PX_PER_MIN - 7, right: 10 }}
            >
              {formatTime(h * 60)}
            </div>
          ))}
        </div>
      ))}

      <button
        type="button"
        className="add-day"
        style={{ top: total - DAY_STRIDE + DAY_HEIGHT + 18, left: LANE_X }}
        onClick={onAddDay}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <IconPlus size={13} />
        Add day
      </button>
    </div>
  )
}
