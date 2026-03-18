import pool from "../config/db.js";

export function ensureAuthenticated(req, res, next) {

  if (req.isAuthenticated()) {
    return next();
  }

  req.flash("error", "Please login first");
  res.redirect("/login");

}


export function ensureAdmin(req, res, next) {

  if (!req.isAuthenticated()) {
    return res.redirect("/admin/login");
  }

  if (req.user.role !== "admin") {
    req.flash("error", "You are not authorized to access admin panel");
    return res.redirect("/");
  }

  next();

}

export async function checkMaintenance(req, res, next) {
  // Always allow admin routes, login/auth routes, and static assets (handled upstream)
  if (req.path.startsWith("/admin") || 
      req.path === "/login" || 
      req.path === "/logout" || 
      req.path.startsWith("/auth")) {
    return next();
  }

  try {
    // If user is logged in as admin, they can bypass maintenance
    if (req.isAuthenticated() && req.user.role === "admin") {
      return next();
    }

    const result = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'maintenance_mode'");
    if (result.rows.length > 0 && result.rows[0].setting_value === "true") {
      return res.render("maintenance");
    }
    
    next();
  } catch (err) {
    console.error("Maintenance check error:", err);
    next();
  }
}