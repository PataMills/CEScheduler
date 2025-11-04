import React, { useEffect, useState } from "react";

export default function MyDay() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // tomorrow in YYYY-MM-DD
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate() + 0).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;

    (async () => {
      try {
        const res = await fetch(`/api/myday?date=${date}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.rows || [];
        console.log("MYDAY rows:", rows);        // <-- watch the browser console
        setTasks(rows);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h2>My Day (debug)</h2>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: "crimson" }}>Error: {error}</div>}
      {!loading && !error && (
        <>
          <div>Tasks loaded: {tasks.length}</div>
          <pre style={{ background: "#f5f5f5", padding: 12, overflow: "auto" }}>
            {JSON.stringify(tasks, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
