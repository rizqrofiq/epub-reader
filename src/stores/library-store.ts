import { create } from "zustand";

interface LibraryState {
  viewMode: "grid" | "list";
  setViewMode: (mode: "grid" | "list") => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;

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

  isUploadModalOpen: false,
  setUploadModalOpen: (isUploadModalOpen) => set({ isUploadModalOpen }),
  isDrivePickerOpen: false,
  setDrivePickerOpen: (isDrivePickerOpen) => set({ isDrivePickerOpen }),
  isUploading: false,
  setIsUploading: (isUploading) => set({ isUploading }),
  uploadProgress: 0,
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
}));
