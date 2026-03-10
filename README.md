# etro

Single-page metronome app for live performance.

`etro` is a lightweight static web app built with vanilla JavaScript + Tailwind CDN. It is designed for fast BPM changes, touch-friendly controls, and quick song navigation during rehearsal or service.

## Features

- High-precision metronome timing using Web Audio API scheduling (`currentTime` pattern, no `setInterval`)
- Setlist with add, select, and delete
- Per-song settings:
  - Title (optional, shows `Untitled` in main view when empty)
  - BPM (`0` to `240`)
  - Time signature (`4/4`, `6/8`, `3/4`, custom)
  - Accent toggle + editable accent map
  - DoubleTime toggle
- Cookie migration support from older versions and current persistence in `localStorage`
- Wake Lock support while playing (when browser allows it)
- Mobile responsive dark UI

## Defaults

When first loaded, or after reset, app state is:

- 1 song
- title empty (`Untitled` shown in main view)
- BPM `120`
- time signature `4/4`
- Accent off
- DoubleTime off

The setlist never stays empty. Deleting the last remaining song resets to default state.

## Run Locally

No build step is required.

1. Open `index.html` directly in a browser
2. Or serve it locally with a static server

Example:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy to GitHub Pages

1. Push this project to a GitHub repository.
2. In GitHub, go to `Settings` -> `Pages`.
3. Under **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/(root)`
4. Save and wait for deployment.
5. Open:
   - `https://<username>.github.io/<repo>/`

If your repo name is `<username>.github.io`, your site URL is:

- `https://<username>.github.io/`

## Browser Notes

- Wake Lock is browser-dependent. If unsupported, the metronome still works.
- Audio starts after user interaction as required by browser autoplay policies.
```
