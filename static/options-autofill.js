(function () {
  const CANON = {
    manufacturer: 'manufacturer',
    species: 'species',
    door_style: 'door_style',
    finish_color: 'finish_color',
    color: 'finish_color',
    finish: 'finish_color',
    paint: 'finish_color',
    paint_color: 'finish_color',
    stain_color: 'finish_color',
    wood: 'species',
    wood_species: 'species',
    brand: 'manufacturer',
    mfg: 'manufacturer',
    doorstyle: 'door_style'
  };
  const canonKey = k => CANON[String(k || '').trim()] || String(k || '').trim();

  function normalize(list) {
    const items = (Array.isArray(list) ? list : []).map(x => ({
      label: String(x.value_text ?? x.value ?? '').trim(),
      value: String(x.value ?? x.value_text ?? '').trim(),
      sort: Number(x.sort ?? x.sort_order ?? 0) || 0,
      num: (x.num ?? x.value_num ?? null)
    }));
    items.sort((a, b) => (a.sort - b.sort) || a.label.localeCompare(b.label));
    return items;
  }

  function selectIsEmptyOrBlankOnly(sel) {
    if (!sel || !sel.options) return true;
    if (sel.options.length === 0) return true;
    if (sel.options.length === 1) {
      const o = sel.options[0];
      return (!o.value && !o.textContent);
    }
    return false;
  }

  function fillSelect(sel, items, includeBlank = true) {
    if (!sel || !Array.isArray(items)) return;
    if (!selectIsEmptyOrBlankOnly(sel)) return;

    sel.innerHTML = '';

    if (includeBlank) {
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '';
      sel.appendChild(blank);
    }

    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.value;
      opt.textContent = it.label;
      sel.appendChild(opt);
    }
  }

  async function load() {
    try {
      // Collect declared selects: data-options="group"
      const declared = Array.from(document.querySelectorAll('select[data-options]'));
      const declaredKeys = Array.from(new Set(declared.map(s => canonKey(s.getAttribute('data-options'))).filter(Boolean)));

      // Fallback IDs commonly used on your page
      const fallbackMap = {
        manufacturer: document.getElementById('manufacturerSelect'),
        species: document.getElementById('speciesSelect'),
        door_style: document.getElementById('doorStyleSelect'),
        finish_color: document.getElementById('finishColorSelect')
      };

      const allKeys = Array.from(new Set([
        ...declaredKeys,
        ...Object.keys(fallbackMap).filter(k => !!fallbackMap[k])
      ]));

      if (allKeys.length === 0) return;

      const url = '/api/options/bulk?keys=' + encodeURIComponent(allKeys.join(','));
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const map = (data && data.options) || {};

      function itemsFor(key) {
        const c = canonKey(key);
        return normalize(map[c] || map[key] || []);
      }

      // Fill declared selects
      for (const sel of declared) {
        const group = canonKey(sel.getAttribute('data-options'));
        fillSelect(sel, itemsFor(group), true);
      }

      // Fill fallback selects if present
      for (const k of Object.keys(fallbackMap)) {
        const sel = fallbackMap[k];
        if (sel) fillSelect(sel, itemsFor(k), true);
      }
    } catch (_) {
      // best-effort; ignore errors
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
