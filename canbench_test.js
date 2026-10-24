// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Windrose
var cb = require("./canbench.js");
var assert = require("assert");

var dbc = cb.parseDbc([
  "BO_ 256 SpeedMsg: 8 Vector__XXX",
  " SG_ VehicleSpeed : 0|16@1+ (0.1,0) [0|200] \"km/h\" Vector__XXX",
  " SG_ EngineSpeed : 23|16@0+ (0.125,0) [0|8000] \"rpm\" Vector__XXX",
  " SG_ Muxed m0 : 16|8@1+ (1,0) [0|0] \"\" Vector__XXX"
].join("\n"));
assert.strictEqual(dbc.messages[256].signals.length, 2);
assert.strictEqual(cb.extractRaw([0x34, 0x12], 0, 16, true), 0x1234);
assert.strictEqual(cb.extractRaw([0x12, 0x34], 7, 16, false), 0x1234);
var rows = cb.decode([{ t: 0.1, id: 256, ext: false, data: [0x34, 0x12, 0x12, 0x34, 0, 0, 0, 0] }], dbc);
assert.ok(Math.abs(rows[0].value - 466) < 1e-6);
assert.ok(Math.abs(rows[1].value - 582.5) < 1e-6);

var pdu1 = cb.pgnParts(0x18daf100);
assert.strictEqual(pdu1.pgn, 0xda00);
assert.strictEqual(pdu1.da, 0xf1);
var pdu2 = cb.pgnParts(0x18feca00);
assert.strictEqual(pdu2.pgn, 0xfeca);
assert.strictEqual(pdu2.da, null);

var report = cb.j1939Report([
  { t: 0.3, id: 0x18feca00, ext: true, data: [0, 0, 0xd2, 0x04, 0x05, 0x03, 0xff, 0xff] }
]);
assert.ok(report.indexOf("SPN 1234") >= 0);
assert.ok(report.indexOf("FMI 5") >= 0);

var page = cb.plotHtml([
  { t: 0.1, id: 256, data: [0x34, 0x12, 0x12, 0x34, 0, 0, 0, 0] },
  { t: 0.2, id: 256, data: [0x35, 0x12, 0x12, 0x34, 0, 0, 0, 0] }
], dbc, "t");
assert.ok(page.indexOf("<svg") >= 0);
assert.ok(page.indexOf("#f6f5f2") >= 0);
assert.ok(page.indexOf("可以问，不能改") >= 0);
assert.strictEqual(cb.policy, "可以问，不能改");
assert.ok(page.indexOf("VehicleSpeed") >= 0);
assert.strictEqual(page.indexOf("EngineSpeed"), -1);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x01, 0x0D], false), true);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x10, 0x03, 0, 0, 0, 0, 0], false), true);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x10, 0x01, 0, 0, 0, 0, 0], false), true);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x3E, 0x00, 0, 0, 0, 0, 0], false), true);
assert.strictEqual(cb.isInquiry(0x7DF, [0x03, 0x22, 0xF1, 0x90, 0, 0, 0, 0], false), true);
assert.strictEqual(cb.isInquiry(0x7DF, [0x03, 0x19, 0x02, 0xFF, 0, 0, 0, 0], false), true);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x10, 0x02, 0, 0, 0, 0, 0], false), false);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x27, 0x01, 0, 0, 0, 0, 0], false), false);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x34, 0x00, 0, 0, 0, 0, 0], false), false);
assert.strictEqual(cb.isInquiry(0x7DF, [0x02, 0x36, 0x01, 0, 0, 0, 0, 0], false), false);
assert.strictEqual(cb.isInquiry(0x7DF, [0x01, 0x37, 0, 0, 0, 0, 0, 0], false), false);
assert.strictEqual(cb.isInquiry(0x7DF, [0x04, 0x31, 0x01, 0x02, 0x03, 0, 0, 0], false), false);
assert.strictEqual(cb.isInquiry(0x7DF, [0x03, 0x2F, 0xF1, 0x90, 0, 0, 0, 0], false), false);
assert.strictEqual(cb.isInquiry(0x0CF00400, [0x03, 0x22, 0xF1, 0x90, 0, 0, 0, 0], true), false);
assert.strictEqual(cb.isInquiry(0x7DF, [0x03, 0x2E, 0xF1, 0x90], false), false);
var poll = cb.udsReadFrames("extended");
assert.strictEqual(poll.length, 4);
poll.forEach(function (fr) { assert.strictEqual(cb.isInquiry(fr.id, fr.data, fr.ext), true); });
assert.strictEqual(cb.udsReadFrames("programming"), null);
assert.strictEqual(cb.isInquiry(0x7E0, [0x30, 0x00, 0x00], false), true);
assert.strictEqual(cb.isInquiry(0x18FEF100, [0, 1, 2, 3, 4, 5, 6, 7], true), false);
var req = cb.j1939Request("dm1");
assert.strictEqual(req.id, 0x18eafffe);
assert.deepStrictEqual(req.data, [0xca, 0xfe, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff]);
assert.strictEqual(cb.isInquiry(req.id, req.data, true), true);
assert.strictEqual(cb.j1939Request("dm11"), null);
assert.strictEqual(cb.j1939Request("65235"), null);
assert.strictEqual(cb.isInquiry(0x18eafffe, [0xd3, 0xfe, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff], true), false);
assert.strictEqual(cb.isInquiry(0x18eefffe, [0, 1, 2, 3, 4, 5, 6, 7], true), false);
var cpg = [0x40, 0xfe, 0xca, 8, 0x00, 0x00, 0x7b, 0x00, 0x02, 0x01, 0xff, 0xff];
var multi = cb.j1939Report([{ t: 0.1, id: 0x1825ff31, ext: true, fd: true, data: cpg }]);
assert.ok(multi.indexOf("SPN 123") >= 0);
assert.ok(multi.indexOf("FMI 2") >= 0);
var fbff = cb.j1939Dtcs([{ t: 0.1, id: 0x31, ext: false, fd: true, data: cpg }]);
assert.strictEqual(fbff[0].spn, 123);
assert.strictEqual(fbff[0].fmi, 2);
assert.strictEqual(cb.j1939Dtcs([{ t: 0.1, id: 0x31, ext: false, data: cpg }]).length, 0);
var assured = cb.j1939Report([{ t: 0.1, id: 0x1825ff31, ext: true, fd: true, data: [0x44, 0xfe, 0xca, 8, 0, 0, 0x7b, 0, 2, 1, 0xff, 0xff] }]);
assert.strictEqual(assured.indexOf("SPN 123"), -1);
assert.ok(assured.indexOf("assurance") >= 0);
var fdRep = cb.j1939Report([
  { t: 0.1, id: 0x184dff31, ext: true, fd: true, data: [0x14, 0x08, 0, 0, 1, 0, 0, 0, 0, 0xca, 0xfe, 0] },
  { t: 0.2, id: 0x184eff31, ext: true, fd: true, data: [0x10, 1, 0, 0, 0, 0, 0x7b, 0, 2, 1, 0xff, 0xff] }
]);
assert.ok(fdRep.indexOf("reassembled 1") >= 0);
assert.ok(fdRep.indexOf("SPN 123") >= 0);
console.log("canbench.js ok");
