# etro

`etro` is a static, touch-first metronome built for live performance.

It keeps the main controls large, the setlist close at hand, and the timing stable with a Web Audio scheduler instead of `setInterval`.

## What it looks like

![etro screenshot](./assets/media/etro-screenshot.png)

## Highlights

- Web Audio `currentTime` scheduler for steadier timing
- Setlist workflow with add, select, delete, and reset
- BPM range `20-240`
- Time signatures: `4/4`, `6/8`, `3/4`, and custom
- Custom signatures support top values `1-32` and bottom values `2`, `4`, `8`, or `16` such as `13/16`
- Accent toggle with editable accent-map beats
- Double Time toggle per song
- Export/share links and import flow with destructive-action confirmation
- Persistent local data via `localStorage`
- Installable PWA with offline support and Wake Lock when available

## Project stance

- `etro` is a non-commercial project.
- `etro` is open source.
- Contributions are welcome.

## PWA support

`etro` is configured as a Progressive Web App (PWA):

- Installable on supported mobile and desktop browsers
- Offline-capable after first load with network-first refresh and cached fallback
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

## Share and import

1. Tap `Export` in the setlist panel to generate a link.
2. Use `Copy Link` or native `Send`.
3. On another device, open `Import`, paste the link or code, review the replacement, then tap `Replace Setlist`.

Notes:

- Import replaces the current setlist only after a confirmation step.
- Opening a URL with `#sl=...` pre-fills the import modal automatically.

## Default state

On first load and after reset:

- 1 song
- Empty title (shown as `Untitled` in the main view)
- BPM `120`
- Time signature `4/4`
- Accent off
- Double Time off

The setlist never stays empty.

## Project structure

- `index.html` - app markup and share metadata
- `assets/css/styles.css` - app styles
- `assets/js/app.js` - app logic and audio scheduler
- `manifest.json` - PWA manifest
- `sw.js` - PWA service worker

## Local run

No build step required.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Contributing

1. Fork the repo: `https://github.com/widodoalfianto/etro`
2. Create a branch.
3. Open a pull request with a clear summary.

Bug reports and feature requests are also welcome in Issues.

## Browser notes

- Audio starts after user interaction because of browser autoplay policy
- Wake Lock support depends on browser and device
