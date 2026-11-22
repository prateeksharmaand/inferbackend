from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.career_agent import chat
from app.core import ratelimit
from app.core.db import get_db
from app.core.deps import current_user
from app.core.errors import NotFound
from app.core.time import now_utc
from app.models import AgentConversation, AgentMessage, User
from app.schemas.common import ORM

router = APIRouter(prefix="/api/agent", tags=["career agent"])


class ConvOut(ORM):
    id: int
    title: str
    created_at: object
    updated_at: object


class MsgOut(ORM):
    id: int
    role: str
    content: str
    tool_calls: list[dict]
    created_at: object


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: int | None = None


@router.get("/conversations", response_model=list[ConvOut])
def conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(AgentConversation).where(AgentConversation.user_id == user.id,
                                                      AgentConversation.archived_at.is_(None))
                      .order_by(AgentConversation.updated_at.desc()).limit(50)).all()


@router.get("/conversations/{cid}/messages", response_model=list[MsgOut])
def messages(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(AgentConversation, cid)
    if not c or c.user_id != user.id:
        raise NotFound("Conversation not found")
    return db.scalars(select(AgentMessage).where(AgentMessage.conversation_id == cid).order_by(AgentMessage.id)).all()


@router.delete("/conversations/{cid}", status_code=204)
def archive(cid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(AgentConversation, cid)
    if not c or c.user_id != user.id:
        raise NotFound("Conversation not found")
    c.archived_at = now_utc()
    db.commit()


@router.post("/chat")
def send(body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ratelimit.hit(f"agent:{user.id}", 30, 300)
    if body.conversation_id:
        conv = db.get(AgentConversation, body.conversation_id)
        if not conv or conv.user_id != user.id:
            raise NotFound("Conversation not found")
    else:
        conv = AgentConversation(user_id=user.id, transcript=[])
        db.add(conv)
        db.flush()
    msg = chat(db, user, conv, body.message)
    return {"conversation_id": conv.id, "message": MsgOut.model_validate(msg)}
