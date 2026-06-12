import { Router } from "express";
import { createOrder } from "./orderService.js";

export const orderRouter = Router();

orderRouter.post("/orders", async (req, res) => {
  const order = await createOrder(req.body);
  res.status(201).json(order);
});
