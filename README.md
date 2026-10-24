# Windrose Diagnose

**You can ask. You cannot change.** Windrose Diagnose listens, and it may ask a read-only diagnostic question. It never writes to the vehicle.

The words are one language at a time, the same list as [windrose.ai](https://www.windrose.ai): `en`, `zh`, `zh_tw`, `fr`, `de`, `es`, `it`, `pt`, `nl`, `pl`, `sv`, `da`, `no`, `fi`, `is`, `tr`, `ar`, `he`, `ja`, `ko`. Set `WR_LANG` or pass `--lang`. An empty or unknown tag stays English. `zh-CN` is simplified Chinese and `zh-TW` is traditional.

Windrose Diagnose connects to a vehicle CAN bus to **read** — vehicle speed, fault
codes, VIN, software and component identifiers — plots signals, and decodes a
DBC that you supply.

## Design principles

- **A full Diagnose page.** `connect --page diagnose.html` writes one page in the
  active language: what to read, the adapter in plain language, the recommended
  diagnostic bus, then the asks and the decoded replies. Choosing a read on
  that page only highlights the row. It does not transmit.
- **Plug in a dongle.** On open, Diagnose lists what is connected in plain language
  (vendor and product when known, otherwise “unknown USB-CAN, VID:PID …”).
  You do not choose Peak or ZLG. `connect` asks read-only UDS at classic 500 kbit/s
  on `0x18DBFFF1` when a dongle is ready. If the bus is talking, the traffic is
  named with the public J1939 list and standard UDS response names.
  A missing driver, the wrong bitrate, a dead diagnostic bus, and a write are each
  explained in a sentence. Recording stays listen-only.
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
| `canbench_i18n.json` | The same twenty languages as the website. English is the fallback. |
| `canbench.js` | The same bench logic for a browser read page (UMD module), including that catalog. |
| `canbench_test.py`, `canbench_test.js` | Unit tests. |

## Quick start

```sh
python3 canbench.py            # what is plugged in
python3 canbench.py connect --page diagnose.html
WR_LANG=zh python3 canbench.py # same screen, simplified Chinese
python3 canbench_test.py       # run the tests
```

Hardware: plug in a USB-CAN dongle. Peak, ZLG, SocketCAN, and other USB-CAN devices are recognized from the system device list. PCAN-USB FD does not speak CAN XL.

## Scope and safety

You can ask. You cannot change. This tool asks read-only diagnostic questions on the diagnostic
CAN and never writes, flashes, unlocks, or commands the vehicle. Use it on
buses and vehicles you are authorized to access.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
