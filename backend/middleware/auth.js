import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, name, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// NOTE: there used to be a second, older copy of this function further down
// in this file that only accepted a single role (function requireRole(role)).
// Having two `export function requireRole` declarations in the same file
// meant the OLDER single-role one was the one actually being used -- so any
// route written as requireRole("admin", "doctor") silently behaved as
// requireRole("admin") only, rejecting every doctor request with
// "Requires admin role.". That old duplicate has been removed. This is now
// the ONLY requireRole in the file.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires ${roles.join(" or ")} role.` });
    }
    next();
  };
}