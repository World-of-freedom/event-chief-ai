from fastapi import APIRouter, Depends

from app.api.routes import auth, events, outreach, prospects, tasks, webhooks
from app.core.auth import get_current_user

api_router = APIRouter(prefix="/api/v1")
protected_router = APIRouter(dependencies=[Depends(get_current_user)])
protected_router.include_router(events.router)
protected_router.include_router(prospects.router)
protected_router.include_router(outreach.router)
protected_router.include_router(tasks.router)

api_router.include_router(auth.router)
api_router.include_router(protected_router)
api_router.include_router(webhooks.router)
