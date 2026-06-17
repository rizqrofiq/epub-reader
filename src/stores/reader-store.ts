import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ReaderTheme = "dark" | "light" | "sepia";
export type FontFamily = "sans" | "serif";
export type LineHeight = "compact" | "normal" | "relaxed";
export type PageLayout = "single" | "double";

interface ReaderState {
  theme: ReaderTheme;
  setTheme: (theme: ReaderTheme) => void;

  fontSize: number;
  setFontSize: (size: number) => void;
  fontFamily: FontFamily;
  setFontFamily: (family: FontFamily) => void;
  lineHeight: LineHeight;
  setLineHeight: (height: LineHeight) => void;
  layout: PageLayout;
  setLayout: (layout: PageLayout) => void;

  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  activeSidebarTab: string;
  setActiveSidebarTab: (tab: string) => void;

  isSettingsOpen: boolean;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;

  isToolbarVisible: boolean;
  setToolbarVisible: (visible: boolean) => void;
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),

      fontSize: 18,
      setFontSize: (fontSize) =>
        set({ fontSize: Math.max(14, Math.min(28, fontSize)) }),
      fontFamily: "serif",
      setFontFamily: (fontFamily) => set({ fontFamily }),
      lineHeight: "normal",
      setLineHeight: (lineHeight) => set({ lineHeight }),
      layout: "single",
      setLayout: (layout) => set({ layout }),

      isSidebarOpen: false,
      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen, isSettingsOpen: false })),
      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      activeSidebarTab: "toc",
      setActiveSidebarTab: (activeSidebarTab) => set({ activeSidebarTab }),

      isSettingsOpen: false,
      toggleSettings: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen, isSidebarOpen: false })),
      setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),

      isToolbarVisible: true,
      setToolbarVisible: (isToolbarVisible) => set({ isToolbarVisible }),
    }),
    {
      name: "readium-reader-settings",
      partialize: (state) => ({
        theme: state.theme,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        lineHeight: state.lineHeight,
        layout: state.layout,
      }),
    }
  )
);
