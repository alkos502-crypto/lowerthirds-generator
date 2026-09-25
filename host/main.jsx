// main.jsx
// Lower Thirds Generator — хост-скрипт ExtendScript для Premiere Pro.
// Раскладывает титры нижней трети из CSV в MOGRT-шаблон и записывает текст внутрь шаблона.

// ---------------------------------------------------------------------------
// JSON fallback (в старых рантаймах ExtendScript нет нативного JSON)
// ---------------------------------------------------------------------------
function _jsonParse(text) {
    var i = 0, len = text.length;
    function ws() { while (i < len && " \t\r\n".indexOf(text.charAt(i)) >= 0) i++; }
    function str() {
        i++; var out = "";
        while (i < len) {
            var c = text.charAt(i);
            if (c === '"') { i++; return out; }
            if (c === "\\") {
                i++; var e = text.charAt(i);
                if (e === "n") out += "\n"; else if (e === "t") out += "\t";
                else if (e === "r") out += "\r"; else if (e === "b") out += "\b";
                else if (e === "f") out += "\f"; else if (e === "u") { out += String.fromCharCode(parseInt(text.substr(i + 1, 4), 16)); i += 4; }
                else out += e; i++;
            } else { out += c; i++; }
        }
        throw new Error("bad string");
    }
    function val() {
        ws(); var c = text.charAt(i);
        if (c === '"') return str();
        if (c === "{") {
            var o = {}; i++; ws();
            if (text.charAt(i) === "}") { i++; return o; }
            while (i < len) {
                ws(); var k = str(); ws();
                if (text.charAt(i) !== ":") throw new Error("bad obj");
                i++; o[k] = val(); ws();
                if (text.charAt(i) === ",") { i++; continue; }
                if (text.charAt(i) === "}") { i++; break; }
                throw new Error("bad obj");
            }
            return o;
        }
        if (c === "[") {
            var a = []; i++; ws();
            if (text.charAt(i) === "]") { i++; return a; }
            while (i < len) { a.push(val()); ws(); if (text.charAt(i) === ",") { i++; continue; }
                if (text.charAt(i) === "]") { i++; break; } throw new Error("bad arr"); }
            return a;
        }
        if (text.substr(i, 4) === "true" ) { i += 4; return true; }
        if (text.substr(i, 5) === "false") { i += 5; return false; }
        if (text.substr(i, 4) === "null" ) { i += 4; return null; }
        var nm = "";
        while (i < len && "-+0123456789.eE".indexOf(text.charAt(i)) >= 0) { nm += text.charAt(i); i++; }
        if (nm === "") throw new Error("bad value");
        return parseFloat(nm);
    }
    ws(); var r = val(); ws(); return r;
}
function _jsonStr(s) {
    function esc(str) {
        var out = '"';
        for (var k = 0; k < str.length; k++) {
            var c = str.charAt(k), code = str.charCodeAt(k);
            if (c === '"') out += '\\"'; else if (c === "\\") out += "\\\\";
            else if (c === "\n") out += "\\n"; else if (c === "\t") out += "\\t";
            else if (c === "\r") out += "\\r";
            else if (code < 32) out += "\\u" + ("000" + code.toString(16)).slice(-4);
            else out += c;
        }
        return out + '"';
    }
    if (s === null || s === undefined) return 'null';
    var t = typeof s;
    if (t === "string") return esc(s);
    if (t === "number") return isFinite(s) ? String(s) : 'null';
    if (t === "boolean") return s ? 'true' : 'false';
    if (Object.prototype.toString.call(s) === "[object Array]") {
        var a = []; for (var m = 0; m < s.length; m++) a.push(_jsonStr(s[m]));
        return '[' + a.join(',') + ']';
    }
    var parts = [];
    for (var k2 in s) if (Object.prototype.hasOwnProperty.call(s, k2)) {
        if (typeof s[k2] !== "function") parts.push(esc(k2) + ':' + _jsonStr(s[k2]));
    }
    return '{' + parts.join(',') + '}';
}
function _JParse(s) { try { if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(s); } catch (e) {} return _jsonParse(s); }
function _JStr(o)   { try { if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(o); } catch (e) {} return _jsonStr(o); }
function Out(o) { return _JStr(o); }

// ---------------------------------------------------------------------------
// Глобальное состояние сессии панели
// ---------------------------------------------------------------------------
// Фиксированный путь к MOGRT-шаблону (диалог выбора не используется).
var DEFAULT_MOGRT_PATH = "/Volumes/MEDIASTORE/МОНТАЖ 2026/ОФОРМЛЕНИЕ/MC TITLE Russia1 mac.mogrt";

var gScout = null;      // первый (разведочный) экземпляр MOGRT на таймлайне
var gScoutSeq = null;
var gStartTicks = 0;
var gMogrtPath = "";
var gTrack = -1;        // трек, на который был импортирован scout
var gParams = [];       // кэш имён параметров шаблона
var TPS = 254016000000; // тиков в 1 секунде

