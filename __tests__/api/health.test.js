import request from "supertest";
import app from "../../app.js";

describe("GET /health", () => {
  it("returns ok:true", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ ok: true });
  });
});

