# OneBookmark

English | [中文](./README.md)

A cross-browser bookmark sync extension that syncs local bookmarks to GitHub Gist for unified bookmark management across devices.

## Features

- One-click upload/download bookmarks to GitHub Gist
- Multi-backup management with selective sync
- Operation locking to prevent concurrent conflicts
- Diff preview before syncing
- Supports Chrome / Edge / Firefox
- English and Chinese localization
- Smooth animated interactions

## Installation

### Release (Recommended)

Go to [Releases](https://github.com/AstraSolis/OneBookmark/releases) to download the latest stable version, extract and load it in your browser.

### CI Build

Get the latest development version: Go to [Actions](https://github.com/AstraSolis/OneBookmark/actions/workflows/build.yml), select the latest successful build, and download the Artifact for your browser.

### Browser Store

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Install-blue?style=for-the-badge)](https://chromewebstore.google.com/detail/onebookmark/nbpcngemklcmfphomlcdpkblookgeeam?hl=zh-CN&utm_source=ext_sidebar)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Install-blue?style=for-the-badge)](https://microsoftedge.microsoft.com/addons/detail/onebookmark/nfgehhnejnoioniplhfgpgaojnafkelj)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Install-blue?style=for-the-badge)](https://addons.mozilla.org/zh-CN/firefox/addon/onebookmark/)

## Usage

1. Create a Personal Access Token at [GitHub Settings](https://github.com/settings/tokens/new?scopes=gist&description=OneBookmark) (requires `gist` scope)
2. Open the extension settings page, configure backup info (Token and Gist ID)
3. Enable the backups you need (upload/download)
4. Click "Upload" or "Download" button in Popup to sync

## Project Structure

```
├── entrypoints/           # Extension entrypoints
│   ├── background.ts      # Background service script
│   ├── popup/             # Popup UI (quick sync operations)
│   └── options/           # Options UI (full settings page)
├── lib/                   # Core libraries
│   ├── bookmark/          # Bookmark parsing and handling
│   ├── storage/           # Gist storage interface
│   ├── sync/              # Sync engine and operation lock
│   ├── i18n/              # Internationalization support
│   ├── motion/            # Animation component library
│   └── errors.ts          # Error type definitions
├── utils/                 # Utility functions
├── types/                 # TypeScript type definitions
├── public/                # Static assets (icons, etc.)
└── .github/workflows/     # CI/CD workflows
```

## Development

### Install Dependencies

```bash
pnpm install
```

### Development Mode

```bash
pnpm dev           # Chrome
pnpm dev:firefox   # Firefox
```

### Build

```bash
pnpm build         # Chrome
pnpm build:firefox # Firefox
pnpm zip           # Package as zip file
```

## Tech Stack

- [WXT](https://wxt.dev/) - Cross-browser extension framework
- React 19 + TypeScript - UI framework
- Tailwind CSS v4 - Styling
- i18next - Internationalization
- Motion - Animation library

## Privacy Policy

See [Privacy Policy](./PRIVACY_POLICY_EN.md).

## License

This project is licensed under the [Apache License 2.0](./LICENSE).

## Core Modules

### Bookmark Sync
- Local bookmark parsing and export
- Bidirectional sync with GitHub Gist
- Diff calculation and preview

### Backup Management
- Multiple Gist backup configurations
- Independent upload/download enable control
- Persistent backup info

### Concurrency Control
- Operation locking to prevent conflicts
- Automatic lock release
- Manual force unlock option

### User Interface
- Popup: Quick sync operations and status display
- Options: Full settings and backup management
- Real-time sync status feedback
- Bookmark statistics
