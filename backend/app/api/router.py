from fastapi import APIRouter, Depends

from app.api.routes import admin, auth, events, outreach, prospects, tasks, webhooks
from app.api.routes.research import leads_router, router as research_router
from app.core.auth import get_current_user

api_router = APIRouter(prefix="/api/v1")
protected_router = APIRouter(dependencies=[Depends(get_current_user)])
protected_router.include_router(events.router)
protected_router.include_router(admin.router)
protected_router.include_router(prospects.router)
protected_router.include_router(outreach.router)
protected_router.include_router(tasks.router)
protected_router.include_router(research_router)
protected_router.include_router(leads_router)

api_router.include_router(auth.router)
api_router.include_router(protected_router)
api_router.include_router(webhooks.router)
