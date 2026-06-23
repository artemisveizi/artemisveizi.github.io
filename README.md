# artemisveizi.github.io

Personal website for Artemis Veizi, built with [Jekyll](https://jekyllrb.com/)
and the [minima](https://github.com/jekyll/minima) theme, hosted on GitHub Pages.

## Structure

- `index.md` — Home (bio + featured work)
- `research-projects.md` — Research & Projects
- `cv.md` — CV (embedded PDF)
- `_config.yml` — site configuration

## Local development

```sh
bundle install
bundle exec jekyll serve
```

Then open <http://localhost:4000>.

## Custom domain (artemisveizi.io)

To serve the site at a purchased custom domain:

1. Add a `CNAME` file containing `artemisveizi.io`.
2. Point DNS at GitHub Pages (4 A records + a `www` CNAME).
3. Set the custom domain under **Settings → Pages** and enable **Enforce HTTPS**.
4. Update `url` in `_config.yml` to `https://artemisveizi.io`.
