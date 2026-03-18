import express from "express";
import crypto from "crypto";

const router = express.Router();

router.post("/payhere-notify", (req, res) => {

    const {
        merchant_id,
        order_id,
        payhere_amount,
        payhere_currency,
        status_code,
        md5sig
    } = req.body;

    const merchant_secret = process.env.PAYHERE_MERCHANT_SECRET;

    const local_md5sig = crypto
        .createHash("md5")
        .update(
            merchant_id +
            order_id +
            payhere_amount +
            payhere_currency +
            status_code +
            crypto.createHash("md5").update(merchant_secret).digest("hex").toUpperCase()
        )
        .digest("hex")
        .toUpperCase();

    if (local_md5sig === md5sig && status_code == 2) {

        console.log("Payment Success:", order_id);

        // TODO:
        // update booking table -> status = confirmed

    }

    res.sendStatus(200);
});

export default router;