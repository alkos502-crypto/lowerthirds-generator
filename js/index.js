// index.js — логика панели Lower Thirds Generator
(function () {
  "use strict";

  function CSInterface() {}
  CSInterface.prototype.evalScript = function (script, callback) {
    var cb = callback || function () {};
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(script, function (ev) {
        cb(ev && ev.data !== undefined ? ev.data : ev);
      });
    } else {
      cb("__ERR__: CEP-рантайм недоступен");
    }
  };
  var cs = new CSInterface();

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    headers: [],
    rows: [],
    params: [],
    paramWarning: "",
    mogrtPath: "",
    selected: [] // для каждой колонки выбранный параметр
  };

  function log(msg, kind) {
    var box = $("log");
    var line = document.createElement("div");
    line.className = "logline" + (kind ? " " + kind : "");
    line.textContent = msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }
  // Передаёт JSON-данные в ExtendScript только в ASCII (\uXXXX для не-ASCII),
  // чтобы кириллица не ломалась на границе evalScript.
  function jsArg(innerJson) {
    var ascii = innerJson.replace(/[^\x20-\x7e]/g, function (c) {
      return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
    });
    return JSON.stringify(ascii);
  }
  function show(id, text, kind) {
    var el = $(id);
    el.className = "hint" + (kind ? " " + kind : "");
    el.textContent = text;
  }

  function run(fn, callback) {
    cs.evalScript(fn, function (raw) {
      var data;
      if (typeof raw === "string" && raw.indexOf("__ERR__") === 0) {
        log(raw, "err");
        return;
      }
      try { data = JSON.parse(raw); }
      catch (e) { log("Ошибка ответа: " + raw, "err"); return; }
      if (callback) callback(data);
    });
  }

  function refreshTracks(selectTrack) {
    run("listTracksAndSeq()", function (d) {
      if (!d.ok) { show("mogrtInfo", d.error || "Ошибка", "err"); return; }
      if (!d.seq) {
        show("mogrtInfo", d.error || "Нет последовательности", "err");
        return;
      }
      var sel = $("trackSel");
      sel.innerHTML = "";
      d.tracks.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.index;
        o.textContent = t.label;
        sel.appendChild(o);
      });
      if (selectTrack !== undefined) sel.value = selectTrack;
    });
  }

  function buildMapping() {
    var map = $("mapping");
    map.innerHTML = "";
    var fields = state.headers;
    state.selected = [];
    if (state.params.length === 0) {
      // ручной ввод имени параметра, т.к. перечислить не удалось
      fields.forEach(function (h, idx) {
        var row = document.createElement("div");
        row.className = "mrow";
        var left = document.createElement("div"); left.className = "colname"; left.textContent = h;
        var inp = document.createElement("input");
        inp.type = "text"; inp.placeholder = "имя параметра в MOGRT"; inp.className = "sel";
        inp.value = (state.params.indexOf(h) >= 0) ? h : "";
        inp.setAttribute("data-i", idx);
        var pos = document.createElement("div"); pos.className = "pos";
        row.appendChild(left); row.appendChild(inp); row.appendChild(pos);
        map.appendChild(row);
        state.selected[idx] = "";
      });
    } else {
      fields.forEach(function (h, idx) {
        var row = document.createElement("div");
        row.className = "mrow";
        var left = document.createElement("div"); left.className = "colname"; left.textContent = h;
        var sel = document.createElement("select");
        var opt0 = document.createElement("option"); opt0.value = ""; opt0.textContent = "— не заполнять —";
        sel.appendChild(opt0);
        var auto = state.params.indexOf(h) >= 0 ? h : "";
        state.params.forEach(function (p) {
          var o = document.createElement("option");
          o.value = p; o.textContent = p;
          sel.appendChild(o);
        });
        sel.value = auto;
        sel.setAttribute("data-i", idx);
        var pos = document.createElement("div"); pos.className = "pos";
        row.appendChild(left); row.appendChild(sel); row.appendChild(pos);
        map.appendChild(row);
        state.selected[idx] = auto;
      });
    }
    $("mapCard").style.display = "block";
  }

  function collectMapping() {
    var out = [];
    var rows = $("mapping").querySelectorAll(".mrow");
    for (var i = 0; i < rows.length; i++) {
      var cell = rows[i].querySelector("select, input");
      out.push(cell ? cell.value : "");
    }
    state.selected = out;
  }

  function loadConfig() {
    try {
      var req = new XMLHttpRequest();
      req.open("GET", "config.json", false);
      req.send();
      var cfg = JSON.parse(req.responseText);
      if (cfg && cfg.mogrtPath) state.mogrtPath = String(cfg.mogrtPath);
    } catch (e) { state.mogrtPath = ""; }
  }

  function showMogrtPath() {
    if (state.mogrtPath) { $("mogrtPath").textContent = "Шаблон: " + state.mogrtPath; return; }
    run("getDefaultMogrtPath()", function (d) {
      if (d && d.path) { state.mogrtPath = d.path; $("mogrtPath").textContent = "Шаблон: " + d.path; }
    });
  }

  // ---------- шаг 1: CSV ----------
  $("btnCsv").addEventListener("click", function () { $("csvFile").click(); });

  $("csvFile").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { show("csvInfo", "Не удалось прочитать файл.", "err"); };
    reader.onload = function () {
      var text = String(reader.result || "").replace(/^\uFEFF/, "");
      var parsed = parseCSVText(text);
      if (!parsed.length) { show("csvInfo", "Файл пуст или не распознан.", "err"); return; }
      state.headers = parsed[0];
      state.rows = parsed.slice(1);
      show("csvInfo", "Файл загружен: " + state.rows.length + " строк(и). Колонки: " + state.headers.join(" · "), "ok");
      log("CSV: " + state.rows.length + " строк(и), колонок: " + state.headers.length, "ok");
      if (state.params.length) buildMapping();
      tryEnable();
    };
    reader.readAsText(file, "utf-8");
  });

  function detectDelim(text) {
    var first = String(text).split(/\r?\n/)[0] || "";
    var c1 = (first.match(/,/g) || []).length;
    var c2 = (first.match(/;/g) || []).length;
    var c3 = (first.match(/\t/g) || []).length;
    if (c2 > c1 && c2 >= c3) return ";";
    if (c3 > c1 && c3 > c2) return "\t";
    return ",";
  }
  function parseCSVText(text) {
    var delim = detectDelim(text);
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === delim) { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* пропуск */ }
        else field += c;
      }
    }
    if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  // ---------- шаг 2: MOGRT ----------
  $("btnMogrt").addEventListener("click", function () {
    refreshTracks();
    var track = $("trackSel").value;
    var pathArg = jsArg(JSON.stringify(state.mogrtPath || ""));
    run("loadMogrt(" + track + ", " + pathArg + ")", function (d) {
      if (!d.ok) { show("mogrtInfo", d.error, "err"); return; }
      state.params = d.params || [];
      state.paramWarning = d.paramWarning || "";
      show("mogrtInfo", "Шаблон загружен. Параметры: " + (state.params.length ? state.params.join(" · ") : "не найдены"), "ok");
      var chips = $("paramChips"); chips.innerHTML = "";
      state.params.forEach(function (p) {
        var c = document.createElement("span"); c.className = "chip"; c.textContent = p;
        chips.appendChild(c);
      });
      if (state.params.length === 0 && state.paramWarning) {
        var w = document.createElement("div");
        w.className = "hint err"; w.style.marginTop = "6px"; w.textContent = state.paramWarning;
        chips.appendChild(w);
      }
      if (d.tracks) {
        var sel = $("trackSel"); sel.innerHTML = "";
        d.tracks.forEach(function (t) {
          var o = document.createElement("option"); o.value = t.index; o.textContent = t.label;
          sel.appendChild(o);
        });
        if (d.usedTrack !== undefined) sel.value = d.usedTrack;
      }
      if (state.headers.length) buildMapping();
      tryEnable();
    });
  });

  // ---------- шаг 3: создание ----------
  $("btnCreate").addEventListener("click", function () {
    collectMapping();
    var maps = [];
    var skipped = 0;
    var anyRow = false;
    state.rows.forEach(function (rowVals) {
      var rowEmpty = true;
      for (var c = 0; c < rowVals.length; c++) {
        if (rowVals[c] !== undefined && String(rowVals[c]).trim() !== "") { rowEmpty = false; break; }
      }
      if (rowEmpty) { skipped++; return; }
      var m = {};
      for (var i = 0; i < state.selected.length; i++) {
        var param = state.selected[i];
        var val = (rowVals[i] !== undefined) ? String(rowVals[i]) : "";
        if (param && val !== "") m[param] = val;
      }
      anyRow = true;
      maps.push(m);
    });
    if (!anyRow) { log("Нет заполненных строк для создания.", "err"); return; }
    if (skipped > 0) log("Пропущено пустых строк: " + skipped + ".");
    var track = $("trackSel").value;
    var durArg = jsArg(JSON.stringify(String($("durSec").value || "").trim()));
    log("Создаю " + maps.length + " титров на треке V" + (parseInt(track, 10) + 1) + "…");
    run("createTitles(" + jsArg(JSON.stringify(maps)) + ", " + track + ", " + durArg + ")", function (d) {
      if (!d.ok) { log(d.error, "err"); return; }
      if (d.errors && d.errors.length) d.errors.forEach(function (e) { log(e, "err"); });
      if (d.step) log("Шаг расстановки: " + d.step.toFixed(2) + " сек на титр.");
      if (d.timeline) {
        log("Клипов на треке после расстановки: " + d.timeline.length);
        d.timeline.forEach(function (s) { log("  Старт: " + s.toFixed(2) + " c."); });
      }
      log("Готово: создано " + d.created + " из " + d.total + ".", d.created === d.total ? "ok" : "err");
    });
  });

  function tryEnable() {
    var ok = state.headers.length > 0 && state.params.length > 0;
    $("btnCreate").disabled = !ok;
  }

  // старт
  loadConfig();
  showMogrtPath();
  refreshTracks();
})();