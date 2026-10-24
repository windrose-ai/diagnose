# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Windrose
# Local CAN bench for Windrose AI. Python 3.9 standard library only.
# Plot, a DBC you choose, and J1939 stay on this computer. Nothing here is sent
# to the assistant. send() may ask a read-only diagnostic question. Clear,
# write, flash, security access, and control frames are refused.
# Recording stays listen-only. The ask path is a CAN adapter (Peak, ZLG, …):
# PCAN-Basic, ZLG ControlCAN, or SocketCAN, classic ~500 kbit/s.
# PCAN-USB FD does not speak CAN XL.
# CANBENCH_REV = "2026-10-24.2"

from __future__ import annotations

import ctypes
import html
import os
import re
import socket
import struct
import sys
import time

CANBENCH_REV = "2026-10-24.3"
ADAPTER_LABEL = "CAN adapter (Peak, ZLG, …)"
CH1 = 0x51  # PCAN_USBBUS1
LISTEN_ONLY = 0x08
OK = 0x00000
T_EXT, T_FD, T_BRS = 0x02, 0x04, 0x08
FDLEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64]
WINDROSE_FD = b"f_clock_mhz=80,nom_brp=2,nom_tseg1=63,nom_tseg2=16,nom_sjw=16,data_brp=2,data_tseg1=15,data_tseg2=4,data_sjw=4"
BTR = {1000000: 0x0014, 500000: 0x001C, 250000: 0x011C, 125000: 0x031C}
TP_CM, TP_DT, DM1 = 0xEC00, 0xEB00, 0xFECA
# A few public parameter-group names. This is not the SAE catalog.
PGN_NAMES = {
    9472: "Multi-PG",
    19712: "FD.TP.CM",
    19968: "FD.TP.DT",
    59904: "Request",
    60160: "TP.DT",
    60416: "TP.CM",
    60928: "Address Claim",
    61444: "EEC1",
    65217: "HOURS",
    65226: "DM1",
    65227: "DM2",
    65228: "DM3",
    65229: "DM4",
    65230: "DM5",
    65231: "DM6",
    65235: "DM11",
    65236: "DM12",
    65242: "Software ID",
    65259: "Component ID",
    65260: "VIN",
    65262: "ET1",
    65265: "CCVS1",
}
# PGN 59904 can ask or clear. Only these reads are sent. DM3 and DM11 clear faults.
READ_REQUESTS = {
    "dm1": 65226,
    "dm2": 65227,
    "dm4": 65229,
    "dm5": 65230,
    "dm6": 65231,
    "dm12": 65236,
    "vin": 65260,
    "component": 65259,
    "software": 65242,
    "address": 60928,
}
READ_REQUEST_SET = frozenset(READ_REQUESTS.values())
TOOL_SA = 0xFE
MULTI_PG = 0x2500
FD_TP_CM = 0x4D00
FD_TP_DT = 0x4E00
# Diagnostic interface only: OBD pins 6 and 14, classic CAN, via TGW / GWCANFD9.
# Not the powertrain backbone.
DIAGNOSTIC_BITRATE = 500000
# WH13 / E700 UDS is 29-bit. Functional broadcast, tester source 0xF1.
# Physical request is 0x18DAxxF1. Response 0x18DAF1xx is never transmitted.
WH13_FUNCTIONAL = 0x18DBFFF1
# J1979 legacy only. UDS asks are not sent on these ids.
J1979_FUNCTIONAL = 0x7DF
J1979_FUNCTIONAL_EXT = 0x18DB33F1
ASK_ONLY = "可以问，不能改"
BUS_NOTE = (
    "可以问，不能改。Asking only. Nothing on the truck is changed. "
    "CAN XL is not available on PCAN-USB FD."
)
UDS_BUS_NOTE = (
    "UDS asks go out on the diagnostic CAN only "
    "(OBD pins 6/14, classic 500 kbit/s via TGW / GWCANFD9, "
    "29-bit functional 0x18DBFFF1 or physical 0x18DAxxF1)."
)
# Transmit allowlist. A service id that is not listed is refused.
# Keep these sets in sync with canbench.js.
# $10 is listed, and only default (0x01) and extended (0x03) sub-functions pass.
# Programming session (0x02) is the flash entry and is refused below.
UDS_ASK_SERVICES = frozenset((0x10, 0x19, 0x22, 0x3E))
# J1979 reads already supported, on 0x7DF / 0x7E0-0x7E7 / 0x18DB33F1 only.
# Mode 04 (clear) and mode 08 (control) are not in this set.
OBD_READ_SERVICES = frozenset((0x01, 0x02, 0x03, 0x05, 0x06, 0x07, 0x09, 0x0A))
# Hard block. Checked before the allowlist. No seed-key, flash, write, or control.
BLOCKED_SERVICES = frozenset((
    0x04,  # OBD clear DTCs
    0x08,  # OBD control of an onboard system
    0x11,  # ECUReset
    0x14,  # ClearDiagnosticInformation
    0x27,  # SecurityAccess
    0x28,  # CommunicationControl
    0x29,  # Authentication
    0x2A,  # ReadDataByPeriodicIdentifier (arms periodic transmit)
    0x2C,  # DynamicallyDefineDataIdentifier
    0x2E,  # WriteDataByIdentifier
    0x2F,  # InputOutputControlByIdentifier
    0x31,  # RoutineControl
    0x34,  # RequestDownload
    0x35,  # RequestUpload
    0x36,  # TransferData
    0x37,  # RequestTransferExit
    0x38,  # RequestFileTransfer
    0x3D,  # WriteMemoryByAddress
    0x83,  # AccessTimingParameter
    0x84,  # SecuredDataTransmission
    0x85,  # ControlDTCSetting
    0x86,  # ResponseOnEvent
    0x87,  # LinkControl
))
NOT_A_QUESTION = (
    "可以问，不能改。This frame is not a read-only question. "
    "Clear, reset, write, flash, security access, and control are not sent."
)


class Fail(Exception):
    pass


def is_j1939_read_request(can_id, data, extended=False):
    """PGN 59904 from the tool address, and only a read on the whitelist."""
    data = bytes(data)
    n = can_id & 0x1FFFFFFF
    if not (extended or n > 0x7FF):
        return False
    if ((n >> 26) & 7) != 6 or ((n >> 25) & 1) or ((n >> 24) & 1):
        return False
    if ((n >> 16) & 0xFF) != 0xEA or ((n >> 8) & 0xFF) != 0xFF or (n & 0xFF) != TOOL_SA:
        return False
    if len(data) < 3:
        return False
    pgn = data[0] | (data[1] << 8) | (data[2] << 16)
    if pgn not in READ_REQUEST_SET:
        return False
    return all(b in (0xFF, 0x00) for b in data[3:])


def _id_ext(can_id, extended=False):
    n = can_id & 0x1FFFFFFF
    return n, bool(extended or n > 0x7FF)


def is_wh13_request(can_id, extended=False):
    """WH13 / E700 tester request. Functional 0x18DBFFF1 or physical 0x18DAxxF1.

    Response ids 0x18DAF1xx are not requests and are never transmitted.
    """
    n, extended = _id_ext(can_id, extended)
    if not extended:
        return False
    if n == WH13_FUNCTIONAL:
        return True
    return (n & 0xFFFF00FF) == 0x18DA00F1 and ((n >> 8) & 0xFF) != 0xF1


def is_j1979_request(can_id, extended=False):
    """Passenger-car / legislated OBD request ids. Not the WH13 UDS address."""
    n, extended = _id_ext(can_id, extended)
    if not extended:
        return n == J1979_FUNCTIONAL or 0x7E0 <= n <= 0x7E7
    return n == J1979_FUNCTIONAL_EXT


def is_diagnostic_address(can_id, extended=False):
    """Tester request ids on the diagnostic interface. Not a powertrain backbone id."""
    return is_wh13_request(can_id, extended) or is_j1979_request(can_id, extended)


def service_is_read(payload):
    """True only for an allowlisted read. payload starts with the service id.

    $10 DiagnosticSessionControl passes for default (0x01) and extended (0x03)
    only, including the suppress-response bit. Programming session (0x02) does
    not. $3E TesterPresent passes for sub-function 0x00 only. $22 and $19 are
    reads. Everything in BLOCKED_SERVICES is refused, including flash,
    WriteDataByIdentifier, IO control, routine control, and SecurityAccess.
    """
    if not payload:
        return False
    sid = payload[0]
    allowed = sid in UDS_ASK_SERVICES or sid in OBD_READ_SERVICES
    if sid in BLOCKED_SERVICES or not allowed:
        return False
    if sid == 0x10:
        if len(payload) != 2:
            return False
        return (payload[1] & 0x7F) in (0x01, 0x03)
    if sid == 0x3E:
        if len(payload) != 2:
            return False
        return (payload[1] & 0x7F) == 0x00
    if sid == 0x22:
        return len(payload) >= 3 and ((len(payload) - 1) % 2) == 0
    if sid == 0x19:
        return len(payload) >= 2 and (payload[1] & 0x7F) != 0
    return sid in OBD_READ_SERVICES


