// Fills the popup and options page with texts from _locales, so they follow
// the browser language (German or English).
const t = (key) => chrome.i18n.getMessage(key);
const fmt = (n) => (n || 0).toLocaleString(chrome.i18n.getUILanguage());

document.documentElement.lang = chrome.i18n.getUILanguage();
document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
// Only our own bundled messages go through innerHTML.
document.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
document.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
