"""Baseline fixture for tree-sitter Python parsing.

Covers: class with @decorator (preceding sibling), async def, PEP 695 type alias
(Python 3.12+ — `type X = ...`), import capture, method inside class.
"""
from typing import Optional

type OrderId = str  # PEP 695 — tree-sitter may capture as 'module' or 'type_alias'


@dataclass
class Order:
    id: str
    total: int = 0


@app.get("/orders")
async def get_orders() -> list[Order]:
    return []


@app.post("/orders")
def create_order(order: Order) -> Order:
    return order