# 3D Setup Visualizer

A web app for drawing hardware bench setups in 3D: put boards on a bench, connect their pins with jumper cables, and let the app check the wiring. It runs on your own computer, and other people on the same network can open it in a browser. It needs no internet connection once it is installed.

## What it does

- **Parts library.** Breadboards (full, half, mini), Arduino Uno R3, Nano and Mega 2560, Raspberry Pi 4 Model B, STM32 Blue Pill, STM32F4 Discovery, and FTDI FT232RL and CH340G USB-serial adapters ship with the app, with their pins already named.
- **SDRs, RF parts and coax cables.** SDRs (RTL-SDR, HackRF One and six USRPs), instruments, amplifier and switch modules, attenuators, filters, splitters and antennas ship with the app. A cable drawn between two RF ports is a coax cable with the right connector on each end.
- **Your own hardware.** Upload a STEP, STL, OBJ or GLB file. Check its size against an Arduino Uno and a ruler, lay it flat, then mark where its pins are: one by one, as a header strip, or from a CSV or JSON list.
- **Setups.** Drag parts onto the bench, move and rotate them, and draw cables from pin to pin. Boards such as the Nano plug into a breadboard and connect to its rows.
- **Wiring checks.** The app warns about power shorted to ground, 5 V tied to 3.3 V, 5 V reaching a 3.3 V-only pin, and boards with no ground or power connection, an RF port wired to an ordinary pin, and more than one cable on an RF port.
- **Exports.** Screenshot (PNG), wiring list and bill of materials (on screen, CSV, print), and a view-only link.
- **Saving.** Every change is saved automatically. Ctrl+Z and Ctrl+Y undo and redo.

## Install and start

