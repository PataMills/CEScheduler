// pages/purchasing.js
import { requireRolePage } from "../routes/auth.js";

export default function registerPurchasingPage(app) {
  app.get("/purchasing", requireRolePage(["admin", "purchasing"]), (_req, res) => {
    res.redirect(302, "/purchasing-dashboard?tab=queue");
  });
}
