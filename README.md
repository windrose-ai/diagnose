# Windrose-CAN

A read-only CAN / CAN FD diagnostic bench tool from Windrose.

Windrose-CAN connects to a vehicle CAN bus to **read** — vehicle speed, fault
codes, VIN, software and component identifiers — plots signals, and decodes a
DBC that you supply. It is deliberately listen-and-ask only.

## Design principles

- **Read-only / questions only.** Outbound traffic is limited to diagnostic
  *requests* — standard OBD (services 01 / 03 / 09), UDS read services (22 read
  data, 19 read DTC), and read-only J1939 requests. The transmit layer
  **refuses** anything that would change the vehicle: clear-codes, reset, write,
  control, periodic transmission, and address-claim frames are all rejected.
- **Your data stays local.** Plots, the DBC you choose, and J1939 decoding are
  computed on your own machine. Nothing is uploaded anywhere.
- **Bring your own DBC.** No DBC and no vehicle signal database is bundled.
  Point the tool at a `.dbc` file you own (`dbc set FILE.dbc`).
- Recording is listen-only. CAN XL is not implemented.

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

Hardware: tested with PCAN-USB FD (note: PCAN-USB FD does not speak CAN XL).

## Scope and safety

This tool never writes to or commands the vehicle; it only listens and asks
standard diagnostic questions. Use it on buses and vehicles you are authorized
to access.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
