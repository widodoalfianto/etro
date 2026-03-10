# etro

`etro` is a static, touch-first metronome app for live performance.

## Why split files

For Vercel hosting and long-term maintenance, separate files are better than one huge `index.html`:

- Better browser caching (CSS/JS cached independently)
- Easier edits and reviews
- Cleaner debugging in DevTools

The app is now split into HTML, CSS, and JS files.

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

Open `http://localhost:8080`.

## Deploy on Vercel (free tier)

1. Push this repo to GitHub.
2. In Vercel, click **Add New Project** and import the repo.
3. Use these settings:
   - Framework Preset: `Other`
   - Build Command: leave empty
   - Output Directory: leave empty (or `.`)
4. Deploy.

Each push to your connected branch will auto-deploy.

## Social link

Setlist footer currently links to:

- GitHub: `https://github.com/widodoalfianto`

## Browser notes

- Audio starts after user interaction (browser autoplay policy)
- Wake Lock support depends on browser/device
