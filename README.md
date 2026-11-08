# Cookie Profile Switcher

Chrome extension for switching between multiple logins on the same website without logging out. It also includes a live editor for cookies and localStorage.

Based on the original Cookie Profile Switcher by Emery Steele (GPL v3).

## Install

This build is not on the Chrome Web Store. Install it manually:

1. Download `cookie-profile-switcher-v1.5.0.zip` from the [latest release](https://github.com/Dazaike/cookie-profile-switcher/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and select the unzipped folder.

## Usage

1. Open the site you want to manage and click the extension icon.
2. Log in to your first account, then press **Save** to store it in the active profile.
3. Type a name under "New profile name" and press **Create**.
4. Press **Switch** on the new profile. The page reloads logged out.
5. Log in to your second account, then switch back and forth with **Switch**.

Profiles are stored per domain (for example, `example.com`) in the extension's local storage on your machine.

## What a profile contains

- Cookies for the site and for the hosts the page loaded resources from (the third-party cookies you see in DevTools).
- The page's `localStorage`.

Switching saves the current state into the profile you are leaving, clears it, applies the target profile, and reloads the tab. A new profile starts empty, so it starts logged out.

`sessionStorage` and IndexedDB are not included.

## Editor

Press **Editor** in the popup.

| Mode | What you can do |
|---|---|
| Cookies | List, filter, edit values, add, delete, delete all, export as JSON or Netscape, import JSON or Netscape |
| Local storage | List, filter, edit values, add, delete, delete all, export as JSON, import a JSON object or a `[{name, value}]` array (merges into existing items) |

Delete all in cookie mode removes every cookie shown in the list, including third-party ones.

## Limitations

- localStorage can only be read on pages the extension is allowed to script. On pages like `chrome://` only cookies switch.
- The page's own scripts can write localStorage back before the reload finishes. If a switch seems to revert, switch again.
- If a site keeps its login in IndexedDB or sessionStorage, profiles will not switch it.

## Permissions

| Permission | Why |
|---|---|
| `cookies` and all `http`/`https` hosts | Read, set and remove cookies for the site and its third-party hosts |
| `tabs` | Find the active tab and reload it after a switch |
| `scripting` | Read and write the active tab's localStorage |
| `storage` | Save profiles in the extension's local storage |

Nothing is sent anywhere. All data stays in your browser.

## Development

No build step. Edit the files and reload the extension at `chrome://extensions`.

- `manifest.json`: extension manifest (Manifest V3)
- `profiles.html`, `css/profiles.css`: popup UI
- `profiles.js`: all logic

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).

Uses jQuery and Font Awesome.