def is_inquiry(can_id, data, extended=False):
    """True for a diagnostic question or the flow-control that finishes a read.

    UDS asks ($10, $19, $22, $3E) are WH13 29-bit only. J1979 reads stay on
    0x7DF, 0x7E0-0x7E7, and 0x18DB33F1.
    """
    data = bytes(data)
    if is_j1939_read_request(can_id, data, extended):
        return True
    if len(data) < 2:
        return False
    pci = data[0]
    if pci == 0x30:
        if not is_diagnostic_address(can_id, extended):
            return False
        return len(data) >= 3 and data[1] == 0x00 and data[2] == 0x00 and not any(data[3:])
    if pci < 1 or pci > 7 or len(data) < 1 + pci:
        return False
    payload = data[1:1 + pci]
    if not service_is_read(payload):
        return False
    if payload[0] in UDS_ASK_SERVICES:
        return is_wh13_request(can_id, extended)
    return is_j1979_request(can_id, extended)


def j1939_request_pgn(name):
    """Whitelist lookup. DM3 and DM11 are rejected before a number is accepted."""
    if isinstance(name, int):
        pgn = name
        key = ""
    else:
        key = str(name).strip().lower()
        if key in ("dm3", "dm11"):
            raise Fail("DM3 and DM11 clear faults. They are not sent.")
        if key in READ_REQUESTS:
            return READ_REQUESTS[key]
        try:
            pgn = int(key, 0) if key.startswith("0x") else int(key)
        except ValueError:
            raise Fail("Unknown J1939 read: %s" % name)
    if pgn in (65228, 65235) or pgn not in READ_REQUEST_SET:
        raise Fail("That parameter group is not a read-only question.")
    return pgn


def j1939_request_frame(name):
    """One global request, tool source address 0xFE. Not an address claim."""
    pgn = j1939_request_pgn(name)
    data = bytes((pgn & 0xFF, (pgn >> 8) & 0xFF, (pgn >> 16) & 0xFF)) + b"\xff" * 5
    frame = (0x18EAFFFE, data, True)
    if not is_j1939_read_request(frame[0], frame[1], frame[2]):
        raise Fail(NOT_A_QUESTION)
    return frame


def _pad8(body):
    body = bytes(body)
    if len(body) > 8:
        raise Fail("A read request has to fit in one classic CAN frame.")
    return body + bytes(8 - len(body))


def standard_questions():
    """The same questions the read page asks: supported PIDs, speed, faults, VIN."""
    bodies = [bytes((0x02, 0x01, pid)) for pid in (0x00, 0x20, 0x40, 0x0D, 0x0C, 0x05, 0x04, 0x0F, 0x11, 0x2F, 0x42, 0x5C, 0x5E, 0x1F, 0x01)]
    bodies.append(bytes((0x01, 0x03)))
    bodies.append(bytes((0x02, 0x09, 0x02)))
    frames = []
    for body in bodies:
        pad = _pad8(body)
        frames.append((J1979_FUNCTIONAL, pad, False))
        frames.append((J1979_FUNCTIONAL_EXT, pad, True))
    return frames


def wh13_request_id(target=None):
    """Functional 0x18DBFFF1, or physical 0x18DAxxF1 when target is an ECU byte."""
    if target is None:
        return WH13_FUNCTIONAL
    if isinstance(target, str):
        target = _parse_target(target)
    if not isinstance(target, int) or isinstance(target, bool) or not 0 <= target <= 0xFF or target == 0xF1:
        raise Fail("UDS physical target is one byte other than the tester address 0xF1.")
    return 0x18DA00F1 | (target << 8)


def _parse_target(text):
    text = str(text).strip().lower()
    if text.startswith("0x"):
        text = text[2:]
    try:
        target = int(text, 16)
    except ValueError:
        raise Fail("UDS --target is one hex byte, for physical id 0x18DAxxF1.")
    if not 0 <= target <= 0xFF or target == 0xF1:
        raise Fail("UDS --target is one byte other than the tester address 0xF1.")
    return target


def uds_read_frames(session="extended", target=None):
    """One read-only UDS poll on the WH13 29-bit diagnostic id.

    Default id is functional 0x18DBFFF1. Pass target to use physical
    0x18DAxxF1. Order: session (default or extended), TesterPresent, VIN,
    then stored DTCs. No programming session, no write, no security access.
    """
    if session == "default":
        sub = 0x01
    elif session == "extended":
        sub = 0x03
    else:
        raise Fail("UDS session must be default or extended. Programming is not a read.")
    can_id = wh13_request_id(target)
    bodies = [
        bytes((0x02, 0x10, sub)),
        bytes((0x02, 0x3E, 0x00)),
        bytes((0x03, 0x22, 0xF1, 0x90)),
        bytes((0x03, 0x19, 0x02, 0xFF)),
    ]
    frames = []
    for body in bodies:
        frame = (can_id, _pad8(body), True)
        if not is_inquiry(frame[0], frame[1], frame[2]):
            raise Fail(NOT_A_QUESTION)
        frames.append(frame)
    return frames


def _uds_ask_frame(data):
    data = bytes(data)
    if len(data) < 2:
        return False
    pci = data[0]
    if pci < 1 or pci > 7 or len(data) < 1 + pci:
        return False
    return data[1] in UDS_ASK_SERVICES


def pgn_parts(can_id):
    """29-bit J1939 id -> pgn, source, destination or None, priority. PDU1 drops PS."""
    n = can_id & 0x1FFFFFFF
    pri = (n >> 26) & 7
    edp = (n >> 25) & 1
    dp = (n >> 24) & 1
    pf = (n >> 16) & 0xFF
    ps = (n >> 8) & 0xFF
    sa = n & 0xFF
    if pf < 240:
        pgn = (edp << 17) | (dp << 16) | (pf << 8)
        da = ps
    else:
        pgn = (edp << 17) | (dp << 16) | (pf << 8) | ps
        da = None
    return pgn, sa, da, pri


def _bit(data, bit):
    if bit < 0:
        return 0
    i = bit >> 3
    if i >= len(data):
        return 0
    return 1 if (data[i] & (1 << (bit & 7))) else 0


def extract_raw(data, start, length, intel):
    if length <= 0 or length > 32:
        raise Fail("signal length must be 1..32 bits")
    val = 0
    if intel:
        for i in range(length):
            if _bit(data, start + i):
                val |= 1 << i
    else:
        bit = start
        for i in range(length):
            if _bit(data, bit):
                val |= 1 << (length - 1 - i)
            if i + 1 == length:
                break
            if (bit % 8) == 0:
                bit += 15
            else:
                bit -= 1
    return val


def _set_bit(buf, bit, on):
    i = bit >> 3
    if i >= len(buf) or bit < 0:
        return
    mask = 1 << (bit & 7)
    if on:
        buf[i] |= mask
    else:
        buf[i] &= ~mask


def insert_raw(buf, start, length, intel, raw):
    raw &= (1 << length) - 1
    if intel:
        for i in range(length):
            _set_bit(buf, start + i, (raw >> i) & 1)
    else:
        bit = start
        for i in range(length):
            _set_bit(buf, bit, (raw >> (length - 1 - i)) & 1)
            if i + 1 == length:
                break
            if (bit % 8) == 0:
                bit += 15
            else:
                bit -= 1


def physical(raw, length, signed, factor, offset):
    if signed and raw >= (1 << (length - 1)):
        raw -= 1 << length
    return raw * factor + offset


def raw_from_physical(value, length, signed, factor, offset):
    if not factor:
        raise Fail("signal factor is 0")
    n = int(round((float(value) - offset) / factor))
    if signed and n < 0:
        n += 1 << length
    return n & ((1 << length) - 1)


_BO = re.compile(r"^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+")
_SG = re.compile(
    r"^SG_\s+(\w+)(?:\s+(M|m\d+))?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*(?:\[[^\]]*\])?\s*\"([^\"]*)\""
)


def load_dbc(text):
    """Subset of Vector DBC. Multiplexed signals (mN) are skipped, not guessed."""
    messages = {}
    cur = None
    for line in text.splitlines():
        s = line.strip()
        m = _BO.match(s)
        if m:
            full = int(m.group(1))
            cur = {
                "id": full & 0x1FFFFFFF,
                "ext": full > 0x7FF,
                "name": m.group(2),
                "size": int(m.group(3)),
                "signals": [],
            }
            messages[cur["id"]] = cur
            continue
        m = _SG.match(s)
        if m and cur is not None:
            mux = m.group(2) or ""
            if mux.startswith("m"):
                continue
            cur["signals"].append({
                "name": m.group(1),
                "mux": mux,
                "start": int(m.group(3)),
                "length": int(m.group(4)),
                "intel": m.group(5) == "1",
                "signed": m.group(6) == "-",
                "factor": float(m.group(7)),
                "offset": float(m.group(8)),
                "unit": m.group(9),
            })
    return {"messages": messages}


def signal_value(data, sig):
    raw = extract_raw(data, sig["start"], sig["length"], sig["intel"])
    return physical(raw, sig["length"], sig["signed"], sig["factor"], sig["offset"])


def decode_frame(frame, dbc):
    msg = dbc["messages"].get(frame["id"] & 0x1FFFFFFF)
    if not msg:
        return []
    out = []
    for sig in msg["signals"]:
        try:
            val = signal_value(frame["data"], sig)
        except Fail:
            continue
        out.append({
            "t": frame["t"],
            "message": msg["name"],
            "id": msg["id"],
            "signal": sig["name"],
            "value": val,
            "unit": sig["unit"],
        })
    return out


def decode(frames, dbc):
    rows = []
    for fr in frames:
        rows.extend(decode_frame(fr, dbc))
    return rows


