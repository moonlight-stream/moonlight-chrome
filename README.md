# Moonlight for ChromeOS

[Moonlight for ChromeOS](https://moonlight-stream.org) is an open source implementation of NVIDIA's GameStream, as used by the NVIDIA Shield, but built to run on ChromeOS.

Moonlight for ChromeOS allows you to stream your full collection of games from your powerful desktop to another PC or laptop running ChromeOS.

For Windows, Mac, and Linux, we recommend running the [new PC port](https://github.com/moonlight-stream/moonlight-qt) for maximum performance.

Moonlight also has mobile versions for [Android](https://github.com/moonlight-stream/moonlight-android) and [iOS](https://github.com/moonlight-stream/moonlight-ios).

## Features

* Streams Steam Big Picture and all of your games from your PC to your ChromeOS system
* Keyboard and mouse support
* Hardware-accelerated video decoding
* Full support for Xbox controllers and PlayStation controllers, and some other HID gamepads
* Use mDNS to scan for compatible GeForce Experience (GFE) machines on the network

## Features to come
* Gamepad mapping
* Improved UI
* Better error handling

## Installation
* Download [GeForce Experience](http://www.geforce.com/geforce-experience) and install on your GameStream-compatible PC
* Install the [latest release](https://github.com/moonlight-stream/moonlight-chrome/releases)

## Requirements
* ChromeOS
* [GameStream-compatible](http://shield.nvidia.com/play-pc-games/) computer with GTX 600+ series desktop or mobile GPU (for the PC from which you're streaming)
* High-end wireless router (802.11n dual-band recommended) or wired network
* Hardware acceleration enabled under `chrome://settings/system`
* For Linux users, ensure your Chrome/Chromium package was built with NaCl support. Google's official packages are, but your distro's packages may not be.

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

## Streaming
Simply type the hostname or IP into the textbox, pair, choose an app to run, then begin streaming.  Once paired, the host will be remembered in a dropdown menu.  To exit a stream, press Ctrl+Alt+Shift+Q. To remove focus from the stream, press Ctrl+Alt+Shift.

## Contribute

This project is being actively developed at [XDA Developers](http://forum.xda-developers.com/showthread.php?t=2505510)

1. Fork us
2. Write code
3. Send Pull Requests

Check out our [website](http://moonlight-stream.com) for project links and information.
