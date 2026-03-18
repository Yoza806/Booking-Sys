import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.connect()
  .then(async (client) => {
    console.log("✅ PostgreSQL Connected Successfully");
    try {
      // Initialize System Settings Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          setting_key VARCHAR(50) PRIMARY KEY,
          setting_value VARCHAR(255)
        );
      `);
      await client.query(`
        INSERT INTO system_settings (setting_key, setting_value) VALUES ('maintenance_mode', 'false') ON CONFLICT (setting_key) DO NOTHING;
      `);
      await client.query(`
        INSERT INTO system_settings (setting_key, setting_value) VALUES ('system.timezone', 'UTC') ON CONFLICT (setting_key) DO NOTHING;
      `);
      client.release();
    } catch (err) {
      console.error("⚠️  Settings Initialization Error:", err);
      client.release();
    }
  })
  .catch(err => {
    console.error("❌ Database Connection Error:", err);
  });

export default pool;