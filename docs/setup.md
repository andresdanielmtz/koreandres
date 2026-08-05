# Setting up

Two optional things: Supabase, for boards that outlive one browser, and a
Google Maps key, for the preview pane on the right. The app runs without
either. Skip to [the map key](#setting-up-the-map) if that's what you're after.

# Setting up Supabase

Without this the app still runs, it just keeps everything in your browser's
local storage. Doing this gets you boards that survive a different machine.

## 1. Make a project

Sign up at [supabase.com](https://supabase.com) and create a project. The free
tier is plenty. Once it finishes provisioning, go to Project Settings, then API,
and copy two things:

- the project URL, which looks like `https://abcdefgh.supabase.co`
- the publishable key, sometimes labelled `anon`

## 2. Point the app at it

Copy the template if you haven't already, then fill it in:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_KEY=your-publishable-key
```

The `VITE_` prefix matters. Vite refuses to expose anything else to the
browser, so a variable named `SUPABASE_URL` will silently be undefined.

`.env` is gitignored. Don't remove that.

## 3. Create the tables

This is the step people miss. Nothing creates the tables for you. The app only
ever reads and writes rows, and the publishable key can't run `CREATE TABLE`
anyway, so restarting the dev server will never fix a missing schema.

Open the SQL editor in your Supabase dashboard, paste the whole of
[`supabase/schema.sql`](../supabase/schema.sql), and run it.

On Linux you can get it onto the clipboard with one of these:

```bash
wl-copy < supabase/schema.sql    # Wayland
xsel -ib < supabase/schema.sql   # X11
```

You'll see a few `NOTICE: ... does not exist, skipping` lines. Ignore them. The
script drops things before recreating them so you can run it again safely.

Restart `npm run dev` and the toolbar should say `Synced` instead of
`Local only`. If it still says `Local only`, open the browser console. The app
logs why it fell back.

## What the tables are

Four of them, and everything hangs off a board, so one project can hold as many
whiteboards as you want.

`boards` is the whiteboard itself: a title, a start date and how many days long
it is.

`timeline_blocks` are the things on the day rail. They're stored as a day
number plus a start and end minute rather than timestamps, which keeps dragging
them around simple. Each one also carries a location: `place` is what you
pasted, `place_label` / `place_lat` / `place_lng` / `place_zoom` are what it
resolved to, and `url` is a link to go with it. The resolved half is saved so
that reopening a board doesn't geocode everything on it again.

`canvas_blocks` are the loose cards, data or travel, positioned with plain x/y
coordinates and a width and height.

`block_links` are the connections. A link can join any two blocks in either
direction, so the endpoints can't be foreign keys. There's a trigger that
deletes links when the block on either end goes away.

## Locking it down

The policies in `schema.sql` let anyone with the publishable key do anything.
That's deliberate, because it means the app works with no login at all, but it
is not something you want if the data matters.

To fix it properly you'd turn on Supabase Auth, add an `owner_id uuid
references auth.users` column to `boards`, and rewrite the policies to check
`owner_id = auth.uid()` instead of `true`. The other three tables would check
that their board belongs to you. That's a real piece of work rather than a
config change, which is why it isn't done here.

## Starting over

If you want to wipe everything and begin again:

```sql
drop table if exists block_links, canvas_blocks, timeline_blocks, boards cascade;
```

Then run `schema.sql` again. Your browser's local copy is separate and lives
under the `itinerary.boards.v2` key in local storage.

## Adding to a project you already have

`create table if not exists` leaves an existing table alone, so new columns
never appear on their own. Run the migration for whatever you're missing, in
the SQL editor. Re-running the whole of `schema.sql` does the same thing and is
equally safe — the migrations are just the smaller version.

| Set up before | Run |
| --- | --- |
| the map pane | [`001-block-locations.sql`](../supabase/migrations/001-block-locations.sql) — `place`, `place_lat`, and the rest |
| commute blocks | [`002-commute-blocks.sql`](../supabase/migrations/002-commute-blocks.sql) — `kind`, `from_place`, `to_place`, `travel_mode` |
| trivia blocks | [`003-trivia-blocks.sql`](../supabase/migrations/003-trivia-blocks.sql) — widens the `kind` check; no new columns |

**Until you do, saving any time block fails and the toolbar says `Save failed`**
— the app writes every column, so one missing column takes all of them down,
not just the new feature. Restarting the dev server does not help.

# Setting up the map

The right-hand pane is a real Google map, kept alive for the whole session.
Selecting a block flies the camera to it rather than reloading anything, which
is why it's the Maps JavaScript API and not an embedded iframe.

## 1. Get a key

In the [Google Cloud console](https://console.cloud.google.com), pick or create
a project, then under **APIs & Services → Library**, enable three things:

- **Maps JavaScript API**, which draws the map.
- **Geocoding API**, which turns "Gyeongbokgung Palace, Seoul" into a point to
  fly to. It also returns how big the place is, which is how the map knows to
  stop closer for a building than for a city.
- **Directions API**, which works out the route a commute block draws between
  two places, and how long it takes. **In South Korea it only answers for
  transit** — walking, driving and cycling come back empty between any two
  points, whatever key you use, because Korean mapping data can't leave the
  country and Google has no road network to route over. Those three modes fall
  back to a distance-based estimate, marked with a `≈`.

- **Places API (New)**, which finds the restaurants around a block when you
  right-click it. Note the *(New)* — the old Places API is a different entry in
  the library and the app doesn't use it.

Then **APIs & Services → Credentials → Create credentials → API key**.

Enabling only the first is the mistake to watch for: the map draws, every
location fails to resolve, and the pane just says it couldn't find the place.
Skipping the third or fourth is the same story one level down — everything
works until you select a commute block, or ask what is nearby, and the pane
says which API isn't enabled.

You'll be asked to attach a billing account — Google asks for one across Maps
Platform. All four have a free monthly allowance that a trip board will not
come close to, and geocodes, routes and nearby searches are all cached for the
session, so re-selecting a block you've already looked at costs nothing.
Nearby search is the priciest of the four per call, which is why dragging the
radius slider waits for you to stop before it asks.

## 2. Put it in `.env`

```
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

The `VITE_` prefix matters here for the same reason it does for Supabase — a
variable named `GOOGLE_MAPS_API_KEY` is silently undefined in the browser.
Restart `npm run dev`; Vite only reads `.env` at startup.

Leave it out and nothing breaks. The pane says which variable is missing, and
every location still has an "open in Google Maps" link that needs no key.

## 3. Restrict it

The key ends up in the JavaScript bundle. That's unavoidable for a client-side
map, and it's why Google expects Maps keys to be public — restricting them is
the protection. On the key's page in Credentials:

- **Application restrictions → Websites**, listing the origins you serve from
  (`http://localhost:5173` for development, plus wherever you deploy).
- **API restrictions → Restrict key →** Maps JavaScript API, Geocoding API,
  Directions API and Places API (New).

## 4. Optionally, a Map ID — and a style

```
VITE_GOOGLE_MAPS_MAP_ID=...
VITE_GOOGLE_MAPS_MAP_ID_DARK=...
```

A Map ID does two jobs. It selects vector rendering, which is what makes the
camera glide rather than step — raster tiles only zoom in whole levels. And it
is the only way to restyle the map.

That second part is worth being clear about, because it isn't obvious: passing
a `styles` array in JavaScript **stops working the moment a `mapId` is set**.
Google moved styling to the Cloud console, and the Map ID is how a map picks up
the style attached to it. So there is no library to add and no code to write —
the style lives in your Google account, and the app just names it.

Unset, the app uses Google's `DEMO_MAP_ID` — works, no setup, looks like plain
Google Maps.

### Setting one up

1. **Map Management → Create Map ID**: type JavaScript, rendering Vector.
2. **Map Styles → Create Map Style → Import JSON**:
   [`light.json`](map-styles/light.json).
3. Switch the editor's **light/dark toggle to dark**, import
   [`dark.json`](map-styles/dark.json) into that variant.
4. Associate the style with the Map ID — a separate step, on the style's page.
5. Put step 1's ID in `VITE_GOOGLE_MAPS_MAP_ID`.

[map-styles/README.md](map-styles/README.md) covers what the styles keep and
why. Edit them in the console's visual editor rather than by hand; changes take
minutes to propagate and browsers cache them hard, so hard-reload before
deciding a tweak didn't land.

### Three ways this goes wrong

**A Style ID in `VITE_GOOGLE_MAPS_MAP_ID`.** Map IDs and styles are different
objects with different IDs, and only the Map ID works here. A style's ID
resolves to nothing: default map, no error in the interface, and — since the
fallback is raster — a camera that steps between zoom levels instead of
gliding. That last symptom is the fastest way to spot it.

**A Map ID created with rendering Raster.** The style lands, but every zoom
refetches a whole set of tiles, so the map appears to reload each time it moves.
The app asks for `renderingType: VECTOR`, and the Map ID's configuration
overrides it — there is no fix in the code. Change the rendering type on the Map
ID, or make a new one; the setting is on the Map ID, not on the style.

**A dark theme that looks neither styled nor dark.** Light and dark are two
*variants of one style*, so there is no separate dark style ID; one Map ID
covers both, and the app selects the variant by passing `colorScheme`. Either
the style has no dark variant yet (step 3), or
`VITE_GOOGLE_MAPS_MAP_ID_DARK` is set — which tells the app themes live in
separate Map IDs and stops it sending `colorScheme` at all. Leave that variable
empty unless you genuinely have two styled Map IDs.
