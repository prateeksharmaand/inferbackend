// Print one element (a receipt, a document…) in its own window.
//
// Why not window.print() on the app page: the app's CSS is bundled app-wide, so a print rule
// written for one screen (e.g. InferPad's "hide everything except the prescription") applies to
// every other screen too and prints them blank. This copies the app's CSS — keeping hashed
// CSS-module class names — but drops its @media print rules, then prints only `el`.
export function collectAppCss() {
  let css = '';
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.type === CSSRule.MEDIA_RULE && /print/i.test(rule.media?.mediaText || '')) continue;
          css += rule.cssText + '\n';
        }
      } catch { /* cross-origin sheet (e.g. fonts) */ }
    }
  } catch { /* no stylesheets */ }
  return css;
}

/**
 * @param {HTMLElement} el   element to print
 * @param {object} opts      { title, autoClose = true, extraCss = '' }
 * @returns {boolean}        false if the pop-up was blocked or there was nothing to print
 */
export function printElement(el, { title = 'Print', autoClose = true, extraCss = '' } = {}) {
  if (!el) return false;
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;
  const safeTitle = String(title).replace(/[<>&"]/g, '');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <style>
    ${collectAppCss()}
    *, *::before, *::after { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 8mm; }
    html, body {
      margin: 0; padding: 0; background: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .print-root > * { width: 100% !important; max-width: none !important; margin: 0 !important;
                      box-shadow: none !important; border-radius: 0 !important; }
    img { max-width: 100% !important; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    ${extraCss}
  </style>
</head>
<body>
  <div class="print-root">${el.outerHTML}</div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); ${autoClose ? 'window.close();' : ''} }, 600);
    };
  </script>
</body>
</html>`);
  win.document.close();
  return true;
}
