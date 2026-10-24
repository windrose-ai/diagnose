// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Windrose
/* Local CAN bench for the Windrose read page. Same rules as canbench.py.
   A DBC stays in this browser. Outbound frames are read-only questions.
   CAN XL is not implemented. CANBENCH_REV 2026-10-24.1 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Canbench = api;
})(typeof self !== "undefined" ? self : this, function () {
  var PGN_NAMES = {
    9472: "Multi-PG", 19712: "FD.TP.CM", 19968: "FD.TP.DT", 59904: "Request",
    60160: "TP.DT", 60416: "TP.CM", 60928: "Address Claim", 61444: "EEC1",
    65217: "HOURS", 65226: "DM1", 65227: "DM2", 65228: "DM3", 65229: "DM4",
    65230: "DM5", 65231: "DM6", 65235: "DM11", 65236: "DM12",
    65242: "Software ID", 65259: "Component ID", 65260: "VIN", 65262: "ET1", 65265: "CCVS1"
  };
  var READ_PGN = {65226:1, 65227:1, 65229:1, 65230:1, 65231:1, 65236:1, 65260:1, 65259:1, 65242:1, 60928:1};
  var READ_NAME = {dm1:65226, dm2:65227, dm4:65229, dm5:65230, dm6:65231, dm12:65236, vin:65260, component:65259, software:65242, address:60928};

  var UDS_ASK = {0x10:1, 0x19:1, 0x22:1, 0x3E:1};
  var OBD_READ = {0x01:1, 0x02:1, 0x03:1, 0x05:1, 0x06:1, 0x07:1, 0x09:1, 0x0A:1};
  var BLOCKED = {
    0x04:1, 0x08:1, 0x11:1, 0x14:1, 0x27:1, 0x28:1, 0x29:1, 0x2A:1, 0x2C:1,
    0x2E:1, 0x2F:1, 0x31:1, 0x34:1, 0x35:1, 0x36:1, 0x37:1, 0x38:1, 0x3D:1,
    0x83:1, 0x84:1, 0x85:1, 0x86:1, 0x87:1
  };
  var POLICY = "可以问，不能改";
  function serviceIsRead(payload) {
    if (!payload || !payload.length) return false;
    var sid = payload[0] & 255;
    if (BLOCKED[sid] || (!UDS_ASK[sid] && !OBD_READ[sid])) return false;
    if (sid === 0x10) {
      if (payload.length !== 2) return false;
      var session = payload[1] & 0x7f;
      return session === 0x01 || session === 0x03;
    }
    if (sid === 0x3e) {
      if (payload.length !== 2) return false;
      return (payload[1] & 0x7f) === 0x00;
    }
    if (sid === 0x22) return payload.length >= 3 && ((payload.length - 1) % 2) === 0;
    if (sid === 0x19) return payload.length >= 2 && (payload[1] & 0x7f) !== 0;
    return !!OBD_READ[sid];
  }
  function udsReadFrames(session) {
    var which = session || "extended";
    var sub = which === "default" ? 0x01 : 0x03;
    if (which !== "default" && which !== "extended") return null;
    var bodies = [
      [0x02, 0x10, sub],
      [0x02, 0x3e, 0x00],
      [0x03, 0x22, 0xf1, 0x90],
      [0x03, 0x19, 0x02, 0xff]
    ];
    return bodies.map(function (body) {
      var data = body.slice();
      while (data.length < 8) data.push(0);
      return { id: 0x7df, data: data, ext: false };
    });
  }
  function isJ1939ReadRequest(canId, data, extended) {
    var id = canId >>> 0;
    var b = data || [];
    if (!(extended || id > 0x7ff)) return false;
    if (((id >>> 26) & 7) !== 6 || ((id >>> 25) & 1) || ((id >>> 24) & 1)) return false;
    if (((id >>> 16) & 0xff) !== 0xea || ((id >>> 8) & 0xff) !== 0xff || (id & 0xff) !== 0xfe) return false;
    if (b.length < 3) return false;
    var pgn = (b[0] & 255) | ((b[1] & 255) << 8) | ((b[2] & 255) << 16);
    if (!READ_PGN[pgn]) return false;
    for (var i = 3; i < b.length; i++) if ((b[i] & 255) !== 0xff && (b[i] & 255) !== 0) return false;
    return true;
  }
  function isInquiry(canId, data, extended) {
    var b = data || [];
    if (isJ1939ReadRequest(canId, b, extended)) return true;
    var id = canId >>> 0;
    var ext = !!extended || id > 0x7ff;
    var ok = !ext ? (id === 0x7df || (id >= 0x7e0 && id <= 0x7e7))
      : (id === 0x18db33f1 || (((id & 0xffff00ff) === 0x18da00f1) && (((id >>> 8) & 0xff) !== 0xf1)));
    if (!ok || b.length < 2) return false;
    var pci = b[0] & 255;
    if (pci === 0x30) {
      if (b.length < 3 || (b[1] & 255) !== 0 || (b[2] & 255) !== 0) return false;
      for (var i = 3; i < b.length; i++) if ((b[i] & 255) !== 0) return false;
      return true;
    }
    if (pci < 1 || pci > 7 || b.length < 1 + pci) return false;
    return serviceIsRead(b.slice(1, 1 + pci));
  }
  function j1939Request(name) {
    var key = String(name).toLowerCase();
    if (key === "dm3" || key === "dm11") return null;
    var pgn = READ_NAME[key];
    if (pgn == null) {
      var n = parseInt(key, key.indexOf("0x") === 0 ? 16 : 10);
      if (!READ_PGN[n]) return null;
      pgn = n;
    }
    return { id: 0x18eafffe, data: [pgn & 255, (pgn >> 8) & 255, (pgn >> 16) & 255, 0xff, 0xff, 0xff, 0xff, 0xff] };
  }

  function pgnParts(canId) {
    var n = canId >>> 0;
    var pf = (n >>> 16) & 0xff;
    var ps = (n >>> 8) & 0xff;
    var sa = n & 0xff;
    var pgn, da;
    if (pf < 240) {
      pgn = ((n >>> 25) & 1) * 131072 + ((n >>> 24) & 1) * 65536 + (pf << 8);
      da = ps;
    } else {
      pgn = ((n >>> 25) & 1) * 131072 + ((n >>> 24) & 1) * 65536 + (pf << 8) + ps;
      da = null;
    }
    return { pgn: pgn, sa: sa, da: da };
  }

  function bitOn(data, bit) {
    var i = bit >> 3;
    if (bit < 0 || i >= data.length) return 0;
    return (data[i] & (1 << (bit & 7))) ? 1 : 0;
  }

  function extractRaw(data, start, length, intel) {
    var val = 0;
    var i, bit;
    if (intel) {
      for (i = 0; i < length; i++) if (bitOn(data, start + i)) val |= 1 << i;
    } else {
      bit = start;
      for (i = 0; i < length; i++) {
        if (bitOn(data, bit)) val |= 1 << (length - 1 - i);
        if (i + 1 === length) break;
        if ((bit % 8) === 0) bit += 15;
        else bit -= 1;
      }
    }
    return val >>> 0;
  }

  function parseDbc(text) {
    var messages = {};
    var cur = null;
    var bo = /^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+/;
    var sg = /^SG_\s+(\w+)(?:\s+(M|m\d+))?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*(?:\[[^\]]*\])?\s*"([^"]*)"/;
    text.split(/\r?\n/).forEach(function (line) {
      var s = line.trim();
      var m = bo.exec(s);
      if (m) {
        var full = parseInt(m[1], 10);
        cur = { id: full & 0x1fffffff, ext: full > 0x7ff, name: m[2], size: parseInt(m[3], 10), signals: [] };
        messages[cur.id] = cur;
        return;
      }
      m = sg.exec(s);
      if (m && cur && !(m[2] && m[2].charAt(0) === "m")) {
        cur.signals.push({
          name: m[1], start: parseInt(m[3], 10), length: parseInt(m[4], 10),
          intel: m[5] === "1", signed: m[6] === "-", factor: parseFloat(m[7]),
          offset: parseFloat(m[8]), unit: m[9]
        });
      }
    });
    return { messages: messages };
  }

  function signalValue(data, sig) {
    var raw = extractRaw(data, sig.start, sig.length, sig.intel);
    if (sig.signed && raw >= (1 << (sig.length - 1))) raw -= 1 << sig.length;
    return raw * sig.factor + sig.offset;
  }

  function decode(frames, dbc) {
    var rows = [];
    frames.forEach(function (fr) {
      var msg = dbc.messages[fr.id & 0x1fffffff];
      if (!msg) return;
      msg.signals.forEach(function (sig) {
        rows.push({ t: fr.t, message: msg.name, signal: sig.name, value: signalValue(fr.data, sig), unit: sig.unit || "" });
      });
    });
    return rows;
  }

  function plotHtml(frames, dbc, title) {
    var buckets = {};
    decode(frames, dbc).forEach(function (row) {
      var key = row.message + "." + row.signal + "\t" + row.unit;
      (buckets[key] = buckets[key] || []).push(row);
    });
    var series = [];
    Object.keys(buckets).forEach(function (key) {
      var pts = buckets[key];
      if (pts.length < 2 || series.length >= 12) return;
      var lo = pts[0].value, hi = lo;
      pts.forEach(function (p) { if (p.value < lo) lo = p.value; if (p.value > hi) hi = p.value; });
      if (lo === hi) return;
      series.push({ key: key, pts: pts, lo: lo, hi: hi });
    });
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
    var html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + esc(title || "CAN plot") +
      "</title><style>body{background:#f6f5f2;color:#1c1c1c;font:14px -apple-system,sans-serif;margin:24px}" +
      "svg{background:#fff;border:1px solid #ddd;display:block;margin:8px 0 20px}" +
      "p.policy{font-weight:600;color:#1c1c1c}p.note{color:#555}</style></head><body><h1>" +
      esc(title || "CAN plot") + "</h1><p class=\"policy\">" + POLICY +
      "</p><p class=\"note\">Local file. It is not sent to the assistant. Read-only questions only; the vehicle is not changed.</p>";
    if (!series.length) html += "<p>No signal in this recording changed value.</p>";
    series.forEach(function (s) {
      var pts = s.pts, t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      var spanT = (t1 - t0) || 1, spanV = (s.hi - s.lo) || 1;
      var coords = pts.map(function (p) {
        var x = 28 + (p.t - t0) / spanT * 664;
        var y = 112 - (p.value - s.lo) / spanV * 84;
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ");
      html += "<h2>" + esc(s.key.split("\t")[0]) + "</h2><svg viewBox=\"0 0 720 140\" width=\"720\" height=\"140\"><polyline fill=\"none\" stroke=\"#1d4e89\" stroke-width=\"1.5\" points=\"" + coords + "\"/></svg>";
    });
    return html + "</body></html>";
  }

  function dtcs(payload) {
    var found = [], i = 2;
    while (i + 4 <= payload.length) {
      var c0 = payload[i], c1 = payload[i + 1], c2 = payload[i + 2], c3 = payload[i + 3];
      i += 4;
      if ((c0 | c1 | c2 | c3) === 0 || (c0 & c1 & c2 & c3) === 0xff) continue;
      if (c3 & 0x80) { found.push({ cm: 1, oc: c3 & 0x7f }); continue; }
      found.push({ cm: 0, spn: c0 | (c1 << 8) | ((c2 & 0xe0) << 3), fmi: c2 & 0x1f, oc: c3 & 0x7f });
    }
    return found;
  }

  function cpgWalk(data) {
    var out = [], i = 0;
    while (i + 4 <= data.length) {
      var b0 = data[i] & 255;
      var tos = (b0 >> 5) & 7;
      var tf = (b0 >> 2) & 7;
      if (tos === 0) break;
      var pgn = ((b0 & 3) << 16) | ((data[i + 1] & 255) << 8) | (data[i + 2] & 255);
      var length = data[i + 3] & 255;
      i += 4;
      if (length > 60 || i + length > data.length) break;
      var payload = [];
      for (var k = 0; k < length; k++) payload.push(data[i + k] & 255);
      i += length;
      out.push({ pgn: pgn, payload: tf ? null : payload, length: length, tf: tf });
    }
    return out;
  }

  function keepDtc(pgn, payload, sa, rows) {
    if (pgn !== 0xfeca || !payload) return;
    dtcs(payload).forEach(function (d) { d.sa = sa; rows.push(d); });
  }

  function absorbCpgs(data, sa, counts, rows, notes) {
    cpgWalk(data).forEach(function (item) {
      var key = item.pgn + ":" + sa + ":";
      counts[key] = (counts[key] || 0) + 1;
      if (item.tf) notes.push(item);
      else keepDtc(item.pgn, item.payload, sa, rows);
    });
  }

  function collectJ1939(frames) {
    var counts = {}, dtcsOut = [], notes = [], pending = {}, fdJobs = {}, rebuilt = 0;
    frames.forEach(function (fr) {
      var data = fr.data || [];
      var id = fr.id >>> 0;
      var ext = !!fr.ext || id > 0x7ff;
      if (!ext && fr.fd && id <= 0xff) { absorbCpgs(data, id & 0xff, counts, dtcsOut, notes); return; }
      if (!ext) return;
      var parts = pgnParts(id);
      var key = parts.pgn + ":" + parts.sa + ":" + (parts.da == null ? "" : parts.da);
      if (parts.pgn === 0xec00 && data.length >= 8 && data[0] === 0x20) {
        pending[parts.sa] = { size: data[1] | (data[2] << 8), npk: data[3], pgn: data[5] | (data[6] << 8) | (data[7] << 16), got: {} };
        counts[key] = (counts[key] || 0) + 1;
        return;
      }
      if (parts.pgn === 0xeb00 && pending[parts.sa] && data.length) {
        var job = pending[parts.sa];
        job.got[data[0]] = data.slice(1, 8);
        var n = Object.keys(job.got).length;
        if (n >= job.npk && job.npk) {
          var blob = [];
          for (var s = 1; s <= job.npk; s++) blob = blob.concat(job.got[s] || []);
          blob = blob.slice(0, job.size);
          rebuilt++;
          keepDtc(job.pgn, blob, parts.sa, dtcsOut);
          var carried = job.pgn + ":" + parts.sa + ":";
          counts[carried] = (counts[carried] || 0) + 1;
          delete pending[parts.sa];
        }
        counts[key] = (counts[key] || 0) + 1;
        return;
      }
      if (parts.pgn === 0x2500) {
        counts[key] = (counts[key] || 0) + 1;
        absorbCpgs(data, parts.sa, counts, dtcsOut, notes);
        return;
      }
      if (parts.pgn === 0x4d00) {
        counts[key] = (counts[key] || 0) + 1;
        if (data.length >= 12) {
          var session = (data[0] >> 4) & 15;
          var ctrl = data[0] & 15;
          var jobKey = parts.sa + ":" + session;
          if (ctrl === 15) delete fdJobs[jobKey];
          else if (ctrl === 0 || ctrl === 4) {
            var size = data[1] | (data[2] << 8) | (data[3] << 16);
            var nseg = data[4] | (data[5] << 8) | (data[6] << 16);
            var carriedPgn = data[9] | (data[10] << 8) | (data[11] << 16);
            if (nseg > 0 && nseg <= 256 && size <= nseg * 60) fdJobs[jobKey] = { size: size, nseg: nseg, pgn: carriedPgn, got: {} };
          }
        }
        return;
      }
      if (parts.pgn === 0x4e00) {
        counts[key] = (counts[key] || 0) + 1;
        if (data.length >= 4 && (data[0] & 15) === 0) {
          var sess = (data[0] >> 4) & 15;
          var fdJob = fdJobs[parts.sa + ":" + sess];
          if (fdJob) {
            var seg = data[1] | (data[2] << 8) | (data[3] << 16);
            fdJob.got[seg] = data.slice(4, 64);
            var ready = true;
            for (var si = 1; si <= fdJob.nseg; si++) if (!fdJob.got[si]) ready = false;
            if (fdJob.nseg && ready) {
              var blob2 = [];
              for (var sj = 1; sj <= fdJob.nseg; sj++) blob2 = blob2.concat(fdJob.got[sj] || []);
              blob2 = blob2.slice(0, fdJob.size);
              rebuilt++;
              keepDtc(fdJob.pgn, blob2, parts.sa, dtcsOut);
              var ck = fdJob.pgn + ":" + parts.sa + ":";
              counts[ck] = (counts[ck] || 0) + 1;
              delete fdJobs[parts.sa + ":" + sess];
            }
          }
        }
        return;
      }
      counts[key] = (counts[key] || 0) + 1;
      if (parts.pgn === 0xfeca) keepDtc(parts.pgn, data, parts.sa, dtcsOut);
    });
    return { counts: counts, dtcs: dtcsOut, notes: notes, rebuilt: rebuilt };
  }

  function j1939Report(frames) {
    var got = collectJ1939(frames);
    var extN = 0;
    frames.forEach(function (fr) { if (fr.ext) extN++; });
    var lines = ["J1939 listen", "extended frames " + extN, "reassembled " + got.rebuilt];
    Object.keys(got.counts).sort(function (a, b) { return got.counts[b] - got.counts[a]; }).forEach(function (key) {
      var bits = key.split(":");
      var pgn = parseInt(bits[0], 10);
      var name = PGN_NAMES[pgn] || "";
      var dest = bits[2] === "" ? "" : " DA 0x" + (parseInt(bits[2], 10) & 255).toString(16);
      lines.push("PGN " + pgn + " " + name + "  SA 0x" + (parseInt(bits[1], 10) & 255).toString(16) + dest + "  count " + got.counts[key]);
    });
    got.notes.forEach(function (item) { lines.push("C-PG PGN " + item.pgn + "  len " + item.length + "  assurance"); });
    if (!got.dtcs.length) lines.push("DM1: no DTC in this recording");
    got.dtcs.forEach(function (d) {
      if (d.cm) lines.push("DM1 SA 0x" + d.sa.toString(16) + "  conversion method 1  OC " + d.oc);
      else lines.push("DM1 SA 0x" + d.sa.toString(16) + "  SPN " + d.spn + "  FMI " + d.fmi + "  OC " + d.oc);
    });
    return lines.join("\n") + "\n";
  }

  return {
    policy: POLICY,
    isInquiry: isInquiry,
    serviceIsRead: serviceIsRead,
    udsReadFrames: udsReadFrames,
    j1939Request: j1939Request,
    j1939Dtcs: function (frames) { return collectJ1939(frames).dtcs; },
    pgnParts: pgnParts,
    extractRaw: extractRaw,
    parseDbc: parseDbc,
    signalValue: signalValue,
    decode: decode,
    plotHtml: plotHtml,
    j1939Report: j1939Report
  };
});