def encode_signals(dbc, assigns):
    """assigns: list of 'Message.Signal=physical'. One CAN frame, zeros elsewhere."""
    msg = None
    buf = None
    ext = False
    can_id = None
    for item in assigns:
        if "=" not in item or "." not in item.split("=", 1)[0]:
            raise Fail("symbol must look like Message.Signal=12.5")
        left, val_s = item.split("=", 1)
        mname, sname = left.split(".", 1)
        found = None
        for m in dbc["messages"].values():
            if m["name"] == mname:
                for sig in m["signals"]:
                    if sig["name"] == sname:
                        found = (m, sig)
        if not found:
            raise Fail("symbol not in the DBC: %s" % left)
        m, sig = found
        if msg is None:
            msg = m
            buf = bytearray(max(8, m["size"]))
            can_id = m["id"]
            ext = m["ext"]
        elif m["id"] != msg["id"]:
            raise Fail("one send can fill only one message")
        raw = raw_from_physical(val_s.strip(), sig["length"], sig["signed"], sig["factor"], sig["offset"])
        insert_raw(buf, sig["start"], sig["length"], sig["intel"], raw)
    if buf is None:
        raise Fail("no symbol")
    return can_id, bytes(buf[: msg["size"]]), ext


_CLASSIC = re.compile(
    r"^\s*([0-9]+(?:\.[0-9]+)?)\s+\d+\s+([0-9A-Fa-f]+)(x)?\s+\S+\s+[dDrR]\s+[0-9A-Fa-f]+\s*(.*?)\s*$"
)
_CANFD = re.compile(
    r"^\s*([0-9]+(?:\.[0-9]+)?)\s+CANFD\s+\d+\s+\S+\s+([0-9A-Fa-f]+)\s+\S*\s+\d+\s+\d+\s+[0-9A-Fa-f]+\s+\d+\s+((?:[0-9A-Fa-f]{2}\s*)+)"
)
_CANDUMP = re.compile(
    r"^\s*(?:\(([0-9.]+)\)\s+)?\S+\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)\s*$"
)


def _hex_bytes(text):
    out = []
    for tok in text.replace(",", " ").split():
        if re.fullmatch(r"[0-9A-Fa-f]{2}", tok):
            out.append(int(tok, 16))
    return bytes(out)


def load_asc(text):
    frames = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s[0] in ";#" or s.startswith(("date ", "base ", "internal ", "Begin", "End", "Start", "//")):
            continue
        m = _CANFD.match(line)
        if m:
            ident = int(m.group(2), 16) & 0x1FFFFFFF
            frames.append({
                "t": float(m.group(1)),
                "id": ident,
                "ext": ident > 0x7FF,
                "fd": True,
                "data": _hex_bytes(m.group(3)),
            })
            continue
        m = _CLASSIC.match(line)
        if m:
            frames.append({
                "t": float(m.group(1)),
                "id": int(m.group(2), 16),
                "ext": bool(m.group(3)),
                "data": _hex_bytes(m.group(4)),
            })
            continue
        m = _CANDUMP.match(s)
        if m and m.group(1):
            ident = m.group(2)
            frames.append({
                "t": float(m.group(1)),
                "id": int(ident, 16),
                "ext": len(ident) > 3,
                "data": bytes.fromhex(m.group(3)) if m.group(3) else b"",
            })
    return frames


def _changed_series(rows):
    buckets = {}
    for row in rows:
        key = (row["message"], row["signal"], row["unit"])
        buckets.setdefault(key, []).append(row)
    series = []
    for key, pts in buckets.items():
        if len(pts) < 2:
            continue
        vals = [p["value"] for p in pts]
        if min(vals) == max(vals):
            continue
        step = max(1, len(pts) // 300)
        series.append((key, pts[::step]))
        if len(series) >= 12:
            break
    return series


def plot_html(frames, dbc, title="CAN plot"):
    series = _changed_series(decode(frames, dbc))
    parts = [
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>",
        html.escape(title),
        "</title><style>",
        "body{background:#f6f5f2;color:#1c1c1c;font:14px -apple-system,BlinkMacSystemFont,sans-serif;margin:24px}",
        "svg{background:#fff;border:1px solid #ddd;display:block;margin:8px 0 20px}",
        "p.policy{font-weight:600;color:#1c1c1c}",
        "p.note{color:#555}",
        "</style></head><body><h1>",
        html.escape(title),
        "</h1><p class=\"policy\">可以问，不能改</p>",
        "<p class=\"note\">",
        "Plug in a USB-CAN dongle. You do not need to know the brand. ",
        ADAPTER_LABEL,
        ". Local file. It is not sent to the assistant. ",
        "Read-only questions only; the vehicle is not changed.</p>",
    ]
    if not series:
        parts.append("<p>No signal in this recording changed value.</p>")
    width, height, pad = 720, 140, 28
    for (message, signal, unit), pts in series:
        t0 = pts[0]["t"]
        t1 = pts[-1]["t"]
        vals = [p["value"] for p in pts]
        lo, hi = min(vals), max(vals)
        span_t = (t1 - t0) or 1.0
        span_v = (hi - lo) or 1.0
        coords = []
        for p in pts:
            x = pad + (p["t"] - t0) / span_t * (width - pad * 2)
            y = height - pad - (p["value"] - lo) / span_v * (height - pad * 2)
            coords.append("%.1f,%.1f" % (x, y))
        label = "%s.%s" % (message, signal)
        if unit:
            label += " (%s)" % unit
        ymin = ("%.4g" % lo).rjust(12)
        ymax = ("%.4g" % hi).rjust(12)
        parts.append("<h2>%s</h2><p class=\"note\">min %s &nbsp; max %s</p>" % (
            html.escape(label), html.escape(ymin.strip()), html.escape(ymax.strip())))
        parts.append(
            "<svg viewBox=\"0 0 %d %d\" width=\"%d\" height=\"%d\" role=\"img\">" % (width, height, width, height)
        )
        parts.append("<polyline fill=\"none\" stroke=\"#1d4e89\" stroke-width=\"1.5\" points=\"%s\"/>" % " ".join(coords))
        parts.append("</svg>")
    parts.append("</body></html>")
    return "".join(parts)


def _dtcs(payload):
    found = []
    if len(payload) < 6:
        return found
    i = 2
    while i + 4 <= len(payload):
        chunk = payload[i:i + 4]
        i += 4
        if chunk == b"\x00\x00\x00\x00" or chunk == b"\xff\xff\xff\xff":
            continue
        cm = (chunk[3] >> 7) & 1
        oc = chunk[3] & 0x7F
        if cm:
            found.append({"cm": 1, "oc": oc, "raw": chunk.hex()})
            continue
        spn = chunk[0] | (chunk[1] << 8) | ((chunk[2] & 0xE0) << 3)
        fmi = chunk[2] & 0x1F
        found.append({"cm": 0, "spn": spn, "fmi": fmi, "oc": oc})
    return found


def _cpg_walk(data):
    """J1939-22 contained parameter groups. TOS 0 is padding and stops the walk.
    TF other than 0 means an assurance trailer whose size is not guessed here."""
    data = bytes(data)
    out = []
    i = 0
    while i + 4 <= len(data):
        b0 = data[i]
        tos = (b0 >> 5) & 7
        tf = (b0 >> 2) & 7
        if tos == 0:
            break
        pgn = ((b0 & 3) << 16) | (data[i + 1] << 8) | data[i + 2]
        length = data[i + 3]
        i += 4
        if length > 60 or i + length > len(data):
            break
        payload = data[i:i + length]
        i += length
        out.append((pgn, None if tf else payload, length, tf))
    return out


def _keep_dtc(pgn, payload, sa, rows):
    if pgn != DM1 or payload is None:
        return
    for dtc in _dtcs(payload):
        dtc["sa"] = sa
        rows.append(dtc)


def _absorb_cpgs(data, sa, counts, rows, notes):
    for pgn, payload, length, tf in _cpg_walk(data):
        counts[(pgn, sa, None)] = counts.get((pgn, sa, None), 0) + 1
        if tf:
            notes.append((pgn, length))
        else:
            _keep_dtc(pgn, payload, sa, rows)


def j1939_dtcs(frames):
    return _j1939_collect(frames)[0]


def _j1939_collect(frames):
    counts = {}
    dtc_rows = []
    notes = []
    pending = {}
    fd_jobs = {}
    rebuilt = 0
    for fr in frames:
        data = bytes(fr.get("data") or b"")
        can_id = fr["id"] & 0x1FFFFFFF
        ext = bool(fr.get("ext")) or can_id > 0x7FF
        fd = bool(fr.get("fd"))
        if not ext and fd and can_id <= 0xFF:
            _absorb_cpgs(data, can_id & 0xFF, counts, dtc_rows, notes)
            continue
        if not ext:
            continue
        pgn, sa, da, _pri = pgn_parts(can_id)
        if pgn == TP_CM and len(data) >= 8 and data[0] == 0x20:
            pending[sa] = {
                "size": data[1] | (data[2] << 8),
                "npk": data[3],
                "pgn": data[5] | (data[6] << 8) | (data[7] << 16),
                "got": {},
            }
            counts[(pgn, sa, da)] = counts.get((pgn, sa, da), 0) + 1
            continue
        if pgn == TP_DT and sa in pending and data:
            job = pending[sa]
            job["got"][data[0]] = data[1:8]
            if len(job["got"]) >= job["npk"] and job["npk"]:
                blob = b"".join(job["got"].get(n, b"") for n in range(1, job["npk"] + 1))[: job["size"]]
                rebuilt += 1
                _keep_dtc(job["pgn"], blob, sa, dtc_rows)
                counts[(job["pgn"], sa, None)] = counts.get((job["pgn"], sa, None), 0) + 1
                del pending[sa]
            counts[(pgn, sa, da)] = counts.get((pgn, sa, da), 0) + 1
            continue
        if pgn == MULTI_PG:
            counts[(pgn, sa, da)] = counts.get((pgn, sa, da), 0) + 1
            _absorb_cpgs(data, sa, counts, dtc_rows, notes)
            continue
        if pgn == FD_TP_CM:
            counts[(pgn, sa, da)] = counts.get((pgn, sa, da), 0) + 1
            if len(data) >= 12:
                session = (data[0] >> 4) & 0x0F
                ctrl = data[0] & 0x0F
                if ctrl == 15:
                    fd_jobs.pop((sa, session), None)
                elif ctrl in (0, 4):
                    size = data[1] | (data[2] << 8) | (data[3] << 16)
                    nseg = data[4] | (data[5] << 8) | (data[6] << 16)
                    carried = data[9] | (data[10] << 8) | (data[11] << 16)
                    if 0 < nseg <= 256 and size <= nseg * 60:
                        fd_jobs[(sa, session)] = {"size": size, "nseg": nseg, "pgn": carried, "got": {}}
            continue
        if pgn == FD_TP_DT:
            counts[(pgn, sa, da)] = counts.get((pgn, sa, da), 0) + 1
            if len(data) >= 4 and (data[0] & 0x0F) == 0:
                session = (data[0] >> 4) & 0x0F
                job = fd_jobs.get((sa, session))
                if job:
                    seg = data[1] | (data[2] << 8) | (data[3] << 16)
                    job["got"][seg] = data[4:4 + 60]
                    if job["nseg"] and all(n in job["got"] for n in range(1, job["nseg"] + 1)):
                        blob = b"".join(job["got"][n] for n in range(1, job["nseg"] + 1))[: job["size"]]
                        rebuilt += 1
                        _keep_dtc(job["pgn"], blob, sa, dtc_rows)
                        counts[(job["pgn"], sa, None)] = counts.get((job["pgn"], sa, None), 0) + 1
                        del fd_jobs[(sa, session)]
            continue
        counts[(pgn, sa, da)] = counts.get((pgn, sa, da), 0) + 1
        if pgn == DM1:
            _keep_dtc(pgn, data, sa, dtc_rows)
    return dtc_rows, counts, notes, rebuilt


def j1939_report(frames):
    dtc_rows, counts, notes, rebuilt = _j1939_collect(frames)
    lines = ["J1939 listen", "extended frames %d" % sum(1 for f in frames if f.get("ext")), "reassembled %d" % rebuilt]
    for (pgn, sa, da), n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0][0])):
        name = PGN_NAMES.get(pgn, "")
        dest = (" DA 0x%02X" % da) if da is not None else ""
        lines.append("PGN %d %s  SA 0x%02X%s  count %d" % (pgn, name, sa, dest, n))
    for pgn, length in notes:
        lines.append("C-PG PGN %d  len %d  assurance" % (pgn, length))
    if not dtc_rows:
        lines.append("DM1: no DTC in this recording")
    for dtc in dtc_rows:
        if dtc.get("cm"):
            lines.append("DM1 SA 0x%02X  conversion method 1  raw %s  OC %d" % (dtc["sa"], dtc["raw"], dtc["oc"]))
        else:
            lines.append("DM1 SA 0x%02X  SPN %d  FMI %d  OC %d" % (dtc["sa"], dtc["spn"], dtc["fmi"], dtc["oc"]))
    return "\n".join(lines) + "\n"


