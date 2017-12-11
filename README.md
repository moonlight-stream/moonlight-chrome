# Moonlight Native

[Moonlight Native](http://moonlight-stream.com) is an open source implementation of NVIDIA's GameStream, as used by the NVIDIA Shield, but built to run natively.

Moonlight allows you to stream your full collection of games from your powerful desktop to another PC or laptop running Windows, Mac OS X, Linux, or Chrome OS.

Moonlight also has mobile versions for [Android](https://github.com/moonlight-stream/moonlight-android) and  [iOS](https://github.com/moonlight-stream/moonlight-ios).

## Features

* Streams Steam Big Picture and all of your games from your PC to your computer
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
* Install the [latest release](https://github.com/moonlight-stream/moonlight-native/releases)

## Requirements
* [GameStream-compatible](http://shield.nvidia.com/play-pc-games/) computer with GTX 600+ series desktop or mobile GPU (for the PC from which you're streaming)
* High-end wireless router (802.11n dual-band recommended) or wired network

## Building
1. Install the Chrome Native Client SDK, download the current Pepper SDK, and ensure a recent version `npm` is installed
2. Run `npm install nwjs-builder-phoenix --save-dev` from within `moonlight-native/`
3. Set the `NACL_SDK_ROOT` environment variable to your Pepper SDK folder. If you need more detailed instructions, see [here](https://github.com/google/pepper.js/wiki/Getting-Started)
4. Run `git submodule update --init --recursive` from within `moonlight-native/`
5. Run `make` from within `moonlight-native/`
6. Run `npm run dist`

## Testing
1. Open the associated build in `dist/` for your target system

## Streaming
Simply type the hostname or IP into the textbox, pair, choose an app to run, then begin streaming.  Once paired, the host will be remembered in the main menu.  To exit a stream, press Ctrl+Alt+Shift+Q. To remove focus from the stream, press Ctrl+Alt+Shift.

## Contribute

This project is being actively developed at [XDA Developers](http://forum.xda-developers.com/showthread.php?t=2505510)

1. Fork us
2. Write code
3. Send Pull Requests

Check out our [website](http://moonlight-stream.com) for project links and information.
