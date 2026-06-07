from fastapi import FastAPI, APIRouter

app = FastAPI()
router = APIRouter()

@app.get("/health")
async def health():
    return {"ok": True}

@app.post("/items")
async def create_item(payload: dict):
    return payload

@router.get("/items/{item_id}")
async def read_item(item_id: int):
    return {"id": item_id}

@router.delete("/items/{item_id}")
async def delete_item(item_id: int):
    return {"id": item_id}