def _home():
    return os.path.join(os.path.expanduser("~"), ".windrose")


def dbc_path_file():
    return os.path.join(_home(), "user-dbc.path")


def set_dbc_path(path):
    path = os.path.abspath(path)
    if not os.path.isfile(path):
        raise Fail("DBC not found: %s" % path)
    os.makedirs(_home(), exist_ok=True)
    with open(dbc_path_file(), "w", encoding="utf-8") as f:
        f.write(path + "\n")
    return path


def saved_dbc_path():
    try:
        with open(dbc_path_file(), encoding="utf-8") as f:
            path = f.read().strip()
    except OSError:
        return ""
    return path if path and os.path.isfile(path) else ""


def resolve_dbc(explicit):
    path = explicit or saved_dbc_path()
    if not path:
        raise Fail("No DBC. Pass --dbc FILE, or: windrose-ai dbc set FILE")
    with open(path, encoding="utf-8", errors="replace") as f:
        return load_dbc(f.read()), path


def _len_to_dlc(n):
    for i, size in enumerate(FDLEN):
        if size >= n:
            return i
    return 15


class Msg(ctypes.Structure):
    _fields_ = [("ID", ctypes.c_uint32), ("MSGTYPE", ctypes.c_uint8), ("LEN", ctypes.c_uint8), ("DATA", ctypes.c_uint8 * 8)]


class Stamp(ctypes.Structure):
    _fields_ = [("millis", ctypes.c_uint32), ("millis_overflow", ctypes.c_uint16), ("micros", ctypes.c_uint16)]


class MsgFD(ctypes.Structure):
    _fields_ = [("ID", ctypes.c_uint32), ("MSGTYPE", ctypes.c_uint8), ("DLC", ctypes.c_uint8), ("DATA", ctypes.c_uint8 * 64)]


def load_peak(path):
    lib = ctypes.WinDLL(path) if os.name == "nt" else ctypes.CDLL(path)
    lib.CAN_Initialize.argtypes = [ctypes.c_uint16, ctypes.c_uint16, ctypes.c_uint8, ctypes.c_uint32, ctypes.c_uint16]
    lib.CAN_InitializeFD.argtypes = [ctypes.c_uint16, ctypes.c_char_p]
    lib.CAN_Uninitialize.argtypes = [ctypes.c_uint16]
    lib.CAN_Write.argtypes = [ctypes.c_uint16, ctypes.POINTER(Msg)]
    lib.CAN_WriteFD.argtypes = [ctypes.c_uint16, ctypes.POINTER(MsgFD)]
    lib.CAN_SetValue.argtypes = [ctypes.c_uint16, ctypes.c_uint8, ctypes.c_void_p, ctypes.c_uint32]
    lib.CAN_GetValue.argtypes = [ctypes.c_uint16, ctypes.c_uint8, ctypes.c_void_p, ctypes.c_uint32]
    for name in ("CAN_Initialize", "CAN_InitializeFD", "CAN_Uninitialize", "CAN_Write", "CAN_WriteFD", "CAN_SetValue", "CAN_GetValue"):
        getattr(lib, name).restype = ctypes.c_uint32
    if hasattr(lib, "CAN_Read"):
        lib.CAN_Read.argtypes = [ctypes.c_uint16, ctypes.POINTER(Msg), ctypes.POINTER(Stamp)]
        lib.CAN_Read.restype = ctypes.c_uint32
    return lib


def default_lib():
    for key in ("WR_PCBUSB", "PCAN_BASIC"):
        env = os.environ.get(key) or ""
        if env and os.path.isfile(env):
            return env
    names = [
        os.path.expanduser("~/.windrose/PCBUSB/libPCBUSB.0.13.dylib"),
        "/usr/local/lib/libPCBUSB.dylib",
        "/opt/homebrew/lib/libPCBUSB.dylib",
        r"C:\Windows\System32\PCANBasic.dll",
    ]
    for base in (os.environ.get("ProgramFiles", ""), os.environ.get("ProgramFiles(x86)", "")):
        if base:
            names.append(os.path.join(base, "PEAK-System", "PCAN-Basic API", "x64", "PCANBasic.dll"))
    for path in names:
        if path and os.path.isfile(path):
            return path
    return ""


def guard_transmit(bus, can_id, data, extended):
    """Shared ask-only check for every CAN adapter. Called before any write."""
    if not bus.transmitting:
        raise Fail("Call open_transmit() before send().")
    data = bytes(data)
    if not is_inquiry(can_id, data, extended):
        raise Fail(NOT_A_QUESTION)
    if _uds_ask_frame(data) and (not bus.classic or bus.bitrate != DIAGNOSTIC_BITRATE):
        raise Fail(UDS_BUS_NOTE)
    return data


