import { Router } from "express";
import { createOrder } from "../services/orderService.js";

export const ordersRouter = Router();

ordersRouter.post("/orders", async (req, res) => {
  const order = await createOrder(req.body);
  res.status(201).json(order);
});

ordersRouter.get("/orders/:id", async (req, res) => {
  res.json({ id: req.params.id, status: "CREATED" });
});
