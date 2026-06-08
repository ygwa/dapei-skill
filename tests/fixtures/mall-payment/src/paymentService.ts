export async function capturePayment(payload: { orderId: string; amount: number }): Promise<unknown> {
  const payment = {
    id: `pay-${Date.now()}`,
    orderId: payload.orderId,
    status: "PENDING_PAYMENT"
  };
  // update payments table
  // emit domain event for downstream fulfillment
  return payment;
}
