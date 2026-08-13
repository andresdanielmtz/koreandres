# CI

Four workflows in `.github/workflows/`, each its own file and its own status
check. They run on every pull request and every push to `main`. There is no test
suite — CI runs the build, the linter and two guards, and nothing here should
imply otherwise.

| Workflow | Runs | Locally | Fails when |
| --- | --- | --- | --- |
| `lint.yml` | `npm run lint` | same | eslint reports anything |
| `build.yml` | `npm run build` on Node 20.19 and 24 | same | a type error, a build error, or the stated Node floor stops working |
| `check-motion.yml` | `npm run check:motion` | same | a rule in `cards.css` transitions `transform`, `width`, `height`, `top`, `left` or `all` |
| `check-env.yml` | `git ls-files` over `.env*` | `git ls-files \| grep -E '^\.env'` | any `.env` but `.env.example` is committed |

`npm run build` is the typecheck — `tsc -b` runs inside it. Don't add a separate
typecheck workflow.

Nothing needs a secret. The build runs with no `.env` at all, which is the state
the app supports and documents.

## Adding a workflow

Copy the header from any of the four. The one thing that must change with the
filename is the concurrency group:

```yaml
concurrency:
  group: <name>-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

Reuse another workflow's group and the two cancel each other on the same ref, so
only one check ever finishes. `cancel-in-progress` is off for `main` so its
history stays fully checked, and on for branches so a superseded push stops
burning minutes.

## Failure modes

**The 20.19 leg fails and 24 passes.** That's a real finding about the Node floor
the README promises, not a CI bug. Fix the code or raise the floor in the README
— don't drop the leg.

**`check-motion` looks incomplete.** It reads `src/cards/cards.css` and only
that, on purpose. `styles.css` transitions `transform` in two places
deliberately (the link handle's reveal, the colour swatches), so adding it to
`FILES` reports correct code as broken. The wider "nothing that moves is
animated" rule in AGENTS.md stays a review judgement; only the cards.css
formulation is mechanical enough to check. `all` is in the banned list though
AGENTS.md doesn't name it, because it's the one-word way around the other five.

**The build starts needing a key.** It breaks here first, and the break is the
bug: running with no API key is a supported state, and CI is where that stays
true.

**A workflow file doesn't appear in the Actions tab.** Malformed YAML fails
silently rather than loudly. Check indentation and that you haven't used a tab.
