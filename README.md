# etro

Single-page metronome app for live performance.

`etro` is a static HTML app with no build step, designed for touch-first live use.

## Features

- High-precision metronome timing using Web Audio API scheduling (`currentTime` pattern, no `setInterval`)
- Setlist with add, select, delete, and reset
- Per-song settings:
  - Optional title (`Untitled` shown in main view when empty)
  - BPM (`0` to `240`)
  - Time signature (`4/4`, `6/8`, `3/4`, custom)
  - Accent toggle + editable accent map
  - DoubleTime toggle
- Persistence in `localStorage` (with legacy cookie migration support)
- Wake Lock while playing (when browser/device allows it)
- Mobile-responsive dark UI

## Default State

When first loaded, or after reset:

- 1 song
- title empty (`Untitled` shown in main view)
- BPM `120`
- time signature `4/4`
- Accent off
- DoubleTime off

The setlist never stays empty. Deleting the last song resets to default.

## Run Locally

No build required.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## GitHub Pages via GitHub Actions

This repo uses:

- [`.github/workflows/pages.yml`](.github/workflows/pages.yml)

### One-time setup in GitHub

1. Push this repo to GitHub.
2. Open `Settings` -> `Pages`.
3. Under **Build and deployment**, set **Source** to `GitHub Actions`.
4. Open `Settings` -> `Actions` -> `General` and confirm actions are allowed for this repo.

### Deploy

1. Push to `main`.
2. Go to `Actions` and watch `Deploy GitHub Pages`.
3. After success, your site URL is:
   - `https://<username>.github.io/<repo>/`

If the repository name is `<username>.github.io`, URL is:

- `https://<username>.github.io/`

## What Else You Need To Launch

If `pages.yml` is already committed, only these remain:

1. Ensure repo is on GitHub and `main` is pushed.
2. Set Pages source to `GitHub Actions`.
3. Push one commit (or run workflow manually from `Actions`).
4. Wait for green workflow run, then open the Pages URL.

## Browser Notes

- Wake Lock support varies by browser/device.
- Audio starts only after user interaction due to browser autoplay policy.
