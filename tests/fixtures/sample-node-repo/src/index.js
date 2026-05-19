function summarizeOrder(order) {
  if (!order || !order.id) {
    throw new Error("order.id is required");
  }

  return {
    id: order.id,
    status: order.status || "pending"
  };
}

module.exports = {
  summarizeOrder
};
