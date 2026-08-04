# Map styles

Backups of the map pane's style, exported from **Google Maps Platform → Map
Styles**. Two files, but one style: `light.json` and `dark.json` are its light
and dark **variants**, which is why each export carries a `variant` key and why
there is only ever one Map ID to put in `.env`.

**Nothing here is read by the app.** These files are a record, so a style can be
rebuilt if it's lost or copied into another project. The map gets its
appearance from Google: a style lives in the Cloud console, is associated with
a Map ID there, and the app only ever names that Map ID. The chain is

```
Map Style (console)  →  associated with a Map ID (console)  →  VITE_GOOGLE_MAPS_MAP_ID (.env)
```

and editing a file in this folder touches none of it.

To restore one, open the style in the console and paste the file back in. Note
that the current console emits its own format — objects with an `id`, a
`geometry` and a `label`, under a `variant` — which is *not* what the older
**Import JSON** box expects; that one wants a flat array of
`featureType`/`stylers` rules. Paste each into the editor it came from.

Setup end to end is in
[docs/setup.md](../setup.md#4-optionally-a-map-id--and-a-style).

## What they keep, and why

Minimal isn't empty — the map still has to answer "where is this, and what's
near it". The rule was: keep what you navigate by.

| Kept | Why |
|---|---|
| Attractions, places of worship | The palaces and temples blocks are named after |
| Parks, water | What makes a city legible at a glance |
| Neighbourhood and city names | "Hongdae" beats any street around it |
| Rail and metro stations | How you get between two blocks in a day |
| Arterial roads and above, named | Orientation without clutter |

| Dropped | Why |
|---|---|
| Businesses | The bulk of the clutter, and none of it is a plan |
| Schools, hospitals, government | Never the reason you're there |
| Bus stops | A wall of dots at city zoom |
| Road shields, route icons | Noise |
| Local street *names* | Streets stay as geometry, so districts still read |

Flat throughout: one base grey, white roads, hairline strokes, no gradients —
the same restraint as the interface, so the map sits beside the board rather
than shouting over it. Motorways keep a warm tint as the single accent.
