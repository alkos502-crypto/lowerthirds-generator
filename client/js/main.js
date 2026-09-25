// Lower Thirds Generator — Install / Debug helper
// Copy this folder to your CEP extensions directory:
//   macOS: ~/Library/Application Support/Adobe/CEP/extensions/
//   Windows: %APPDATA%\Adobe\CEP\extensions\
// Then enable debug mode: Preferences → General → enable "Developer Mode"
// Restart Premiere Pro, find panel under Window → Extensions → Lower Thirds Generator

(function() {
  "use strict";

  var csInterface = new CSInterface();
  var host = null;
  var tableData = [];
  var headers = [];
  var mogrtParams = [];

  var $mogrtPath   = document.getElementById("mogrtPath");
  var $btnBrowse   = document.getElementById("btnBrowseMogrt");
  var $btnInspect  = document.getElementById("btnInspect");
  var $paramList   = document.getElementById("paramList");

  var $csvPath     = document.getElementById("csvPath");
  var $btnBrowseCsv= document.getElementById("btnBrowseCsv");
  var $previewTable= document.getElementById("previewTable");
  var $previewHead = document.getElementById("previewHeader");
  var $previewBody = document.getElementById("previewBody");
  var $rowCount    = document.getElementById("rowCount");

  var $mappingCont = document.getElementById("mappingContainer");
  var $trackIdx    = document.getElementById("trackIndex");
  var $durationSec = document.getElementById("durationSec");
  var $gapSec      = document.getElementById("gapSec");
  var $btnGenerate = document.getElementById("btnGenerate");
  var $status      = document.getElementById("status");

  function evalScript(script) {
    return new Promise(function(resolve, reject) {
      csInterface.evalScript(script, function(result) {
        if (result && typeof result === "string" && result.indexOf("EvalScript error") === 0) {
          reject(result);
        } else {
          try { resolve(JSON.parse(result)); }
          catch(e) { resolve(result); }
        }
      });
    });
  }

  function browseFile(title, filter, callback) {
    csInterface.evalScript(
      'var f = File.openDialog("' + title + '", "' + filter + '");'
      + 'if (f) f.fsName; else "";',
      function(path) {
        callback(path || "");
      }
    );
  }

  $btnBrowse.addEventListener("click", function() {
    browseFile("Select MOGRT", "Motion Graphics Template:*.mogrt;Text templates:*.mogrt",
      function(path) { if (path) $mogrtPath.value = path; });
  });

  $btnBrowseCsv.addEventListener("click", function() {
    browseFile("Select Spreadsheet",
      "Excel/CSV files:*.xlsx;*.xls;*.csv;Tab-separated:*.tsv;*.txt",
      function(path) {
        if (path) { $csvPath.value = path; loadSpreadsheet(path); }
      });
  });

  function loadSpreadsheet(path) {
    setStatus("Reading spreadsheet...", "progress");

    var ext = path.split(".").pop().toLowerCase();
    var isBinary = (ext === "xlsx" || ext === "xls");

    var script;
    if (isBinary) {
      // Read .xlsx as base64 via ExtendScript
      script = 'var f = new File("' + path.replace(/\\/g, "/") + '");'
        + 'if (f.open("r")) {'
        + '  var raw = f.read(); f.close();'
        + '  raw.encoding = "binary";'
        + '  var bytes = [];'
        + '  for (var i = 0; i < raw.length; i++) { bytes.push(raw.charCodeAt(i) & 0xFF); }'
        + '  var base64 = "";'
        + '  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";'
        + '  for (var i = 0; i < bytes.length; i += 3) {'
        + '    var b = [bytes[i], bytes[i+1]||0, bytes[i+2]||0];'
        + '    var idx = [b[0]>>2, ((b[0]&3)<<4)|(b[1]>>4), ((b[1]&15)<<2)|(b[2]>>6), b[2]&63];'
        + '    base64 += chars[idx[0]] + chars[idx[1]] + chars[idx[2]] + chars[idx[3]];'
        + '  }'
        + '  var pad = (3 - bytes.length % 3) % 3;'
        + '  if (pad) base64 = base64.slice(0, -pad) + (pad === 1 ? "=" : "==");'
        + '  base64;'
        + '} else { ""; }';
    } else {
      script = 'var f = new File("' + path.replace(/\\/g, "/") + '");'
        + 'if (f.open("r")) {'
        + '  f.encoding = "UTF-8";'
        + '  var d = f.read(); f.close(); d;'
        + '} else { ""; }';
    }

    csInterface.evalScript(script, function(rawData) {
      if (!rawData) { setStatus("Cannot read file.", "error"); return; }

      try {
        var workbook;
        if (isBinary) {
          var binary = atob(rawData);
          workbook = XLSX.read(binary, {type: "binary", raw: true});
        } else {
          workbook = XLSX.read(rawData, {type: "string", raw: true});
        }

        var sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) { setStatus("No sheets found.", "error"); return; }

        var json = XLSX.utils.sheet_to_json(sheet, {defval: ""});
        if (!json.length) { setStatus("Empty sheet.", "error"); return; }

        tableData = json;
        headers = Object.keys(json[0]);
        renderPreview();
        buildMapping();
        updateGenerateButton();
        setStatus("Loaded " + json.length + " rows.", "success");
      } catch(e) {
        setStatus("Parse error: " + e.message, "error");
      }
    });
  }

  function renderPreview() {
    $previewHead.innerHTML = headers.map(function(h) {
      return "<th>" + escHtml(h) + "</th>";
    }).join("");

    var maxRows = 10;
    $previewBody.innerHTML = tableData.slice(0, maxRows).map(function(row) {
      return "<tr>" + headers.map(function(h) {
        return "<td>" + escHtml(String(row[h] || "")) + "</td>";
      }).join("") + "</tr>";
    }).join("");

    $previewTable.classList.add("show");
    $rowCount.textContent = tableData.length + " rows" +
      (tableData.length > maxRows ? " (showing first " + maxRows + ")" : "");
  }

  function buildMapping() {
    $mappingCont.innerHTML = "";
    var suggest = ["Name", "Title", "Company", "Subtitle", "Location", "Date", "Role", "Department"];
    var colNames = headers.slice(0, 8);

    colNames.forEach(function(col) {
      var row = document.createElement("div");
      row.className = "mapping-row";

      var label = document.createElement("span");
      label.className = "col-name";
      label.textContent = col;
      row.appendChild(label);

      var select = document.createElement("select");
      select.dataset.col = col;

      var emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "(skip)";
      select.appendChild(emptyOpt);

      var allParamNames = mogrtParams.length
        ? mogrtParams.map(function(p) { return p.displayName; })
        : suggest;

      allParamNames.forEach(function(pn) {
        var opt = document.createElement("option");
        opt.value = pn;
        opt.textContent = pn;
        if (pn.toLowerCase() === col.toLowerCase()) opt.selected = true;
        select.appendChild(opt);
      });

      row.appendChild(select);
      $mappingCont.appendChild(row);
      select.addEventListener("change", updateGenerateButton);
    });
    updateGenerateButton();
  }

  $btnInspect.addEventListener("click", function() {
    var path = $mogrtPath.value.trim();
    if (!path) { setStatus("Select a MOGRT file first.", "error"); return; }
    setStatus("Inspecting MOGRT...", "progress");

    evalScript("LowerThirdsGenerator.inspectMGT(" + JSON.stringify(path) + ")")
      .then(function(result) {
        if (result.error) { setStatus(result.error, "error"); return; }
        mogrtParams = result.params || [];
        $paramList.innerHTML = mogrtParams.length
          ? mogrtParams.map(function(p) {
              return '<div class="param-item">' + escHtml(p.displayName) + '</div>';
            }).join("")
          : '<div class="param-item" style="color:#c66">No text params found</div>';
        $paramList.classList.add("show");
        setStatus("Found " + mogrtParams.length + " parameter(s).", "success");
        if (headers.length) buildMapping();
      })
      .catch(function(err) {
        setStatus("Inspect failed: " + String(err).slice(0, 200), "error");
      });
  });

  $btnGenerate.addEventListener("click", function() {
    var mogrtPath = $mogrtPath.value.trim();
    if (!mogrtPath) { setStatus("Select MOGRT path.", "error"); return; }

    var columnMap = {};
    var selects = $mappingCont.querySelectorAll("select");
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      if (sel.value) columnMap[sel.dataset.col] = sel.value;
    }

    var durSec = parseFloat($durationSec.value) || 5;
    var gapSec = parseFloat($gapSec.value) || 2;
    var trackIdx = parseInt($trackIdx.value, 10) || 3;
    if (trackIdx < 1) trackIdx = 1;

    var TICKS_PER_SEC = 254016000000;
    var durTicks = Math.round(durSec * TICKS_PER_SEC);
    var gapTicks = Math.round(gapSec * TICKS_PER_SEC);

    var payload = {
      mogrtPath: mogrtPath,
      rows: tableData,
      columnMap: columnMap,
      trackIndex: trackIdx,
      startTicks: 0,
      durationTicks: durTicks,
      gapTicks: gapTicks
    };

    setStatus("Generating " + tableData.length + " lower thirds...", "progress");
    $btnGenerate.disabled = true;

    evalScript("LowerThirdsGenerator.generate(" + JSON.stringify(payload) + ")")
      .then(function(result) {
        if (result && result.success) {
          setStatus("Created " + result.itemsCreated + " lower thirds!", "success");
        } else {
          setStatus("Generation error.", "error");
        }
        $btnGenerate.disabled = false;
      })
      .catch(function(err) {
        setStatus("Error: " + String(err).slice(0, 300), "error");
        $btnGenerate.disabled = false;
      });
  });

  function escHtml(s) {
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function setStatus(msg, type) {
    $status.textContent = msg;
    $status.className = "status show " + (type || "info");
  }

  function updateGenerateButton() {
    var hasData = tableData.length > 0;
    var hasPath = $mogrtPath.value.trim().length > 0;
    var hasMapping = $mappingCont.querySelectorAll("select[value]:not([value=''])").length > 0;
    $btnGenerate.disabled = !(hasData && hasPath && hasMapping);
  }

  // Auto-fill the MOGRT path from assets/ shipped inside the extension folder,
  // so the user does not have to browse for the template manually.
  function autoFillMogrtPath() {
    try {
      if ($mogrtPath && $mogrtPath.value.trim()) return; // already set
      var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
      if (!extPath) return;
      var candidate = extPath + "/assets/" + "MC TITLE Russia1 ISPRAVLEN.mogrt";
      csInterface.evalScript(
        'var f = new File(' + JSON.stringify(candidate) + '); f.exists ? f.fsName : "";',
        function(res) {
          if (res && $mogrtPath) { $mogrtPath.value = res; updateGenerateButton(); }
        }
      );
    } catch (e) { /* non-fatal */ }
  }

  autoFillMogrtPath();
  setStatus("Ready. Select MOGRT and data file.", "info");

})();