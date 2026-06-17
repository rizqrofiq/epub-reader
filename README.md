# EPUB Reader

A modern, web-based EPUB reader built with Next.js and Tailwind CSS. It focuses on providing a highly customizable, seamless, and performant reading experience with offline support and cloud synchronization.

## ✨ Features

- **Customizable Reader UI:** Adjust themes (Light, Dark, Sepia), font families, font sizes, and line heights to match your reading preferences.
- **Offline-First:** Powered by [Dexie.js](https://dexie.org/) to store books and reading progress locally in IndexedDB, allowing you to read your books without an internet connection.
- **Cloud Synchronization:** Securely sync your books, bookmarks, and reading progress across devices using [Supabase](https://supabase.com/).
- **Modern Stack:** Built on [Next.js 16](https://nextjs.org/) App Router and styled with [Tailwind CSS v4](https://tailwindcss.com/) for lightning-fast performance and a responsive design.
- **Robust Rendering:** Utilizes [epub.js](https://github.com/futurepress/epub.js) and [react-reader](https://github.com/gerhardsletten/react-reader) for accurate and reliable EPUB parsing and rendering.

## 🛠️ Tech Stack

- **Framework:** Next.js (React 19)
- **Styling:** Tailwind CSS v4
- **State Management:** Zustand
- **Local Database:** Dexie.js (IndexedDB)
- **Backend & Auth:** Supabase
- **Icons:** Material Symbols
- **EPUB Engine:** epub.js & react-reader

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com/) account (if you want to enable cloud sync)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/epub-reader.git
   cd epub-reader
   ```

2. Install dependencies:
   ```bash
   npm install
   # or yarn install, pnpm install
   ```

3. Set up environment variables:
   Copy the example environment file and fill in your Supabase credentials.
   ```bash
   cp .env.example .env.local
   ```
   *Note: `.env.local` is ignored by Git to keep your secrets safe.*

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the app in action.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License

This project is open-source and available under the [Apache License 2.0](LICENSE).
