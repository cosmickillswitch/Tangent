# Tangent

Maths you can grab, in the 3Blue1Brown style: every graph responds to your finger, and every equation redraws as you move it.

## Explorers

- **Transform a function**: y = a·f(b(x − h)) + k. Drag the curve to slide it, drag the yellow point to stretch it, and sweep any value with ▶. Dotted lines show where points travel.
- **Slope → the derivative**: drag P and Q, shrink Δx to 0 and watch the secant become the tangent. "Sweep P" traces f′.
- **Area → the integral**: Riemann rectangles (left, middle, right, trapezoids) with draggable bounds; "Double n" shows the error shrinking.
- **Solve an equation**: algebra tiles on a balance. Every move is done to both sides; the graph of both sides shows the crossing point never moves.

Drag a graph to move around, pinch to zoom, double-tap to reset the view.

## Files

- `index.html`: the app (pages are views: `#transform`, `#derivative`, `#integral`, `#solve`).
- `app.js`: the four explorers. `plot.js`: the graph (pan, zoom, handles). `core.js`: the LaTeX-style maths engine shared with Animath.
- `fonts.css` + `fonts/`: Latin Modern, the LaTeX font (GUST Font License).
- `app.css`: layout and colours.
- `manifest.webmanifest`, `sw.js`, icons: installable and offline. Bump `VERSION` in `sw.js` after any change.

## Put it on GitHub Pages

1. Create a repo called `tangent` and upload everything, including the `fonts` folder.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://cosmickillswitch.github.io/tangent/` and install it: on Android, Chrome's menu (⋮ → Install app); on iPad or iPhone, Safari's Share → Add to Home Screen.