class PeakBus:
    """PCAN-Basic adapter (Peak and other PCAN-Basic devices).

    open_listen records and does not transmit. open_transmit asks on the
    diagnostic interface. send() still refuses any frame that is not an
    allowlisted read.
    """

    name = "peak"

    def __init__(self, lib=None, lib_path=""):
        self.lib = lib
        self.lib_path = lib_path
        self.listening = False
        self.transmitting = False
        self.classic = False
        self.bitrate = 0

    def arm(self, word=""):
        """Kept so older callers can run. Transmit no longer waits on this word."""
        return None

    def open_listen(self, classic=False, bitrate=500000):
        self._open(classic, bitrate, listen=True)

    def open_transmit(self, classic=False, bitrate=500000):
        self._open(classic, bitrate, listen=False)

    def _ensure_lib(self):
        if self.lib is not None:
            return
        path = self.lib_path or default_lib()
        if not path:
            raise Fail(
                "%s: PCAN-Basic library not found. Set WR_PCBUSB, or use --adapter zlg "
                "or --adapter socketcan --iface can0." % ADAPTER_LABEL
            )
        self.lib = load_peak(path)

    def _open(self, classic, bitrate, listen):
        self._ensure_lib()
        flag = ctypes.c_uint32(1 if listen else 0)
        st = self.lib.CAN_SetValue(CH1, LISTEN_ONLY, ctypes.byref(flag), 4)
        if st != OK:
            raise Fail("Could not set listen-only to %d (0x%X)." % (1 if listen else 0, st))
        if classic:
            if bitrate not in BTR:
                raise Fail("bitrate must be 1000000, 500000, 250000 or 125000")
            st = self.lib.CAN_Initialize(CH1, BTR[bitrate], 0, 0, 0)
        else:
            st = self.lib.CAN_InitializeFD(CH1, WINDROSE_FD)
        if st != OK:
            raise Fail(
                "%s: could not open PCAN-Basic (0x%X). Close PCAN-View if it is open."
                % (ADAPTER_LABEL, st)
            )
        if listen:
            got = ctypes.c_uint32(0)
            if self.lib.CAN_GetValue(CH1, LISTEN_ONLY, ctypes.byref(got), 4) != OK or got.value != 1:
                self.lib.CAN_Uninitialize(CH1)
                raise Fail("The adapter did not confirm listen-only. Nothing was opened for transmit.")
        self.listening = listen
        self.transmitting = not listen
        self.classic = bool(classic)
        self.bitrate = bitrate

    def send(self, can_id, data, extended=False, fd=False, brs=False):
        data = guard_transmit(self, can_id, data, extended)
        self._ensure_lib()
        if fd or len(data) > 8:
            msg = MsgFD()
            msg.ID = can_id & (0x1FFFFFFF if extended else 0x7FF)
            msg.MSGTYPE = (T_EXT if extended else 0) | T_FD | (T_BRS if brs else 0)
            msg.DLC = _len_to_dlc(len(data))
            for i, b in enumerate(data[:64]):
                msg.DATA[i] = b
            st = self.lib.CAN_WriteFD(CH1, ctypes.byref(msg))
        else:
            msg = Msg()
            msg.ID = can_id & (0x1FFFFFFF if extended else 0x7FF)
            msg.MSGTYPE = T_EXT if extended else 0
            msg.LEN = len(data)
            for i, b in enumerate(data[:8]):
                msg.DATA[i] = b
            st = self.lib.CAN_Write(CH1, ctypes.byref(msg))
        if st != OK:
            raise Fail("CAN_Write failed (0x%X)." % st)

    def read_frames(self, seconds=0.25):
        """Drain frames already on the adapter. Empty means the bus was quiet."""
        if self.lib is None or not hasattr(self.lib, "CAN_Read"):
            return []
        end = time.monotonic() + seconds
        out = []
        while time.monotonic() < end and len(out) < 80:
            msg = Msg()
            stamp = Stamp()
            st = self.lib.CAN_Read(CH1, ctypes.byref(msg), ctypes.byref(stamp))
            if st == 0x00020:
                time.sleep(0.02)
                continue
            if st != OK:
                break
            out.append({
                "id": int(msg.ID) & 0x1FFFFFFF,
                "ext": bool(msg.MSGTYPE & T_EXT),
                "data": bytes(bytearray(msg.DATA[:msg.LEN])),
            })
        return out

    def close(self):
        if self.lib is not None and (self.listening or self.transmitting):
            self.lib.CAN_Uninitialize(CH1)
        self.listening = False
        self.transmitting = False


# Classic SJA1000 timings used by ZLG ControlCAN. 500 kbit/s is 0x00, 0x1C.
ZLG_TIMING = {1000000: (0x00, 0x14), 500000: (0x00, 0x1C), 250000: (0x01, 0x1C), 125000: (0x03, 0x1C)}
CAN_EFF_FLAG = 0x80000000


class VciInit(ctypes.Structure):
    _fields_ = [
        ("AccCode", ctypes.c_uint32),
        ("AccMask", ctypes.c_uint32),
        ("Reserved", ctypes.c_uint32),
        ("Filter", ctypes.c_uint8),
        ("Timing0", ctypes.c_uint8),
        ("Timing1", ctypes.c_uint8),
        ("Mode", ctypes.c_uint8),
    ]


class VciCanObj(ctypes.Structure):
    _fields_ = [
        ("ID", ctypes.c_uint32),
        ("TimeStamp", ctypes.c_uint32),
        ("TimeFlag", ctypes.c_uint8),
        ("SendType", ctypes.c_uint8),
        ("RemoteFlag", ctypes.c_uint8),
        ("ExternFlag", ctypes.c_uint8),
        ("DataLen", ctypes.c_uint8),
        ("Data", ctypes.c_uint8 * 8),
        ("Reserved", ctypes.c_uint8 * 3),
    ]


def default_zlg_lib():
    for key in ("WR_ZLG_LIB", "ZLG_LIB"):
        env = os.environ.get(key) or ""
        if env and os.path.isfile(env):
            return env
    names = [
        os.path.expanduser("~/.windrose/zlg/libcontrolcan.so"),
        "/usr/lib/libcontrolcan.so",
        "/usr/local/lib/libcontrolcan.so",
        "/opt/zlg/libcontrolcan.so",
        r"C:\Windows\System32\ControlCAN.dll",
    ]
    for base in (os.environ.get("ProgramFiles", ""), os.environ.get("ProgramFiles(x86)", "")):
        if base:
            names.append(os.path.join(base, "ZLG", "ControlCAN.dll"))
    for path in names:
        if path and os.path.isfile(path):
            return path
    return ""


def load_zlg(path):
    lib = ctypes.WinDLL(path) if os.name == "nt" else ctypes.CDLL(path)
    u32 = ctypes.c_uint32
    lib.VCI_OpenDevice.argtypes = [u32, u32, u32]
    lib.VCI_CloseDevice.argtypes = [u32, u32]
    lib.VCI_InitCAN.argtypes = [u32, u32, u32, ctypes.POINTER(VciInit)]
    lib.VCI_StartCAN.argtypes = [u32, u32, u32]
    lib.VCI_Transmit.argtypes = [u32, u32, u32, ctypes.POINTER(VciCanObj), u32]
    for name in ("VCI_OpenDevice", "VCI_CloseDevice", "VCI_InitCAN", "VCI_StartCAN", "VCI_Transmit"):
        getattr(lib, name).restype = u32
    if hasattr(lib, "VCI_Receive"):
        lib.VCI_Receive.argtypes = [u32, u32, u32, ctypes.POINTER(VciCanObj), u32, ctypes.c_int]
        lib.VCI_Receive.restype = u32
    return lib


def zlg_frame(can_id, data, extended):
    """One classic ControlCAN data frame. SendType 1 sends it once."""
    data = bytes(data)
    if len(data) > 8:
        raise Fail("%s: ZLG ask is Classic CAN, 8 bytes." % ADAPTER_LABEL)
    obj = VciCanObj()
    obj.ID = can_id & (0x1FFFFFFF if extended else 0x7FF)
    obj.SendType = 1
    obj.RemoteFlag = 0
    obj.ExternFlag = 1 if extended else 0
    obj.DataLen = len(data)
    for i, b in enumerate(data):
        obj.Data[i] = b
    return obj


class ZlgBus:
    """ZLG ControlCAN (USBCAN and the same vendor USB-CAN API).

    send() uses the same ask-only guard as Peak. Device type 4 is USBCAN2;
    pass --dev-type for another ZLG model.
    """

    name = "zlg"

    def __init__(self, lib=None, lib_path="", dev_type=4, dev_index=0, channel=0):
        self.lib = lib
        self.lib_path = lib_path
        self.dev_type = int(dev_type)
        self.dev_index = int(dev_index)
        self.channel = int(channel)
        self.opened = False
        self.listening = False
        self.transmitting = False
        self.classic = False
        self.bitrate = 0

    def open_listen(self, classic=False, bitrate=500000):
        self._open(classic, bitrate, listen=True)

    def open_transmit(self, classic=False, bitrate=500000):
        self._open(classic, bitrate, listen=False)

    def _ensure_lib(self):
        if self.lib is not None:
            return
        path = self.lib_path or default_zlg_lib()
        if not path:
            raise Fail(
                "%s: ZLG ControlCAN library not found. Set WR_ZLG_LIB, or use "
                "--adapter peak or --adapter socketcan --iface can0." % ADAPTER_LABEL
            )
        self.lib = load_zlg(path)

    def _open(self, classic, bitrate, listen):
        if not classic:
            raise Fail("%s: ZLG ask is Classic CAN. Use send --uds or pass --classic." % ADAPTER_LABEL)
        if bitrate not in ZLG_TIMING:
            raise Fail("bitrate must be 1000000, 500000, 250000 or 125000")
        self._ensure_lib()
        if self.lib.VCI_OpenDevice(self.dev_type, self.dev_index, 0) != 1:
            raise Fail("%s: ZLG OpenDevice failed. Check the USB-CAN box." % ADAPTER_LABEL)
        self.opened = True
        timing = ZLG_TIMING[bitrate]
        cfg = VciInit()
        cfg.AccCode = 0
        cfg.AccMask = 0xFFFFFFFF
        cfg.Filter = 1
        cfg.Timing0 = timing[0]
        cfg.Timing1 = timing[1]
        cfg.Mode = 1 if listen else 0
        if self.lib.VCI_InitCAN(self.dev_type, self.dev_index, self.channel, ctypes.byref(cfg)) != 1:
            self.close()
            raise Fail("%s: ZLG InitCAN failed." % ADAPTER_LABEL)
        if self.lib.VCI_StartCAN(self.dev_type, self.dev_index, self.channel) != 1:
            self.close()
            raise Fail("%s: ZLG StartCAN failed." % ADAPTER_LABEL)
        self.listening = listen
        self.transmitting = not listen
        self.classic = True
        self.bitrate = bitrate

    def send(self, can_id, data, extended=False, fd=False, brs=False):
        data = guard_transmit(self, can_id, data, extended)
        if fd or len(data) > 8:
            raise Fail("%s: ZLG ask is Classic CAN, 8 bytes." % ADAPTER_LABEL)
        if self.lib is None or not self.opened:
            raise Fail("%s is not open." % ADAPTER_LABEL)
        obj = zlg_frame(can_id, data, extended)
        sent = self.lib.VCI_Transmit(self.dev_type, self.dev_index, self.channel, ctypes.byref(obj), 1)
        if sent != 1:
            raise Fail("%s: ZLG Transmit failed." % ADAPTER_LABEL)

    def read_frames(self, seconds=0.25):
        if self.lib is None or not self.opened or not hasattr(self.lib, "VCI_Receive"):
            return []
        arr = (VciCanObj * 40)()
        wait = max(1, min(200, int(seconds * 1000)))
        got = int(self.lib.VCI_Receive(self.dev_type, self.dev_index, self.channel, arr, 40, wait))
        out = []
        for i in range(max(0, min(got, 40))):
            obj = arr[i]
            out.append({
                "id": int(obj.ID) & 0x1FFFFFFF,
                "ext": bool(obj.ExternFlag),
                "data": bytes(bytearray(obj.Data[:obj.DataLen])),
            })
        return out

    def close(self):
        if self.lib is not None and self.opened:
            self.lib.VCI_CloseDevice(self.dev_type, self.dev_index)
        self.opened = False
        self.listening = False
        self.transmitting = False


