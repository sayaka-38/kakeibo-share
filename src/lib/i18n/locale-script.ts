/**
 * Inline script to set html lang before paint (FOUC prevention).
 * Injected as dangerouslySetInnerHTML in <head>.
 */
export const localeScript = `
(function() {
  try {
    var m = document.cookie.match(/kakeibo-locale=(ja|en)/);
    if (m) { document.documentElement.lang = m[1]; return; }
    var l = localStorage.getItem('kakeibo-locale');
    if (l && ['ja','en'].indexOf(l) !== -1) {
      document.documentElement.lang = l;
    }
  } catch(e) {}
})();
`;
