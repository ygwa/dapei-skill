import { Router } from "express";
import { capturePayment } from "./paymentService.js";

export const paymentRouter = Router();

paymentRouter.post("/payments", async (req, res) => {
  const payment = await capturePayment(req.body);
  res.status(201).json(payment);
});
