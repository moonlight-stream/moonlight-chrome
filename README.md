# Moonlight for ChromeOS

[Moonlight for ChromeOS](https://moonlight-stream.org) is an open source client for NVIDIA GameStream and [Sunshine](https://github.com/LizardByte/Sunshine).

Moonlight for ChromeOS allows you to stream your full collection of games from your powerful desktop to another PC or laptop running ChromeOS.

Moonlight also has mobile versions for [Android](https://github.com/moonlight-stream/moonlight-android) and [iOS/tvOS](https://github.com/moonlight-stream/moonlight-ios).

Check out [the Moonlight wiki](https://github.com/moonlight-stream/moonlight-docs/wiki) for more detailed project information, setup guide, or troubleshooting steps.

[![AppVeyor Build Status](https://ci.appveyor.com/api/projects/status/w716mt9ulyww68c5/branch/master?svg=true)](https://ci.appveyor.com/project/cgutman/moonlight-chrome/branch/master)

[![Moonlight for ChromeOS](https://moonlight-stream.org/images/chrome_webstore.png)](https://chrome.google.com/webstore/detail/moonlight-game-streaming/gemamigbbenahjlfnmlfdjhdnkpbkfjj)

## Deprecation

Moonlight for ChromeOS is a legacy client that depends on the [deprecated NaCl runtime](https://blog.chromium.org/2021/10/extending-chrome-app-support-on-chrome.html). It is receiving only basic bugfixes and little/no feature work.

For ChromeOS systems, we recommend migrating to the [Android](https://github.com/moonlight-stream/moonlight-android) app for additional features, functionality, and active support. Please reach out in the [GitHub tracker](https://github.com/moonlight-stream/moonlight-android/issues) if there are any functionality or performance regressions when moving to the Android client on ChromeOS systems.

For Windows, Mac, and Linux clients, we recommend running the [native PC port](https://github.com/moonlight-stream/moonlight-qt).

## Building
1. Install the Chrome Native Client SDK and download the current Pepper SDK
2. Set the `NACL_SDK_ROOT` environment variable to your Pepper SDK folder. If you need more detailed instructions, see [here](https://github.com/google/pepper.js/wiki/Getting-Started)
3. Run `git submodule update --init --recursive` from within `moonlight-chrome/`
4. Run `make` from within the `moonlight-chrome/` repo

## Testing
1. Open the Extensions page in Chrome
2. Check the 'Developer mode' option
3. Click 'Load unpacked extension' and point it at your built moonlight-chrome repo
4. Run Moonlight from the extensions page
5. If making changes, make sure to click the Reload button on the Extensions page
