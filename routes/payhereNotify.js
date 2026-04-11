import express from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

router.post("/payhere-notify", async (req, res) => {
    try {
        const {
            merchant_id,
            order_id,
            payment_id,
            payhere_amount,
            payhere_currency,
            status_code,
            md5sig
        } = req.body;

        const merchant_secret = process.env.PAYHERE_MERCHANT_SECRET;

        // Verify the MD5 Signature to ensure the request is from PayHere
        const hashedSecret = crypto.createHash('md5').update(merchant_secret).digest('hex').toUpperCase();
        const localMd5 = crypto.createHash('md5').update(
            merchant_id + 
            order_id + 
            payhere_amount + 
            payhere_currency + 
            status_code + 
            hashedSecret
        ).digest('hex').toUpperCase();

        if (localMd5 !== md5sig) {
            console.error("PayHere Signature Mismatch");
            return res.status(400).send("Signature Mismatch");
        }

        // Upsert the payment record
        await pool.query(
            `INSERT INTO payments (order_id, payment_id, amount, currency, status_code, md5sig)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (order_id) 
             DO UPDATE SET status_code = $5, payment_id = $2, md5sig = $6`,
            [order_id, payment_id, payhere_amount, payhere_currency, status_code, md5sig]
        );

        res.status(200).send("OK");
    } catch (err) {
        console.error("PayHere Notify Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

export default router;