function _tryRemoveTrackItem(item) {
    try {
        if (!item || !item.remove) return false;
        var r = item.remove(false, false);
        return (r === 0) || (r === undefined);
    } catch (e) { return false; }
}
function _enumMGTParams(ti) {
    var names = [], warning = "";
    try {
        var comp = ti.getMGTComponent();
        if (!comp) return { params: [], warning: "getMGTComponent вернул null. Шаблон должен быть создан в After Effects (с параметрами, вынесенными в Essential Graphics)." };
        var props = comp.properties;
        var n = props.numItems;
        for (var i = 0; i < n; i++) {
            var p = props[i]; var nm = "";
            try { nm = p.displayName; } catch (e) {}
            if (nm === "" || !nm) { try { nm = p.name; } catch (e2) {} }
            if (nm) {
                var _dup = false;
                for (var _q = 0; _q < names.length; _q++) if (names[_q] === nm) { _dup = true; break; }
                if (!_dup) names.push(nm);
            }
        }
    } catch (e) { warning = String(e); }
    return { params: names, warning: warning };
}
function _listTracks(seq) {
    var arr = [];
    try {
        var vt = seq.videoTracks;
        for (var i = 0; i < vt.numTracks; i++) {
            var n = "V" + (i + 1);
            try { var nm = vt[i].name; if (nm && nm !== "") n = nm; } catch (e) {}
            arr.push({ index: i, label: n });
        }
    } catch (e) {}
    return arr;
}

// ---------------------------------------------------------------------------
// Экспортируемые функции (вызываются из панели)
// ---------------------------------------------------------------------------
function getDefaultMogrtPath() {
    return Out({ path: DEFAULT_MOGRT_PATH });
}

function listTracksAndSeq() {
    try {
        if (!app.project) return Out({ ok: true, seq: false, error: "Нет открытого проекта." });
        var seq = app.project.activeSequence;
        if (!seq) return Out({ ok: true, seq: false, error: "Нет активной последовательности. Откройте проект и выделите секвенс на панели Проект." });
        return Out({ ok: true, seq: true, tracks: _listTracks(seq) });
    } catch (e) { return Out({ ok: false, error: String(e) }); }
}

function getCSV(headerLine) {
    try {
        var f = new File.openDialog("Выберите CSV-файл", "*.csv;*.txt;*.tsv", false);
        if (!f) return Out({ ok: false, error: "CSV: диалог отменён." });
        f.encoding = "UTF-8";
        f.open("r");
        var content = f.read();
        f.close();
        content = content.replace(/^\uFEFF/, "");
        // угадываем разделитель по первой строке
        var eol = content.indexOf("\n"); var first = eol >= 0 ? content.substr(0, eol) : content;
        var c1 = (first.match(/,/g) || []).length;
        var c2 = (first.match(/;/g) || []).length;
        var c3 = (first.match(/\t/g) || []).length;
        var delim = ",";
        if (c2 > c1 && c2 >= c3) delim = ";";
        else if (c3 > c1 && c3 > c2) delim = "\t";
        var rows = _parseCSV(content, delim);
        if (rows.length === 0) return Out({ ok: false, error: "Файл пуст." });
        var headers = [];
        var startIdx = 0;
        if (String(headerLine) === "1" || String(headerLine) === "true") {
            headers = rows[0]; startIdx = 1;
        } else {
            for (var h = 0; h < rows[0].length; h++) headers.push("Колонка " + (h + 1));
        }
        var data = [];
        for (var r = startIdx; r < rows.length; r++) if (rows[r].length > 0) data.push(rows[r]);
        return Out({ ok: true, headers: headers, rows: data, delim: delim });
    } catch (e) { return Out({ ok: false, error: "CSV: " + String(e) }); }
}
function _parseCSV(text, delim) {
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
            else if (c === "\r") { /* пропускаем */ }
            else field += c;
        }
    }
    if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

function loadMogrt(trackIndexJson, pathJson) {
    try {
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return Out({ ok: false, error: "Нет активной последовательности." });
        var ti = parseInt(trackIndexJson, 10);
        if (isNaN(ti) || ti < 0) ti = 1;
        var fpath = "";
        try {
            var p2 = _JParse(String(pathJson));
            if (typeof p2 === "string" && p2 !== "") fpath = p2;
        } catch (e) {}
        if (fpath === "" || !fpath) {
            var fb = new File(DEFAULT_MOGRT_PATH);
            if (fb.exists) fpath = DEFAULT_MOGRT_PATH;
            else return Out({ ok: false, error: "MOGRT-файл не найден. Путь не задан в config.json и фолбэк недоступен:\n" + DEFAULT_MOGRT_PATH });
        }
        var dlg = new File(fpath);
        if (!dlg.exists) return Out({ ok: false, error: "MOGRT-файл не найден по пути:\n" + fpath + "\n\nИзмените путь в config.json рядом с панелью и переоткройте панель." });
        var startTicks = seq.getPlayerPosition().ticks;
        var item = seq.importMGT(fpath, startTicks, ti, 0);
        if (!item) return Out({ ok: false, error: "Не удалось импортировать MOGRT на трек V" + (ti + 1) + ". Проверьте номер трека в выпадающем списке." });
        // перечисляем параметры, затем сразу убираем разведочный клип.
        // Все операции над объектами — в пределах этого вызова (иначе ссылки «ломаются»).
        var e = _enumMGTParams(item);
        var removedScout = _tryRemoveTrackItem(item);
        gStartTicks = startTicks; gMogrtPath = fpath; gTrack = ti; gParams = e.params;
        return Out({
            ok: true,
            params: e.params,
            paramWarning: e.warning,
            tracks: _listTracks(seq),
            usedTrack: ti,
            leftover: !removedScout
        });
    } catch (e) { return Out({ ok: false, error: "MOGRT: " + String(e) }); }
}

