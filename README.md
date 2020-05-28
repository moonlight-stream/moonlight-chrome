# Moonlight for ChromeOS

[Moonlight for ChromeOS](https://moonlight-stream.org) is an open source implementation of NVIDIA's GameStream, as used by the NVIDIA Shield, but built to run on ChromeOS.

Moonlight for ChromeOS allows you to stream your full collection of games from your powerful desktop to another PC or laptop running ChromeOS.

For Windows, Mac, and Linux, we recommend running the [new PC port](https://github.com/moonlight-stream/moonlight-qt) for maximum performance.

Moonlight also has mobile versions for [Android](https://github.com/moonlight-stream/moonlight-android) and [iOS/tvOS](https://github.com/moonlight-stream/moonlight-ios).

Check out [the Moonlight wiki](https://github.com/moonlight-stream/moonlight-docs/wiki) for more detailed project information, setup guide, or troubleshooting steps.

[![Moonlight for ChromeOS](https://moonlight-stream.org/images/chrome_webstore.png)](https://chrome.google.com/webstore/detail/moonlight-game-streaming/gemamigbbenahjlfnmlfdjhdnkpbkfjj)

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
