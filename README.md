# Windrose Diagnose

**可以问，不能改。** Windrose Diagnose listens, and it may ask a read-only diagnostic question. It never writes to the vehicle.

Windrose Diagnose connects to a vehicle CAN bus to **read** — vehicle speed, fault
codes, VIN, software and component identifiers — plots signals, and decodes a
DBC that you supply.

## Design principles

- **可以问，不能改。** A CAN adapter (Peak, ZLG, …) may transmit on the diagnostic CAN only:
  OBD pins 6 and 14, classic CAN at 500 kbit/s, via TGW / GWCANFD9.
  `send --uds --adapter peak`, `--adapter zlg`, or `--adapter socketcan --iface can0`.
  PCAN-Basic also covers other devices that ship that library. SocketCAN covers
  USB-CAN boxes the OS exposes as a can interface, including Peak and ZLG kernel
  drivers and other vendor adapters. Recording stays listen-only.
- **WH13 / E700 UDS ids (29-bit).** `send --uds` asks on functional `0x18DBFFF1`
  (tester source `0xF1`). `send --uds --target xx` asks on physical `0x18DAxxF1`.
  Responses come back on `0x18DAF1xx` and are never transmitted. 11-bit `0x7DF`
  is not the WH13 UDS address.
- **Allowed transmit (ask).** The allowlist is explicit:
  - UDS `$10` DiagnosticSessionControl, default (`01`) or extended (`03`) only, so a later read can run
  - UDS `$3E` TesterPresent, sub-function `00`, to keep that read session
  - UDS `$22` ReadDataByIdentifier
  - UDS `$19` ReadDTCInformation
  - Classic J1979 Mode `01` and `09` requests, already supported, plus the other read-only modes already in the tool (`02`, `03`, `05`, `06`, `07`, `0A`), on legacy ids `0x7DF`, `0x7E0`–`0x7E7`, and `0x18DB33F1` only
  - Read-only J1939 requests (not DM3 / DM11) and the ISO-TP flow control that finishes a multi-frame read
- **Still refused (hard block).** The transmit layer rejects anything that would change the vehicle, including:
  - Programming session (`$10` sub-function `02`) and flash / transfer (`$34`, `$35`, `$36`, `$37`, `$38`)
  - WriteDataByIdentifier (`$2E`), input/output control (`$2F`), routine control (`$31`)
  - SecurityAccess (`$27`) and authentication (`$29`)
  - Clear, reset, torque, lock, or limit commands
  - Periodic transmission, address-claim frames, and any id on the powertrain backbone
- **Your data stays local.** Plots, the DBC you choose, and J1939 decoding are
  computed on your own machine. Nothing is uploaded anywhere.
- **Bring your own DBC.** No DBC and no vehicle signal database is bundled.
  Point the tool at a `.dbc` file you own (`dbc set FILE.dbc`).
- CAN XL is not implemented.

## Components

| File | What it is |
|---|---|
| `canbench.py` | Command-line tool. **Python 3.9 standard library only** — no third-party packages. |
| `canbench.js` | The same bench logic for a browser read page (UMD module). |
| `canbench_test.py`, `canbench_test.js` | Unit tests. |

## Quick start

```sh
python3 canbench.py            # run the CLI
python3 canbench_test.py       # run the tests
```

Hardware: any Classic CAN adapter at about 500 kbit/s. Peak (PCAN-Basic), ZLG (ControlCAN), and SocketCAN are built in. PCAN-USB FD does not speak CAN XL.

## Scope and safety

可以问，不能改。This tool asks read-only diagnostic questions on the diagnostic
CAN and never writes, flashes, unlocks, or commands the vehicle. Use it on
buses and vehicles you are authorized to access.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
