source "https://rubygems.org"

# Jekyll 4.x rather than the github-pages gem. github-pages pins Jekyll 3.9,
# which pins liquid 4.0.3, which calls String#tainted? — removed in Ruby 3.2,
# so that stack cannot run on a modern Ruby at all. Pages still builds this
# site server-side with its own pinned 3.9; only local builds use this.
gem "jekyll", "~> 4.3"

# Theme — pinned to the 2.5 series that GitHub Pages uses, so local output
# matches the deployed look. minima 3.x is a visual redesign.
gem "minima", "~> 2.5"

# Plugins
group :jekyll_plugins do
  gem "jekyll-feed"
  gem "jekyll-seo-tag"
end

# Windows / JRuby compatibility (harmless elsewhere)
gem "tzinfo-data", platforms: [:mingw, :mswin, :x64_mingw, :jruby]
gem "wdm", "~> 0.1.1", platforms: [:mingw, :mswin, :x64_mingw]

# Libraries that left the Ruby standard library's default gems (3.4+ / 4.0)
# and so must be declared explicitly to build on a modern Ruby.
gem "csv"
gem "base64"
gem "bigdecimal"
gem "logger"
gem "ostruct"
gem "webrick"   # jekyll serve's local web server
