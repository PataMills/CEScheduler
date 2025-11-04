(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    // ---- DOM
    const elSearch       = document.getElementById("svcSearch");        // text input
    const elResultsBox   = document.getElementById("svcSearchResults"); // dropdown list container
    const elPhone        = document.getElementById("svcPhone");
    const elAddress      = document.getElementById("svcAddress");
    const elDate         = document.getElementById("svcDate");          // <input type="date">
    const elTime         = document.getElementById("svcTime");          // <input type="time">
    const elDuration     = document.getElementById("svcDuration");      // minutes (e.g., 60)
    const elResource     = document.getElementById("svcResource");      // <select> of crews/techs
    const elCheckBtn     = document.getElementById("svcCheckAvailBtn");
    const elCreateBtn    = document.getElementById("svcCreateBtn");
    const elAvailMsg     = document.getElementById("svcAvailMsg");      // status text
    const elSuggestBox   = document.getElementById("svcSuggestions");   // list of suggested times
    const elCalendarWrap = document.getElementById("svcCalendarWrap");  // container to show calendar
    const elCalendarBtn  = document.getElementById("svcCalendarBtn");   // "Show calendar" button

    if (!elSearch || !elCreateBtn) {
      console.error("[SERVICE] Missing required DOM elements. Check IDs.");
      return;
    }

    // ---- State
    let selectedCustomer = null;
    let searchTimer = null;

    // ---- Helpers
    const fmt = (v) => (v == null ? "" : String(v));
    const isoFromDateTime = (d, t) => {
      // d: "2025-10-27", t: "13:30"
      return d && t ? `${d}T${t}:00` : null;
    };

    const setBusy = (busy) => {
      [elCheckBtn, elCreateBtn, elCalendarBtn].forEach(b => { if (b) b.disabled = !!busy; });
    };

    const showAvail = (ok, msg) => {
      if (!elAvailMsg) return;
      elAvailMsg.textContent = msg || (ok ? "Available" : "Not available");
      elAvailMsg.style.color = ok ? "green" : "crimson";
    };

    const renderSuggestions = (slots) => {
      if (!elSuggestBox) return;
      elSuggestBox.innerHTML = (slots && slots.length)
        ? slots.map(s => {
            // s.start, s.end are ISO strings
            const dt = new Date(s.start);
            const hh = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const dd = dt.toLocaleDateString();
            return [
              '<button class="svc-suggest" data-start="', s.start, '" data-end="', s.end, '">',
              dd, " ", hh, " (", Math.round((new Date(s.end)-new Date(s.start))/60000), "m)",
              "</button>"
            ].join("");
          }).join("")
        : '<div>No nearby openings. Try another day/resource.</div>';

      // attach click handlers to suggestions to fill the form
      elSuggestBox.querySelectorAll("button.svc-suggest").forEach(btn => {
        btn.onclick = () => {
          const startIso = btn.getAttribute("data-start");
          const dt = new Date(startIso);
          const d  = dt.toISOString().slice(0,10);
          const hh = dt.toTimeString().slice(0,5);
          elDate.value = d;
          elTime.value = hh;
          showAvail(true, "Selected suggested slot");
        };
      });
    };

    const fetchJSON = async (url, opts) => {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };

    // ---- Customer search (debounced)
    const doSearch = async (q) => {
      if (!q || q.length < 2) {
        elResultsBox.innerHTML = "";
        return;
      }
      try {
        const data = await fetchJSON(`/api/customers/search?q=${encodeURIComponent(q)}`);
        const rows = data.results || [];
        elResultsBox.innerHTML = rows.map(c => [
          '<div class="svc-result" data-id="', c.id, '">',
          fmt(c.name), ' — ', fmt(c.phone || c.mobile || ""), " — ", fmt(c.address_line1 || c.address || ""),
          "</div>"
        ].join("")).join("");

        elResultsBox.querySelectorAll(".svc-result").forEach(div => {
          div.onclick = async () => {
            const id = div.getAttribute("data-id");
            try {
              const detail = await fetchJSON(`/api/customers/${id}`);
              selectedCustomer = detail.customer;
              elPhone.value   = fmt(selectedCustomer.phone || selectedCustomer.mobile || "");
              elAddress.value = [fmt(selectedCustomer.address_line1 || selectedCustomer.address || ""),
                                 fmt(selectedCustomer.city), fmt(selectedCustomer.state), fmt(selectedCustomer.zip)]
                                .filter(Boolean).join(", ");
              elResultsBox.innerHTML = "";
              showAvail(false, "Pick date/time then check availability.");
            } catch (e) {
              console.error(e);
              alert("Could not load customer.");
            }
          };
        });
      } catch (e) {
        console.error(e);
        elResultsBox.innerHTML = '<div class="error">Search failed</div>';
      }
    };

    elSearch.addEventListener("input", () => {
      const q = elSearch.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => doSearch(q), 250);
    });

    // ---- Availability check
    const checkAvailability = async () => {
      if (!selectedCustomer) { alert("Select a customer first."); return; }
      const d = elDate.value; const t = elTime.value;
      const startIso = isoFromDateTime(d, t);
      if (!startIso) { alert("Pick a date and time."); return; }
      const durationMin = Number(elDuration.value || 60);
      const resourceId  = elResource.value || "";

      setBusy(true);
      try {
        const data = await fetchJSON(`/api/availability?start=${encodeURIComponent(startIso)}&duration=${durationMin}&resourceId=${encodeURIComponent(resourceId)}`);
        showAvail(!!data.available, data.message || (data.available ? "Available" : "Not available"));
        renderSuggestions(data.suggestions || []);
        return !!data.available;
      } catch (e) {
        console.error(e);
        showAvail(false, "Error checking availability");
        return false;
      } finally {
        setBusy(false);
      }
    };

    if (elCheckBtn) elCheckBtn.onclick = (e) => { e.preventDefault(); checkAvailability(); };

    // ---- Create service
    if (elCreateBtn) elCreateBtn.onclick = async (e) => {
      e.preventDefault();
      if (!selectedCustomer) { alert("Select a customer first."); return; }

      const d = elDate.value; const t = elTime.value;
      const startIso = isoFromDateTime(d, t);
      const durationMin = Number(elDuration.value || 60);
      const resourceId  = elResource.value || "";

      if (!startIso) { alert("Pick a date and time."); return; }

      // double-check availability; if not available, don’t create
      const ok = await checkAvailability();
      if (!ok) return;

      setBusy(true);
      try {
        const body = {
          customer_id: selectedCustomer.id,
          start: startIso,
          duration_min: durationMin,
          resource_id: resourceId,
          phone: elPhone.value || null,
          address: elAddress.value || null,
          notes: (document.getElementById("svcNotes")?.value || "")
        };
        const data = await fetchJSON("/api/service-appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        alert("Service scheduled. ID: " + data.id);
        // Optionally redirect:
        // window.location = `/service-details?id=${data.id}`;
      } catch (e2) {
        console.error(e2);
        alert("Failed to create service.");
      } finally {
        setBusy(false);
      }
    };

    // ---- Calendar toggle (simple week view of free/blocked slots)
    if (elCalendarBtn && elCalendarWrap) {
      elCalendarBtn.onclick = async () => {
        const resourceId = elResource.value || "";
        const day = elDate.value || new Date().toISOString().slice(0,10);
        elCalendarWrap.innerHTML = "Loading...";
        try {
          const data = await fetchJSON(`/api/availability/calendar?resourceId=${encodeURIComponent(resourceId)}&day=${day}`);
          // Expect: { blocks: [{start,end,type:'busy'|'free'}] }
          elCalendarWrap.innerHTML = [
            '<div style="max-height:260px; overflow:auto; border:1px solid #ddd; padding:8px;">',
            (data.blocks||[]).map(b => [
              '<div style="margin:4px 0;">',
              b.type === 'busy' ? '🟥' : '🟩',
              ' ', new Date(b.start).toLocaleString(), ' - ', new Date(b.end).toLocaleTimeString(),
              '</div>'
            ].join("")).join("") ,
            '</div>'
          ].join("");
        } catch (e) {
          console.error(e);
          elCalendarWrap.innerHTML = "Failed to load calendar.";
        }
      };
    }
  });
})();
