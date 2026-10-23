# Date Jar

A pixel-art ("Pocket RPG") web app for couples to track shared date expenses against a monthly budget. It installs to the iPhone Home Screen and works offline.

**Live:** https://darrenczw.github.io/date-jar/

## Run it
There is no build step: plain ES modules with Preact + htm (vendored in `vendor/`). Serve the folder with any static server and open `index.html`. Cloud sync uses Supabase (`src/config.js`); without it the app runs on this device only.
