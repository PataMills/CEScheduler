// pages/_layout.js
// Shared layout helper for consistent styling across all pages

export function headCommon(title = '') {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <title>${title ? title + ' – ' : ''}Cabinets Express</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E📦%3C/text%3E%3C/svg%3E">
  <link rel="stylesheet" href="/static/appbar.css?v=3">
  <link rel="stylesheet" href="/static/calendar.css?v=3">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css">
  <script>
    // Global HTML escape helper for safe rendering
    window.esc = function (v) {
      const s = String(v ?? '');
      return s.replace(/[&<>"']/g, c => (
        c === '&' ? '&amp;' :
        c === '<' ? '&lt;'  :
        c === '>' ? '&gt;'  :
        c === '"' ? '&quot;':
                   '&#39;'
      ));
    };
  </script>
</head>
<body class="theme-dark">
  <div id="appbar"></div>
`;
}

export function footCommon() {
  return `
  <script src="/static/appbar.js?v=3"></script>
</body>
</html>`;
}
