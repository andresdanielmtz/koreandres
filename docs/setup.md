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
them around simple.

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
