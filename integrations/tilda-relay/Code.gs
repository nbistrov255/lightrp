/**
 * CyberHub — ретранслятор броней Tilda (Google Apps Script)
 * ==========================================================
 * Tilda (RU и LV) → этот скрипт → 1) Google Таблица (журнал и очередь)
 *                                  2) Discord (сразу)
 *                                  3) CyberHub Control (сразу, а если недоступен — повтор каждые 5 минут)
 *
 * Скрипт работает на серверах Google и не зависит от CyberHub Control:
 * если приложение упало или обновляется, заявка всё равно попадёт в Discord
 * и в таблицу, а в приложение — как только оно снова поднимется.
 *
 * Настройка — см. integrations/tilda-relay/README.md
 * Свойства скрипта (Project Settings → Script properties):
 *   RELAY_TOKEN       — секрет в URL вебхука Tilda (?token=...)
 *   DISCORD_WEBHOOK   — webhook канала броней в Discord
 *   APP_URL           — https://<домен>/api/integrations/tilda
 *   APP_TOKEN         — TILDA_TOKEN из .env приложения
 */

const SHEET_NAME = 'Брони';
const HEADERS = ['Получено', 'Сайт', 'tranid', 'Имя', 'Телефон', 'Дата', 'Время', 'Данные (JSON)', 'Discord', 'Приложение', 'Попыток', 'Ошибка'];
const COL = { discord: 9, app: 10, tries: 11, error: 12 };
const MAX_TRIES = 288; // ≈ сутки при повторе раз в 5 минут

function doPost(e) {
  const p = (e && e.parameter) || {};
  // Tilda проверяет вебхук запросом test=test
  if (p.test === 'test') return text_('ok');

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('RELAY_TOKEN') || p.token !== props.getProperty('RELAY_TOKEN')) return text_('forbidden');

  const lang = String(p.lang || 'ru').toLowerCase() === 'lv' ? 'lv' : 'ru';
  const data = {};
  Object.keys(p).forEach(function (k) {
    if (['token', 'lang'].indexOf(k) === -1) data[k] = p[k];
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let row;
  try {
    const sh = sheet_();
    // Защита от дублей (Tilda может повторить запрос)
    if (data.tranid && findRowByTranid_(sh, data.tranid)) return text_('ok');
    const f = pick_(data);
    sh.appendRow([new Date(), lang.toUpperCase(), data.tranid || '', f.name || '', f.phone || '', f.date || '', f.time || '', JSON.stringify(data), 'ожидает', 'ожидает', 0, '']);
    row = sh.getLastRow();
  } finally {
    lock.releaseLock();
  }

  deliver_(row);
  return text_('ok');
}

/** Отправка одной строки: Discord и приложение, по отдельности */
function deliver_(row) {
  const sh = sheet_();
  const vals = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  const lang = String(vals[1]).toLowerCase();
  const data = JSON.parse(vals[7]);
  const errors = [];
  let discordDone = vals[COL.discord - 1] === 'отправлено';

  if (!discordDone) {
    try {
      sendDiscord_(lang, data);
      sh.getRange(row, COL.discord).setValue('отправлено');
      discordDone = true;
    } catch (err) {
      errors.push('Discord: ' + err.message);
    }
  }

  if (vals[COL.app - 1] !== 'доставлено') {
    try {
      sendApp_(lang, data, discordDone);
      sh.getRange(row, COL.app).setValue('доставлено');
    } catch (err) {
      errors.push('Приложение: ' + err.message);
    }
  }

  sh.getRange(row, COL.tries).setValue(Number(vals[COL.tries - 1] || 0) + 1);
  sh.getRange(row, COL.error).setValue(errors.join(' | '));
}

/** Повтор недоставленных — запускается триггером раз в 5 минут */
function retryPending() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  vals.forEach(function (v, i) {
    const pending = v[COL.discord - 1] !== 'отправлено' || v[COL.app - 1] !== 'доставлено';
    if (pending && Number(v[COL.tries - 1]) < MAX_TRIES) deliver_(i + 2);
  });
}

function sendDiscord_(lang, data) {
  const hook = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK');
  if (!hook) throw new Error('DISCORD_WEBHOOK не задан');
  const f = pick_(data);
  const fields = [
    ['Имя', f.name], ['Телефон', f.phone], ['E-mail', f.email], ['Дата', f.date], ['Время', f.time], ['Гостей / ПК', f.guests], ['Зона', f.zone],
  ].filter(function (x) { return x[1]; }).map(function (x) { return { name: x[0], value: String(x[1]).slice(0, 1024), inline: true }; });
  const res = UrlFetchApp.fetch(hook, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      username: 'CyberHub · Брони',
      embeds: [{
        title: '📅 Новая бронь · Сайт ' + lang.toUpperCase(),
        description: f.comment ? String(f.comment).slice(0, 2000) : '',
        color: lang === 'lv' ? 0x9e3039 : 0x7c5cff,
        fields: fields,
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (res.getResponseCode() >= 300) throw new Error('HTTP ' + res.getResponseCode());
}

function sendApp_(lang, data, discordSent) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('APP_URL');
  if (!url) throw new Error('APP_URL не задан');
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { 'X-CyberHub-Token': props.getProperty('APP_TOKEN') || '' },
    payload: JSON.stringify({ lang: lang, discord_sent: discordSent ? 1 : 0, data: data }),
  });
  if (res.getResponseCode() >= 300) throw new Error('HTTP ' + res.getResponseCode());
}

// Поля форм Tilda называются по-разному на RU и LV сайтах — ищем по синонимам
const ALIASES = {
  name: ['name', 'имя', 'vārds', 'vards', 'фио'],
  phone: ['phone', 'телефон', 'tālrunis', 'talrunis', 'tel'],
  email: ['email', 'e-mail', 'почта', 'e-pasts', 'epasts'],
  date: ['date', 'дата', 'datums'],
  time: ['time', 'время', 'laiks'],
  guests: ['guests', 'гости', 'количество', 'people', 'cilvēki', 'skaits', 'пк', 'места'],
  zone: ['zone', 'зона', 'zona', 'зал', 'zāle', 'room', 'пакет'],
  comment: ['comment', 'комментарий', 'komentārs', 'komentars', 'message', 'сообщение', 'textarea'],
};
function pick_(data) {
  const out = {};
  const keys = Object.keys(data);
  Object.keys(ALIASES).forEach(function (field) {
    const a = ALIASES[field];
    const k = keys.filter(function (key) { return a.indexOf(key.toLowerCase()) !== -1; })[0]
      || keys.filter(function (key) { return a.some(function (x) { return key.toLowerCase().indexOf(x) !== -1; }); })[0];
    if (k) out[field] = data[k];
  });
  return out;
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function findRowByTranid_(sh, tranid) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 3, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0 && i >= ids.length - 500; i--) if (String(ids[i][0]) === String(tranid)) return i + 2;
  return 0;
}

function text_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}

/** Запустите один раз вручную: создаёт лист и триггер повтора */
function setup() {
  sheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'retryPending') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('retryPending').timeBased().everyMinutes(5).create();
}

/** Проверка без Tilda: Run → testBooking */
function testBooking() {
  const props = PropertiesService.getScriptProperties();
  doPost({ parameter: { token: props.getProperty('RELAY_TOKEN'), lang: 'ru', Name: 'Тест', Phone: '+371 20000000', Date: '01.01.2027', Time: '19:00', tranid: 'test-' + Date.now() } });
}
