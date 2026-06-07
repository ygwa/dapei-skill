import { Router } from "express";
import { cancelOrder } from "../services/orderService.js";

export const orderController = Router();

orderController.post("/orders/:id/cancel", async (req, res) => {
  const result = await cancelOrder(req.params.id);
  res.json(result);
});
