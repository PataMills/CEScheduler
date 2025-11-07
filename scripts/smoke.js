import http from "http";

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "localhost", port: 3000, path }, (r) => {
        let body = "";
        r.on("data", (chunk) => {
          body += chunk;
        });
        r.on("end", () => {
          resolve({ status: r.statusCode, body });
        });
      })
      .on("error", reject);
  });
}

function post(path, json) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(json || {}));
    const req = http.request(
      {
        host: "localhost",
        port: 3000,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (r) => {
        let body = "";
        r.on("data", (chunk) => {
          body += chunk;
        });
        r.on("end", () => {
          resolve({ status: r.statusCode, body });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  const bidId = 36; // <-- change to a real bid in your DB

  const columns = await get(`/api/bids/${bidId}/columns-details`);
  if (columns.status !== 200) throw new Error(`columns-details failed: ${columns.status}`);

  const docs = await get(`/api/bids/${bidId}/documents`);
  if (docs.status !== 200) throw new Error(`documents failed: ${docs.status}`);

  const submit = await post(`/api/po/submit`, { bidId });
  if (submit.status !== 200) throw new Error(`po submit failed: ${submit.status}`);

  console.log("SMOKE OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
