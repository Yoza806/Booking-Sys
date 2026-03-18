import express from "express";
import bcrypt from "bcrypt";
import pool from "../config/db.js";
import passport from "passport";
import { ensureAdmin, ensureAuthenticated } from "../middleware/authMiddleware.js";
import crypto from "crypto";
import sendEmail from "../config/email.js";

const router = express.Router();

router.get("/register", (req, res) => {
  res.render("register");
});

router.get("/login", (req, res) => {
  res.render("login");
});

router.get("/admin/login", (req, res) => {
  res.render("adminLogin");
});

router.get("/admin", ensureAdmin, async (req, res) => {
  try {
    const courtsResult = await pool.query(
      "SELECT court_id, court_name, default_price, peak_price FROM courts WHERE is_active = true ORDER BY court_id"
    );
    
    // Fetch multiple settings
    const settingsResult = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('maintenance_mode', 'calendar_days_to_show')"
    );
    
    const settings = settingsResult.rows.reduce((acc, row) => {
        acc[row.setting_key] = row.setting_value;
        return acc;
    }, {});

    const maintenanceMode = settings.maintenance_mode === 'true';
    const calendarDaysToShow = settings.calendar_days_to_show || 7; // Default to 7 if not set

    res.render("admin", { courts: courtsResult.rows, maintenanceMode, calendarDaysToShow });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load court data.");
    res.render("admin", { courts: [], maintenanceMode: false, calendarDaysToShow: 7 });
  }
});

router.post(
  "/admin/login",
  passport.authenticate("local", {
    successRedirect: "/admin",
    failureRedirect: "/admin/login",
    failureFlash: true,
  })
)

router.post("/register", async (req, res) => {
  try {

    const { name, email, phone, address, password, confirm_password } = req.body;

    //check password match.
    if (password !== confirm_password){
      req.flash("error","password do not match!")
      return res.redirect("/register");
    }
    //check if the user is already exist
    const userCheck = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if(userCheck.rows.length>0){
      req.flash("error","Email already registered");
      return res.redirect("/register");
    }
    //hashing entered password
    const hashedPassword = await bcrypt.hash(password, 10);

    //insert user
      await pool.query(
        "INSERT INTO users (name, email, phone, address, password) VALUES ($1, $2, $3, $4, $5)",
        [name, email, phone, address, hashedPassword]
      );
    
    req.flash("success","Account created successfully!")
    res.redirect("/login");

  } catch (error) {
    console.error(err);
    req.flash("Error","Something Went Wrong!");
    res.redirect("/register");
  }
   });

router.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/calendar",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

router.get("/logout", (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect("/");
  });
});

router.post("/profile/update", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");
  
  try {
    const { name, phone, address } = req.body;
    const userId = req.user.id;

    await pool.query(
      "UPDATE users SET name = $1, phone = $2, address = $3 WHERE id = $4",
      [name, phone, address, userId]
    );

    req.flash("success", "Profile updated successfully");
    res.redirect("/profile");

  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to update profile");
    res.redirect("/profile");
  }
});

router.post("/profile/change-password", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/login");

  try {
    const { old_password, new_password, confirm_password } = req.body;
    const userId = req.user.id;

    // Verify old password
    const match = await bcrypt.compare(old_password, req.user.password);
    if (!match) {
      req.flash("error", "Incorrect old password");
      return res.redirect("/profile");
    }

    if (new_password !== confirm_password) {
      req.flash("error", "New passwords do not match");
      return res.redirect("/profile");
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, userId]);

    req.flash("success", "Password changed successfully");
    res.redirect("/profile");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to change password");
    res.redirect("/profile");
  }
});

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })
);

router.get(
  "/auth/google/admin",
  passport.authenticate("google", { 
    scope: ["profile", "email"], 
    prompt: "select_account",
    state: "admin_intent" 
  })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", failureFlash: true }),
  (req, res) => {
    // Handle Admin Google Login
    if (req.query.state === "admin_intent") {
      if (req.user.role === "admin") {
        return res.redirect("/admin");
      }
      return req.logout((err) => {
        if (err) console.error(err);
        req.flash("error", "Access Denied: You do not have admin privileges.");
        res.redirect("/admin/login");
      });
    }

    // Check if critical information is missing (Phone or Address)
    if (!req.user.phone || !req.user.address) {
      return res.redirect("/complete-profile");
    }
    res.redirect("/calendar");
  }
);

