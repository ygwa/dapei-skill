// Baseline fixture for tree-sitter TypeScript parsing.
// Covers: class + method with TS decorator, interface, type alias, generic function, ESM import.
// Verifies TS decorator attach (decorator is sibling in class_body, not child of method_definition).

import { Order } from "./order-model";

@Controller("/orders")
export class OrderController {
  @Get("/:id")
  getOrder(@Param("id") id: string): Order {
    return { id, total: 0 };
  }

  @Post("/")
  createOrder(@Body() body: Order): Order {
    return body;
  }
}

interface PaymentRepo {
  find(id: string): Promise<Order>;
}

type OrderId = string & { __brand: "OrderId" };

function generic<T extends object>(x: T): T {
  return x;
}

export default class Foo {}