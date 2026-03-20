import express from "express";
import dotenv from "dotenv";
import session from "express-session";
import passport from "passport";
import flash from "connect-flash";
import methodOverride from "method-override";
import path from "path";
import { fileURLToPath } from "url";


import "./config/db.js";
import "./config/passport.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { checkMaintenance } from "./middleware/authMiddleware.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import notifyRoutes from "./routes/payhereNotify.js";

dotenv.config();

const app = express();


// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ========================
// Middleware
// ========================

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Method override
app.use(methodOverride("_method"));

//payhere setup
app.use("/api/payment", paymentRoutes);
app.use("/api/payment", notifyRoutes);

// ========================
// View Engine
// ========================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// ========================
// Sessions
// ========================

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);


// ========================
// Passport
// ========================

app.use(passport.initialize());
app.use(passport.session());


// ========================
// Flash Messages
// ========================

app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.user = req.user || null;
  next();
});

// ========================
// Global Middleware
// ========================

app.use(checkMaintenance);

// ========================
// Routes
// ========================

app.use("/", authRoutes);
app.use("/", bookingRoutes);
app.use("/", adminRoutes);


// ========================
// Home Route
// ========================

app.get("/", (req, res) => {
  res.render("index");
});


// ========================
// Start Server
// ========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});