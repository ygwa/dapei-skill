export async function createOrder(payload: { userId: string; items: unknown[] }): Promise<unknown> {
  const order = {
    id: `ord-${Date.now()}`,
    userId: payload.userId,
    status: "CREATED"
  };
  // insert into orders table
  // emit domain event for downstream payment service
  return order;
}
