"""Short, URL-safe public identifiers (Nano ID style)."""

import secrets

# Alphanumeric only, so IDs read cleanly in URLs and never contain "-" (used as the slug separator).
PUBLIC_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
PUBLIC_ID_LENGTH = 10


def generate_public_id(size: int = PUBLIC_ID_LENGTH) -> str:
    """Return a random Nano ID–style string using a cryptographically secure generator."""
    return "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(size))
