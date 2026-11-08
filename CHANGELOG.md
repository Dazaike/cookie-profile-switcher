# Changelog

## [v1.5.0] - 2026-11-08

First commit of this repository; there is no earlier git history or tag, so entries describe the changes made on top of the 1.4.0 manifest baseline.

### Added
- Local storage editor in the cookie editor view: list, filter, edit, add, delete, delete all, JSON export and JSON import (merge) for the active tab's `localStorage`.
- Profiles now save and restore the page's `localStorage` together with cookies (save, switch, rename, remove, create).

### Changed
- Cookie editor and profiles now include cookies for hosts the page loaded resources from (e.g. third-party domains shown in DevTools), not only the tab's own domain.
