import { publishEvent } from "../events/publisher.js";
import { chargePayment } from "./paymentClient.js";

export async function createOrder(payload: { userId: string; items: unknown[] }) {
  const order = {
    id: `ord-${Date.now()}`,
    userId: payload.userId,
    status: "CREATED"
  };

  // insert into orders table
  await chargePayment(order.id, payload.userId);
  await publishEvent("order.created", { orderId: order.id });

  return order;
}
