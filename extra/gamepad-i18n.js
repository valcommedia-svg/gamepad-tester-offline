// Strings for the "any gamepad" page. The main (upstream) page has 24 languages;
// this page ships English and Russian and falls back to English for the rest.

const STRINGS = {
  en: {
    'page.title': 'Gamepad test',
    'nav.playstation': 'PlayStation calibration',
    'hint': 'Connect a gamepad and press any button on it. Any standard gamepad works (Xbox, PlayStation, Switch Pro, 8BitDo...).',
    'connected': 'Connected:',
    'pick': 'Gamepad',
    'layout.standard': 'standard layout',
    'layout.other': 'non-standard layout, buttons are shown as numbers',
    'counts': '{buttons} buttons, {axes} axes',
    'sticks': 'Sticks',
    'stick.left': 'Left stick',
    'stick.right': 'Right stick',
    'stick.reset': 'Reset trace',
    'stick.hint': 'Push a stick around its edge to draw its range. The outline shows the furthest point reached in every direction.',
    'circ.need': 'round: rotate the stick fully',
    'circ.result': 'round: coverage {coverage}%, error {error}%',
    'buttons': 'Buttons',
    'axes': 'Raw axes',
    'pressed': 'Pressed at once: {now} (most: {max})',
    'drift.title': 'Drift (rest) test',
    'drift.desc': 'Let go of both sticks and press Measure. The app records how far the sticks read from center for 3 seconds.',
    'drift.start': 'Measure',
    'drift.running': 'Measuring, do not touch the sticks ({sec} s)',
    'drift.moved': 'A stick was moved during the test. Let go of the sticks and try again.',
    'drift.col.stick': 'Stick',
    'drift.col.offset': 'Offset',
    'drift.col.noise': 'Noise',
    'drift.col.max': 'Max deviation',
    'drift.col.deadzone': 'Suggested dead zone',
    'drift.col.verdict': 'Verdict',
    'verdict.good': 'Excellent',
    'verdict.minor': 'Minor drift',
    'verdict.noticeable': 'Noticeable drift',
    'verdict.severe': 'Severe drift',
    'drift.note': 'Rough guide: below 2% is normal. Calibration cannot repair worn sticks; drift is a mechanical problem.',
    'poll.title': 'Update rate',
    'poll.desc': 'Keep moving a stick in circles during the test. This shows how often the app receives new data. It can be lower than the real rate of the controller because the browser limits how often it polls.',
    'poll.start': 'Measure 5 s',
    'poll.running': 'Measuring, keep moving a stick ({sec} s)',
    'poll.result': '{hz} Hz (average {ms} ms, jitter {jitter} ms, {n} updates)',
    'poll.nodata': 'Not enough data. Move a stick continuously during the test.',
    'rumble.title': 'Vibration',
    'rumble.weak': 'Weak',
    'rumble.strong': 'Strong',
    'rumble.both': 'Both',
    'rumble.unsupported': 'This gamepad or system does not expose vibration to the app.',
    'rumble.failed': 'Vibration failed: {error}',
    'report.title': 'Report',
    'report.copy': 'Copy report',
    'report.copied': 'Copied',
    'report.failed': 'Could not copy, select the text and copy it manually.',
    'report.empty': 'Run the tests to fill the report.',
  },
  ru: {
    'page.title': 'Тест геймпада',
    'nav.playstation': 'Калибровка PlayStation',
    'hint': 'Подключите геймпад и нажмите на нём любую кнопку. Подойдёт любой стандартный геймпад (Xbox, PlayStation, Switch Pro, 8BitDo...).',
    'connected': 'Подключён:',
    'pick': 'Геймпад',
    'layout.standard': 'стандартная раскладка',
    'layout.other': 'нестандартная раскладка, кнопки показаны номерами',
    'counts': 'кнопок: {buttons}, осей: {axes}',
    'sticks': 'Стики',
    'stick.left': 'Левый стик',
    'stick.right': 'Правый стик',
    'stick.reset': 'Сбросить след',
    'stick.hint': 'Проведите стиком по краю, чтобы нарисовать его диапазон. Контур показывает самую дальнюю точку в каждом направлении.',
    'circ.need': 'круглость: проведите стик по полному кругу',
    'circ.result': 'круглость: охват {coverage}%, отклонение {error}%',
    'buttons': 'Кнопки',
    'axes': 'Оси (сырые значения)',
    'pressed': 'Нажато одновременно: {now} (максимум: {max})',
    'drift.title': 'Тест дрейфа (в покое)',
    'drift.desc': 'Отпустите оба стика и нажмите «Измерить». Приложение 3 секунды записывает, насколько стики отклоняются от центра.',
    'drift.start': 'Измерить',
    'drift.running': 'Идёт измерение, не трогайте стики ({sec} с)',
    'drift.moved': 'Во время теста стик двигали. Отпустите стики и повторите.',
    'drift.col.stick': 'Стик',
    'drift.col.offset': 'Смещение',
    'drift.col.noise': 'Шум',
    'drift.col.max': 'Макс. отклонение',
    'drift.col.deadzone': 'Мёртвая зона',
    'drift.col.verdict': 'Оценка',
    'verdict.good': 'Отлично',
    'verdict.minor': 'Небольшой дрейф',
    'verdict.noticeable': 'Заметный дрейф',
    'verdict.severe': 'Сильный дрейф',
    'drift.note': 'Ориентир: до 2% это норма. Калибровка не лечит изношенные стики: дрейф — механическая проблема.',
    'poll.title': 'Частота обновления',
    'poll.desc': 'Во время теста непрерывно водите стиком по кругу. Показывает, как часто приложение получает новые данные. Она может быть ниже реальной частоты контроллера, потому что браузер ограничивает частоту опроса.',
    'poll.start': 'Измерить 5 с',
    'poll.running': 'Идёт измерение, продолжайте водить стиком ({sec} с)',
    'poll.result': '{hz} Гц (в среднем {ms} мс, разброс {jitter} мс, обновлений: {n})',
    'poll.nodata': 'Мало данных. Непрерывно двигайте стик во время теста.',
    'rumble.title': 'Вибрация',
    'rumble.weak': 'Слабая',
    'rumble.strong': 'Сильная',
    'rumble.both': 'Обе',
    'rumble.unsupported': 'Этот геймпад или система не отдают приложению управление вибрацией.',
    'rumble.failed': 'Не удалось включить вибрацию: {error}',
    'report.title': 'Отчёт',
    'report.copy': 'Скопировать отчёт',
    'report.copied': 'Скопировано',
    'report.failed': 'Не удалось скопировать, выделите текст и скопируйте вручную.',
    'report.empty': 'Запустите тесты, чтобы заполнить отчёт.',
  },
};

/** Same choice as the main page: its language menu stores `force_lang` in localStorage. */
export function detectLang() {
  let preferred = '';
  try { preferred = localStorage.getItem('force_lang') || ''; } catch { /* storage unavailable */ }
  return (preferred || navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function makeT(lang) {
  const dict = STRINGS[lang] ?? STRINGS.en;
  return (key, vars = {}) => {
    let text = dict[key] ?? STRINGS.en[key] ?? key;
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  };
}

export const KEYS = Object.keys(STRINGS.en);
export const RU_KEYS = Object.keys(STRINGS.ru);
