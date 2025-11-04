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
  <link rel="stylesheet" href="/static/appbar.css?v=3">
  <link rel="stylesheet" href="/static/calendar.css?v=3">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css">
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
