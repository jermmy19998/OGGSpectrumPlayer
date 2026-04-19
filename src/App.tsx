import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "./audio/engine";
import { usePlayerStore } from "./store/playerStore";
import { buildStaticSpectrogram, SpectrogramCanvas } from "./visualizer/spectrogram";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

function getRelativeName(file: File) {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath && withPath.webkitRelativePath.length > 0
    ? withPath.webkitRelativePath
    : file.name;
}

function collectAudioFiles(files: FileList | File[]) {
  return Array.from(files)
    .filter((file) => /\.(ogg|oga)$/i.test(file.name))
    .sort((a, b) => getRelativeName(a).localeCompare(getRelativeName(b)));
}

function buildAxisTicks(duration: number, count = 7) {
  if (duration <= 0 || count < 2) {
    return ["00:00"];
  }

  const ticks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (duration * i) / (count - 1);
    ticks.push(formatTime(t));
  }
  return ticks;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const spectrogramRef = useRef<SpectrogramCanvas | null>(null);
  const animationRef = useRef<number>(0);
  const lastStatsRef = useRef(performance.now());
  const fpsFramesRef = useRef(0);
  const lastTimelineRef = useRef(0);
  const draggingRef = useRef(false);
  const analysisTokenRef = useRef(0);
  const durationRef = useRef(0);
  const currentTimeRef = useRef(0);
  const nMelsRef = useRef(128);

  const playlistRef = useRef<File[]>([]);
  const trackIndexRef = useRef(-1);

  const [trackIndex, setTrackIndex] = useState(-1);
  const [playlistSize, setPlaylistSize] = useState(0);
  const [playlistNames, setPlaylistNames] = useState<string[]>([]);
  const [nMelsValue, setNMelsValue] = useState(128);
  const [nMelsInput, setNMelsInput] = useState("128");
  const [isDragOver, setIsDragOver] = useState(false);

  const setSelectedFileName = usePlayerStore((s) => s.setSelectedFileName);
  const setReady = usePlayerStore((s) => s.setReady);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setStatusMessage = usePlayerStore((s) => s.setStatusMessage);
  const setFps = usePlayerStore((s) => s.setFps);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const selectedFileName = usePlayerStore((s) => s.selectedFileName);
  const isReady = usePlayerStore((s) => s.isReady);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const statusMessage = usePlayerStore((s) => s.statusMessage);
  const fps = usePlayerStore((s) => s.fps);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);

  const audioEngine = useMemo(() => new AudioEngine(), []);

  useEffect(() => {
    trackIndexRef.current = trackIndex;
  }, [trackIndex]);

  useEffect(() => {
    durationRef.current = duration;
    currentTimeRef.current = currentTime;
  }, [currentTime, duration]);

  useEffect(() => {
    nMelsRef.current = nMelsValue;
  }, [nMelsValue]);

  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) {
      return;
    }

    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
    el.setAttribute("multiple", "");
  }, []);

  const openFolderPicker = () => {
    folderInputRef.current?.click();
  };

  const renderSpectrogramForCurrentTrack = useCallback(
    async (token: number) => {
      const painter = spectrogramRef.current;
      const buffer = audioEngine.getAudioBuffer();
      if (!painter || !buffer) {
        return;
      }

      const size = painter.getSuggestedImageSize();
      const image = await buildStaticSpectrogram(buffer, size.width, size.height, {
        nMels: nMelsRef.current
      });

      if (token !== analysisTokenRef.current) {
        return;
      }

      painter.setImage(image);
      const currentDuration = durationRef.current;
      const ratio = currentDuration > 0 ? currentTimeRef.current / currentDuration : 0;
      painter.draw(ratio);
    },
    [audioEngine]
  );

  const loadTrack = useCallback(
    async (index: number, autoPlay: boolean) => {
      const list = playlistRef.current;
      const file = list[index];
      if (!file) {
        return;
      }

      try {
        setStatusMessage(`Decoding ${index + 1}/${list.length}...`);
        await audioEngine.load(file);

        setTrackIndex(index);
        setSelectedFileName(getRelativeName(file));
        setReady(true);
        setPlaying(false);
        setCurrentTime(0);

        const nextDuration = audioEngine.getDuration();
        setDuration(nextDuration);

        setStatusMessage(`Analyzing spectrogram ${index + 1}/${list.length}...`);
        const token = ++analysisTokenRef.current;
        await renderSpectrogramForCurrentTrack(token);

        if (autoPlay) {
          await audioEngine.play();
          setPlaying(true);
          setStatusMessage(`Playing ${index + 1}/${list.length}.`);
        } else {
          setStatusMessage(`Loaded ${index + 1}/${list.length}.`);
        }
      } catch {
        setStatusMessage("Decode/analyze failed. Please check your OGG files.");
      }
    },
    [
      audioEngine,
      renderSpectrogramForCurrentTrack,
      setCurrentTime,
      setDuration,
      setPlaying,
      setReady,
      setSelectedFileName,
      setStatusMessage
    ]
  );

  useEffect(() => {
    audioRef.current = audioEngine;
    audioEngine.setVolume(volume);

    const offEnded = audioEngine.onEnded(() => {
      const next = trackIndexRef.current + 1;
      if (next < playlistRef.current.length) {
        void loadTrack(next, true);
      } else {
        setPlaying(false);
        setStatusMessage("Playlist finished.");
      }
    });

    return () => {
      offEnded();
      audioEngine.stop(true);
    };
  }, [audioEngine, loadTrack, setPlaying, setStatusMessage, volume]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    try {
      spectrogramRef.current = new SpectrogramCanvas(canvasRef.current);
      spectrogramRef.current.resize();
      spectrogramRef.current.clear();
      setStatusMessage("Load an OGG file or folder, then press Play.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Canvas initialization failed.";
      setStatusMessage(msg);
    }

    const onResize = () => {
      spectrogramRef.current?.resize();
      const currentDuration = durationRef.current;
      const ratio = currentDuration > 0 ? currentTimeRef.current / currentDuration : 0;
      spectrogramRef.current?.draw(ratio);
      const token = ++analysisTokenRef.current;
      void renderSpectrogramForCurrentTrack(token);
    };

    window.addEventListener("resize", onResize);

    const frame = (now: number) => {
      const engine = audioRef.current;
      if (engine && now - lastTimelineRef.current >= 100) {
        const t = engine.getCurrentTime();
        const d = engine.getDuration();
        setCurrentTime(t);
        setDuration(d);
        setPlaying(engine.isPlaying());

        const ratio = d > 0 ? t / d : 0;
        spectrogramRef.current?.draw(ratio);

        lastTimelineRef.current = now;
      }

      fpsFramesRef.current += 1;
      if (now - lastStatsRef.current >= 500) {
        const currentFps = (fpsFramesRef.current * 1000) / (now - lastStatsRef.current);
        setFps(Number(currentFps.toFixed(0)));
        lastStatsRef.current = now;
        fpsFramesRef.current = 0;
      }

      animationRef.current = requestAnimationFrame(frame);
    };

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [renderSpectrogramForCurrentTrack, setCurrentTime, setDuration, setFps, setPlaying, setStatusMessage]);

  useEffect(() => {
    if (!isReady || trackIndex < 0) {
      return;
    }

    const id = setTimeout(() => {
      const token = ++analysisTokenRef.current;
      setStatusMessage("Rebuilding spectrogram with updated mel bands...");
      void renderSpectrogramForCurrentTrack(token).then(() => {
        setStatusMessage(`Loaded ${trackIndex + 1}/${playlistSize}.`);
      });
    }, 180);

    return () => clearTimeout(id);
  }, [isReady, nMelsValue, playlistSize, renderSpectrogramForCurrentTrack, setStatusMessage, trackIndex]);

  const onSelectFolder = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const list = collectAudioFiles(files);
    if (list.length === 0) {
      setStatusMessage("No OGG files found in selected folder.");
      return;
    }

    playlistRef.current = list;
    setPlaylistNames(list.map((file) => file.name));
    setPlaylistSize(list.length);
    setTrackIndex(-1);
    setSelectedFileName("");
    setReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audioEngine.stop(true);
    spectrogramRef.current?.clear();
    setStatusMessage(`Folder indexed: ${list.length} OGG files. Select one in Files to load.`);
  };

  const onDropFiles = (files: FileList) => {
    const list = collectAudioFiles(files);
    if (list.length === 0) {
      setStatusMessage("No OGG files found in dropped content.");
      return;
    }

    playlistRef.current = list;
    setPlaylistNames(list.map((file) => file.name));
    setPlaylistSize(list.length);
    setTrackIndex(-1);
    setSelectedFileName("");
    setReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    audioEngine.stop(true);
    spectrogramRef.current?.clear();
    setStatusMessage(`Dropped ${list.length} OGG files. Select one in Files to load.`);
  };

  const onPlayPause = async () => {
    if (!isReady) {
      return;
    }

    try {
      if (audioEngine.isPlaying()) {
        audioEngine.pause();
        setPlaying(false);
        setStatusMessage("Paused.");
      } else {
        await audioEngine.play();
        setPlaying(true);
        setStatusMessage("Playing static spectrogram.");
      }
    } catch {
      setStatusMessage("Playback operation failed.");
    }
  };

  const onPrev = async () => {
    if (trackIndex <= 0) {
      return;
    }

    const autoPlay = audioEngine.isPlaying();
    await loadTrack(trackIndex - 1, autoPlay);
  };

  const onNext = async () => {
    if (trackIndex < 0 || trackIndex >= playlistSize - 1) {
      return;
    }

    const autoPlay = audioEngine.isPlaying();
    await loadTrack(trackIndex + 1, autoPlay);
  };

  const onSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    audioEngine.seek(next);
    setCurrentTime(next);
    const ratio = duration > 0 ? next / duration : 0;
    spectrogramRef.current?.draw(ratio);
  };

  const onVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    audioEngine.setVolume(nextVolume);
    setVolume(nextVolume);
  };

  const applyNMelsInput = () => {
    const trimmed = nMelsInput.trim();
    const next = Number(trimmed);
    if (trimmed.length > 0 && Number.isFinite(next) && next > 0) {
      const normalized = Math.max(1, Math.round(next));
      setNMelsValue(normalized);
      setNMelsInput(String(normalized));
    } else {
      setStatusMessage("n_mels must be a positive number.");
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable);

      if (isEditable) {
        return;
      }

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        void onPrev();
        return;
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        void onNext();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        void onPlayPause();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext, onPlayPause, onPrev]);

  const seekByClientX = (clientX: number) => {
    if (!isReady || duration <= 0) {
      return;
    }

    const view = spectrogramRef.current;
    if (!view) {
      return;
    }

    const next = view.timeFromClientX(clientX, duration);
    audioEngine.seek(next);
    setCurrentTime(next);
    const ratio = next / duration;
    view.draw(ratio);
  };

  const ticks = buildAxisTicks(duration, 7);

  return (
    <main
      className={`app-shell${isDragOver ? " drag-over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) {
          setIsDragOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
          onDropFiles(event.dataTransfer.files);
        }
      }}
    >
      <section className="panel">
        <header className="header">
          <div className="chip">{isPlaying ? "Playing" : "Paused"}</div>
        </header>

        <div className="controls">
          <input
            ref={folderInputRef}
            type="file"
            accept=".ogg,.oga,audio/ogg"
            onChange={onSelectFolder}
            className="hidden-folder-input"
          />
          <button type="button" onClick={openFolderPicker}>
            Load Folder
          </button>
          <button type="button" onClick={onPrev} disabled={trackIndex <= 0}>
            Prev
          </button>
          <button type="button" onClick={onPlayPause} disabled={!isReady}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={onNext} disabled={trackIndex < 0 || trackIndex >= playlistSize - 1}>
            Next
          </button>
        </div>

        <div className="timeline">
          <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.01}
            value={Math.min(currentTime, Math.max(duration, 0.01))}
            onChange={onSeek}
            disabled={!isReady}
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="timeline volume-row">
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={onVolume} />
          <span>{Math.round(volume * 100)}%</span>
        </div>

        <div className="timeline volume-row">
          <span>n_mels</span>
          <input
            type="text"
            inputMode="numeric"
            value={nMelsInput}
            onChange={(event) => {
              setNMelsInput(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applyNMelsInput();
              }
            }}
          />
          <button type="button" onClick={applyNMelsInput}>
            Apply
          </button>
        </div>

        <p className="meta">{selectedFileName || "No file selected"}</p>
        <p className="meta">{playlistSize > 0 ? `Track ${trackIndex + 1}/${playlistSize}` : "Playlist empty"}</p>
        <p className="status">{statusMessage}</p>

        <div className="player-grid">
          <div>
            <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                className="spectrum-canvas"
                onMouseDown={(event) => {
                  draggingRef.current = true;
                  seekByClientX(event.clientX);
                }}
                onMouseMove={(event) => {
                  if (draggingRef.current) {
                    seekByClientX(event.clientX);
                  }
                }}
                onMouseUp={() => {
                  draggingRef.current = false;
                }}
                onMouseLeave={() => {
                  draggingRef.current = false;
                }}
              />
            </div>
            <div className="x-axis">
              {ticks.map((label, i) => (
                <span key={`${label}-${i}`}>{label}</span>
              ))}
            </div>
            <div className="axis-label">Time (s)</div>
          </div>

          <aside className="playlist-panel">
            <div className="playlist-title">Files ({playlistSize})</div>
            <div className="playlist-list">
              {playlistNames.length === 0 ? (
                <div className="playlist-empty">No files</div>
              ) : (
                playlistNames.map((name, i) => (
                  <button
                    key={`${name}-${i}`}
                    type="button"
                    className={`track-item ${i === trackIndex ? "active" : ""}`}
                    onClick={() => {
                      const autoPlay = audioEngine.isPlaying();
                      void loadTrack(i, autoPlay);
                    }}
                  >
                    {i + 1}. {name}
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default App;
