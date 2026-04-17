# OGG Spectrum Player / OGG 频谱播放器

Desktop OGG player with a static spectrogram, draggable playhead, folder-based playlist, and Electron packaging.

桌面端 OGG 播放器，支持静态频谱图、可拖拽播放线、按文件夹加载播放列表，以及 Electron 打包。

## Features / 功能

- Folder-only loading (`.ogg`, `.oga`), with file list panel
- Static spectrogram rendering (normalized to `[-1, 1]` color mapping)
- Draggable playhead on spectrogram and timeline seek
- Playlist controls: `Prev`, `Play/Pause`, `Next`
- Volume control and FPS indicator
- Electron desktop app build for Windows

- 仅文件夹加载（`.ogg`, `.oga`），并显示文件列表
- 静态频谱图渲染（归一化到 `[-1, 1]` 配色）
- 频谱图拖拽播放线 + 时间轴拖动
- 播放列表控制：`Prev`、`Play/Pause`、`Next`
- 音量控制与 FPS 指示
- 支持 Windows Electron 桌面打包

## Stack / 技术栈

- Electron
- React + TypeScript
- Zustand
- Vite
- Web Audio API
- Canvas (offline spectrogram rendering)

## Project Structure / 项目结构

```text
.
|- electron/
|  `- main.ts
|- src/
|  |- App.tsx
|  |- main.tsx
|  |- styles.css
|  |- audio/engine.ts
|  |- store/playerStore.ts
|  `- visualizer/spectrogram.ts
|- index.html
|- package.json
`- vite.config.ts
```

## Development / 开发运行

```bash
npm install
npm run start
```

## Build / 构建

```bash
npm run build
```

Outputs / 产物:

- `dist/` renderer assets
- `dist-electron/` main process build

## Run Desktop App / 桌面运行

```bash
npm run electron
```

## Package EXE (Windows) / 打包 EXE（Windows）

```bash
npm run build
npx electron-builder --win --x64
```

## Notes / 说明

- Best experience with Node 20 LTS.
- Large OGG files may take time for initial spectrogram analysis.

- 建议使用 Node 20 LTS。
- 大体积 OGG 在首次频谱分析时会有等待时间。
