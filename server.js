import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const OKX_API_KEY = process.env.OKX_API_KEY;
const OKX_SECRET = process.env.OKX_SECRET;
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const SIMULATED = process.env.SIMULATED_TRADING || "1";

const BASE = "https://www.okx.com";

function sign(ts, method, path, body = "") {
  const prehash = ts + method + path + body;
  return crypto.createHmac("sha256", OKX_SECRET).update(prehash).digest("base64");
}

app.get("/health", (req, res) => res.send("OK"));

app.post("/tv", async (req, res) => {
  try {
    // 1) 校验 secret
    if (req.body?.secret !== WEBHOOK_SECRET) {
      return res.status(401).send("bad secret");
    }

    // 2) 基础字段（从 TV 传来）
    const instId = req.body?.instId;           // e.g. ETH-USDT (spot) / ETH-USDT-SWAP (perp)
    const side = req.body?.action;             // "buy" / "sell"
    const sz = req.body?.sz;                   // string/number 都行
    const ordType = req.body?.ordType || "market"; // "market" / "limit"
    const tdMode = req.body?.tdMode || "cash";     // spot: "cash" ; perp: "cross"/"isolated"
    const reduceOnly = req.body?.reduceOnly;        // true/false (optional)
    const posSide = req.body?.posSide;              // "long"/"short" (optional, hedge mode only)
    const px = req.body?.px;                         // limit price (optional)

    if (!instId || !side || (sz === undefined || sz === null || sz === "")) {
      return res.status(400).json({ error: "missing fields: instId/action/sz" });
    }

    // 3) 组装 OKX 下单 body
    const payload = {
      instId,
      tdMode,
      side,
      ordType,
      sz: String(sz),
    };

    // limit 单需要 px
    if (ordType === "limit") {
      if (!px) return res.status(400).json({ error: "limit order requires px" });
      payload.px = String(px);
    }

    // 可选字段（只在传了才带上）
    if (typeof reduceOnly === "boolean") payload.reduceOnly = reduceOnly;
    if (posSide) payload.posSide = posSide;

    const body = JSON.stringify(payload);

    const ts = new Date().toISOString();
    const path = "/api/v5/trade/order";

    const response = await fetch(BASE + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "OK-ACCESS-KEY": OKX_API_KEY,
        "OK-ACCESS-SIGN": sign(ts, "POST", path, body),
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
        "x-simulated-trading": SIMULATED,
      },
      body,
    });

    const data = await response.json();
    res.json({ sent: payload, okx: data });
  } catch (e) {
    res.status(500).send(e.toString());
  }
});

app.listen(3000, () => console.log("running"));
