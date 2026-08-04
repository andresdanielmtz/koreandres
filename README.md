# Koreandres

## A whiteboard for planning trips.

![Readme Image](docs/readme.png)

Most trip planners make you fill in a form. This one gives you a canvas. Days
run down the left as a continuous timeline, and you drop blocks onto it for the
things you're actually doing: shopping in Hongdae from 10 to 1, a temple visit
at 2. Drag the edges to change the time. Everything snaps to fifteen minutes.

The other half is the loose stuff that doesn't belong on a clock. Opening
hours, ticket prices, a Google Maps link, which subway line to take. Those go in
separate cards off to the side, and you connect them back to the day with a
line. Drag the blue handle out of a block and drop it on a card. Drop it on
empty space instead and you get a new card, already connected.

Down the right is a map. Copy a place out of Google Maps, paste the link into a
block's location, and that's the whole job — it works out what the place is
called, names the block after it if you hadn't, and remembers where it is so it
never has to look it up twice. A plain name or a `lat,lng` works too. Clicking
the block flies the map there, next to the hour you're doing it at. It's one live map, so it moves the way Google Maps
does when you search: over to the place, and in or out depending on whether
you've picked a building or a city. Nothing selected and it sits on Seoul.

Pan with the scroll wheel, zoom with cmd or ctrl and scroll, right click for a
menu. It's meant to feel like a whiteboard, not a form.

## Running it

You'll need Node 20.19 or newer, which is what Vite 8 asks for.

```bash
git clone https://github.com/andresdanielmtz/koreandres.git
cd koreandres
npm install
npm run dev
```

That's enough to start using it. With no Supabase configured it saves to your
browser's local storage, and the toolbar says `Local only` so you know where
your boards are going. Fine for a look around, but they live in that one
browser and nowhere else.

For boards that follow you between machines, copy `.env.example` to `.env`,
point it at a Supabase project and run one SQL script.
[docs/setup.md](docs/setup.md) walks through it. It takes a couple of minutes.

The map pane wants one more line in that same `.env`:

```
VITE_GOOGLE_MAPS_API_KEY=your-key
```

A Google Cloud API key with two APIs enabled on it: **Maps JavaScript API** to
draw the map, and **Geocoding API** to turn a place you've typed into somewhere
to fly to. One thing it can't do: the short `maps.app.goo.gl` links the share
button gives you only resolve by following their redirect, which a page with no
server of its own isn't allowed to do. Open one and paste the full link it
lands on, or just the name of the place. Without it the app still runs; the pane tells you which variable is
missing and every location keeps its link out to Google Maps. Setting one up,
and restricting it so it can't be lifted out of the bundle, is in
[docs/setup.md](docs/setup.md#setting-up-the-map).

## Getting around

| | |
|---|---|
| Scroll, or drag empty space | Move around |
| Cmd/Ctrl and scroll | Zoom in and out |
| Hold space and drag | Move around from anywhere |
| Double click the timeline | New block at that hour |
| Double click empty canvas | New card |
| Right click anything | Menu: add, recolour, duplicate, delete |
| Drag a block's top or bottom edge | Change its start or end time |
| Drag the blue handle | Draw a connection |
| Click a block | Show its location on the map |
| Drag the divider | Resize the map |
| Enter | Rename what's selected |
| Cmd/Ctrl + D | Duplicate |
| Backspace | Delete |
| Escape | Deselect |
| 0 | Reset the view |

The sun/moon/monitor buttons in the top right switch between light, dark and
following your system.

## What it's built on

React 19 and TypeScript, Vite for the build, Supabase for storage. No UI
library and no CSS framework, just one stylesheet. The whole thing is client
side, there's no server of its own.

If you want to know how the code is laid out before changing anything, that's
in [docs/architecture.md](docs/architecture.md).

## A warning about the data

The app talks to Supabase with a publishable key, which is meant to be public
and ends up in the JavaScript bundle no matter what you do. The schema that
ships here has wide open row level security to match, so anyone who has that key
can read and edit every board in the project.

For planning a holiday with friends that's fine. If you're going to put anything
you care about in here, add authentication first. There's a note in
[docs/setup.md](docs/setup.md) about what to change.

## Licence

MIT. See [LICENSE](LICENSE).
