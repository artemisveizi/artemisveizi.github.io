# artemisveizi.github.io

Personal site, built with [Jekyll](https://jekyllrb.com/) 4 and the
[minima](https://github.com/jekyll/minima) 2.5 theme, hosted on GitHub Pages.

## Local preview

Needs Ruby 3 or newer. On macOS the system Ruby is too old, so put
Homebrew's first:

```sh
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
bundle install
bundle exec jekyll serve     # http://localhost:4000
```

GitHub Pages currently builds with its own older toolchain (Jekyll 3.10, Ruby
Sass), not this `Gemfile`, so a clean local build doesn't guarantee a clean
deploy. See `.github/pages-deploy-spec.md` for the plan to close that gap.

## Tests

```sh
sh test/run.sh
```

Plain `node`, no dependencies. The suites drive the shipped
`assets/js/pool.js` against a stubbed DOM.

## Layout

| Path | What |
| --- | --- |
| `index.md`, `research-projects.md`, `cv.md` | The three pages |
| `_layouts/`, `_includes/` | Overrides of minima's templates, plus the pool table |
| `assets/main.scss` | All site styling, layered over minima |
| `assets/js/` | Intro-photo sizing and the pool table |
| `assets/fonts/` | Self-hosted Computer Modern / Latin Modern subsets |
| `files/`, `Artemis Veizi CV.pdf` | Thesis and CV |
