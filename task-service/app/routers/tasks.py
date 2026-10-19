import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Task
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.security import bearer_scheme, get_current_user_id

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Queries use SQLAlchemy bound parameters. Request text is never concatenated into SQL.


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _get_owned_task(db: Session, task_id: uuid.UUID, user_id: uuid.UUID) -> Task:
    # user_id comes from the token, never from the client. Filtering it in the
    # same query makes another user's task look the same as a missing one (404).
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user_id))
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> list[Task]:
    user_id = get_current_user_id(credentials)
    return list(
        db.scalars(select(Task).where(Task.user_id == user_id).order_by(Task.created_at.desc())).all()
    )


@router.post("", response_model=TaskResponse, status_code=201)
def create_task(
    body: TaskCreate,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Task:
    user_id = get_current_user_id(credentials)
    title = _clean_text(body.title)
    if title is None:
        raise HTTPException(status_code=422, detail="Title is required")
    now = datetime.now(timezone.utc)
    task = Task(
        user_id=user_id,
        title=title,
        description=_clean_text(body.description),
        status=body.status,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Task:
    user_id = get_current_user_id(credentials)
    task = _get_owned_task(db, task_id, user_id)
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes:
        title = _clean_text(changes["title"])
        if title is None:
            raise HTTPException(status_code=422, detail="Title is required")
        task.title = title
    if "description" in changes:
        task.description = _clean_text(changes["description"])
    if "status" in changes and changes["status"] is not None:
        task.status = changes["status"]
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: uuid.UUID,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Response:
    user_id = get_current_user_id(credentials)
    task = _get_owned_task(db, task_id, user_id)
    db.delete(task)
    db.commit()
    return Response(status_code=204)
