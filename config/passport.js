import passport from "passport";
import pkg from "passport-local";
import bcrypt from "bcrypt";
import pool from "./db.js";
import GoogleStrategy from "passport-google-oauth20";
import dotenv from "dotenv";

dotenv.config();


const { Strategy: LocalStrategy } = pkg;

passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {

      try {

        const result = await pool.query(
          "SELECT * FROM users WHERE email = $1",
          [email]
        );

        if (result.rows.length === 0) {
          return done(null, false, { message: "User not found" });
        }

        const user = result.rows[0];

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
          return done(null, false, { message: "Incorrect password" });
        }

        return done(null, user);

      } catch (err) {
        return done(err);
      }

    }
  )
);

//Google OAuth Setup

passport.use("google", new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback",
  passReqToCallback: true
}, async (request, accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0].value;
    const name = profile.displayName;

    // Check if user exists
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length > 0) {
      return cb(null, result.rows[0]);
    }

    // Create new user if they don't exist
    // We provide empty strings for phone/address and a dummy password
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password, phone, address) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, email, "google_oauth_login", "", ""]
    );

    return cb(null, newUser.rows[0]);
  } catch (err) {
    return cb(err);
  }
}));


passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {

  try {

    const result = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );

    done(null, result.rows[0]);

  } catch (err) {
    done(err);

  }

});