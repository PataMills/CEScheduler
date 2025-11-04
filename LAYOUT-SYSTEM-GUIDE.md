# Shared Layout System - Implementation Guide

## What Was Done

Created a unified layout system to ensure consistent styling across all pages in your app. This eliminates the "looks fine on some pages, off on others" issue you experienced.

## Files Created/Modified

### 1. **pages/_layout.js** (NEW)
Shared layout helper that provides consistent HTML structure, cache-busting, and theme class.

**Key features:**
- Includes all shared CSS files with `?v=3` cache-buster
- Sets `theme-dark` body class automatically
- Includes cache-control meta tags
- Includes appbar automatically
- FullCalendar CSS loaded by default

**Usage:**
```javascript
import { headCommon, footCommon } from "./_layout.js";

app.get("/my-page", (req, res) => {
  res.type("html").send(headCommon('Page Title') + `
    <div class="wrap">
      <!-- Your page content here -->
    </div>
  ` + footCommon());
});
```

### 2. **static/appbar.css** (EXTENDED)
Expanded from just appbar styles to include all shared dark theme styles.

**Now includes:**
- CSS variables for dark theme colors
- Body/typography styles scoped to `body.theme-dark`
- Layout containers (`.wrap`, `.row`, `.panel`, `.card`, `.sheet`)
- Buttons (`.btn`)
- Form controls (`input`, `select`, `textarea`)
- Badges (`.badge` with status variants)
- Links, tables, legends
- Modal overlay styles
- Original appbar navigation styles

**Key benefit:** All pages using this CSS get consistent styling automatically.

### 3. **static/calendar.css** (NEW)
FullCalendar dark theme customizations.

**Includes:**
- Event type colors (manufacturing, paint, assembly, delivery, install, service)
- Status badge styles inside calendar events
- Calendar UI dark theme overrides
- Modal styles for task completion

**Why separate:** Keeps calendar-specific styling isolated; only pages using FullCalendar need these rules.

### 4. **pages/mydayTeams.js** (REFACTORED)
First page converted to use the new shared layout system.

**Changes:**
- Imports `headCommon` and `footCommon` from `_layout.js`
- Removed duplicate CSS (now in shared files)
- Removed inline `<script src="/static/appbar.js">` (now in footCommon)
- Kept page-specific inline script for calendar/team logic

**Before:** 550+ lines with massive inline CSS
**After:** 550+ lines but CSS moved to shared files, cleaner structure

## Why This Fixes Your Styling Issues

### Problem 1: Different CSS bundles per page
**Fixed:** All pages using `headCommon()` automatically get the same CSS stack:
- `/static/appbar.css?v=3` (shared theme)
- `/static/calendar.css?v=3` (calendar styles)
- FullCalendar CDN CSS

### Problem 2: Service worker caching
**Fixed:** 
- `?v=3` cache-buster on all CSS/JS
- Cache-control meta tags in `<head>`
- Users should do a hard refresh (Ctrl+Shift+R) once

### Problem 3: Missing FullCalendar CSS
**Fixed:** FullCalendar CSS loaded automatically in `headCommon()`.

### Problem 4: Theme class not applied
**Fixed:** `<body class="theme-dark">` set automatically in `headCommon()`.

### Problem 5: Specificity clashes
**Fixed:** All shared styles now scoped to `body.theme-dark` for proper cascading.

## Quick Migration Guide for Other Pages

To migrate another page to use the shared layout:

```javascript
// Before
export default function registerMyPage(app) {
  app.get("/my-page", (req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <title>My Page</title>
  <style>
    /* lots of duplicate CSS */
  </style>
</head>
<body>
  <div class="wrap">
    <!-- content -->
  </div>
  <script src="/static/appbar.js"></script>
</body></html>`);
  });
}

// After
import { headCommon, footCommon } from "./_layout.js";

