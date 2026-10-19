import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.exc import OperationalError

from app.database import engine
from app.models import Base
from app.routers.auth import router as auth_router


def init_db() -> None:
    # create_all creates missing tables only. It does not alter or wipe existing ones.
    # Alembic is the later migration tool when a column needs to change.
    # The users table is the account record. refresh_tokens is the revocation list.
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


app = FastAPI(title="Auth service", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
