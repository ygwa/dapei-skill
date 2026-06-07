package com.example.order;

import org.springframework.web.bind.annotation.*;
import org.springframework.stereotype.Service;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {

    @GetMapping("/{id}")
    public Order getOrder(@PathVariable String id) {
        return orderService.findById(id);
    }

    @PostMapping
    public Order createOrder(@RequestBody OrderRequest req) {
        return orderService.create(req);
    }

    @DeleteMapping("/{id}")
    public void cancelOrder(@PathVariable String id) {
        orderService.cancel(id);
    }

    private final OrderService orderService;
}
