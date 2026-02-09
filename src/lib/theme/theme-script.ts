/**
 * Inline script to prevent FOUC (Flash of Unstyled Content).
 * Injected as dangerouslySetInnerHTML in <head> so it runs before paint.
 */
export const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('kakeibo-theme');
    if (t && ['14','12','15','16','17'].indexOf(t) !== -1) {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch(e) {}
})();
`;
