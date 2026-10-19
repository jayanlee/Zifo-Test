import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.exc import OperationalError

from app.database import engine
from app.models import Base
from app.routers.tasks import router as task_router


def init_db() -> None:
    # create_all creates missing tables only. It does not alter or wipe existing ones.
    # Alembic is the later migration tool when a column needs to change.
    last_error: Exception | None = None
    for _ in range(30):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError as exc:
            last_error = exc
            time.sleep(1)
    raise last_error  # type: ignore[misc]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Task service", lifespan=lifespan)
app.include_router(task_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
