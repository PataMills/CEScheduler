const request = require("supertest");

describe("GET /health", () => {
  it("returns ok:true", async () => {
    const app = (await import("../../app.js")).default;
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ ok: true });
  });
});

