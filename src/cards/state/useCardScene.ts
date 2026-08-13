/**
 * The card table: a Three scene whose cards are real DOM elements.
 *
 * `CSS3DRenderer` puts the browser's own 3D compositor behind a scene graph, so
 * Three owns where a card *is* — position, rotation, scale, all written as one
 * `matrix3d` per frame — and the document owns what a card *says*. That split
 * is the whole reason this isn't WebGL: a card's text stays selectable and
 * findable, and its colours are the same CSS variables everything else uses, so
 * a theme switch costs nothing. There is deliberately no `cssColor()` here; a
 * colour read into JS is a colour that stops following the theme.
 *
 * The discipline is `useGoogleMap`'s: build once, command afterwards. The build
 * effect has no dependencies — not even the theme, which is what forces that
 * hook to replace its map and is exactly what this arrangement avoids.
 *
 * **The element handed to a `CSS3DObject` is created here and never appears in
 * any JSX.** React renders *into* it through a portal; it never renders *it*.
 * Were it React-rendered with a `style` prop, React and Three would take turns
 * clobbering each other's `transform`, and the symptom would be cards that jump
 * when unrelated state changes. For the same reason nothing in `cards.css` may
 * put a `transition` or a `transform` on `.card` itself.
 */
import { useEffect, useRef, useState } from 'react'
import { PerspectiveCamera, Scene } from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import {
  CARD_DEAL_MS,
  CARD_FLIP_MS,
  CARD_FOV,
  CARD_H,
  CARD_LIFT,
  CARD_PILE_SCALE,
  CARD_RETURN_MS,
  CARD_STACK_STEP,
  CARD_W,
} from '../lib/constants'

/** The three places a card can be. */
export type CardPlace = 'deck' | 'table' | 'pile'

/** Where a card is headed, in world units — which are CSS pixels here. */
type Pose = {
  x: number
  y: number
  z: number
  /** Radians about Y. π is face-down. */
  turn: number
  scale: number
}

type Slot = {
  id: string
  el: HTMLElement
  object: CSS3DObject
  /** Kept so a resize can re-derive the target from the new anchors. */
  place: CardPlace
  depth: number
  from: Pose
  to: Pose
  /** Milliseconds into the move; equal to `ms` once it has landed. */
  t: number
  ms: number
  /** How high it arcs on the way. Zero for anything that slides. */
  lift: number
  done?: () => void
}

const pose = (p: Partial<Pose>): Pose => ({ x: 0, y: 0, z: 0, turn: 0, scale: 1, ...p })

/** Decelerating: leaves at the speed of the press and arrives settled — the
 *  same curve the board's day arrows glide on. */