router.get("/complete-profile", ensureAuthenticated, (req, res) => {
  // If they already have the info, don't let them access this page, send to calendar
  if (req.user.phone && req.user.address) {
    return res.redirect("/calendar");
  }
  res.render("completeProfile", { user: req.user });
});

router.post("/complete-profile", ensureAuthenticated, async (req, res) => {
  try {
    const { phone, address } = req.body;
    const userId = req.user.id;

    // Update the user record with the new details
    await pool.query(
      "UPDATE users SET phone = $1, address = $2 WHERE id = $3",
      [phone, address, userId]
    );

    req.flash("success", "Profile completed! Welcome.");
    res.redirect("/calendar");
  } catch (err) {
    console.error(err);
    req.flash("error", "An error occurred while saving your details.");
    res.redirect("/complete-profile");
  }
});

router.get("/forgot-password", (req, res) => {
  res.render("forgotPassword");
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    // Use case-insensitive search and trim whitespace to ensure user is found
    const result = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email.trim()]);
    const user = result.rows[0];

    // To prevent email enumeration attacks, always show a generic success message.
    // Also, don't allow password resets for Google OAuth accounts.
    if (!user || user.password === 'google_oauth_login') {
      req.flash("success", "If an account with that email exists, a password reset link has been sent.");
      return res.redirect("/forgot-password");
    }

    // 1. Generate the random reset token.
    const resetToken = crypto.randomBytes(32).toString("hex");
    // Hash the token before saving to the DB for security.
    const passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // 2. Set token and expiry on the user record (e.g., 10 minutes).
    const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      "UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3",
      [passwordResetToken, passwordResetExpires, user.id]
    );

    // 3. Send the email with the UN-hashed token.
    const resetURL = `${req.protocol}://${req.get("host")}/reset-password/${resetToken}`;
    const message = `Forgot your password? Please go to the following link to reset it: ${resetURL}\n\nIf you didn't request this, please ignore this email. This link is valid for 10 minutes.`;

    try {
      await sendEmail({
        email: user.email,
        subject: "Your Password Reset Link",
        message,
      });

      req.flash("success", "A password reset link has been sent to your email.");
      res.redirect("/forgot-password");
    } catch (err) {
      // If email fails, clear the token from the DB so the user can try again.
      await pool.query(
        "UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL WHERE id = $1",
        [user.id]
      );
      console.error("EMAIL SENDING ERROR:", err);
      req.flash("error", "There was an error sending the email. Please try again later.");
      res.redirect("/forgot-password");
    }
  } catch (err) {
    console.error(err);
    req.flash("error", "An error occurred. Please try again.");
    res.redirect("/forgot-password");
  }
});

router.get("/reset-password/:token", async (req, res) => {
    try {
        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

        const result = await pool.query(
            "SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()",
            [hashedToken]
        );

        if (result.rows.length === 0) {
            req.flash("error", "Password reset token is invalid or has expired.");
            return res.redirect("/forgot-password");
        }

        res.render("resetPassword", { token: req.params.token });
    } catch (err) {
        console.error(err);
        req.flash("error", "An error occurred.");
        res.redirect("/forgot-password");
    }
});

router.post("/reset-password/:token", async (req, res) => {
    try {
        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
        const result = await pool.query(
            "SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()",
            [hashedToken]
        );
        const user = result.rows[0];

        if (!user) {
            req.flash("error", "Password reset token is invalid or has expired.");
            return res.redirect("/forgot-password");
        }

        const { password, confirm_password } = req.body;
        if (password !== confirm_password) {
            req.flash("error", "Passwords do not match.");
            return res.render("resetPassword", { token: req.params.token });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query("UPDATE users SET password = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2", [hashedPassword, user.id]);

        req.flash("success", "Password has been reset successfully. Please log in.");
        res.redirect("/login");
    } catch (err) {
        console.error(err);
        req.flash("error", "An error occurred while resetting your password.");
        res.redirect("/forgot-password");
    }
});

export default router;