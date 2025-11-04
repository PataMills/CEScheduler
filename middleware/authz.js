// middleware/authz.js
export function requireAdmin(req, res, next) {
  // Assumes your auth middleware put { id, email, role, org_id } on req.user
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (!req.user.org_id) return res.status(400).json({ error: 'missing_org' });
  next();
}
