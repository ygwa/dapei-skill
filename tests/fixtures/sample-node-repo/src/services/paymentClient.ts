export async function chargePayment(orderId: string, userId: string) {
  return { paymentId: `pay-${orderId}`, status: "PENDING_PAYMENT" };
}
