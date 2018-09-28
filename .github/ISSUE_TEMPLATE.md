# Read before posting an issue
If you have an issue, please consider the following before:

- Have you tried __updating__:
  - Your operating system
  - Geforce Experience (mention if in beta)
  - Chrome to the latest version
  - The Moonlight client
- Have you tried __pinging__ your host from the client?
- If streaming __over the internet__:
  - Have you followed the [guide](https://github.com/moonlight-stream/moonlight-docs/wiki/Setup-Guide)?
  - Have you opened all ports to they correct protocols (udp or tcp)
- Have you enabled __hardware acceleration__?
  - Check under `chrome://settings/system` to enable it
  - Check under `chrome://flags/#disable-accelerated-video-decode` for video hardware acceleration
  - Check under `chrome://gpu` for:
    - Video Decode: "Hardware accelerated"
    - WebGL: "Hardware accelerated"
    - WebGL2: "Hardware accelerated"
- Have you __enabled NaCL__?
  - Check under `chrome://flags/#enable-nacl` to enable it
  - Are you running Linux? if so, install Chrome from official ppa

If you still have problems, post them in the issues section with info, logs and screenshots if possible