def socketcan_frame(can_id, data, extended):
    """Linux can_frame. The extended bit is CAN_EFF_FLAG, not part of the id."""
    data = bytes(data)
    if len(data) > 8:
        raise Fail("%s: SocketCAN ask is Classic CAN, 8 bytes." % ADAPTER_LABEL)
    ident = can_id & (0x1FFFFFFF if extended else 0x7FF)
    if extended:
        ident |= CAN_EFF_FLAG
    return struct.pack("=IB3x8s", ident, len(data), data.ljust(8, b"\x00"))


def _socketcan_bitrate(iface):
    try:
        with open("/sys/class/net/%s/can_bittiming/bitrate" % iface, encoding="ascii") as handle:
            return int(handle.read().strip())
    except (OSError, ValueError):
        return None


def _socketcan_present(iface):
    try:
        with open("/sys/class/net/%s/type" % iface, encoding="ascii") as handle:
            return int(handle.read().strip()) == 280
    except (OSError, ValueError):
        return False


class SocketCanBus:
    """SocketCAN. Covers USB-CAN devices the OS exposes as a can interface.

    That includes Peak and ZLG kernel drivers, and other vendor USB-CAN boxes.
    The interface must already be up. UDS still requires classic 500 kbit/s.
    """

    name = "socketcan"

    def __init__(self, iface="can0"):
        self.iface = iface or "can0"
        self.sock = None
        self.listening = False
        self.transmitting = False
        self.classic = False
        self.bitrate = 0

    def open_listen(self, classic=False, bitrate=500000):
        self._open(classic, bitrate, listen=True)

    def open_transmit(self, classic=False, bitrate=500000):
        self._open(classic, bitrate, listen=False)

    def _open(self, classic, bitrate, listen):
        if not hasattr(socket, "PF_CAN") or not hasattr(socket, "CAN_RAW"):
            raise Fail("%s: SocketCAN is not on this system. Use --adapter peak or --adapter zlg." % ADAPTER_LABEL)
        if bitrate not in BTR:
            raise Fail("bitrate must be 1000000, 500000, 250000 or 125000")
        actual = _socketcan_bitrate(self.iface)
        if actual is not None and actual != bitrate:
            raise Fail(
                "%s: SocketCAN %s is %d bit/s, not %d."
                % (ADAPTER_LABEL, self.iface, actual, bitrate)
            )
        try:
            sock = socket.socket(socket.PF_CAN, socket.SOCK_RAW, socket.CAN_RAW)
            sock.bind((self.iface,))
        except OSError as exc:
            raise Fail(
                "%s: SocketCAN %s is not open (%s)."
                % (ADAPTER_LABEL, self.iface, getattr(exc, "strerror", None) or exc)
            )
        self.sock = sock
        self.listening = listen
        self.transmitting = not listen
        self.classic = bool(classic)
        self.bitrate = bitrate

    def send(self, can_id, data, extended=False, fd=False, brs=False):
        data = guard_transmit(self, can_id, data, extended)
        if fd or len(data) > 8:
            raise Fail("%s: SocketCAN ask is Classic CAN, 8 bytes." % ADAPTER_LABEL)
        if self.sock is None:
            raise Fail("%s is not open." % ADAPTER_LABEL)
        try:
            self.sock.send(socketcan_frame(can_id, data, extended))
        except OSError as exc:
            raise Fail("%s: SocketCAN send failed (%s)." % (ADAPTER_LABEL, getattr(exc, "strerror", None) or exc))

    def read_frames(self, seconds=0.25):
        if self.sock is None:
            return []
        self.sock.settimeout(seconds)
        out = []
        end = time.monotonic() + seconds
        while time.monotonic() < end and len(out) < 80:
            try:
                raw = self.sock.recv(16)
            except (TimeoutError, socket.timeout, OSError):
                break
            if len(raw) < 16:
                continue
            ident, dlc = struct.unpack_from("=IB", raw)
            ext = bool(ident & CAN_EFF_FLAG)
            data = raw[8:8 + min(dlc, 8)]
            out.append({"id": ident & 0x1FFFFFFF, "ext": ext, "data": data})
        return out

    def close(self):
        sock = self.sock
        self.sock = None
        self.listening = False
        self.transmitting = False
        if sock is not None:
            sock.close()


ADAPTER_ALIASES = {
    "peak": "peak",
    "pcan": "peak",
    "pcan-basic": "peak",
    "pcanbasic": "peak",
    "zlg": "zlg",
    "controlcan": "zlg",
    "socketcan": "socketcan",
    "socket-can": "socketcan",
}


def resolve_adapter(adapter, iface=""):
    """auto picks an explicit env, then a library that is installed, else Peak."""
    kind = (adapter or "auto").strip().lower()
    if kind != "auto":
        if kind not in ADAPTER_ALIASES:
            raise Fail("%s: unknown adapter %r. Use peak, zlg, or socketcan." % (ADAPTER_LABEL, adapter))
        return ADAPTER_ALIASES[kind]
    env = (os.environ.get("WR_CAN_ADAPTER") or "").strip().lower()
    if env:
        if env not in ADAPTER_ALIASES:
            raise Fail("%s: unknown adapter %r. Use peak, zlg, or socketcan." % (ADAPTER_LABEL, env))
        return ADAPTER_ALIASES[env]
    if iface or os.environ.get("WR_CAN_IFACE"):
        return "socketcan"
    if default_lib():
        return "peak"
    if default_zlg_lib():
        return "zlg"
    if _socketcan_present(iface or os.environ.get("WR_CAN_IFACE") or "can0"):
        return "socketcan"
    return "peak"


def open_can_port(adapter="auto", lib_path="", iface="", dev_type=4, dev_index=0, channel=0):
    kind = resolve_adapter(adapter, iface)
    if kind == "peak":
        return PeakBus(lib_path=lib_path)
    if kind == "zlg":
        return ZlgBus(lib_path=lib_path, dev_type=dev_type, dev_index=dev_index, channel=channel)
    return SocketCanBus(iface or os.environ.get("WR_CAN_IFACE") or "can0")


# Public names only. No vehicle database. VID:PID values are the ones the
# vendors and the Linux CAN drivers publish.
KNOWN_USB_CAN = {
    (0x0C72, 0x000C): ("Peak PCAN-USB", "peak"),
    (0x0C72, 0x000D): ("Peak PCAN-USB Pro", "peak"),
    (0x0C72, 0x0011): ("Peak PCAN-USB FD", "peak"),
    (0x0C72, 0x0012): ("Peak PCAN-USB Pro FD", "peak"),
    (0x0C72, 0x0013): ("Peak PCAN-USB Chip", "peak"),
    (0x0C72, 0x0014): ("Peak PCAN-USB X6", "peak"),
    (0x0471, 0x1200): ("ZLG USBCAN", "zlg"),
    (0x1D50, 0x606F): ("candleLight USB-CAN", "socketcan"),
}
# A response the vehicle sends after a read. These names are ISO 14229, not a truck DBC.
PUBLIC_UDS = {
    0x50: "diagnostic session",
    0x59: "fault information",
    0x62: "data value",
    0x7E: "tester still present",
    0x7F: "the vehicle declined the question",
}
PLAIN_NOTHING = (
    "Nothing is plugged in. Plug a USB-CAN dongle into this computer. "
    "You do not need to know if it is Peak, ZLG, or another brand."
)
PLAIN_DRIVER = (
    "The adapter driver is missing. Install the driver that came with the dongle, then plug it in again. "
    "You do not need to choose Peak or ZLG."
)
PLAIN_BITRATE = (
    "The dongle is at the wrong bitrate. The diagnostic plug needs classic CAN at 500 kbit/s."
)
PLAIN_POWER = (
    "The vehicle bus has no power, or the diagnostic cable is not seated. "
    "Turn the ignition on and check OBD pins 6 and 14."
)
PLAIN_BOUNDARY = (
    "可以问，不能改。This tool only asks for data. It will not write, flash, unlock, or command the vehicle."
)


