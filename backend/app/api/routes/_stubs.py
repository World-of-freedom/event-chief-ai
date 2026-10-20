from fastapi import HTTPException, status


def not_implemented(feature: str) -> None:
    """Standard fail-closed response for intentionally unwired feature routes."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"{feature} is a boilerplate extension point and is not configured yet.",
    )
