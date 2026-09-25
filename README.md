# Lower Thirds Generator — Adobe Premiere Pro Plugin

CEP-расширение для Premiere Pro, которое массово создаёт нижние трети (lower thirds) по шаблону `.mogrt`, используя данные из таблицы (`.xlsx` / `.csv`).

## Как это работает

1. Вы выбираете MOGRT-шаблон (созданный в After Effects с текстовыми параметрами).
2. Загружаете таблицу с данми (спикеры, должности, компании и т.д.).
3. Сопоставляете колонки таблицы → параметры MOGRT.
4. Нажимаете Generate — плагин последовательно вставляет MOGRT-клипы на таймлайн и заполняет текст данными из каждой строки.

## Установка

В папке уже лежат рабочий шаблон `assets/MC TITLE Russia1 ISPRAVLEN.mogrt` и пример данных `sample.csv`.

### macOS

```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions/
cp -r "/Volumes/MEDIASTORE/lowerthirds-generator" ~/Library/Application\ Support/Adobe/CEP/extensions/
```

### Windows

```cmd
mkdir "%APPDATA%\Adobe\CEP\extensions\"
xcopy /E /I "%MEDIASTORE%\lowerthirds-generator" "%APPDATA%\Adobe\CEP\extensions\lowerthirds-generator\"
```

### Включить режим разработчика в Premiere Pro (обязательно для CEP в PR 2025/2026)

1. Откройте **Premiere Pro → Preferences → General** (или **Edit → Preferences → General**).
2. В секции **Developer** поставьте галочку **Enable Developer Mode**.
3. Полностью перезапустите Premiere Pro.
4. Откройте **Window → Extensions → Lower Thirds Generator**.

## Использование

В папке уже есть собранный шаблон:
`assets/MC TITLE Russia1 ISPRAVLEN.mogrt`. При открытии панели путь к нему **подставляется автоматически** (если шаблон лежит в `assets/` рядом с панелью) — отдельный выбор `.mogrt` не требуется.

1 Шаблон уже в комплекте и подставлен. Если нужно — нажмите **Browse** и выберите другой `.mogrt`.  
Нажмите **Inspect Params** — в списке появятся имена текстовых параметров шаблона (у «MC TITLE» это обычно «Имя Фамилия» и «Должность»).

2 Нажмите **Browse** под «Data Source» → выберите `.xlsx` или `.csv` (пример — `sample.csv`).  
Таблица отобразится с предпросмотром первых 10 строк.

3 Под «Column Mapping» сопоставьте колонки таблицы с параметрами MOGRT (например, колонка «Имя» → параметр «Имя Фамилия»).

4 Настройте **Track** (номер видео-дорожки), **Duration** и **Gap** между клипами.

5 Нажмите **Generate Lower Thirds**.

## Формат таблицы

Таблица должна содержать как минимум одну колонку для текста. Пример:

| Name | Title | Company |
|------|-------|---------|
| Иван Иванов | CEO | ООО «Ромашка» |
| Анна Петрова | CFO | ООО «Ромашка» |
| Пётр Сидоров | CTO | ТехноИнновации |

## Требования к MOGRT

- Шаблон **обязательно** должен быть создан в Adobe After Effects и экспортирован как Motion Graphics Template (`.mogrt`).
- Текстовые поля должны быть выведены через **редактируемые текстовые параметры** (Essential Graphics → Edit → проследите, чтобы текст был залинкован как параметр).
- Встроенные в Premiere Pro шаблоны (не AE) **не поддерживаются** — у них другой внутренний формат.

## Структура файлов

```
lowerthirds-generator/
├── CSXS/
│   └── manifest.xml          # CEP-манифест (регистрация расширения)
├── hostscript.jsx             # ExtendScript — работает в Premiere Pro
├── assets/
│   └── MC TITLE Russia1 ISPRAVLEN.mogrt   # готовый шаблон
├── sample.csv                 # пример данных (имя;должность)
├── client/
│   ├── index.html             # Интерфейс панели
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── main.js            # Логика UI + связь с ExtendScript
│       ├── CSInterface.js     # CEP bridge
│       └── xlsx.full.min.js   # SheetJS — парсинг Excel/CSV
└── README.md
```

## Известные ограничения

- **Premiere Pro 2025+**: Adobe постепенно мигрирует с CEP на UXP. Если расширение не грузится в PR 2026, убедитесь что включён Developer Mode, или используйте версию 25.x.
- MOGRT должен быть AE-based. Встроенные шаблоны PR (редактируемые через Essential Graphics без AE) не имеют `getMGTComponent()`.
- Для `.xlsx` файлов чтение идёт через base64 (ExtendScript → JS) — большие файлы (>10 MB) могут работать медленно.

## Debug

Логи ExtendScript пишутся в консоль. Включите **Debug → Open Console** в Premiere Pro при активном Developer Mode.

## Лицензия

MIT