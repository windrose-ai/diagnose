# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Windrose
# Unit tests for canbench.py. No adapter and no network.
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import canbench as cb

DBC = """
BO_ 256 SpeedMsg: 8 Vector__XXX
 SG_ VehicleSpeed : 0|16@1+ (0.1,0) [0|200] "km/h" Vector__XXX
 SG_ EngineSpeed : 23|16@0+ (0.125,0) [0|8000] "rpm" Vector__XXX
 SG_ Muxed m0 : 16|8@1+ (1,0) [0|0] "" Vector__XXX
"""

ASC = """
date Mon Oct 04 12:00:00.000 2026
   0.100000 1  100             Rx   d 8 34 12 12 34 00 00 00 00
   0.200000 1  100             Rx   d 8 35 12 12 34 00 00 00 00
   0.300000 1  18FECA00x       Rx   d 8 00 00 D2 04 05 03 FF FF
"""


class DecodeTests(unittest.TestCase):
    def test_intel_and_motorola(self):
        self.assertEqual(cb.extract_raw(bytes.fromhex("3412"), 0, 16, True), 0x1234)
        self.assertEqual(cb.extract_raw(bytes.fromhex("1234"), 7, 16, False), 0x1234)
        self.assertEqual(cb.extract_raw(bytes.fromhex("34121234"), 23, 16, False), 0x1234)
        dbc = cb.load_dbc(DBC)
        self.assertNotIn("Muxed", [s["name"] for s in dbc["messages"][256]["signals"]])
        frames = cb.load_asc(ASC)
        rows = cb.decode(frames[:1], dbc)
        by = {r["signal"]: r["value"] for r in rows}
        self.assertAlmostEqual(by["VehicleSpeed"], 466.0)
        self.assertAlmostEqual(by["EngineSpeed"], 582.5)

    def test_roundtrip_symbol(self):
        dbc = cb.load_dbc(DBC)
        can_id, data, ext = cb.encode_signals(dbc, ["SpeedMsg.VehicleSpeed=80.5"])
        self.assertEqual(can_id, 256)
        self.assertFalse(ext)
        self.assertAlmostEqual(cb.signal_value(data, dbc["messages"][256]["signals"][0]), 80.5)

    def test_plot_skips_constant(self):
        dbc = cb.load_dbc(DBC)
        page = cb.plot_html(cb.load_asc(ASC), dbc)
        self.assertIn("<svg", page)
        self.assertIn("#f6f5f2", page)
        self.assertIn("可以问，不能改", page)
        self.assertIn("VehicleSpeed", page)
        self.assertNotIn("EngineSpeed", page)

    def test_pgn_pdu1_pdu2(self):
        pgn, sa, da, _pri = cb.pgn_parts(0x18DAF100)
        self.assertEqual((pgn, sa, da), (0xDA00, 0x00, 0xF1))
        pgn, sa, da, _pri = cb.pgn_parts(0x18FECA00)
        self.assertEqual((pgn, sa, da), (0xFECA, 0x00, None))

    def test_dm1_and_bam(self):
        text = cb.j1939_report(cb.load_asc(ASC))
        self.assertIn("SPN 1234", text)
        self.assertIn("FMI 5", text)
        self.assertIn("OC 3", text)
        # BAM: 9-byte DM1, SPN 99 FMI 1 OC 2
        # SPN 99 = 0x63 -> bytes 63 00 01, OC 2
        payload = bytes.fromhex("000063000102FFFFAA")
        self.assertEqual(len(payload), 9)
        cm = bytes([0x20, 9, 0, 2, 0xFF, 0xCA, 0xFE, 0x00])
        dt1 = bytes([1]) + payload[:7]
        dt2 = bytes([2]) + payload[7:] + bytes(5)
        frames = [
            {"t": 0.0, "id": 0x1CECFF80, "ext": True, "data": cm},
            {"t": 0.01, "id": 0x1CEBFF80, "ext": True, "data": dt1},
            {"t": 0.02, "id": 0x1CEBFF80, "ext": True, "data": dt2},
        ]
        report = cb.j1939_report(frames)
        self.assertIn("reassembled 1", report)
        self.assertIn("SPN 99", report)
        self.assertIn("FMI 1", report)
        self.assertIn("OC 2", report)

    def test_only_questions_are_sent(self):
        self.assertTrue(cb.is_inquiry(0x7DF, bytes.fromhex("02010D"), False))
        self.assertTrue(cb.is_inquiry(0x18DB33F1, bytes.fromhex("020902"), True))
        self.assertTrue(cb.is_inquiry(0x7E0, bytes.fromhex("300000"), False))
        self.assertTrue(cb.is_inquiry(0x18DBFFF1, bytes.fromhex("0322F190"), True))
        self.assertFalse(cb.is_inquiry(0x7E0, bytes.fromhex("0322F190"), False))
        legacy = {can_id for can_id, _data, _ext in cb.standard_questions()}
        self.assertEqual(legacy, {0x7DF, 0x18DB33F1})
        self.assertFalse(cb.is_inquiry(0x7DF, bytes.fromhex("032EF190"), False))
        self.assertFalse(cb.is_inquiry(0x7DF, bytes.fromhex("0104"), False))
        self.assertFalse(cb.is_inquiry(0x7DF, bytes.fromhex("023101"), False))
        self.assertFalse(cb.is_inquiry(0x18FEF100, bytes.fromhex("0011223344556677"), True))
        for can_id, data, ext in cb.standard_questions():
            self.assertTrue(cb.is_inquiry(can_id, data, ext))
        opened = []
        real_open, real_send, real_close = cb.PeakBus.open_transmit, cb.PeakBus.send, cb.PeakBus.close

        def fake_open(self, classic=False, bitrate=500000):
            opened.append((classic, bitrate))
            self.transmitting = True

        sent = []

        def fake_send(self, can_id, data, extended=False, fd=False, brs=False):
            if not cb.is_inquiry(can_id, data, extended):
                raise cb.Fail(cb.NOT_A_QUESTION)
            sent.append(can_id)

        cb.PeakBus.open_transmit = fake_open
        cb.PeakBus.send = fake_send
        cb.PeakBus.close = lambda self: None
        try:
            self.assertEqual(cb.main(["send", "--id", "100", "--data", "00"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--symbol", "Speed.A=1"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--id", "7DF", "--data", "01 04"]), 2)
            self.assertEqual(cb.main(["send", "--id", "7DF", "--data", "02 10 02", "--classic"]), 2)
            self.assertEqual(cb.main(["send", "--id", "7DF", "--data", "02 10 03"]), 2)
            self.assertEqual(cb.main(["send", "--id", "7DF", "--data", "02 01 0D", "--period", "100"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--id", "7DF", "--data", "02 01 0D"]), 0)
            self.assertEqual(cb.main(["send", "-id", "7DF", "-data", "02010D"]), 0)
        finally:
            cb.PeakBus.open_transmit, cb.PeakBus.send, cb.PeakBus.close = real_open, real_send, real_close
        self.assertEqual(opened, [(False, 500000), (False, 500000)])
        self.assertEqual(sent, [0x7DF, 0x7DF])
        bus = cb.PeakBus()
        bus._open = lambda *a, **k: opened.append(k)
        bus.open_listen(classic=True, bitrate=500000)
        self.assertEqual(opened[-1], {"listen": True})

    def test_j1939_read_request_and_fd_listen(self):
        dm1 = cb.j1939_request_frame("dm1")
        self.assertEqual(dm1[0], 0x18EAFFFE)
        self.assertEqual(dm1[1], bytes.fromhex("CAFE00FFFFFFFFFF"))
        self.assertTrue(cb.is_inquiry(dm1[0], dm1[1], True))
        self.assertTrue(cb.is_inquiry(*cb.j1939_request_frame("address")))
        self.assertFalse(cb.is_inquiry(0x18EAFFFE, bytes.fromhex("D3FE00FFFFFFFFFF"), True))
        self.assertFalse(cb.is_inquiry(0x18EEFFFE, bytes.fromhex("0011223344556677"), True))
        self.assertFalse(cb.is_inquiry(0x10EAFFFE, bytes.fromhex("CAFE00FFFFFFFFFF"), True))
        with self.assertRaises(cb.Fail):
            cb.j1939_request_frame("dm11")
        with self.assertRaises(cb.Fail):
            cb.j1939_request_frame(65235)
        with self.assertRaises(cb.Fail):
            cb.j1939_request_frame("dm3")
        body = bytes.fromhex("40FECA0800007B000201FFFF")
        multi = cb.j1939_report([{"t": 0.1, "id": 0x1825FF31, "ext": True, "fd": True, "data": body}])
        self.assertIn("SPN 123", multi)
        self.assertIn("FMI 2", multi)
        self.assertIn("OC 1", multi)
        fbff = cb.j1939_report([{"t": 0.1, "id": 0x31, "ext": False, "fd": True, "data": body}])
        self.assertIn("SPN 123", fbff)
        classic = cb.j1939_report([{"t": 0.1, "id": 0x31, "ext": False, "data": body}])
        self.assertIn("DM1: no DTC", classic)
        assured = bytes.fromhex("44FECA0800007B000201FFFF")
        no_decode = cb.j1939_report([{"t": 0.1, "id": 0x1825FF31, "ext": True, "fd": True, "data": assured}])
        self.assertNotIn("SPN 123", no_decode)
        self.assertIn("assurance", no_decode)
        cm = bytes.fromhex("140800000100000000CAFE00")
        dt = bytes.fromhex("1001000000007B000201FFFF")
        self.assertEqual(cm[0], 0x14)
        self.assertEqual((6 << 26) | (0x4D << 16) | (0xFF << 8) | 0x31, 0x184DFF31)
        fd = cb.j1939_report([
            {"t": 0.1, "id": 0x184DFF31, "ext": True, "fd": True, "data": cm},
            {"t": 0.2, "id": 0x184EFF31, "ext": True, "fd": True, "data": dt},
        ])
        self.assertIn("reassembled 1", fd)
        self.assertIn("SPN 123", fd)
        opened = []
        sent = []
        real_open, real_send, real_close = cb.PeakBus.open_transmit, cb.PeakBus.send, cb.PeakBus.close

        def fake_open(self, classic=False, bitrate=500000):
            opened.append(1)
            self.transmitting = True

        def fake_send(self, can_id, data, extended=False, fd=False, brs=False):
            if not cb.is_inquiry(can_id, data, extended):
                raise cb.Fail(cb.NOT_A_QUESTION)
            sent.append(can_id)

        cb.PeakBus.open_transmit = fake_open
        cb.PeakBus.send = fake_send
        cb.PeakBus.close = lambda self: None
        try:
            self.assertEqual(cb.main(["send", "--j1939", "dm11"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--j1939", "dm3"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--j1939", "dm1"]), 0)
        finally:
            cb.PeakBus.open_transmit, cb.PeakBus.send, cb.PeakBus.close = real_open, real_send, real_close
        self.assertEqual(sent, [0x18EAFFFE])

    def test_cli_plot_and_j1939(self):
        dbc = cb.load_dbc(DBC)
        with tempfile.TemporaryDirectory() as folder:
            asc = os.path.join(folder, "t.asc")
            dbc_path = os.path.join(folder, "t.dbc")
            with open(asc, "w", encoding="utf-8") as f:
                f.write(ASC)
            with open(dbc_path, "w", encoding="utf-8") as f:
                f.write(DBC)
            out = os.path.join(folder, "t.plot.html")
            self.assertEqual(cb.main(["plot", asc, "--dbc", dbc_path, "--out", out]), 0)
            with open(out, encoding="utf-8") as handle:
                self.assertIn("<svg", handle.read())
            self.assertEqual(cb.main(["j1939", asc]), 0)
            self.assertIn("km/h", dbc["messages"][256]["signals"][0]["unit"])

    def test_uds_ask_allowlist_and_hard_block(self):
        def frame(hex_bytes):
            body = bytes.fromhex(hex_bytes)
            return body + bytes(8 - len(body))

        uds_ok = (
            "021001", "021003", "021081", "021083",
            "023E00", "023E80", "0322F190", "031902FF",
        )
        for raw in uds_ok:
            self.assertTrue(cb.is_inquiry(0x18DBFFF1, frame(raw), True), raw)
            self.assertTrue(cb.is_inquiry(0x18DA10F1, frame(raw), True), raw)
            self.assertFalse(cb.is_inquiry(0x7DF, frame(raw), False), raw)
            self.assertFalse(cb.is_inquiry(0x18DAF110, frame(raw), True), raw)
            self.assertTrue(cb.service_is_read(bytes.fromhex(raw)[1:]), raw)
        for raw in ("02010D", "020902", "0103"):
            self.assertTrue(cb.is_inquiry(0x7DF, frame(raw), False), raw)
            self.assertFalse(cb.is_inquiry(0x18DBFFF1, frame(raw), True), raw)
            self.assertTrue(cb.service_is_read(bytes.fromhex(raw)[1:]), raw)
        self.assertTrue(cb.is_inquiry(0x18DB33F1, frame("020902"), True))
        self.assertFalse(cb.is_inquiry(0x18DB33F1, frame("0322F190"), True))
        self.assertTrue(cb.is_inquiry(0x18DA10F1, bytes.fromhex("3000000000000000"), True))
        self.assertFalse(cb.is_inquiry(0x18DAF110, bytes.fromhex("3000000000000000"), True))
        blocked = (
            "021002", "021082", "021004", "03100300",
            "022701", "042702AABB", "023E01", "0222F1",
            "021900", "032EF190", "072EF190010203",
            "052FF1900300", "0431010203",
            "07340011223344", "0135", "023601", "0137", "023801",
            "021101", "0414FFFFFF", "0104", "020800",
            "03280101", "023D00",
        )
        for raw in blocked:
            self.assertFalse(cb.is_inquiry(0x18DBFFF1, frame(raw), True), raw)
            self.assertFalse(cb.is_inquiry(0x7DF, frame(raw), False), raw)
        self.assertFalse(cb.is_inquiry(0x0CF00400, frame("0322F190"), True))
        self.assertFalse(cb.is_inquiry(0x18DA10F1, frame("021002"), True))
        passed = []
        wh13 = []
        for sid in range(256):
            probe = bytes((0x02, sid, 0x00)) + bytes(5)
            if cb.is_inquiry(0x7DF, probe, False):
                passed.append(sid)
            if cb.is_inquiry(0x18DBFFF1, probe, True):
                wh13.append(sid)
        self.assertEqual(set(passed), set(cb.OBD_READ_SERVICES))
        self.assertEqual(set(wh13), {0x3E})
        self.assertTrue(cb.BLOCKED_SERVICES.isdisjoint(cb.UDS_ASK_SERVICES))
        self.assertTrue(cb.BLOCKED_SERVICES.isdisjoint(cb.OBD_READ_SERVICES))
        poll = cb.uds_read_frames("extended")
        self.assertEqual([item[0] for item in poll], [0x18DBFFF1] * 4)
        self.assertEqual([item[2] for item in poll], [True] * 4)
        for can_id, data, ext in poll:
            self.assertTrue(cb.is_inquiry(can_id, data, ext))
        physical = cb.uds_read_frames("extended", 0x10)
        self.assertEqual([item[0] for item in physical], [0x18DA10F1] * 4)
        self.assertEqual(cb.wh13_request_id("10"), 0x18DA10F1)
        self.assertEqual(bytes(poll[0][1][:3]), bytes.fromhex("021003"))
        self.assertEqual(bytes(poll[1][1][:3]), bytes.fromhex("023E00"))
        self.assertEqual(bytes(poll[2][1][:4]), bytes.fromhex("0322F190"))
        self.assertEqual(bytes(poll[3][1][:4]), bytes.fromhex("031902FF"))
        self.assertEqual(bytes(cb.uds_read_frames("default")[0][1][:3]), bytes.fromhex("021001"))
        with self.assertRaises(cb.Fail):
            cb.uds_read_frames("programming")
        bare = cb.PeakBus()
        bare.transmitting = True
        bare.classic = False
        bare.bitrate = cb.DIAGNOSTIC_BITRATE
        with self.assertRaises(cb.Fail) as caught:
            bare.send(0x18DBFFF1, bytes.fromhex("021003"), extended=True)
        self.assertIn("0x18DBFFF1", str(caught.exception))
        bare.classic = True
        bare.bitrate = 250000
        with self.assertRaises(cb.Fail):
            bare.send(0x18DBFFF1, bytes.fromhex("021003"), extended=True)
        bare.bitrate = cb.DIAGNOSTIC_BITRATE
        with self.assertRaises(cb.Fail):
            bare.send(0x18DBFFF1, bytes.fromhex("022701"), extended=True)
        with self.assertRaises(cb.Fail):
            bare.send(0x7DF, bytes.fromhex("021003"), extended=False)
        with self.assertRaises(cb.Fail):
            bare.send(0x0CF00400, bytes.fromhex("0322F190"), extended=True)
        opened = []
        sent = []
        real_open, real_send, real_close = cb.PeakBus.open_transmit, cb.PeakBus.send, cb.PeakBus.close

        def fake_open(self, classic=False, bitrate=500000):
            opened.append((classic, bitrate))
            self.transmitting = True

        def fake_send(self, can_id, data, extended=False, fd=False, brs=False):
            if not cb.is_inquiry(can_id, data, extended):
                raise cb.Fail(cb.NOT_A_QUESTION)
            sent.append((can_id, bytes(data), extended))

        cb.PeakBus.open_transmit = fake_open
        cb.PeakBus.send = fake_send
        cb.PeakBus.close = lambda self: None
        try:
            self.assertEqual(cb.main(["send", "--uds", "--session", "programming"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--uds", "--bitrate", "250000"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--id", "7E0", "--data", "02 27 01", "--classic"]), 2)
            self.assertEqual(cb.main(["send", "--id", "7E0", "--data", "02 10 03", "--classic"]), 2)
            self.assertEqual(cb.main(["send", "--id", "18DAF110", "--data", "02 3E 00", "--classic"]), 2)
            self.assertEqual(cb.main(["send", "--id", "CF00400", "--data", "03 22 F1 90", "--classic", "--extended"]), 2)
            self.assertEqual(cb.main(["send", "--uds", "--target", "F1"]), 2)
            self.assertEqual(opened, [])
            self.assertEqual(cb.main(["send", "--uds"]), 0)
            self.assertEqual(cb.main(["send", "--uds", "--target", "10"]), 0)
            self.assertEqual(cb.main(["send", "--id", "18DBFFF1", "--data", "02 10 03", "--classic"]), 0)
        finally:
            cb.PeakBus.open_transmit, cb.PeakBus.send, cb.PeakBus.close = real_open, real_send, real_close
        self.assertEqual(opened, [(True, 500000), (True, 500000), (True, 500000)])
        self.assertEqual(len(sent), 9)
        ids = [can_id for can_id, _data, _ext in sent]
        self.assertEqual(ids[:4], [0x18DBFFF1] * 4)
        self.assertEqual(ids[4:8], [0x18DA10F1] * 4)
        self.assertEqual(ids[8], 0x18DBFFF1)
        for can_id, data, ext in sent:
            self.assertTrue(ext)
            self.assertTrue(cb.is_inquiry(can_id, data, ext))
            self.assertNotIn(data[1], cb.BLOCKED_SERVICES)
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(cb.main([]), 0)
        self.assertIn("可以问，不能改", buf.getvalue())
        self.assertIn("18DBFFF1", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