export default function registerMyPage(app) {
  app.get("/my-page", (req, res) => {
    res.type("html").send(headCommon('My Page') + `
  <div class="wrap">
    <!-- content -->
  </div>
` + footCommon());
  });
}
```

**Pages that should be migrated:**
- adminInvites.js
- acceptInvite.js
- adminHub.js
- adminUsers.js
- adminOptions.js
- salesHome.js
- salesConsole.js
- salesReview.js
- salesDetails.js
- salesReschedule.js
- salesServiceSchedule.js
- createService.js
- teamTask.js
- purchasingDashboard.js
- purchasingWorklist.js
- incomplete.js
- login.js (maybe - might need custom styling)
- register.js (maybe - might need custom styling)

## Testing Steps

1. **Hard refresh pages:**
   ```
   Ctrl+Shift+R on Windows/Linux
   Cmd+Shift+R on Mac
   ```

2. **Clear service worker (if needed):**
   - Open DevTools → Application → Service Workers
   - Check "Update on reload"
   - Or: Application → Storage → Clear site data

3. **Verify consistent styling:**
   - Check all pages have the same button/input/badge styles
   - Calendar events show correct colors
   - Dark theme applied everywhere
   - No missing CSS

4. **Network tab verification:**
   - `/static/appbar.css?v=3` loads (200 OK)
   - `/static/calendar.css?v=3` loads (200 OK)
   - `/static/appbar.js?v=3` loads (200 OK)
   - FullCalendar CSS loads from CDN

## CSS Variable Reference

Available throughout your app via `:root`:

```css
--bg: #0b0c10        /* Main background */
--panel: #111318     /* Panel/card background */
--line: #212432      /* Border color */
--text: #eef2ff      /* Primary text */
--muted: #8b93a3     /* Secondary text */
--accent: #6ee7b7    /* Accent/link color */
--blue: #3b82f6      /* Manufacturing */
--purple: #8b5cf6    /* Paint */
--amber: #f59e0b     /* Assembly */
--emerald: #10b981   /* Delivery */
--green: #22c55e     /* Install */
--red: #ef4444       /* Service */
```

## Utility Classes

Available on all pages (when using theme-dark body):

**Typography:** `.muted`, `.small`
**Layout:** `.wrap`, `.row`, `.panel`, `.card`, `.sheet`
**Buttons:** `.btn`
**Badges:** `.badge`, `.badge.scheduled`, `.badge.in_progress`, `.badge.complete`, `.badge.wip`, `.badge.en_route`
**Legend:** `.legend`, `.dot` (with variants: `.manu`, `.paint`, `.asm`, `.del`, `.ins`, `.svc`)

## Next Steps

1. **Immediate:**
   - Test MyDay page with hard refresh
   - Verify calendar displays correctly
   - Verify all buttons/inputs styled consistently

2. **Short-term:**
   - Migrate 2-3 more high-traffic pages (Admin Hub, Sales Home, Team Task)
   - Test across different roles (admin, sales, installer)
   - Gather feedback on styling consistency

3. **Medium-term:**
   - Migrate remaining pages to shared layout
   - Consider extracting page-specific JS to `/static/` files
   - Add more utility classes as patterns emerge

4. **Optional improvements:**
   - Light theme support (`.theme-light` variant)
   - Responsive breakpoint utilities
   - Animation/transition utilities
   - Print stylesheet

## Troubleshooting

**Issue:** Styles not applying on a specific page
**Fix:** Ensure page uses `headCommon()` and `footCommon()`, and body has `theme-dark` class

**Issue:** Old cached CSS still loading
**Fix:** Hard refresh (Ctrl+Shift+R) or increment version number (?v=4)

**Issue:** Calendar looks wrong
**Fix:** Verify `/static/calendar.css` loads and FullCalendar CSS loads from CDN

**Issue:** Buttons/badges look different on different pages
**Fix:** Check if page has inline CSS overriding shared styles; remove duplicates

## File Structure

```
cabinet-manufacturing-api/
├── pages/
│   ├── _layout.js          ← NEW: Shared layout helper
│   ├── mydayTeams.js       ← UPDATED: First migrated page
│   ├── adminInvites.js     ← TODO: Migrate
│   ├── salesHome.js        ← TODO: Migrate
│   └── ... (other pages)
│
└── static/
    ├── appbar.css          ← UPDATED: Extended with full theme
    ├── calendar.css        ← NEW: Calendar dark theme
    ├── appbar.js           ← Existing: Nav bar script
    └── admin-invites.js    ← Existing: Admin page client script
```

## Summary

You now have a robust shared layout system that ensures:
- ✅ Consistent styling across all pages
- ✅ Automatic dark theme application
- ✅ Cache-busting for fresh CSS/JS
- ✅ FullCalendar styling out-of-the-box
- ✅ Easy-to-use helper functions
- ✅ Modular, maintainable CSS architecture

All pages migrated to this system will automatically inherit the same look and feel, eliminating the "some pages look fine, others don't" problem!