You need [Node.js](https://nodejs.org) 20 or 22.

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

The terminal then prints two addresses:

- `http://localhost:4700` opens the app on the computer that runs it.
- `http://<your-ip>:4700` is the address for other people on your network. If they cannot connect, allow port 4700 through the computer's firewall.

`npm install` is the only step that uses the internet.

### Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4700` | Port the app listens on |
| `HOST` | `0.0.0.0` | Set to `127.0.0.1` to keep the app private to this computer |
| `DATA_DIR` | `./data` | Folder for the database and the uploaded models |

Everything you make is in the data folder: `app.db` (parts and setups) and `files/` (3D models and thumbnails). Copy that folder to back up or move your work.

### Docker

```bash
docker build -t setup-visualizer .
```

```bash
docker run -p 4700:4700 -v setup-visualizer-data:/app/data setup-visualizer
```

## Using it

### Add your own part

1. On the home page, choose **Upload 3D model** and drop a file.
2. Check the size. The model is shown beside an Arduino Uno and a 100 mm ruler. If it is the wrong size, change the unit. Use **Lay flat** and the turn buttons until it lies on the bench the way it does in real life.
3. Save. The pin editor opens.
4. Press **S**, click the first pin of a header row, then the last. The app fills in the pins at 2.54 mm pitch. Drag the white dots to resize the strip, or change the count, pitch and rows on the right. Name each pin and set its type in the table.
5. Press **P** to add single pins, such as a power connector.

A pin's type (5 V, ground, digital I/O and so on) is what the wiring checks use. The part's **logic voltage** says whether its signal pins are 5 V or 3.3 V. A single pin can be marked "3.3 V only" or "5 V tolerant".

To load many pins at once, use **Import** in the pin editor. CSV columns are `name, type, x, y, z`, with `gender`, `nx, ny, nz` and `limit` as optional extras. Positions are in millimetres from the centre of the model's base, with X to the right, Y to the back and Z up.

### Build a setup

1. Choose **New setup**.
2. Click a part on the left to place it, or drag it onto the bench.
3. Drag boards to move them. Press **R** to rotate the selected board.
4. Press **W**, click a pin, then click the pin to connect to. Power cables are red, ground cables black, and signal cables take the next colour of a palette. Press **Esc** to stop wiring.
5. Click a cable to change its colour or label. Drag the white dot on it to route it.
6. Problems appear under **Checks** on the right.

### RF parts and coax cables

The **SDR** and **RF** groups of the library hold:

| Group | Kind | Parts |
| --- | --- | --- |
| SDR | USB radios | RTL-SDR dongle, HackRF One, USRP B200, USRP B205mini-i |
| SDR | Networked radios | USRP N210, USRP X310, USRP X410, USRP X440 |
| RF | Instruments | NanoVNA, tinySA spectrum analyzer |
| RF | Amplifiers and switches | LNA module, power amplifier module, SPDT RF switch, mixer |
| RF | Passive parts | SMA attenuator, 50 Ω terminator, DC block, low-pass filter, bias tee, 2-way power splitter, directional coupler |
| RF | Antennas | Whip antenna (SMA), patch antenna (U.FL), GPS puck antenna |

The USRPs carry their RF ports and their timing connectors (reference, PPS, trigger, GPS antenna), so you can draw the 10 MHz and PPS cabling between units. The front ports of the X440 are MMPX; every other bundled SDR port is SMA.

The Ethernet, SFP+, QSFP28, PCIe, MIMO and GPIO connectors of the USRPs are drawn but take no cable, because the app has no network cable type yet. The USRPs have no power pins either: they run from their own supplies, and the app does not ask for a power connection.

RF ports are the gold dots in wire mode. Draw a cable between two of them the same way as a jumper wire, and it becomes a coax cable:

- It takes the mating connector for each port. A cable between an SMA jack and a BNC jack is listed as "BNC male to SMA male".
- The wiring list and the bill of materials name it by its two ends and the standard length that reaches.
- The coax shield counts as a common ground between the two parts.

Parts are joined by cables only. An attenuator or an antenna does not screw straight onto a port yet, so it sits on the bench with a short coax cable to the port.

The app reports two RF mistakes: a cable from an RF port to an ordinary pin, and two cables on one RF port. It does not check power levels, port direction or unterminated ports.

To give your own hardware RF ports, set a pin's type to **RF port (coax)** in the pin editor, then choose its connector (SMA, BNC, N, U.FL or MMPX) and whether it is a plug or a jack. In a CSV pin list, use the type `RF` and the optional column `connector`.

### Keyboard shortcuts

| Key | Setup editor | Pin editor |
| --- | --- | --- |
| V | Select tool | Select tool |
| W | Wire tool | |
| S | | Add strip |
| P | | Add pin |
| R, Shift+R | Rotate the selected board | |
| Arrow keys | Nudge the selected board (Shift: further) | |
| Delete | Delete the selection | Delete the selection |
| Ctrl+D | Duplicate the selected board | |
| Ctrl+Z, Ctrl+Y | Undo, redo | Undo, redo |
| G | Grid snap on or off (hold Alt while dragging to move freely) | |
| L | Cable labels on or off | |
| Esc | Cancel, leave the tool, clear the selection | Same |

Mouse: drag the background to look around, right-drag to pan, scroll to zoom.

### Working with other people

There is no login. Anyone who can reach the address can open and change setups. Two people can have the same setup open, but changes are not shown live. If someone else saves while you are editing, the app tells you and asks which version to keep.

## About the bundled boards

The bundled boards, SDRs and RF parts are simplified models drawn by this app, not the manufacturers' 3D files.

- **Arduino, Raspberry Pi, STM32 and USB-adapter boards:** header positions follow the public board drawings. The header spacing of the STM32F4 Discovery is approximate.
- **SDR and RF parts:** sizes are approximate, and so is the position of each port on the USRP panels.

**Check pin and port names against the manufacturer's documentation before relying on them.** None of them has been verified against it.

To use a real 3D model for a bundled board, open it in the library, choose **Duplicate to edit**, then **Replace 3D model**. The pins are kept.

## Developing

```bash
npm run dev
```

This starts the server on port 4700 and the client on port 5173 with live reload. Open `http://localhost:5173`.

```bash
npm test
```

```bash
npm run typecheck
```

- `shared/` holds the data model and all the wiring logic (strips, breadboards, nets, checks, exports). It has no dependencies and is covered by unit tests.
- `server/` is a small Fastify server that stores parts and setups in SQLite and serves the built client.
- `client/` is the React and three.js app.

Licences of the bundled libraries are listed in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
