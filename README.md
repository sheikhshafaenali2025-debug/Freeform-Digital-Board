# Freeform-Digital-Board
A frontend-only application that acts as a free-form digital board where users can create and organize pins or lists on a blank canvas.
# Inkboard 

Inkboard is a lightweight, local-first digital board for notes, images, and simple to-dos.
It uses IndexedDB for persistence and a single-file bundled client (`app.js`) so it can run via file:// or a tiny local server.

## Features

- Create text notes, image pins, and basic to-do items.
- Drag & drop pins across an infinite canvas.
- Undo / redo history with local persistence.
- Theming (light/dark) and a compact left toolbar.
- Local snapshot saving (mocked) and IndexedDB storage.

## Quick start

Recommended: open `index.html` in a modern browser (Chrome, Edge, Firefox).

- To open directly on Windows (file://):

```powershell
start index.html
```

- Or serve with a tiny HTTP server (recommended for predictable behavior):

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
```

## Project layout

- `index.html` — main HTML file and entry point.
- `style.css` — site styles, palette, animations, and layout.
- `app.js` — bundled application logic (components, canvas controller, and state).
- `db.js` — database wrapper for IndexedDB (used by older code paths).
- `state.js` / `state.js.bak` — alternate app state implementation (kept for reference).
- `pin.js`, `canvas.js`, `main.js` — auxiliary modules (may be partially bundled).

## Development notes & recent fixes

- Dragging issues were addressed by switching to Pointer Events (`pointerdown`/`pointermove`/`pointerup`) with `setPointerCapture`/`releasePointerCapture` and `touch-action: none` on pins. If dragging still doesn't start, open DevTools Console to see pointer logs.
- Undo/redo and DB sync: history seeding and stronger DB sync logic were added to avoid stale DB items.
- Styling: new palette, fonts, card radius, shadows, hover effects, and small animations were added. Background image support via `assets/background.jpg` was added; place an image there or change the CSS variable `--bg-image`.

## Troubleshooting

- Drag not starting: ensure you drag by the pin header (grip area). If drag never starts, check the browser Console for pointerdown logs and errors.
- IndexedDB errors: check browser privacy settings blocking storage for file:// URLs. Use `http://localhost` server if you see DB permission issues.
- Missing assets: add `assets/background.jpg` to enable the background image, or adjust `--bg-image` in `style.css`.

## Testing

- Create a note with the toolbar button, drag it, edit content (blur to save), delete and use undo/redo to verify history and persistence.

## Contributing

This is a small local project — grab the code, make improvements, and open a PR or file issues describing desired changes. Keep changes minimal and consistent with the existing style.


