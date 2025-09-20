// server.js — Backend mínimo para Stripe Checkout alineado al dominio canónico
// Requisitos: Node 18+, npm i express cors stripe dotenv

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ====== CONFIG ======
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY; // sk_live_*** o sk_test_***
if (!STRIPE_SECRET_KEY) {
  console.error("❌ Falta STRIPE_SECRET_KEY en .env");
  process.exit(1);
}
const stripe = (await import("stripe")).default(STRIPE_SECRET_KEY);

// TU FRONTEND CANÓNICO (sin www)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://flovermaps.com";

// ====== HEALTH ======
app.get("/health", (_req, res) => res.sendStatus(204));

// ====== CREA SESIÓN DE CHECKOUT ======
app.post("/create-checkout-session", async (req, res) => {
  try {
    // Datos que te manda el frontend
    const {
      lat, lng, place, fromName, toName, message,
      ngo, ngo_label, amount_total
    } = req.body || {};

    // Validaciones mínimas
    if (!lat || !lng || !fromName || !toName || !message || !amount_total) {
      return res.status(400).json({ ok:false, error:"missing fields" });
    }

    // Monto en céntimos
    const amountCents = Math.round(Number(amount_total) * 100);

    // Metadatos que luego usarás para escribir en el App Script
    const metadata = {
      lat: String(lat),
      lng: String(lng),
      place: String(place || ""),
      fromName: String(fromName || ""),
      toName: String(toName || ""),
      message: String(message || ""),
      ngo: String(ngo || ""),
      ngo_label: String(ngo_label || ""),
      amount_total_cents: String(amountCents)
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Flovermaps • Flor solidaria",
              description: `${fromName} → ${toName} • ${message}`.slice(0, 120)
            },
            unit_amount: amountCents
          },
          quantity: 1
        }
      ],

      // ⚠️ AQUÍ VA LA CLAVE: SIEMPRE TU DOMINIO CANÓNICO SIN "www"
      success_url: `${FRONTEND_ORIGIN}/?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${FRONTEND_ORIGIN}/?canceled=1`,

      // Guarda todo lo que necesites para luego crear la fila en Sheets
      metadata
    });

    return res.json({ ok:true, url: session.url });
  } catch (err) {
    console.error("checkout error:", err);
    return res.status(500).json({ ok:false, error:String(err?.message||err) });
  }
});

// ====== OBTENER SESIÓN (para leer metadatos al volver del pago) ======
app.get("/session", async (req, res) => {
  try {
    const id = String(req.query.id || "");
    if (!id) return res.status(400).json({ ok:false, error:"missing id" });

    const s = await stripe.checkout.sessions.retrieve(id);
    // Devuelve lo necesario al frontend
    return res.json({
      ok: true,
      id: s.metadata?.id || "",      // si luego lo rellenas tras insertar en Sheets
      metadata: s.metadata || {},
      amount_total: (s.amount_total ?? 0) / 100,
      payment_status: s.payment_status
    });
  } catch (err) {
    console.error("session error:", err);
    return res.status(500).json({ ok:false, error:String(err?.message||err) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend escuchando en http://localhost:${PORT}`);
});