const easeOut = (t: number) => 1 - (1 - t) ** 3

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useCardScene(hostRef: React.RefObject<HTMLElement | null>) {
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<PerspectiveCamera | null>(null)
  const rendererRef = useRef<CSS3DRenderer | null>(null)
  const slotsRef = useRef(new Map<string, Slot>())
  const anchorsRef = useRef<Record<CardPlace, Pose>>({
    deck: pose({}),
    table: pose({}),
    pile: pose({}),
  })
  const frameRef = useRef(0)
  const clockRef = useRef(0)

  /** The portal targets. The one thing the scene tells React about, and it
   *  changes when a card enters or leaves — never per frame. */
  const [mounted, setMounted] = useState<{ id: string; el: HTMLElement }[]>([])

  function render() {
    const scene = sceneRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current
    if (scene && camera && renderer) renderer.render(scene, camera)
  }

  /** Where a place puts a card, with its depth in the stack folded in. */
  function poseFor(place: CardPlace, depth: number): Pose {
    const a = anchorsRef.current[place]
    return { ...a, y: a.y + depth * CARD_STACK_STEP, z: a.z + depth * CARD_STACK_STEP }
  }

  const current = (slot: Slot): Pose => ({
    x: slot.object.position.x,
    y: slot.object.position.y,
    z: slot.object.position.z,
    turn: slot.object.rotation.y,
    scale: slot.object.scale.x,
  })

  function write(slot: Slot, at: Pose) {
    slot.object.position.set(at.x, at.y, at.z)
    slot.object.rotation.y = at.turn
    slot.object.scale.set(at.scale, at.scale, at.scale)
  }

  /** Snaps a slot onto its target — used on resize, and for every move when
   *  motion is reduced, where a move is a cut. */
  function settle(slot: Slot) {
    slot.from = slot.to
    slot.t = slot.ms
    write(slot, slot.to)
    slot.done?.()
    slot.done = undefined
  }

  /**
   * One frame of every running move. The loop parks itself the moment nothing
   * is moving, and any command restarts it, so a still table costs nothing.
   */
  function step(now: number) {
    const dt = clockRef.current ? now - clockRef.current : 16
    clockRef.current = now
    let moving = false

    for (const slot of slotsRef.current.values()) {
      if (slot.t >= slot.ms) continue
      slot.t = Math.min(slot.ms, slot.t + dt)
      const raw = slot.ms ? slot.t / slot.ms : 1
      const k = easeOut(raw)

      write(slot, {
        x: lerp(slot.from.x, slot.to.x, k),
        y: lerp(slot.from.y, slot.to.y, k),
        // The arc: a dealt card passes over the pile rather than through it.
        z: lerp(slot.from.z, slot.to.z, k) + Math.sin(raw * Math.PI) * slot.lift,
        turn: lerp(slot.from.turn, slot.to.turn, k),
        scale: lerp(slot.from.scale, slot.to.scale, k),
      })

      if (slot.t >= slot.ms) {
        slot.from = slot.to
        slot.done?.()
        slot.done = undefined
      } else {
        moving = true
      }
    }

    render()
    if (moving) {
      frameRef.current = requestAnimationFrame(step)
    } else {
      frameRef.current = 0
      clockRef.current = 0
    }
  }

  function wake() {
    if (frameRef.current) return
    clockRef.current = 0
    frameRef.current = requestAnimationFrame(step)
  }

  /**
   * Recomputes the anchors from the table's own rect. The deck sits low left,
   * the seen pile low right, and a dealt card comes up between them.
   */
  function layout() {
    const host = hostRef.current
    if (!host) return
    const w = host.clientWidth
    const h = host.clientHeight
    const inset = CARD_W * CARD_PILE_SCALE + 40
    const floor = h / 2 - CARD_H * CARD_PILE_SCALE

    anchorsRef.current = {
      deck: pose({ x: -w / 2 + inset, y: -floor, turn: Math.PI, scale: CARD_PILE_SCALE }),
      table: pose({ turn: 0, scale: 1 }),
      pile: pose({ x: w / 2 - inset, y: -floor, turn: 0, scale: CARD_PILE_SCALE }),
    }
  }

  /* ----------------------------------------------------------- commands -- */

  /** Puts a card in the scene if it isn't already, parked at `place`. */
  function add(id: string, place: CardPlace, depth = 0) {
    const scene = sceneRef.current
    if (!scene || slotsRef.current.has(id)) return

    // Created here, never in JSX — see the note at the top of the file.
    const el = document.createElement('div')
    el.className = 'card'
    const object = new CSS3DObject(el)
    const at = poseFor(place, depth)
    scene.add(object)

    const slot: Slot = { id, el, object, place, depth, from: at, to: at, t: 0, ms: 0, lift: 0 }
    write(slot, at)
    slotsRef.current.set(id, slot)
    setMounted((m) => [...m, { id, el }])
    render()
  }

  function move(
    id: string,
    place: CardPlace,
    opts: { depth?: number; ms: number; lift?: number; done?: () => void },
  ) {
    const slot = slotsRef.current.get(id)
    if (!slot) return
    slot.place = place
    slot.depth = opts.depth ?? 0
    slot.from = current(slot)
    slot.to = poseFor(place, slot.depth)
    slot.t = 0
    slot.ms = reducedMotion() ? 0 : opts.ms
    slot.lift = reducedMotion() ? 0 : (opts.lift ?? 0)
    slot.done = opts.done

    if (slot.ms === 0) settle(slot)
    else wake()
  }

  /** Deck to table, turning face up on the way. */
  const deal = (id: string) =>
    move(id, 'table', { ms: CARD_DEAL_MS + CARD_FLIP_MS, lift: CARD_LIFT })

  /** Table to the seen pile. */
  const toPile = (id: string, depth: number, done?: () => void) =>
    move(id, 'pile', { depth, ms: CARD_RETURN_MS, lift: CARD_LIFT / 2, done })

  /** Table back to the deck, turning face down again. */
  const toDeck = (id: string, done?: () => void) =>
    move(id, 'deck', { ms: CARD_RETURN_MS, lift: CARD_LIFT / 2, done })

  function remove(id: string) {
    const slot = slotsRef.current.get(id)
    if (!slot) return
    // Out of the scene first, then out of React — the other order lets Three
    // write into a node React has already detached.
    slot.object.removeFromParent()
    slotsRef.current.delete(id)
    setMounted((m) => m.filter((s) => s.id !== id))
    render()
  }

  /* -------------------------------------------------------------- build -- */

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new Scene()
    const camera = new PerspectiveCamera(CARD_FOV, 1, 1, 8000)
    const renderer = new CSS3DRenderer()
    // CSS3DRenderer has no setPixelRatio — it hands the work to the browser's
    // own compositor, which is also why the text stays crisp at any scale.
    host.appendChild(renderer.domElement)

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      // Puts the camera exactly far enough back that one world unit is one CSS
      // pixel, so a card element CARD_W wide is CARD_W units wide.
      camera.position.z = h / (2 * Math.tan((CARD_FOV * Math.PI) / 360))
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      layout()
      // The anchors moved under everything. Anything already landed is put on
      // its new mark outright — a card sliding to catch up with a window drag
      // is the lag the whole app is written to avoid.
      for (const slot of slotsRef.current.values()) {
        if (slot.t < slot.ms) continue
        slot.to = poseFor(slot.place, slot.depth)
        settle(slot)
      }
      render()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const slots = slotsRef.current
    return () => {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      observer.disconnect()
      for (const slot of slots.values()) slot.object.removeFromParent()
      slots.clear()
      scene.clear()
      // No renderer.dispose() — CSS3DRenderer hasn't got one, and reaching for
      // it is the reflex that throws here. Its DOM goes with the host.
      host.replaceChildren()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { mounted, add, deal, toPile, toDeck, remove }
}