function setMGTText(item, map) {
    var comp = item.getMGTComponent();
    if (!comp) throw new Error("getMGTComponent вернул null (шаблон не из After Effects?)");
    var props = comp.properties;
    for (var key in map) {
        if (!map.hasOwnProperty(key)) continue;
        var val = map[key];
        if (val === null || val === undefined) continue;
        var txt = String(val);
        if (txt === "") continue;
        var p = null;
        try { p = props.getParamForDisplayName(key); } catch (e) {}
        if (!p) throw new Error('Параметр шаблона "' + key + '" не найден.');
        var raw = p.getValue();
        var obj = null;
        if (typeof raw === "string") { try { obj = _JParse(raw); } catch (e) { obj = null; } }
        else obj = raw;
        if (obj && typeof obj === "object" && !(obj instanceof Array)) {
            obj.textEditValue = txt;
            obj.fontTextRunLength = [txt.length];
            p.setValue(_JStr(obj), true);
        } else {
            p.setValue(txt, true);
        }
    }
}

function createTitles(mappingArrayStr, trackIndexJson, durationSecJson) {
    try {
        var rows = _JParse(mappingArrayStr);
        var seq = app.project ? app.project.activeSequence : null;
        if (!seq) return Out({ ok: false, error: "Нет активной последовательности." });
        if (!gMogrtPath) return Out({ ok: false, error: "Сначала выберите MOGRT шаблон кнопкой «Шаг 2»." });
        var fchk = new File(gMogrtPath);
        if (!fchk.exists) return Out({ ok: false, error: "MOGRT-файл больше не найден:\n" + gMogrtPath });
        var ti = parseInt(trackIndexJson, 10);
        if (isNaN(ti) || ti < 0) ti = (gTrack >= 0) ? gTrack : 1;
        var durSec = parseFloat(_JParse(String(durationSecJson))) || 0;
        if (durSec <= 0) durSec = 5;
        var stepSec = durSec;

        // Получаем ProjectItem шаблона (импортированный клип-заготовку затем перезапишем первым титром)
        var intro = seq.importMGT(gMogrtPath, gStartTicks, ti, 0);
        if (!intro) return Out({ ok: false, error: "Не удалось импортировать MOGRT-шаблон в секвенс." });
        var pItem = intro.projectItem;

        var startSec = gStartTicks / TPS;
        var created = 0, errors = [];
        for (var r = 0; r < rows.length; r++) {
            var slotSec = startSec + r * stepSec;
            var ok = false;
            try { ok = seq.overwriteClip(pItem, slotSec, ti, -1); }
            catch (e) { errors.push("Титр " + (r + 1) + ": " + String(e)); }
            if (!ok) { errors.push("Титр " + (r + 1) + ": не удалось перезаписать клип."); continue; }
            var placed = _findClipNear(seq, ti, slotSec, 0.7);
            try {
                if (placed) { setMGTText(placed, rows[r]); created++; }
                else { errors.push("Титр " + (r + 1) + ": клип не найден после вставки."); }
            } catch (e) { errors.push("Титр " + (r + 1) + ": " + String(e)); }
        }

        // ДИАГНОСТИКА: сколько клипов реально лежит на треке и их старты
        var timeline = [];
        try {
            var vtr2 = seq.videoTracks[ti];
            var cl2 = vtr2 ? vtr2.clips : null;
            if (cl2 && cl2.numItems !== undefined) {
                for (var k = 0; k < cl2.numItems; k++) {
                    var c2 = cl2[k];
                    var st = 0; try { st = c2.start.ticks; } catch (e) {}
                    timeline.push(st / TPS);
                }
            }
        } catch (e) {}
        timeline.sort();
        gTrack = -1; gParams = [];
        return Out({ ok: true, created: created, total: rows.length, errors: errors, step: stepSec, timeline: timeline });
    } catch (e) { return Out({ ok: false, error: "Создание: " + String(e) }); }
}

function _findClipNear(seq, trackIdx, sec, tol) {
    try {
        var vtr = seq.videoTracks[trackIdx];
        var cl = vtr ? vtr.clips : null;
        if (!cl || cl.numItems === undefined) return null;
        for (var i = 0; i < cl.numItems; i++) {
            var c = cl[i];
            var s = 0;
            try { s = c.start.ticks / TPS; } catch (e) {}
            if (Math.abs(s - sec) < tol) return c;
        }
    } catch (e) {}
    return null;
}