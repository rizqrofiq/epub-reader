import { create } from "zustand";

interface LibraryState {
  viewMode: "grid" | "list";
  setViewMode: (mode: "grid" | "list") => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;

  activeShelf: string | null;
  setActiveShelf: (shelf: string | null) => void;
  activeTags: string[];
  toggleTag: (tag: string) => void;
  clearFilters: () => void;

  isUploadModalOpen: boolean;
  setUploadModalOpen: (open: boolean) => void;
  isDrivePickerOpen: boolean;
  setDrivePickerOpen: (open: boolean) => void;
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
  uploadProgress: number;
  setUploadProgress: (progress: number) => void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  viewMode: "grid",
  setViewMode: (viewMode) => set({ viewMode }),

  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  activeShelf: null,
  setActiveShelf: (activeShelf) => set({ activeShelf }),
  activeTags: [],
  toggleTag: (tag) =>
    set((state) => ({
      activeTags: state.activeTags.includes(tag)
        ? state.activeTags.filter((t) => t !== tag)
        : [...state.activeTags, tag],
    })),
  clearFilters: () => set({ activeShelf: null, activeTags: [], searchQuery: "" }),

  isUploadModalOpen: false,
  setUploadModalOpen: (isUploadModalOpen) => set({ isUploadModalOpen }),
  isDrivePickerOpen: false,
  setDrivePickerOpen: (isDrivePickerOpen) => set({ isDrivePickerOpen }),
  isUploading: false,
  setIsUploading: (isUploading) => set({ isUploading }),
  uploadProgress: 0,
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
}));
