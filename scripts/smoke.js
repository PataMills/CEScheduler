const BID = Number(process.env.BID || "36");
const BASE = process.env.BASE || "http://localhost:3000";

async function hit(path) {
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, json };
  } catch (error) {
    return { ok: false, status: 0, json: { error: error?.message || String(error) } };
  }
}

(async () => {
  const summary = await hit(`/api/bids/${BID}/summary`);
  const model = await hit(`/api/bids/${BID}/model`);
  const lines = await hit(`/api/bids/${BID}/lines`);
  const preview = await hit(`/api/bids/${BID}/preview`);
  const customer = await hit(`/api/bids/${BID}/customer-info`);
  const health = await hit(`/api/__health`);

  const report = {
    summary_ok: summary.ok && !!summary.json?.ok,
    model_cols: model.ok ? model.json?.columns?.length ?? 0 : -1,
    model_lines: model.ok ? model.json?.lines?.length ?? 0 : -1,
    lines: lines.ok ? lines.json?.length ?? 0 : -1,
    preview: preview.ok ? preview.json?.length ?? 0 : -1,
    customer_ok: customer.ok && !!customer.json?.id,
    health_ok: health.ok && !!health.json?.ok,
  };

  console.table(report);

  const pass =
    report.summary_ok &&
    report.model_cols >= 0 &&
    report.model_lines >= 0 &&
    report.lines >= 0 &&
    report.preview >= 0 &&
    report.customer_ok &&
    report.health_ok;

  if (!pass) {
    console.error("Smoke failed");
    process.exit(1);
  }

  console.log("Smoke passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
