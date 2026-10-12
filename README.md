# Phenomena

Natural scenes drawn in the browser, with the sound synthesized as they play.

## Live

<p>
  <a href="https://az9713.github.io/grok-4.7-nature-simulation/"><strong>Watch the scenes</strong></a>
  ·
  <a href="https://az9713.github.io/grok-4.7-nature-simulation/journey.html"><strong>How it is drawn</strong></a>
</p>

The player and the development journey are published from this repository with GitHub Pages. The river, falls, aurora, eruption, and storm run at the first link. The second link is the account of how each one is generated.

Click **Hear the scene** on the player. Browsers block synthesized audio until that gesture.

## Run it locally

```bash
npm install
npm run dev
```

The dev server prints a local URL. Production uses a different base path, `/grok-4.7-nature-simulation/`, which the Pages workflow sets when it builds.

## Stack

Three.js and custom GLSL for the picture. The Web Audio API for the sound. Vite builds the two pages, `index.html` and `journey.html`.