def _read_text(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def _hex_id(text):
    try:
        return int(text, 16)
    except (TypeError, ValueError):
        return None


def plain_adapter_name(manufacturer, product, vid, pid, iface="", catalog=None):
    """Vendor and product when we know them, otherwise unknown USB-CAN, VID:PID."""
    if catalog:
        return catalog[0]
    manufacturer = (manufacturer or "").strip()
    product = (product or "").strip()
    if manufacturer and product:
        return "%s %s" % (manufacturer, product)
    if product:
        return product
    if manufacturer:
        return manufacturer
    if vid is not None and pid is not None:
        return "unknown USB-CAN, VID:PID %04x:%04x" % (vid, pid)
    if iface:
        return "SocketCAN %s" % iface
    return "unknown USB-CAN"


def _catalog(vid, pid):
    if vid is None or pid is None:
        return None
    found = KNOWN_USB_CAN.get((vid, pid))
    if found:
        return found
    if vid == 0x0C72:
        return ("Peak USB-CAN", "peak")
    if vid == 0x0BFD:
        return ("Kvaser USB-CAN", "socketcan")
    return None


def _backend_for(driver, catalog, iface):
    """A dongle the OS already shows as a CAN port is used that way. Otherwise the vendor library."""
    if iface:
        return "socketcan"
    driver = (driver or "").lower()
    if catalog:
        return catalog[1]
    if "peak" in driver or "pcan" in driver:
        return "peak"
    if "zlg" in driver or "controlcan" in driver:
        return "zlg"
    return "socketcan"


def _usb_parent(start):
    if not os.path.exists(start):
        return ""
    cur = os.path.realpath(start)
    for _ in range(8):
        if os.path.isfile(os.path.join(cur, "idVendor")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    return ""


def _driver_of(usb_node):
    devices = os.path.dirname(usb_node)
    base = os.path.basename(usb_node)
    try:
        names = os.listdir(devices)
    except OSError:
        return ""
    for name in names:
        if not name.startswith(base + ":"):
            continue
        link = os.path.join(devices, name, "driver")
        if os.path.islink(link) or os.path.isdir(link):
            return os.path.basename(os.path.realpath(link))
    own = os.path.join(usb_node, "driver")
    if os.path.islink(own) or os.path.isdir(own):
        return os.path.basename(os.path.realpath(own))
    return ""


def _usb_record(node, iface, libs):
    vid = _hex_id(_read_text(os.path.join(node, "idVendor")))
    pid = _hex_id(_read_text(os.path.join(node, "idProduct")))
    if vid is None or pid is None:
        return None
    catalog = _catalog(vid, pid)
    driver = _driver_of(node)
    backend = _backend_for(driver, catalog, iface)
    lib_ready = (backend == "peak" and libs.get("peak")) or (backend == "zlg" and libs.get("zlg"))
    ready = bool(iface) or lib_ready or bool(driver)
    return {
        "plain": plain_adapter_name(
            _read_text(os.path.join(node, "manufacturer")),
            _read_text(os.path.join(node, "product")),
            vid, pid, iface, catalog,
        ),
        "backend": backend,
        "iface": iface or "",
        "vid": vid,
        "pid": pid,
        "driver": driver,
        "ready": ready,
    }


def enumerate_adapters(sys_root="/sys", libs=None):
    """List plugged-in CAN dongles. Does not open them and does not transmit."""
    if libs is None:
        libs = {"peak": bool(default_lib()), "zlg": bool(default_zlg_lib())}
    found = []
    seen = set()
    net = os.path.join(sys_root, "class", "net")
    if os.path.isdir(net):
        for name in sorted(os.listdir(net)):
            if _read_text(os.path.join(net, name, "type")) != "280":
                continue
            usb = _usb_parent(os.path.join(net, name, "device"))
            if usb:
                rec = _usb_record(usb, name, libs)
                if rec:
                    found.append(rec)
                    seen.add(os.path.realpath(usb))
                    continue
            found.append({
                "plain": "SocketCAN %s" % name,
                "backend": "socketcan",
                "iface": name,
                "vid": None,
                "pid": None,
                "driver": "",
                "ready": True,
            })
    usb_root = os.path.join(sys_root, "bus", "usb", "devices")
    if os.path.isdir(usb_root):
        for name in sorted(os.listdir(usb_root)):
            node = os.path.join(usb_root, name)
            if not os.path.isdir(node) or os.path.realpath(node) in seen:
                continue
            if not os.path.isfile(os.path.join(node, "idVendor")):
                continue
            vid = _hex_id(_read_text(os.path.join(node, "idVendor")))
            pid = _hex_id(_read_text(os.path.join(node, "idProduct")))
            driver = _driver_of(node)
            catalog = _catalog(vid, pid)
            looks_can = catalog or any(
                bit in driver.lower() for bit in ("can", "peak", "pcan", "zlg", "gs_usb", "kvaser", "usbcan")
            )
            if not looks_can:
                continue
            rec = _usb_record(node, "", libs)
            if rec:
                found.append(rec)
                seen.add(os.path.realpath(node))
    return found


def explain_failure(exc):
    """Plain reason. The four cases are bitrate, bus power, missing driver, and ask versus write."""
    text = str(exc)
    low = text.lower()
    if "可以问" in text or "not a read-only" in low or "not a question" in low:
        return PLAIN_BOUNDARY
    if "bit/s" in low or "bitrate" in low or "kbit" in low:
        return PLAIN_BITRATE
    if "library not found" in low or "driver is missing" in low or "driver" in low and "not found" in low:
        return PLAIN_DRIVER
    if any(bit in low for bit in (
        "network is down", "enetdown", "no such device", "opendevice", "no power",
        "not open", "startcan", "initcan", "bus has no power",
    )):
        return PLAIN_POWER
    return text


def _is_uds_response(can_id):
    """Vehicle replies: WH13 0x18DAF1xx, or J1979 0x7E8–0x7EF. Never a request id."""
    n = can_id & 0x1FFFFFFF
    return (n & 0xFFFFFF00) == 0x18DAF100 or (0x7E8 <= n <= 0x7EF)


def decode_public(frames):
    """Name traffic with the public J1939 list and standard UDS response names. No truck DBC."""
    lines = []
    uds_left = []
    other = []
    for fr in frames:
        data = bytes(fr.get("data") or b"")
        can_id = fr.get("id", 0) & 0x1FFFFFFF
        if _is_uds_response(can_id):
            uds_left.append((can_id, data))
        else:
            other.append(fr)
    if other:
        report = j1939_report(other).strip()
        if report:
            lines.append(report)
    for can_id, data in uds_left:
        if len(data) >= 2 and 1 <= data[0] <= 7 and len(data) >= 1 + data[0]:
            payload = data[1:1 + data[0]]
        else:
            payload = data
        if not payload:
            continue
        sid = payload[0]
        if sid == 0x7F and len(payload) >= 3 and payload[2] == 0x33:
            lines.append("Response 0x%X: the vehicle asked for a security unlock. This tool will not unlock it." % can_id)
            continue
        name = PUBLIC_UDS.get(sid, "")
        if name:
            lines.append("Response 0x%X: %s." % (can_id, name))
        else:
            lines.append("Response 0x%X: %d bytes, not in the public dictionary." % (can_id, len(data)))
    return "\n".join(lines) + ("\n" if lines else "")


def connect_html(found, lines):
    """The page shown when Diagnose opens. Brand is a name, not a choice the user must make."""
    body = [
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Windrose Diagnose</title>",
        "<style>body{background:#f6f5f2;color:#1c1c1c;font:15px -apple-system,sans-serif;margin:24px}",
        "p.policy{font-weight:600}li{margin:6px 0}</style></head><body>",
        "<h1>Windrose Diagnose</h1>",
        "<p class=\"policy\">可以问，不能改</p>",
        "<p>Plug in a USB-CAN dongle. You do not need to know the brand.</p>",
    ]
    if not found:
        body.append("<p>%s</p>" % html.escape(PLAIN_NOTHING))
    else:
        body.append("<ul>")
        for dev in found:
            body.append("<li>%s</li>" % html.escape(dev.get("plain") or "unknown USB-CAN"))
        body.append("</ul>")
    for line in lines:
        body.append("<p>%s</p>" % html.escape(line))
    body.append("</body></html>")
    return "".join(body)


def run_connect(found=None, open_port=None, libs=None):
    """Enumerate, name, and when a dongle is ready ask read-only UDS at classic 500 kbit/s."""
    if found is None:
        found = enumerate_adapters(libs=libs)
    lines = ["可以问，不能改。"]
    asked = []
    heard = []
    if not found:
        lines.append(PLAIN_NOTHING)
        return {"ok": False, "found": found, "lines": lines, "asked": asked, "heard": heard}
    lines.append("Found: %s." % "; ".join(dev["plain"] for dev in found))
    ready = [dev for dev in found if dev.get("ready")]
    if not ready:
        lines.append(PLAIN_DRIVER)
        return {"ok": False, "found": found, "lines": lines, "asked": asked, "heard": heard}
    if open_port is None:
        open_port = open_can_port
    last = None
    for dev in ready:
        port = None
        try:
            port = open_port(dev.get("backend") or "auto", iface=dev.get("iface") or "")
            port.open_transmit(classic=True, bitrate=DIAGNOSTIC_BITRATE)
            poll = uds_read_frames("extended")
            for can_id, data, ext in poll:
                port.send(can_id, data, extended=ext)
                asked.append((can_id, bytes(data), ext))
            if hasattr(port, "read_frames"):
                heard = list(port.read_frames(0.05) or [])
            lines.append(
                "Asked %s for session, fault codes, and VIN on 0x18DBFFF1. Nothing on the vehicle was changed."
                % dev["plain"]
            )
            if heard:
                lines.append("Heard traffic and decoded it with the public dictionary.")
                text = decode_public(heard).strip()
                if text:
                    lines.append(text)
            else:
                lines.append(
                    "No messages came back. Turn the ignition on and seat the cable on the diagnostic plug."
                )
            return {"ok": True, "found": found, "lines": lines, "asked": asked, "heard": heard}
        except Fail as exc:
            last = exc
            lines.append("%s: %s" % (dev["plain"], explain_failure(exc)))
        finally:
            if port is not None:
                port.close()
    if last is not None and PLAIN_DRIVER not in lines[-1] and PLAIN_BITRATE not in lines[-1] and PLAIN_POWER not in lines[-1] and PLAIN_BOUNDARY not in lines[-1]:
        lines.append(explain_failure(last))
    return {"ok": False, "found": found, "lines": lines, "asked": asked, "heard": heard}


def _keys(name):
    if name.startswith("--"):
        return (name, "-" + name[2:])
    return (name,)


def _opt(argv, name, default=None):
    for key in _keys(name):
        if key in argv:
            i = argv.index(key)
            if i + 1 >= len(argv):
                raise Fail("missing value after %s" % key)
            return argv[i + 1]
    return default


def _flag(argv, name):
    return any(key in argv for key in _keys(name))


def _read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def _cmd_plot(argv):
    if not argv or argv[0].startswith("-"):
        raise Fail("usage: plot FILE.asc [--dbc FILE] [--out FILE.html]")
    frames = load_asc(_read(argv[0]))
    dbc, _path = resolve_dbc(_opt(argv, "--dbc"))
    out = _opt(argv, "--out") or (os.path.splitext(argv[0])[0] + ".plot.html")
    body = plot_html(frames, dbc, title=os.path.basename(argv[0]))
    with open(out, "w", encoding="utf-8") as f:
        f.write(body)
    print(out)
    return 0


def _cmd_j1939(argv):
    if not argv or argv[0].startswith("-"):
        raise Fail("usage: j1939 FILE.asc")
    print(j1939_report(load_asc(_read(argv[0]))), end="")
    return 0


def _cmd_decode(argv):
    if not argv or argv[0].startswith("-"):
        raise Fail("usage: decode FILE.asc [--dbc FILE]")
    frames = load_asc(_read(argv[0]))
    dbc, path = resolve_dbc(_opt(argv, "--dbc"))
    print("dbc %s" % path)
    shown = 0
    for row in decode(frames, dbc):
        unit = (" " + row["unit"]) if row["unit"] else ""
        print("%.3f  %s.%s  %.6g%s" % (row["t"], row["message"], row["signal"], row["value"], unit))
        shown += 1
        if shown >= 400:
            print("... %d more" % (len(decode(frames, dbc)) - shown))
            break
    if not shown:
        print("No signal from this DBC was in the recording.")
    return 0


def _cmd_dbc(argv):
    if not argv:
        path = saved_dbc_path()
        print(path or "No DBC saved on this computer.")
        return 0
    if argv[0] == "set" and len(argv) >= 2:
        print(set_dbc_path(argv[1]))
        return 0
    raise Fail("usage: dbc set FILE.dbc")


def _parse_data(text):
    text = text.replace("0x", "").replace(",", " ")
    if " " in text.strip():
        return bytes(int(tok, 16) for tok in text.split())
    text = text.strip()
    if len(text) % 2:
        text = "0" + text
    return bytes.fromhex(text)


def _load_list(path):
    frames = []
    for line in _read(path).splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        bits = s.split()
        if len(bits) < 2:
            raise Fail("list row needs ID and data: %s" % s)
        frames.append((int(bits[0], 16), _parse_data(" ".join(bits[1:])), len(bits[0]) > 3))
    if not frames:
        raise Fail("transmit list is empty")
    return frames


def _cmd_send(argv):
    if any(item in ("--symbol", "-symbol") for item in argv):
        raise Fail("A DBC symbol is not sent. Outbound frames are questions only.")
    if _opt(argv, "--period") not in (None, "0"):
        raise Fail("A question is sent once.")
    if _opt(argv, "--count") not in (None, "1"):
        raise Fail("A question is sent once.")
    uds = _flag(argv, "--uds")
    classic = _flag(argv, "--classic") or uds
    bitrate = int(_opt(argv, "--bitrate", str(DIAGNOSTIC_BITRATE)))
    frames = []
    if uds:
        if _opt(argv, "--j1939") is not None or _opt(argv, "--list") or _opt(argv, "--id") or _opt(argv, "--data"):
            raise Fail("send --uds is only the read-only UDS poll.")
        if bitrate != DIAGNOSTIC_BITRATE:
            raise Fail("Diagnostic CAN is classic %d bit/s (OBD pins 6 and 14)." % DIAGNOSTIC_BITRATE)
        target = _parse_target(_opt(argv, "--target")) if _opt(argv, "--target") is not None else None
        frames.extend(uds_read_frames(_opt(argv, "--session", "extended"), target))
    else:
        if _opt(argv, "--session") is not None or _opt(argv, "--target") is not None:
            raise Fail("--session and --target are only valid with send --uds.")
        j1939_ask = _opt(argv, "--j1939")
        if j1939_ask is not None:
            if _opt(argv, "--id") or _opt(argv, "--list"):
                raise Fail("send --j1939 asks for one parameter group only.")
            frames.append(j1939_request_frame(j1939_ask))
        if _opt(argv, "--list"):
            frames.extend(_load_list(_opt(argv, "--list")))
        if _opt(argv, "--id"):
            ident = _opt(argv, "--id")
            data = _parse_data(_opt(argv, "--data", ""))
            ext = _flag(argv, "--extended") or len(ident) > 3
            frames.append((int(ident, 16), data, ext))
    if not frames:
        frames = standard_questions()
    for can_id, data, ext in frames:
        if not is_inquiry(can_id, data, ext):
            raise Fail(NOT_A_QUESTION)
        if _uds_ask_frame(data) and (not classic or bitrate != DIAGNOSTIC_BITRATE):
            raise Fail(UDS_BUS_NOTE)
    fd = False
    print(BUS_NOTE)
    if any(_uds_ask_frame(data) for _can_id, data, _ext in frames):
        print(UDS_BUS_NOTE)
    bus = open_can_port(
        _opt(argv, "--adapter", "auto"),
        lib_path=_opt(argv, "--lib", ""),
        iface=_opt(argv, "--iface", ""),
        dev_type=int(_opt(argv, "--dev-type", "4"), 0),
        dev_index=int(_opt(argv, "--dev-index", "0"), 0),
        channel=int(_opt(argv, "--channel", "0"), 0),
    )
    print("%s: %s" % (ADAPTER_LABEL, bus.name))
    bus.open_transmit(classic=classic, bitrate=bitrate)
    try:
        for can_id, data, ext in frames:
            bus.send(can_id, data, extended=ext, fd=fd, brs=False)
            print("asked 0x%X  %s" % (can_id, data.hex()))
    finally:
        bus.close()
    return 0


def _cmd_connect(argv):
    report = run_connect()
    for line in report["lines"]:
        print(line)
    page = _opt(argv, "--page")
    if page:
        with open(page, "w", encoding="utf-8") as handle:
            handle.write(connect_html(report["found"], report["lines"]))
        print(page)
    if report["ok"] or not any(dev.get("ready") for dev in report["found"]):
        return 0
    return 2


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print("可以问，不能改")
        print("Plug in a USB-CAN dongle, then: connect")
        print("You do not need to know if it is Peak, ZLG, or another brand.")
        print(ADAPTER_LABEL)
        found = enumerate_adapters()
        if found:
            print("Plugged in: %s." % "; ".join(dev["plain"] for dev in found))
        else:
            print(PLAIN_NOTHING)
        print("plot FILE.asc [--dbc FILE]")
        print("j1939 FILE.asc")
        print("decode FILE.asc [--dbc FILE]")
        print("dbc set FILE.dbc")
        print("send    ask the standard J1979 questions (speed, fault codes, VIN)")
        print("connect    find the dongle and ask read-only UDS on 0x18DBFFF1")
        print("send --uds    WH13 UDS poll on 29-bit 0x18DBFFF1 (classic 500 kbit/s)")
        print("send --uds --adapter socketcan --iface can0")
        print("send --uds --adapter zlg    ZLG ControlCAN, classic 500 kbit/s")
        print("send --uds --target 10    same poll, physical 0x18DA10F1")
        print("send --id 18DBFFF1 --data 02 10 03 --classic    extended session, a read")
        print("send --id 7DF --data 02 01 0D    J1979 legacy read; UDS is not sent on 7DF")
        print("send --j1939 dm1    ask one read-only J1939 group; DM3 and DM11 are refused")
        print("Refused: programming session, flash ($34/$36/$37), write ($2E),")
        print("IO control ($2F), routine control ($31), security access ($27).")
        print("Recording stays listen-only. CAN XL is not implemented.")
        return 0
    cmd, rest = argv[0], argv[1:]
    try:
        if cmd == "plot":
            return _cmd_plot(rest)
        if cmd == "j1939":
            return _cmd_j1939(rest)
        if cmd == "decode":
            return _cmd_decode(rest)
        if cmd == "dbc":
            return _cmd_dbc(rest)
        if cmd == "send":
            return _cmd_send(rest)
        if cmd == "connect":
            return _cmd_connect(rest)
        raise Fail("unknown command: %s" % cmd)
    except Fail as exc:
        sys.stderr.write(str(exc) + "\n")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
