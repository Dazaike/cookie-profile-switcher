# Cookie Profile Switcher

## Install
This build is not on the Chrome Web Store. Install it manually:
1. Download `cookie-profile-switcher-v1.5.0.zip` from the [latest release](https://github.com/Dazaike/cookie-profile-switcher/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and select the unzipped folder.

Based on the original Cookie Profile Switcher by Emery Steele (GPL v3).

## What's new in v1.5.0
* Local storage editor next to the cookie editor.
* Profiles save and restore the page's localStorage along with cookies.
* Cookies from hosts the page loads resources from are included.

See [CHANGELOG.md](CHANGELOG.md) for details.

## About
Cookie Profile Switcher allows you to easily manage multiple cookie sessions for all of your websites! No more logging out & logging in, just to switch your user profile. This is a MUST have for people who manage multiple social media profiles, emails or eCommerce accounts. Simply create a new profile in the extension, login to your user account, then you can switch between your profiles with ease.

Questions, bugs or feature requests: open an issue on GitHub.


## How it Works
The extension at it's core is fairly simple. It takes advantage of Google Chrome Extension's cookie & storage APIs. When a new profile is created, the profile name is stored in Google Chrome's local storage. Then when you switch to another profile, the cookie data for the website on the active tab is saved to the previous profile; And the cookie data from the local storage is loaded into the cookie store, effectively swapping the cookies.


## License Info
This work is licensed under a GNU General Public License v3.0.

This extension uses the following open-source projects:

* jQuery
* Font Awesome

## Analytics
This extension uses Google Analytics to gather a small amount of anonymous usage data. This data includes: browser version, number of sessions per user, and average session length. Personal information like your profile or cookie data will not be tracked. Ever. The usage information is used to improve the usability of extension & help with bug fixes.
