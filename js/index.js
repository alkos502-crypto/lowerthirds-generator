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

  // Фиксированный видео-трек для титров (V3 = Video 3, индекс 2)
  var TRACK = 2;

  var state = {
    headers: [],
    rows: [],
    mogrtPath: ""
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

function refreshTracks() {
    run("listTracksAndSeq()", function (d) {
      if (!d.ok) { show("mogrtInfo", d.error || "Ошибка", "err"); return; }
      if (!d.seq) {
        show("mogrtInfo", d.error || "Нет последовательности", "err");
        return;
      }
    });
  }

  // Позиция колонки в CSV по названию (точное совпадение, затем по подстроке)
  function colIndexOf(kind) {
    for (var i = 0; i < state.headers.length; i++) {
      if (String(state.headers[i] || "").trim().toLowerCase() === kind) return i;
    }
    for (var j = 0; j < state.headers.length; j++) {
      if (String(state.headers[j] || "").trim().toLowerCase().indexOf(kind) !== -1) return j;
    }
    return -1;
  }
  // Позиция колонки по любому из допустимых названий
  function colIndexByNames(names) {
    for (var a = 0; a < state.headers.length; a++) {
      var h = String(state.headers[a] || "").trim().toLowerCase();
      for (var b = 0; b < names.length; b++) if (h === names[b]) return a;
    }
    for (var c = 0; c < state.headers.length; c++) {
      var hc = String(state.headers[c] || "").trim().toLowerCase();
      for (var d = 0; d < names.length; d++) if (hc.indexOf(names[d]) !== -1) return c;
    }
    return -1;
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

  // ---------- создание ----------
  $("btnCreate").addEventListener("click", function () {
    refreshTracks();
    var iFio = colIndexByNames(["фио", "имя фамилия", "имя", "фамилия"]);
    var iDolz = colIndexOf("должность");
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
      if (iFio >= 0) {
        var v = rowVals[iFio];
        if (v !== undefined && String(v).trim() !== "") m["Имя Фамилия"] = String(v);
      }
      if (iDolz >= 0) {
        var v2 = rowVals[iDolz];
        if (v2 !== undefined && String(v2).trim() !== "") m["Должность"] = String(v2);
      }
      anyRow = true;
      maps.push(m);
    });
    if (!anyRow) { log("Нет заполненных строк для создания.", "err"); return; }
    if (skipped > 0) log("Пропущено пустых строк: " + skipped + ".");
    var track = TRACK;
    var pathArg = jsArg(JSON.stringify(state.mogrtPath || ""));
    log("Создаю " + maps.length + " титров на Video 3 (по 7 сек)…");
    run("createTitles(" + jsArg(JSON.stringify(maps)) + ", " + track + ", 7, " + pathArg + ")", function (d) {
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
    var ok = state.headers.length > 0;
    $("btnCreate").disabled = !ok;
  }

  // старт
  loadConfig();
  showMogrtPath();
  refreshTracks();
})();