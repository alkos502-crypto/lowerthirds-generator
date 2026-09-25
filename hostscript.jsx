// Lower Thirds Generator — ExtendScript for Premiere Pro
// Runs on the host side, creates MOGRT clips and sets text from tabular data

// Helper: JSON.parse fallback for the CEP host
if (typeof JSON === "undefined") {
  //#include "json2.jsx"
}

(function() {
  var _exports = {};

  // ── Public API called from the panel via CSXS ──────────────────────────

  _exports.generate = function(params) {
    /*
      params = {
        mogrtPath: "/path/to/template.mogrt",
        rows: [
          { "Name": "John", "Title": "CEO", "Company": "Acme" },
          ...
        ],
        columnMap: { "Name": "Name", "Title": "Title", "Company": "Company" },
        trackIndex: 3,
        startFrame: 0,
        durationTicks: 900000,       // ~30s at 30fps
        gapTicks: 300000             // ~10s gap
      }
    */

    var seq = app.project.activeSequence;
    if (!seq) { throw new Error("No active sequence."); }
    if (!params.rows || !params.rows.length) { throw new Error("No data rows."); }
    if (!params.mogrtPath) { throw new Error("No MOGRT path specified."); }

    // Resolve tick → time
    var tickRate = seq.timeDisplayFormat === 24 ? 254016000000 :  // 24fps timecode
                   254016000000; // fallback — Premiere uses 254016000000 ticks/sec

    // We'll work in ticks.  durationTicks & gapTicks are already ticks.
    var dur = params.durationTicks || 900000;
    var gap = params.gapTicks || 300000;
    var cursor = params.startTicks || 0;

    var trackIdx = params.trackIndex || 3;

    // Ensure the target track exists
    var videoTracks = seq.videoTracks;
    while (videoTracks.numTracks < trackIdx + 1) {
      seq.addVideoTrack();
    }

    var track = videoTracks[trackIdx];
    var createdItems = [];

    for (var r = 0; r < params.rows.length; r++) {
      var row = params.rows[r];

      // 1. Import MOGRT at cursor position
      var item = seq.importMGT(params.mogrtPath, cursor, trackIdx, 0);
      if (!item) {
        throw new Error("Failed to import MOGRT at row " + (r + 1));
      }

      // 2. Set duration
      if (item.duration) {
        try { item.duration.ticks = dur; } catch(e) {}
      }

      // 3. Set text parameters on the MGT component
      var mgtComp = item.getMGTComponent();
      if (mgtComp) {
        _exports.setMGTTextParams(mgtComp, row, params.columnMap);
      }

      createdItems.push(item);

      // Advance cursor: duration + gap
      cursor += dur + gap;
    }

    return {
      success: true,
      itemsCreated: createdItems.length,
      firstItem: createdItems[0] ? createdItems[0].name : null
    };
  };

  // ── Set MOGRT text parameters ────────────────────────────────────────

  _exports.setMGTTextParams = function(mgtComp, row, columnMap) {
    /*
      columnMap example:
      {
        "Name": "name_param",       // MOGRT param display name → column key
        "Title": "title_param",
        "Company": "company_param"
      }
    */
    if (!mgtComp || !mgtComp.properties) return;

    var props = mgtComp.properties;

    for (var colKey in columnMap) {
      if (!columnMap.hasOwnProperty(colKey)) continue;
      var paramDisplayName = columnMap[colKey];
      var textValue = row[colKey];
      if (textValue === undefined || textValue === null) continue;
      textValue = String(textValue);

      var param = props.getParamForDisplayName(paramDisplayName);
      if (!param) continue;

      try {
        var raw = param.getValue();
        var paramObj = (typeof raw === "string") ? JSON.parse(raw) : raw;
        if (!paramObj || typeof paramObj !== "object") continue;

        paramObj.textEditValue = textValue;
        paramObj.fontTextRunLength = [textValue.length];
        if (paramObj.textCase) {
          // Preserve case setting from template
        }

        param.setValue(JSON.stringify(paramObj), true);
      } catch(e) {
        $.writeln("Failed to set param '" + paramDisplayName + "': " + e.message);
      }
    }
  };

  // ── List MOGRT parameters (for column mapping) ────────────────────────

  _exports.inspectMGT = function(mogrtPath) {
    var seq = app.project.activeSequence;
    if (!seq) return { error: "No active sequence" };

    // Import temporarily at time 0 on a hidden track
    var item = seq.importMGT(mogrtPath, 0, 0, 0);
    if (!item) return { error: "Failed to import MOGRT for inspection" };

    var mgtComp = item.getMGTComponent();
    if (!mgtComp || !mgtComp.properties) {
      return { error: "No MGT component found (not an AE-based MOGRT?)" };
    }

    var params = [];
    var props = mgtComp.properties;
    var n = props.numItems;
    for (var i = 0; i < n; i++) {
      var p = props[i];
      if (p) {
        params.push({
          displayName: p.displayName,
          matchName: p.matchName,
          type: p.type
        });
      }
    }

    // Remove the temporary clip
    try { item.remove(false); } catch(e) {}

    return { params: params };
  };

  // ── Export ────────────────────────────────────────────────────────────

  $.global.LowerThirdsGenerator = _exports;
  $.writeln("Lower Thirds Generator loaded.");

})();