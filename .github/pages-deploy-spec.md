# Spec: deploy this site with GitHub Actions instead of Pages' built-in build

Status: not started. Self-contained — no context from the authoring session needed.

## The problem

GitHub Pages ignores this repo's `Gemfile`. It builds with its own pinned
toolchain:

```
github-pages 232 -> jekyll 3.10 -> jekyll-sass-converter 1.5.2 -> sass 3.7.4 (Ruby Sass)
```

Local builds use `Gemfile`, which pins Jekyll 4.x and therefore Dart Sass.

These two dialects are not interchangeable, and **local is strictly more
permissive than production**, so a clean local build does not imply a
successful deploy. This already caused one failed deploy: `assets/main.scss`
used `@use "sass:color"` and `color.adjust()`, which Dart Sass accepts and Ruby
Sass rejects as a syntax error, because Ruby Sass predates the Sass module
system.

The obvious fix — build locally with Pages' toolchain — is impossible. Jekyll
3.x pins liquid 4.0.3, which calls `String#tainted?`, removed in Ruby 3.2. That
stack cannot run on a modern Ruby at all, which is why this repo moved to
Jekyll 4 in the first place.

Deploying via GitHub Actions makes Pages build with *this* `Gemfile`, so local
and production become the same toolchain and the divergence disappears.

## Current state to preserve

Site currently deploys from `main` via Pages' built-in builder and works. Do
not break it. Confirm the live site renders correctly before starting, so there
is a known-good baseline.

Relevant existing config:

- `_config.yml` — `url: "https://artemisveizi.github.io"`, `baseurl: ""`,
  plugins `jekyll-feed`, `jekyll-seo-tag`, `jekyll-sitemap`; a `sass:` block
  with `quiet_deps` and `silence_deprecations`.
- `Gemfile` — `jekyll ~> 4.3`, `minima ~> 2.5`, the three plugins, plus stdlib
  gems (`csv`, `base64`, `bigdecimal`, `logger`, `ostruct`, `webrick`) that left
  Ruby's defaults in 3.4+.
- `.gitignore` — `Gemfile.lock` is ignored.
- `assets/main.scss` — carries a comment block explaining the Ruby Sass
  constraint. That comment becomes wrong once this work lands (see Phase 2).

## Phase 1 — switch the deployment

Do this and confirm it works before touching anything else.

### 1. Add the workflow

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy site

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Let a running deploy finish rather than cancelling it half-published.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.4'
          bundler-cache: true

      - uses: actions/configure-pages@v5
        id: pages

      - name: Build
        env:
          JEKYLL_ENV: production
        run: bundle exec jekyll build --baseurl "${{ steps.pages.outputs.base_path }}"

      - uses: actions/upload-pages-artifact@v3   # defaults to ./_site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Notes on specific choices:

- **`ruby-version: '3.4'`** rather than matching the local Homebrew Ruby (4.0.6).
  4.0 may not be available in `setup-ruby`, and it isn't needed: the Gemfile
  declares the stdlib gems explicitly, so it resolves on 3.4+ regardless. If the
  build fails on gem resolution, try `'3.3'`.
- **`JEKYLL_ENV: production`** matters. Some plugins change behaviour outside
  production, and it is what Pages' own builder sets.
- **`--baseurl` from `configure-pages`** resolves to `""` for a
  `<user>.github.io` repo, matching `_config.yml`. Harmless, and correct if the
  site ever moves to a project repo or the planned `artemisveizi.io` domain.
- **No `.nojekyll` needed.** The artifact upload publishes `_site` directly;
  nothing re-runs Jekyll on the output.

### 2. Flip the Pages source

This is a manual step and **the build will succeed without it while the live
site keeps serving the old builder's output** — a confusing failure mode worth
watching for.

Repo → Settings → Pages → Build and deployment → Source → **GitHub Actions**.

### 3. Push and watch

Push to `main`. Check Actions for a green run on both jobs. The `deploy` job
prints the live URL.

### 4. Verify

- [ ] Both jobs green.
- [ ] Live homepage renders: intro photo beside the text at matched height,
      Computer Modern body type, sans headings.
- [ ] `https://artemisveizi.github.io/assets/main.css` loads and contains
      `@font-face` rules (13 of them) and `.pool` rules.
- [ ] All five WOFF fonts and both `artemis-thesis` images return 200.
- [ ] `/sitemap.xml` and `/robots.txt` still generate.
- [ ] `/research-projects/` renders, and both paper PDFs open.
- [ ] Scroll to the bottom of the homepage: `pool ↓` appears, darkens as you
      keep scrolling, and opens the table on click.
- [ ] Compare against a local `bundle exec jekyll build` — output should now be
      near-identical, which is the whole point.

### Rollback

Settings → Pages → Source → back to **Deploy from a branch** (`main`, `/`).
Takes effect on the next push; the workflow can stay in place harmlessly.

## Phase 2 — optional cleanup, only after Phase 1 is verified

Once production runs Dart Sass, the Ruby Sass workarounds are dead weight. **Do
not do this in the same push as Phase 1** — if Phase 1 needs rolling back,
these changes would break the site again on the old builder.

In `assets/main.scss`:

- Replace `lighten($grey-color-light, 8%)` with
  `color.adjust($grey-color-light, $lightness: 8%)` and add `@use "sass:color";`
  at the very top, above the variable declarations.
- Replace `unicode-range: unquote("U+2100-214F, U+2200-22FF");` with the bare
  `unicode-range: U+2100-214F, U+2200-22FF;`. The `unquote()` guards against a
  Ruby Sass parsing quirk that no longer applies.
- Delete the "NOTE ON SASS DIALECT" comment block at the top — it will be
  actively misleading.

In `_config.yml`, drop `color-functions` and `global-builtin` from
`silence_deprecations`. **Keep `import`** — that one comes from minima 2.5,
which has no `@use`-compatible entry point, and is unfixable without forking the
theme. Keep `quiet_deps: true` for the same reason.

Verify the compiled `.featured-card` background is unchanged (it should be
`#fcfcfc`, possibly emitted as an `rgb()` percentage triple by Dart Sass).

## Phase 3 — optional hardening

**Pin dependencies.** `Gemfile.lock` is currently gitignored, so CI resolves
gems fresh each run and a gem release can break the build without any change on
your side. To pin:

```
bundle lock --add-platform x86_64-linux    # the runner's platform
```

then remove `Gemfile.lock` from `.gitignore` and commit it. The
`--add-platform` step is required — a lockfile generated only for
`arm64-darwin` will fail to install on the Linux runner.

Tradeoff: reproducible builds, but you then have to run `bundle update`
deliberately to get security patches.

**Run the test suites in CI.** Three node harnesses were written for the
JavaScript but live in `/tmp` and are not in the repo:

- physics/geometry of the pool table (16 assertions)
- the reveal/collapse state machine (20 assertions)
- intro-photo height-matching convergence (21 assertions)

They stub a minimal DOM and drive the real shipped files, needing only `node` —
no test framework. If you want them, they would need recreating under something
like `test/`, plus a step in the workflow. Worth it mainly if the pool table or
intro sizing gets edited again; they caught several real bugs, including a
pocket-escape bug and an unreachable collapse condition.

## Things that will not change

- `url`/`baseurl` in `_config.yml`.
- The three Jekyll plugins — all already work under Jekyll 4.
- Anything static: fonts, images, `assets/js/*.js`, the PDFs.
- `minima` stays at 2.5.x. Do not let it drift to 3.x, which is a visual
  redesign; the pin in `Gemfile` exists for that reason.
