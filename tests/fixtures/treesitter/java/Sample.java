// Baseline fixture for tree-sitter Java parsing.
// Covers: class + @RestController, @GetMapping method, Java 16 record,
// @interface annotation type, import capture, generic method.

import org.springframework.web.bind.annotation.GetMapping;

@RestController
public class OrderController {

  @GetMapping("/orders/{id}")
  public Order getOrder(@PathVariable String id) {
    return new Order(id, 0);
  }

  public <T> List<T> findAll(Class<T> type) {
    return List.of();
  }
}

public record OrderRecord(String id, int total) {}

public @interface Validated {
  String message() default "";
}