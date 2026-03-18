import express from "express";
import { ensureAdmin } from "../middleware/authMiddleware.js";
import pool from "../config/db.js";

const router = express.Router();

router.post("/admin/maintenance", ensureAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    const value = enabled === "on" ? "true" : "false";

    await pool.query(
      "UPDATE system_settings SET setting_value = $1 WHERE setting_key = 'maintenance_mode'",
      [value]
    );

    req.flash("success", `Maintenance mode is now ${value === "true" ? "ON" : "OFF"}`);
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to toggle maintenance mode");
    res.redirect("/admin");
  }
});

router.post("/admin/settings/calendar", ensureAdmin, async (req, res) => {
  try {
    const { days_to_show } = req.body;
    const days = parseInt(days_to_show, 10);

    if (isNaN(days) || days < 1 || days > 90) {
      req.flash("error", "Please enter a valid number of days (1-90).");
      return res.redirect("/admin");
    }

    // Use an UPSERT operation to be safe (handles both insert and update)
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value) 
       VALUES ('calendar_days_to_show', $1)
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = $1`,
      [days]
    );

    req.flash("success", "Calendar display setting updated successfully.");
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to update calendar settings.");
    res.redirect("/admin");
  }
});

router.get("/admin/calendar", ensureAdmin, async (req, res) => {
  try {
    const courtsResult = await pool.query(
      "SELECT court_id, court_name, default_price, peak_price FROM courts WHERE is_active = true ORDER BY court_id"
    );
    const peakTimesResult = await pool.query("SELECT * FROM peak_times");
    const settingsResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'calendar_days_to_show'");
    const calendarDaysToShow = (settingsResult.rows.length > 0) ? parseInt(settingsResult.rows[0].setting_value, 10) : 7;
    res.render("adminCalendar", {
      courts: courtsResult.rows,
      peakTimes: peakTimesResult.rows,
      calendarDaysToShow
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load admin calendar");
    res.redirect("/admin");
  }
});

router.get("/api/admin/bookings", ensureAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.court_id, TO_CHAR(b.booking_date, 'YYYY-MM-DD') as booking_date, b.slot, b.user_id, b.price, u.name, u.email, u.phone, u.address, u.role
            FROM bookings b
            JOIN users u ON b.user_id = u.id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

router.post("/admin/booking/toggle", ensureAdmin, async (req, res) => {
    try {
        const { court_id, date, slot } = req.body;
        const userId = req.user.id;

        const check = await pool.query(
            "SELECT * FROM bookings WHERE court_id = $1 AND booking_date = $2 AND slot = $3",
            [court_id, date, slot]
        );

        if (check.rows.length > 0) {
            // Slot is occupied. If it's an admin block (booked by an admin), remove it.
            // If it's a user booking, we generally rely on force delete, but this route handles the toggle logic.
            // We'll delete it if the current user is admin, effectively "Making Available".
            await pool.query("DELETE FROM bookings WHERE court_id = $1 AND booking_date = $2 AND slot = $3", [court_id, date, slot]);
            return res.json({ success: true, status: "available" });
        } else {
            // Slot is empty. Make it unavailable by inserting a booking for the admin.
            await pool.query(
                "INSERT INTO bookings (user_id, court_id, booking_date, slot, price) VALUES ($1, $2, $3, $4, $5)",
                [userId, court_id, date, slot, 0]
            );
            return res.json({ success: true, status: "unavailable" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.post("/admin/booking/cancel", ensureAdmin, async (req, res) => {
    try {
        const { court_id, date, slot } = req.body;
        await pool.query("DELETE FROM bookings WHERE court_id = $1 AND booking_date = $2 AND slot = $3", [court_id, date, slot]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

router.post("/admin/update-court-price", ensureAdmin, async (req, res) => {
  try {
    const { court_id, price, peak_price } = req.body;

    if (!court_id) {
      req.flash("error", "Please select a court.");
      return res.redirect("/admin");
    }

    const hasDefaultPrice = price !== '' && !isNaN(price);
    const hasPeakPrice = peak_price !== '' && !isNaN(peak_price);

    if (!hasDefaultPrice && !hasPeakPrice) {
      req.flash("error", "Please provide at least one price to update.");
      return res.redirect("/admin");
    }

    if(hasDefaultPrice){
        await pool.query("UPDATE courts SET default_price = $1 WHERE court_id = $2", [price, court_id]);
    }

    if(hasPeakPrice){
        await pool.query("UPDATE courts SET peak_price = $1 WHERE court_id = $2", [peak_price, court_id]);
    }

    req.flash("success", "Court price updated successfully");
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to update court price");
    res.redirect("/admin");
  }
});

router.post("/admin/peak-times", ensureAdmin, async (req, res) => {
    try {
        const { court_id, day_of_week, start_time, end_time } = req.body;
        
        const result = await pool.query(
            "UPDATE peak_times SET start_time = $1, end_time = $2 WHERE court_id = $3 AND day_of_week = $4",
            [start_time, end_time, court_id, day_of_week]
        );

        if (result.rowCount === 0) {
            req.flash("error", "No existing peak time slot found to update for this day.");
        } else {
            req.flash("success", "Peak time updated successfully");
        }
        res.redirect("/admin");
    } catch (err) {
        console.error(err);
        req.flash("error", "Failed to update peak time");
        res.redirect("/admin");
    }
});

router.post("/admin/schedule", ensureAdmin, async (req, res) => {
    try {
        const { court_id, day_of_week, open_time, close_time } = req.body;

        if (!court_id || !day_of_week || open_time === "" || close_time === "") {
            req.flash("error", "Please provide all schedule details.");
            return res.redirect("/admin");
        }

        const open = parseInt(open_time);
        const close = parseInt(close_time);

        if (open >= close) {
            req.flash("error", "Closing time must be after opening time.");
            return res.redirect("/admin");
        }

        if (day_of_week === "Everyday") {
            // Delete all existing schedules for this court to reset
            await pool.query("DELETE FROM court_schedule WHERE court_id = $1", [court_id]);

            // Insert for all 7 days (0=Sun to 6=Sat)
            for (let i = 0; i < 7; i++) {
                await pool.query(
                    "INSERT INTO court_schedule (court_id, day_of_week, open_slot, close_slot) VALUES ($1, $2, $3, $4)",
                    [court_id, i, open, close]
                );
            }
        } else {
            const day = parseInt(day_of_week);
            // Remove existing schedule for this specific day
            await pool.query("DELETE FROM court_schedule WHERE court_id = $1 AND day_of_week = $2", [court_id, day]);

            await pool.query(
                "INSERT INTO court_schedule (court_id, day_of_week, open_slot, close_slot) VALUES ($1, $2, $3, $4)",
                [court_id, day, open, close]
            );
        }

        req.flash("success", "Court schedule updated successfully");
        res.redirect("/admin");
    } catch (err) {
        console.error(err);
        req.flash("error", "Failed to update schedule");
        res.redirect("/admin");
    }
});

router.post("/admin/add-court", ensureAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { court_name, price, peak_price } = req.body;

    if (!court_name || !price || !peak_price) {
      req.flash("error", "All fields are required");
      return res.redirect("/admin");
    }

    await client.query("BEGIN");

    // 1. Insert Court
    const courtRes = await client.query(
      "INSERT INTO courts (court_name, default_price, peak_price, is_active) VALUES ($1, $2, $3, true) RETURNING court_id",
      [court_name, price, peak_price]
    );
    const newCourtId = courtRes.rows[0].court_id;

    // 2. Insert Default Schedule (Everyday 08:00 - 22:00)
    for (let i = 0; i < 7; i++) {
      await client.query(
        "INSERT INTO court_schedule (court_id, day_of_week, open_slot, close_slot) VALUES ($1, $2, 8, 22)",
        [newCourtId, i]
      );
    }

    // 3. Insert Placeholder Peak Times (for all options in admin dropdown)
    const days = ["Everyday", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (const d of days) {
      await client.query(
        "INSERT INTO peak_times (court_id, day_of_week, start_time, end_time) VALUES ($1, $2, 0, 0)",
        [newCourtId, d]
      );
    }

    await client.query("COMMIT");
    req.flash("success", "Court added successfully");
    res.redirect("/admin");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    req.flash("error", "Failed to add court");
    res.redirect("/admin");
  } finally {
    client.release();
  }
});

router.post("/admin/delete-court", ensureAdmin, async (req, res) => {
  try {
    const { court_id } = req.body;
    await pool.query("UPDATE courts SET is_active = false WHERE court_id = $1", [court_id]);
    req.flash("success", "Court deleted successfully");
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to delete court");
    res.redirect("/admin");
  }
});

export default router;