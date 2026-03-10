# etro

`etro` is a static, touch-first metronome app for live performance.

## Project stance

- `etro` is a non-commercial project.
- `etro` is open source.
- Contributions are welcome.

## Contributing

If you want to contribute:

1. Fork the repo: `https://github.com/widodoalfianto/etro`
2. Create a feature branch.
3. Open a pull request with a clear summary of changes.

Bug reports and feature requests are also welcome in Issues.

## Project structure

- `index.html` - app markup
- `assets/css/styles.css` - app styles
- `assets/js/app.js` - app logic and audio scheduler
- `.github/workflows/pages.yml` - optional GitHub Pages workflow

## Features

- Web Audio `currentTime` scheduler (no `setInterval`) for stable timing
- Setlist with add, select, delete, reset
- Per-song settings:
  - Optional title
  - BPM `0-240`
  - Time signatures: `4/4`, `6/8`, `3/4`, custom
  - Accent toggle + editable accent map
  - Double Time toggle
- Persistent data in `localStorage`
- Wake Lock while playing (when supported)
- Mobile-responsive dark UI

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

Open `http://localhost:8080`

## Browser notes

- Audio starts after user interaction (browser autoplay policy)
- Wake Lock support depends on browser/device
