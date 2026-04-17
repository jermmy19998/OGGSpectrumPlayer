# OGG Spectrum Player (Desktop App - Electron + React + Zustand + WebGL)

## Overview
A desktop audio player with:
- OGG playback
- Real-time FFT spectrum visualization
- Native desktop GUI via Electron
- React UI state managed by Zustand
- WebGL2 instanced rendering pipeline optimized for high refresh-rate displays

## Node Version Requirement
Use Node 20 LTS (recommended), for example `v20.x`.

Electron install may fail on very new Node releases (such as Node 25), which causes:
`Electron failed to install correctly`.

## Project Structure

```text
D:/Desktop/birdspec/
|- electron/
|  `- main.ts
|- src/
|  |- main.tsx
|  |- App.tsx
|  |- styles.css
|  |- audio/
|  |  `- engine.ts
|  |- store/
|  |  `- playerStore.ts
|  `- visualizer/
|     `- webglSpectrum.ts
|- index.html
|- package.json
|- tsconfig.json
|- tsconfig.electron.json
`- vite.config.ts
```

## Run In Desktop Mode

```bash
npm install
npm run build
npm run electron
```

## Run In Dev Mode

```bash
npm run start
```

This starts Vite and Electron together.

## Build Output

`npm run build` outputs:
- `dist/` (React renderer assets)
- `dist-electron/` (compiled Electron main process)

## Notes
- `AudioBufferSourceNode` is single-use, so playback recreates source nodes each run.
- WebGL2 renderer uses instanced bars to reduce draw calls and improve frame stability.
- Actual FPS depends on display refresh rate and GPU driver settings.
