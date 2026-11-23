# CyberHub Control — дизайн-спецификация (mobile + desktop)

> **Для ИИ-разработчика.** Это полное описание визуального языка приложения CyberHub Control.
> Структура, логика и данные у тебя уже есть — задача: **применить этот дизайн один в один**.
> Все значения ниже — точные (px, hex, классы). Где есть код — копируй его как есть.
> Стек оригинала: React + Tailwind CSS v4 + lucide-react. Если у тебя другой стек — переноси значения, а не классы.

---

## 0. Характер дизайна (в одном абзаце)

Тёмный «киберклубный» интерфейс в стиле современных финтех/игровых приложений: почти чёрный фон с **мягким фиолетово-бирюзовым свечением в верхних углах**, крупные **скруглённые карточки (24px)** с тонкой обводкой вместо теней, **фиолетовый градиентный акцент** (#8b6cff → бирюзовый #22d3ee), жирная геометричная типографика (Manrope 800 для заголовков), моноширинный шрифт для времени и денег. Цвет используется **только для смысла** (статус, приоритет, деньги ±), всё остальное — оттенки серого. Mobile-first: нижняя навигация, нижние «шторки» вместо модалок, кнопки ≥ 44px. На ПК — боковая панель слева, контент по центру до 1024px, шторки превращаются в центрированные диалоги. Есть светлая тема (автоматически по системе + ручной переключатель).

**Ключевые слова:** dark-first · glow · rounded-3xl · thin borders · gradient accent · semantic color · bold type · bottom sheets · tabular numbers.

---

## 1. Дизайн-токены

### 1.1 Цвета — CSS-переменные (вставить в глобальный CSS без изменений)

```css
/* ТЁМНАЯ тема — по умолчанию */
:root {
  --bg:        #0b0b12;  /* фон страницы */
  --surface:   #13131d;  /* карточки, панели */
  --surface-2: #1b1b28;  /* поля ввода, вложенные блоки, hover */
  --surface-3: #242435;  /* треки прогресса, нейтральные бейджи, выключенные тумблеры */
  --line:      #2a2a3d;  /* все обводки и разделители */
  --text:      #ececf5;  /* основной текст */
  --muted:     #8d8daa;  /* вторичный текст, подписи, иконки */
  --accent:    #8b6cff;  /* главный акцент (фиолетовый) */
  --accent-2:  #22d3ee;  /* второй акцент (бирюзовый) — брони, инфо */
  --ok:        #22c55e;  /* успех, деньги +, «выполнено» */
  --warn:      #f5a524;  /* предупреждение, «на проверке», расхождение */
  --bad:       #ff4d6d;  /* ошибка, срочно, критично, деньги −, счётчики */
  --glow:      rgba(139,108,255,.35); /* цвет свечения под акцентными элементами */
  color-scheme: dark;
}

/* СВЕТЛАЯ тема — автоматически по системе, если пользователь не выбрал тёмную вручную */
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg:#f5f5fa; --surface:#ffffff; --surface-2:#f0f0f7; --surface-3:#e6e6f0;
    --line:#e2e2ec; --text:#15151f; --muted:#6b6b85;
    --accent:#6d4dff; --accent-2:#0891b2; --glow:rgba(109,77,255,.2);
    color-scheme: light;
  }
}
/* Светлая тема, выбранная вручную (переключатель в настройках ставит data-theme на <html>) */
:root[data-theme="light"] {
  --bg:#f5f5fa; --surface:#ffffff; --surface-2:#f0f0f7; --surface-3:#e6e6f0;
  --line:#e2e2ec; --text:#15151f; --muted:#6b6b85;
  --accent:#6d4dff; --accent-2:#0891b2; --glow:rgba(109,77,255,.2);
  color-scheme: light;
}
```

**Tailwind v4** — привязка токенов к утилитам (`bg-surface`, `text-muted`, `border-line`, `bg-accent/12` …):

```css
@import "tailwindcss";
@theme inline {
  --color-bg: var(--bg);           --color-surface: var(--surface);
  --color-surface-2: var(--surface-2); --color-surface-3: var(--surface-3);
  --color-line: var(--line);       --color-text: var(--text);
  --color-muted: var(--muted);     --color-accent: var(--accent);
  --color-accent-2: var(--accent-2); --color-ok: var(--ok);
  --color-warn: var(--warn);       --color-bad: var(--bad);
  --font-sans: "Manrope", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

**Правило полупрозрачных подложек** (используется везде для «тонированных» элементов):

| Назначение | Фон | Текст/иконка | Обводка |
|---|---|---|---|
| Тонированная иконка/бейдж | цвет **12–15 %** (`bg-accent/12`, `bg-ok/15`) | цвет 100 % | — |
| Кнопка danger/success | цвет **12 %**, hover **20 %** | цвет 100 % | цвет **25 %** |
| Карточка-предупреждение | цвет **5 %** (`bg-warn/5`) | обычный | цвет **30 %** |
| Активный пункт меню | `accent` **12 %** | `accent` | — |

### 1.2 Семантика цвета (строго соблюдать)

```ts
const SEMANTIC = {
  // приоритет задачи
  priority: { urgent: 'bad', high: 'warn', normal: 'accent', low: 'neutral' },
  // статус задачи
  task:     { open: 'info', in_progress: 'accent', review: 'warn', done: 'ok', rejected: 'bad' },
  // поломки
  severity: { critical: 'bad', medium: 'warn', low: 'neutral' },
  breakdown:{ new: 'bad', in_progress: 'warn', fixed: 'ok' },
  // брони
  booking:  { new: 'bad', confirmed: 'ok', done: 'neutral', cancelled: 'neutral' },
  // авансы
  advance:  { pending: 'warn', approved: 'accent', paid: 'ok', rejected: 'bad' },
  // деньги и баллы: + → ok, − → bad
} as const;
// tone → классы бейджа
const TONE = {
  neutral: 'bg-surface-3 text-muted',
  accent:  'bg-accent/15 text-accent',
  ok:      'bg-ok/15 text-ok',
  warn:    'bg-warn/15 text-warn',
  bad:     'bg-bad/15 text-bad',
  info:    'bg-accent-2/15 text-accent-2',
};
```

Брони и всё «клиентское» = **бирюзовый (`accent-2`)**. Задачи, навигация, CTA = **фиолетовый (`accent`)**.

### 1.3 Типографика

Шрифты (Google Fonts, оба поддерживают кириллицу и латышский):
```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
```

| Роль | Размер / вес / трекинг | Tailwind |
|---|---|---|
| Приветствие на главной | 28px mobile / 36px desktop, 800, tight, line-height 1.25 | `text-[28px] md:text-4xl font-extrabold tracking-tight leading-tight` |
| Заголовок страницы (H1) | 26px / 30px, 800, tight | `text-[26px] md:text-3xl font-extrabold tracking-tight` |
| Заголовок детали (задача) | 24px / 30px, 800 | `text-2xl md:text-3xl font-extrabold tracking-tight` |
| Подзаголовок страницы | 14px, 400, muted | `text-sm text-muted` |
| Заголовок секции | 13px, 700, UPPERCASE, трекинг 0.05em, muted | `text-[13px] font-bold uppercase tracking-wider text-muted` |
| Заголовок карточки | 16–17px, 700 | `font-bold text-[16px] leading-snug` |
| Основной текст / поля | 15px | `text-[15px]` |
| Мета-строка в карточке | 13px, muted | `text-[13px] text-muted` |
| Подписи, время | 12px, muted | `text-xs text-muted` |
| Бейдж | 12px, 600 | `text-[12px] font-semibold` |
| Подпись таба в нижней навигации | 11px, 600 | `text-[11px] font-semibold` |
| Большая цифра (KPI) | 24px, 800, tabular | `text-2xl font-extrabold tracking-tight tabular-nums` |
| Баланс (баллы/конверты) | 30–48px, 800 | `text-3xl`…`text-5xl font-extrabold` |
| Время смены, суммы в полях | JetBrains Mono 13–15px, 500–600 | `font-mono tabular-nums` |

Правила: заголовки всегда `font-extrabold` + `tracking-tight`. Все числа (деньги, баллы, счётчики) — `tabular-nums`. Время смен `10:00–18:00` и суммы в инпутах — моноширинным. Текст UI — по-русски, без Caps Lock, кроме заголовков секций.

### 1.4 Скругления

| Элемент | Радиус |
|---|---|
| Карточки, шторки, крупные блоки | **24px** (`rounded-3xl`), шторка сверху **28px** |
| Кнопки md/lg, поля ввода, иконки-плашки 36–44px | **16px** (`rounded-2xl`) |
| Кнопки sm, сегменты внутри переключателя, чипы | **12px** (`rounded-xl`) |
| Бейджи, аватары, точки, тумблеры, счётчики | **9999px** (`rounded-full`) |
| Логотип-иконка | 12px при 36px; 26px при 80px |

### 1.5 Отступы и сетка

База — 4px. Чаще всего: **gap 8/12px между карточками, padding карточки 16px**.

```
Карточка:            p-4 (16px); компактная статистика p-3.5 (14px); список внутри карточки p-1.5 + строки p-2.5/p-3
Между карточками:    gap-3 (12px) / space-y-2 (8px) для списков-карточек
Секция:              mt-6 (24px) сверху, mb-2.5 снизу у заголовка секции
Поля формы:          space-y-4 (16px); подпись поля mb-1.5; подсказка под полем mt-1
Страница mobile:     px-4 (16px), pt-4, pb-28 (112px — место под нижнюю навигацию)
Страница desktop:    px-8 (32px), pt-8, pb-12, max-width 1024px (max-w-5xl), по центру
```

### 1.6 Тени, свечение, фон

Обычные тени почти не используются — глубина создаётся **обводкой `--line` + разницей surface-оттенков**. Тени только у:
- **Акцентной кнопки:** `box-shadow: 0 8px 24px -10px var(--glow), inset 0 1px 0 rgba(255,255,255,.18)`
- **«Светящейся» карточки** (главное действие / новая бронь): `box-shadow: 0 0 0 1px var(--accent), 0 10px 40px -12px var(--glow)`
- **Шторки/диалога и тостов:** `shadow-2xl`
- **Иконки на экране входа:** `0 20px 60px -15px var(--glow)`

Фон всех экранов (`.bg-hero`) — два размытых пятна в верхних углах, фиксированные при скролле:
```css
.bg-hero {
  background:
    radial-gradient(1200px 400px at 10% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
    radial-gradient(900px 400px at 110% 0%,  color-mix(in srgb, var(--accent-2) 16%, transparent), transparent 60%),
    var(--bg);
  background-attachment: fixed;
}
.text-gradient { background: linear-gradient(90deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.btn-accent {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--accent-2)));
  box-shadow: 0 8px 24px -10px var(--glow), inset 0 1px 0 rgba(255,255,255,.18);
}
```

«Стекло» (верхняя панель, нижняя навигация, боковая панель, липкие блоки): полупрозрачный фон + `backdrop-blur-xl` (24px):
`bg-bg/75` (шапка), `bg-surface/85` (нижняя навигация), `bg-surface/60` (сайдбар), `bg-surface/90` (липкий прогресс).

### 1.7 Анимации

```css
@keyframes sheet-in { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes fade-in  { from { opacity: 0 } to { opacity: 1 } }
.anim-sheet { animation: sheet-in .22s cubic-bezier(.2,.8,.2,1); } /* шторки, тосты */
.anim-fade  { animation: fade-in .18s ease-out; }                  /* затемнение фона, просмотр фото */
```
- Нажатие: кнопки `active:scale-[.97]`, иконки-кнопки `active:scale-95`, кликабельные карточки `active:scale-[.99]`, чекбоксы чек-листа `active:scale-90`.
- Все hover/цвет: `transition` (150ms по умолчанию).
- Прогресс-бары: `transition-all duration-500`.
- Спиннер: иконка `Loader2` + `animate-spin`, цвет accent.
- Никаких длинных/прыгающих анимаций — приложение рабочее, должно ощущаться мгновенным.

### 1.8 Иконки

Библиотека **lucide-react**, stroke по умолчанию (2). Размеры: 14px (`size-3.5`) в мета-строках, 16px (`size-4`) в кнопках, 20px (`size-5`) в меню и плашках, 22px в нижней навигации, 24px в пустых состояниях.
Иконка в карточке почти всегда стоит в **плашке**: `grid size-9|10 place-items-center rounded-2xl bg-<tone>/12 text-<tone>`.

Соответствие разделов и иконок: Главная `Home`, Задачи `ListChecks`, Брони `CalendarClock`, Чек-лист `ClipboardCheck`, Смены `CalendarDays`, Поломки `Wrench`, Касса `Wallet`, Баллы `Coins`/`Star`, Команда `Users`, Настройки `Settings`, Уведомления `Bell`, Конверт `Mail`, Фото `Camera`/`ImagePlus`, Дедлайн `Clock`, Зона `MapPin`, Оборудование `Monitor`.

---

## 2. Компоненты (точные классы)

> Формат: **имя → назначение → классы/размеры → состояния**. Хелпер `cx(...)` = склейка классов с отбрасыванием falsy.

### 2.1 Button
```ts
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';
const base = 'inline-flex items-center justify-center font-semibold transition active:scale-[.97] ' +
             'disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap';
const variant = {
  primary:   'btn-accent text-white',                                         // градиент + свечение
  secondary: 'bg-surface-2 text-text border border-line hover:bg-surface-3',
  ghost:     'text-muted hover:text-text hover:bg-surface-2',
  danger:    'bg-bad/12 text-bad border border-bad/25 hover:bg-bad/20',
  success:   'bg-ok/12 text-ok border border-ok/25 hover:bg-ok/20',
};
const size = {
  sm: 'h-9  px-3 text-sm      rounded-xl  gap-1.5',  // 36px
  md: 'h-11 px-4 text-[15px]  rounded-2xl gap-2',    // 44px — минимум для пальца
  lg: 'h-13 px-5 text-base    rounded-2xl gap-2',    // 52px — главные действия в шторках
};
// props: icon (слева), loading (иконка заменяется на <Loader2 class="size-4 animate-spin">), block (w-full)
```
Правила: одна `primary` на экран/шторку. Деструктивное — `danger`, подтверждение решения директора — `success`. Пара «отклонить / принять» — `grid grid-cols-2 gap-2`, danger слева, success справа.

### 2.2 IconButton
`relative inline-flex size-10 items-center justify-center rounded-2xl text-muted hover:text-text hover:bg-surface-2 transition active:scale-95`
Счётчик (уведомления): `absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-bad text-white text-[11px] font-bold grid place-items-center ring-2 ring-bg` (99+ при переполнении).

### 2.3 Card
`rounded-3xl bg-surface border border-line p-4`
- кликабельная: `+ cursor-pointer transition hover:border-accent/40 active:scale-[.99]`
- `glow` (главное действие, новая бронь): `+ shadow-[0_0_0_1px_var(--accent),0_10px_40px_-12px_var(--glow)]`
- список внутри карточки: карточка `p-1.5`, строки `flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface-2`

### 2.4 Цветная полоса приоритета (карточка задачи)
Карточка `relative overflow-hidden pl-5` + `<span class="absolute left-0 top-0 bottom-0 w-1.5 bg-{bad|warn|accent|surface-3}">`.
В компактных списках — вертикальная пилюля `w-1 self-stretch rounded-full` слева от текста.

### 2.5 Badge
`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap` + `TONE[tone]`. Порядок в карточке: приоритет → статус → доп. метки (`Общая`), над заголовком, `flex flex-wrap gap-1.5 mb-1.5`.

### 2.6 Stat (KPI-плитка)
```
Card p-3.5
├─ row: [плашка-иконка size-9 rounded-2xl bg-<tone>/12 text-<tone>] + label (13px muted medium)
├─ value: mt-2.5 text-2xl font-extrabold tracking-tight tabular-nums
└─ hint:  text-xs text-muted mt-0.5  (может быть цветным: «2 просрочено» → text-bad font-semibold)
```
Сетка: `grid grid-cols-2 lg:grid-cols-4 gap-3`.

### 2.7 Avatar
Круг с инициалами (2 буквы), белый жирный текст, **градиент от хэша имени** — у каждого человека свой постоянный цвет:
```ts
const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
background = `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue+50)%360} 70% 48%))`;
fontSize = size * 0.38; // размеры: 30, 32, 34, 36 (по умолчанию), 44, 48
```

### 2.8 Segmented (вкладки внутри страницы)
```
контейнер: flex gap-1 p-1 rounded-2xl bg-surface-2 border border-line overflow-x-auto (скроллбар скрыт)
пункт:     flex-1 h-9 px-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5
  активный:   bg-surface text-text shadow-sm border border-line     («приподнятая таблетка»)
  неактивный: text-muted hover:text-text
счётчик:   min-w-5 h-5 px-1.5 rounded-full text-[11px]; на активном — bg-accent text-white, иначе bg-surface-3
```
Используется вместо табов везде: «Активные / На проверке / Готово», «Отчёт смены / Конверты / История». Может содержать иконку + текст.

### 2.9 Поля формы
```
Field:     подпись block text-[13px] font-semibold text-muted mb-1.5 px-0.5; подсказка text-xs text-muted mt-1
Input:     w-full rounded-2xl bg-surface-2 border border-line px-3.5 h-11 text-[15px] outline-none transition
           focus:border-accent focus:ring-4 focus:ring-accent/15 placeholder:text-muted/60
Textarea:  то же, h-auto py-2.5 resize-none, rows=3
Select:    то же + appearance-none pr-9 + своя стрелка-шеврон (#8d8daa) справа 12px
MoneyInput: Input с inputMode="decimal", font-mono tabular-nums, pr-9, символ «€» абсолютно справа (muted, semibold)
Date/Time:  нативные, min-height 44px
```
Поля попарно — `grid grid-cols-2 gap-3` (даже на телефоне: дата + время, нал + карта).

**Выбор из 3–4 вариантов** (приоритет) — не select, а сетка кнопок `grid grid-cols-4 gap-1.5`, каждая `h-10 rounded-xl text-sm font-semibold border`; выбранная заливается цветом смысла (`bg-bad text-white` для «Срочно», `bg-warn text-black` для «Высокий», `bg-accent text-white` для «Обычный», `bg-surface-3` для «Низкий»).

**Быстрые варианты текста** (причины бонуса/штрафа) — чипы `h-8 px-3 rounded-xl bg-surface-2 border border-line text-sm text-muted hover:text-text`, по нажатию подставляют текст.

### 2.10 Toggle
Строка `flex justify-between w-full`, слева текст 15px, справа трек `h-7 w-12 rounded-full` (`bg-accent` вкл / `bg-surface-3` выкл) с белым кружком `size-6 rounded-full shadow`, `left-0.5` → `left-[22px]`.

### 2.11 Sheet — нижняя шторка (mobile) / диалог (desktop)
**Главный паттерн всех форм и деталей.** Отдельных страниц-форм нет.
```
обёртка:   fixed inset-0 z-50 flex items-end md:items-center justify-center
затемнение: absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade  (клик = закрыть)
панель:    relative w-full md:max-w-lg max-h-[92dvh] flex flex-col bg-surface border border-line
           rounded-t-[28px] md:rounded-[28px] anim-sheet shadow-2xl
ручка:     (только mobile) mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface-3
шапка:     flex justify-between px-5 pt-3 md:pt-5 pb-2; заголовок text-lg font-bold; справа IconButton «X»
тело:      overflow-y-auto px-5 pb-5 space-y-4
футер:     px-5 pt-3 pb-5 border-t border-line + safe-area; внутри одна кнопка block size=lg
```
Escape закрывает, скролл страницы под шторкой блокируется. Главная кнопка формы — **всегда в закреплённом футере**, неактивна, пока обязательные поля не заполнены.

### 2.12 Фото
- **PhotoPicker** — плитки превью `size-20 rounded-2xl border border-line` с кнопкой удаления `absolute top-1 right-1 size-6 rounded-full bg-black/70`; плитка «добавить» — `size-20 rounded-2xl border-2 border-dashed border-line text-muted hover:text-accent hover:border-accent/50` с иконкой Camera + подписью 10px. `<input type=file accept="image/*" capture="environment" multiple>`. Фото сжимаются на клиенте до 1600px JPEG 0.82.
- **QuickPhoto** (в строке чек-листа) — квадрат `size-10 rounded-2xl bg-surface-2 border border-line` с `ImagePlus`, сразу открывает камеру.
- **PhotoGrid** — квадратные миниатюры 56/72/88/96px `rounded-2xl border border-line object-cover`; по тапу — полноэкранный просмотр `fixed inset-0 z-[60] bg-black/90`, фото `rounded-2xl`, кнопка закрытия `size-10 rounded-full bg-white/10`.

### 2.13 Empty / Error / Loading
- **Empty:** по центру, `py-12`, плашка-иконка `size-14 rounded-3xl bg-surface-2 text-muted`, заголовок bold, текст `text-sm text-muted max-w-xs`. Тон дружелюбный: «Всё работает 🎉», «Активных задач нет 🎉».
- **Error:** Card `border-bad/30 bg-bad/5`, иконка `AlertTriangle` bad + текст + кнопка «Повторить» (secondary sm).
- **Loading:** спиннер по центру `py-10`. Скелетоны не используются.

### 2.14 Toast
Сверху по центру (`top-3` + safe-area), ширина `calc(100% - 32px)`, max 384px, `z-[70]`. Плашка `rounded-2xl bg-surface border border-line px-4 py-3 shadow-2xl text-sm font-medium anim-sheet`, слева `CheckCircle2` (ok) или `AlertTriangle` (bad). Исчезает через 3.2 с. Каждое успешное действие подтверждается тостом («Задача создана», «Отчёт отправлен директору»).

### 2.15 Прогресс
- **Кольцо** (чек-лист на главной): SVG 64px, r=15.5, stroke 3.5, трек `--surface-3`, дуга `--accent` (или `--ok` когда готово), `stroke-linecap: round`, в центре процент `text-sm font-extrabold` или галочка.
- **Полоса**: трек `h-2.5 rounded-full bg-surface-3`, заливка `bg-gradient-to-r from-accent to-accent-2` (готово — `bg-ok`).

### 2.16 Строка-чекбокс чек-листа
```
Card p-3 (выполнено → border-ok/30)
[ квадрат size-10 rounded-2xl border-2: пусто border-line / отмечено bg-ok border-ok text-white + Check strokeWidth=3 ]
[ текст: font-semibold; отмечено → text-muted line-through decoration-2
  мета: зона · «нужно фото» (bad, если отмечено без фото) / «фото есть» ]
[ QuickPhoto справа ]
миниатюры фото — ниже, с отступом слева 52px (выровнены по тексту)
```

### 2.17 Чип с иконкой (брони)
`inline-flex items-center gap-1.5 rounded-xl bg-surface-2 border border-line px-2.5 h-8 text-[13px]`; главный (дата·время) — `font-bold`, остальные — `text-muted font-medium`.

---

## 3. Раскладка: ТЕЛЕФОН (< 768px) — основной сценарий

```
┌──────────────────────────────┐ ← safe-area-inset-top
│ [лого] CyberHub   [🔔3] (АН) │  ШАПКА: sticky top-0 z-30, h-14 (56px), px-4,
│        CONTROL               │  bg-bg/75 backdrop-blur-xl, border-b border-line/60
├──────────────────────────────┤
│                              │
│  Контент: px-4 pt-4 pb-28    │  одна колонка, карточки на всю ширину,
│  (скроллится всё окно)       │  KPI-плитки 2 в ряд, пары полей 2 в ряд
│                              │
├──────────────────────────────┤
│ 🏠    ☑     📅    👛    ☰   │  НИЖНЯЯ НАВИГАЦИЯ: fixed bottom-0 z-40, h-16 (64px),
│Главн Задачи Брони Касса Ещё  │  grid-cols-5, bg-surface/85 backdrop-blur-xl, border-t
└──────────────────────────────┘ ← safe-area-inset-bottom (pb-safe)
```

**Шапка:** слева логотип (иконка 36×36 `rounded-xl` + «CyberHub» 17px 800 и под ним «CONTROL» 11px bold uppercase tracking 0.2em **градиентным текстом**). Справа колокольчик с красным счётчиком и аватар 34px (ведёт в настройки).

**Нижняя навигация:** 5 пунктов — Главная, Задачи, Брони, Касса, **Ещё** (список остальных разделов). Пункт: иконка 22px над подписью 11px, `gap-1`. Активный — цвет accent + **таблетка-подложка** `h-8 w-14 rounded-full bg-accent/15` за иконкой (как в Material 3). Неактивный — muted.

**Экран «Ещё»:** карточка профиля (аватар 48 + имя + роль) и карточка-список разделов: строка = плашка-иконка 40px `bg-accent/12` + название semibold + `ChevronRight` muted.

**Поведение:**
- Все формы, детали брони/поломки/отчёта — **нижние шторки** (до 92 % высоты), ручка сверху, главная кнопка в футере у большого пальца.
- Страница деталей задачи — отдельный экран с кнопкой «← Назад» (ghost sm) вверху слева и иконками редактировать/удалить справа.
- Липкие элементы: прогресс чек-листа `sticky top-[safe-area + 60px]` на стекле.
- Минимальная зона нажатия — 40×40, основные кнопки — 44–52px.
- Мета-тег: `viewport-fit=cover`, `theme-color` #0b0b12 (тёмная) / #f5f5fa (светлая), `overscroll-behavior-y: none`, `-webkit-tap-highlight-color: transparent`.
- Заголовок страницы и кнопка действия — в одной строке (`flex items-end justify-between`); на узком экране текст кнопки сокращается («Новая задача» → «Создать») или остаётся только иконка.

## 4. Раскладка: КОМПЬЮТЕР (≥ 768px, `md:`)

```
┌────────────┬─────────────────────────────────────────────────┐
│ [лого]     │                                                 │
│            │   Заголовок 30px                    [Кнопка]    │
│ ▣ Главная  │   подзаголовок                                  │
│ ☑ Задачи   │                                                 │
│ 📅 Брони    │   ┌──────────┐┌──────────┐┌──────────┐┌──────┐  │
│ ✓ Чек-лист │   │ KPI      ││ KPI      ││ KPI      ││ KPI  │  │
│ ▦ Смены    │   └──────────┘└──────────┘└──────────┘└──────┘  │
│ 🔧 Поломки  │   ┌────────────────────┐┌────────────────────┐  │
│ 👛 Касса    │   │ колонка 1          ││ колонка 2          │  │
│ ◎ Баллы    │   └────────────────────┘└────────────────────┘  │
│ 👥 Команда  │                                                 │
│ ⚙ Настройки│        контент max-w-5xl (1024px), mx-auto       │
│            │        px-8 pt-8 pb-12                          │
│ ┌────────┐ │                                                 │
│ │(Д) Имя🔔⇥│ │                                                 │
│ └────────┘ │                                                 │
└────────────┴─────────────────────────────────────────────────┘
 сайдбар w-64 (256px), lg: w-72 (288px)
```

**Сайдбар:** `sticky top-0 h-dvh`, `p-4`, `border-r border-line bg-surface/60 backdrop-blur-xl`, flex-колонка:
1. Логотип (`px-2 py-2`).
2. Меню `mt-6 space-y-1`: пункт `flex items-center gap-3 h-11 px-3 rounded-2xl text-[15px] font-semibold`; активный `bg-accent/12 text-accent`; неактивный `text-muted hover:text-text hover:bg-surface-2`. Показываются **все** разделы (на телефоне часть спрятана в «Ещё»).
3. Внизу карточка пользователя `p-2 rounded-2xl bg-surface-2 border border-line`: аватар + имя/роль + колокольчик со счётчиком + кнопка выхода.

Шапки и нижней навигации на ПК **нет**.

**Адаптация контента на ПК:**

| Элемент | Телефон | ПК |
|---|---|---|
| Списки карточек (задачи, брони, поломки, команда) | 1 колонка | `md:grid-cols-2` |
| KPI-плитки | 2 в ряд | `lg:grid-cols-4` |
| Главная: задачи / смены+брони | друг под другом | `lg:grid-cols-2 gap-x-6` |
| Смены (дни недели) | 1 колонка | `md:grid-cols-2 xl:grid-cols-3` |
| Конверты | 2 в ряд | `lg:grid-cols-4` |
| Кассовый отчёт | форма, итог внизу | `lg:grid-cols-[1fr_340px]`, итог **липкий справа** (`lg:sticky lg:top-8`) |
| Шторки | снизу, на всю ширину | **по центру**, `max-w-lg` (512px), скругление 28px со всех сторон, без ручки |
| Детали задачи, настройки | на всю ширину | ограничено `max-w-2xl` (672px) |
| Заголовки | 26–28px | 30–36px |

---

## 5. Шаблоны экранов (сверху вниз)

**Главная.** Дата (14px muted, с заглавной буквы) → приветствие «Доброе утро, Анна 👋» (по времени суток) → **главная карточка-действие с glow** (кольцо прогресса чек-листа + текст + шеврон) → у директора карточка «Ждут вашего решения» (`border-warn/30 bg-warn/5`, внутри мини-плитки «число + подпись») → 4 KPI → карточка-напоминание о кассовом отчёте → секции «Приоритетные задачи», «Сегодня на смене», «Последние брони» (заголовок секции + ghost-кнопка «Все» справа) → баннер о критической поломке (`border-bad/30 bg-bad/5`).

**Список (Задачи / Брони / Поломки).** PageHeader (заголовок + подзаголовок + кнопка) → Segmented со счётчиками → сетка карточек. Карточка: бейджи → заголовок bold → мета-строка с иконками 14px (дедлайн, зона, фото, `+баллы` зелёным). Просроченный дедлайн — `text-bad font-semibold` с префиксом «Просрочено ·». Новые брони — карточки с glow.

**Деталь.** Назад → бейджи → H1 → карточка-инфо 2×2 (иконка+подпись muted 12px, значение semibold) → описание в карточке → цветная карточка комментария директора (ok/bad тон) → секция «Отчёт исполнителя» → секция действия (форма + кнопка lg).

**Деньги.** Крупная цифра баланса в карточке с градиентом `bg-gradient-to-br from-accent/25 via-accent/10 to-accent-2/15 border-accent/30` и огромной полупрозрачной иконкой в углу (`absolute -right-4 -top-4 size-32 text-accent/15`). Строка движения: круглая плашка ↙ (ok) / ↗ (bad) + описание + сумма моноширинным со знаком и цветом.

**Конверт** — карточка с цветным «пятном» в углу (`absolute -right-6 -top-6 size-20 rounded-full opacity-20`, цвет конверта), иконка `Mail` цветом конверта, название, сумма 20px 800.

**Вход.** Полноэкранный `bg-hero`, по центру колонка `max-w-sm`: иконка 80px со свечением → «CyberHub **Control**» (второе слово градиентом) 30px 800 → подзаголовок → форма в стеклянной карточке `rounded-[28px] bg-surface/80 backdrop-blur-xl border p-5 shadow-2xl` → кнопка lg на всю ширину.

---

## 6. Тон текста и микрокопи

- Обращение на «вы», коротко, по-деловому, с редкими эмодзи только в позитивных и важных моментах: 👋 🎉 ✅ ⚠️ 🔥 📅.
- Кнопки — глаголы: «Сдать на проверку», «Взять в работу», «Отправить отчёт», «Сообщить».
- Относительные даты: «Сегодня», «Завтра», «Вчера», «ср, 25 нояб.»; время: «только что», «8 мин назад».
- Деньги: `ru-RU`, EUR, «250,50 €», целые без копеек («450 €»).
- Подсказки объясняют зачем: «Пересчитайте наличные после выемки в конверт».

## 7. Доступность и производительность дизайна

- Контраст: текст `--text` на `--surface` ≥ 12:1; `--muted` ≥ 5:1 — не опускать muted ниже этого.
- Цвет никогда не единственный носитель смысла: всегда есть текст бейджа («Срочно», «Критическая»).
- Фокус: `focus:ring-4 ring-accent/15` + `border-accent` у полей.
- Только CSS-переменные — смена темы без перерисовки JS.
- Никаких тяжёлых теней/фильтров на списках; `backdrop-blur` только на 3–4 фиксированных элементах.
- Картинки `loading="lazy"`, превью квадратные с `object-cover`.
- Иконки из одной библиотеки (tree-shaking), шрифты с `display=swap`.

## 8. Чек-лист соответствия («готово, если…»)

- [ ] Фон — `#0b0b12` с фиолетовым пятном слева сверху и бирюзовым справа сверху.
- [ ] Все карточки `rounded-3xl`, `border-line`, без теней.
- [ ] Главная кнопка — градиент accent со свечением снизу.
- [ ] Заголовки Manrope 800 tight; время и суммы — JetBrains Mono, tabular-nums.
- [ ] Телефон: шапка 56px на стекле + нижняя навигация 64px с таблеткой под активной иконкой.
- [ ] ПК: сайдбар 256/288px на стекле, контент ≤ 1024px по центру, без нижней навигации.
- [ ] Формы — шторки снизу (телефон) / диалоги по центру 512px (ПК), кнопка в закреплённом футере.
- [ ] Вкладки — Segmented-таблетки, не подчёркнутые табы.
- [ ] Бейджи — полупрозрачная подложка 15 % + насыщенный текст, по таблице семантики.
- [ ] Иконки в карточках — в плашках `rounded-2xl` с подложкой 12 %.
- [ ] Светлая тема работает от системы и вручную через `data-theme` на `<html>`.
- [ ] Safe-area учтены сверху и снизу; поля ≥ 44px высотой.
