import express from "express";
import { ensureAuthenticated } from "../middleware/authMiddleware.js";
import { ensureAdmin } from "../middleware/authMiddleware.js";
import pool from "../config/db.js";

const router = express.Router();

router.get("/calendar", ensureAuthenticated, async (req, res) => {

  try {

    const courtsResult = await pool.query(
      "SELECT court_id, court_name, default_price, peak_price FROM courts WHERE is_active = true ORDER BY court_id"
    );
    const peakTimesResult = await pool.query("SELECT * FROM peak_times");

    const settingsResult = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'calendar_days_to_show'");
    const calendarDaysToShow = (settingsResult.rows.length > 0) ? parseInt(settingsResult.rows[0].setting_value, 10) : 7;

    const courts = courtsResult.rows;
    const peakTimes = peakTimesResult.rows;

    res.render("calendar", {
      courts,
      peakTimes,
      calendarDaysToShow
    });

  } catch (err) {

    console.error(err);
    res.send("Calendar loading error");

  }

});

router.get("/profile", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all bookings for the user with Court Name
    const result = await pool.query(`
      SELECT b.court_id, TO_CHAR(b.booking_date, 'YYYY-MM-DD') as booking_date, b.slot, b.price, c.court_name
      FROM bookings b
      JOIN courts c ON b.court_id = c.court_id
      WHERE b.user_id = $1
      ORDER BY b.booking_date DESC, b.slot DESC
    `, [userId]);

    const allBookings = result.rows;
    
    // Calculate Points (10 points per booking)
    const points = allBookings.length * 10;

    // Separate Upcoming and Past
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours();

    const upcoming = [];
    const history = [];

    allBookings.forEach(b => {
      if (b.booking_date > todayStr || (b.booking_date === todayStr && b.slot >= currentHour)) {
        upcoming.push(b);
      } else {
        history.push(b);
      }
    });

    // Reverse upcoming so the soonest is at the top
    upcoming.reverse();

    res.render("profile", { user: req.user, upcoming, history, points });

  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load profile");
    res.redirect("/calendar");
  }
});

router.get("/admin", ensureAdmin, (req, res) => {
  res.render("admin");
});

router.post("/book", ensureAuthenticated, async (req, res) => {
  const client = await pool.connect();
  try {
    // Extract bookings and order_id. Handle backward compatibility if strictly an array is sent.
    const { bookings, order_id } = Array.isArray(req.body) ? { bookings: req.body, order_id: null } : req.body;
    const userId = req.user.id;

    // SECURITY NOTE:
    // Currently, this endpoint trusts the client that payment was successful.
    // To fix "Declined -> Booked" issues, you should verify the 'order_id' status here.
    // Example: Check your 'payments' table (populated by payhereNotify.js) to ensure 
    // order_id has status_code == 2 before proceeding.
    
    if (!bookings || bookings.length === 0) {
      return res.status(400).json({ success: false, message: "No slots to book." });
    }

    await client.query("BEGIN");

    for (const item of bookings) {
      // First, check if the slot is already booked to prevent unique constraint violation
      const existingBooking = await client.query(
        "SELECT booking_id FROM bookings WHERE court_id = $1 AND booking_date = $2 AND slot = $3",
        [item.court, item.date, item.slot]
      );

      if (existingBooking.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ // 409 Conflict
          success: false,
          message: "A selected slot was just booked by another user. Please refresh and try again.",
        });
      }

      // Fetch court prices for calculation
      const courtRes = await client.query("SELECT default_price, peak_price FROM courts WHERE court_id = $1", [item.court]);
      if (courtRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: `Invalid court ID: ${item.court}` });
      }
      const court = courtRes.rows[0];

      // Check if this slot is a peak time
      const d = new Date(item.date);
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayName = dayNames[d.getDay()];

      const peakRes = await client.query(
        `SELECT * FROM peak_times 
         WHERE court_id = $1 
         AND (day_of_week = 'Everyday' OR day_of_week = $2)
         AND start_time <= $3 AND end_time > $3`,
        [item.court, dayName, item.slot]
      );

      const price = peakRes.rows.length > 0 ? court.peak_price : court.default_price;

      await client.query(
        `INSERT INTO bookings (user_id, court_id, booking_date, slot, price)
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, item.court, item.date, item.slot, price]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ success: false, message: "An internal server error occurred." });
  } finally {
    client.release();
  }
});

router.get("/api/bookings", ensureAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT court_id, TO_CHAR(booking_date, 'YYYY-MM-DD') as booking_date, slot, price, user_id FROM bookings"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

router.get("/api/schedules", ensureAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM court_schedule"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

export default router;