# etro

`etro` is a static, touch-first metronome app for live performance.

## Project stance

- `etro` is a non-commercial project.
- `etro` is open source.
- Contributions are welcome.

## Contributing

1. Fork the repo: `https://github.com/widodoalfianto/etro`
2. Create a branch.
3. Open a pull request with a clear summary.

Bug reports and feature requests are also welcome in Issues.

## PWA support

`etro` is now configured as a Progressive Web App (PWA):

- Installable on supported mobile and desktop browsers
- Offline-capable after first load (core app shell cached)
- Standalone app mode with theme color and app icons

### PWA files

- `manifest.json` - web app manifest
- `sw.js` - service worker cache/offline logic
- `assets/icons/` - app icons (`192`, `512`, `maskable`, Apple touch icon, favicon)

### Install on device

- Android (Chrome/Edge): open the site, then use **Install app** / **Add to Home screen**
- iOS (Safari): open the site, tap **Share** -> **Add to Home Screen**
- Desktop Chromium browsers: use the install icon in the address bar

Note: service workers require HTTPS (or `localhost`). Vercel provides HTTPS by default.

## Project structure

- `index.html` - app markup
- `assets/css/styles.css` - app styles
- `assets/js/app.js` - app logic and audio scheduler
- `manifest.json` - PWA manifest
- `sw.js` - PWA service worker
- `.github/workflows/pages.yml` - optional GitHub Pages workflow

## Features

- Web Audio `currentTime` scheduler (no `setInterval`) for stable timing
- Setlist with add, select, delete, reset
- Share Link export and import (paste link or code)
- Per-song settings:
  - Optional title
  - BPM `0-240`
  - Time signatures: `4/4`, `6/8`, `3/4`, custom
  - Accent toggle + editable accent map
  - Double Time toggle
- Persistent data in `localStorage`
- Wake Lock while playing (when supported)
- Mobile-responsive dark UI

## Share and import

1. Tap `Share` in Setlist to generate a link.
2. Use `Copy Link` or native `Share`.
3. On another device, open `Import`, paste the link or code, then tap `Import`.

Notes:
- Import replaces the current setlist.
- Opening a URL with `#sl=...` pre-fills the import modal automatically.

## Default state

On first load and after reset:

- 1 song
- Empty title (shown as `Untitled` in main view)
- BPM `120`
- Time signature `4/4`
- Accent off
- Double Time off

The setlist never stays empty.

## Local run

No build step required.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Browser notes

- Audio starts after user interaction (browser autoplay policy)
- Wake Lock support depends on browser/device
