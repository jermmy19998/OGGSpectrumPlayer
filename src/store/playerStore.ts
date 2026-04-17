import { create } from "zustand";

interface PlayerState {
  selectedFileName: string;
  isReady: boolean;
  isPlaying: boolean;
  statusMessage: string;
  fps: number;
  currentTime: number;
  duration: number;
  volume: number;
  setSelectedFileName: (fileName: string) => void;
  setReady: (ready: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setStatusMessage: (message: string) => void;
  setFps: (fps: number) => void;
  setCurrentTime: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  selectedFileName: "",
  isReady: false,
  isPlaying: false,
  statusMessage: "Load an OGG file to start.",
  fps: 0,
  currentTime: 0,
  duration: 0,
  volume: 0.95,
  setSelectedFileName: (selectedFileName) => set({ selectedFileName }),
  setReady: (isReady) => set({ isReady }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  setFps: (fps) => set({ fps }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume })
}));
