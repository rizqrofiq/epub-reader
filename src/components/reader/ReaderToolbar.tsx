"use client";

interface ReaderToolbarProps {
  title: string;
  chapter: string;
  isBookmarked: boolean;
  isVisible: boolean;
  sidebarOpen?: boolean;
  onToggleBookmark: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onBack: () => void;
}

export default function ReaderToolbar({
  title,
  chapter,
  isBookmarked,
  isVisible,
  sidebarOpen,
  onToggleBookmark,
  onToggleSidebar,
  onToggleSettings,
  onBack,
}: ReaderToolbarProps) {
  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
        } ${sidebarOpen ? "lg:right-[380px]" : ""}`}
    >
      <div className="bg-black/70 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
          >
            <span className="material-symbols-rounded">arrow_back</span>
            <span className="text-sm hidden sm:inline">Library</span>
          </button>

          <div className="flex-1 text-center px-4 min-w-0">
            <h1 className="text-sm font-medium text-white truncate">{title}</h1>
            {chapter && (
              <p className="text-xs text-white/50 truncate mt-0.5">{chapter}</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleBookmark();
              }}
              className={`p-2 rounded-sm transition-all duration-200 cursor-pointer ${isBookmarked
                  ? "text-accent bg-accent/15"
                  : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              title="Toggle bookmark"
            >
              <span
                className={`material-symbols-rounded ${isBookmarked ? "filled" : ""
                  }`}
              >
                bookmark
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSidebar();
              }}
              className="p-2 rounded-sm text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
              title="Table of Contents"
            >
              <span className="material-symbols-rounded">
                format_list_bulleted
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSettings();
              }}
              className="p-2 rounded-sm text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
              title="Settings"
            >
              <span className="material-symbols-rounded">settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
