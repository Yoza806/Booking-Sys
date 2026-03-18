import express from "express";
import crypto from "crypto";

const router = express.Router();

router.post("/create-payment", (req, res) => {
    try {
        const { order_id, amount, currency } = req.body;

        const merchant_id = process.env.PAYHERE_MERCHANT_ID;
        const merchant_secret = process.env.PAYHERE_MERCHANT_SECRET;

        if (!merchant_id || !merchant_secret) {
            console.error("PayHere environment variables are missing.");
            return res.status(500).json({ error: "Server payment configuration missing" });
        }

        const hashedSecret = crypto
        .createHash("md5")
        .update(merchant_secret)
        .digest("hex")
        .toUpperCase();

    const hash = crypto
        .createHash("md5")
        .update(
            merchant_id +
            order_id +
            parseFloat(amount).toFixed(2) +
            currency +
            hashedSecret
        )
        .digest("hex")
        .toUpperCase();

    res.json({
        merchant_id,
        hash
    });
    } catch (err) {
        console.error("Payment Route Error:", err);
        res.status(500).json({ error: "Failed to generate payment hash" });
    }
});

export default router;