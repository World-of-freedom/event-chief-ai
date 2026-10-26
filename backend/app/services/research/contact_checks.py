"""Free, deterministic contact checks used before any paid verification.

These checks intentionally do *not* claim a mailbox or phone line is active.
They only record syntax, email-domain configuration, and phone numbering-plan
metadata. Hunter remains a separate, organizer-triggered verification step.
"""

from __future__ import annotations

from typing import Any

import phonenumbers
from email_validator import EmailNotValidError, validate_email

from app.services.research.scorer import CandidateContact, CandidateLead


def check_email(address: str) -> tuple[str, str, dict[str, Any]]:
    """Return normalized address, status, and safely displayable free checks."""
    try:
        normalized = validate_email(address, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        return address.strip(), "failed", {"syntax_valid": False, "domain_mx": "not_checked", "reason": str(exc)[:240]}

    # MX/DNS validation is useful but a transient resolver failure must never
    # be represented as an invalid mailbox or invalid sponsor.
    try:
        validate_email(normalized, check_deliverability=True)
    except EmailNotValidError as exc:
        reason = str(exc)[:240]
        lowered = reason.lower()
        if "does not accept email" in lowered or "does not exist" in lowered or "no mx" in lowered:
            return normalized, "needs_review", {"syntax_valid": True, "domain_mx": "unavailable", "reason": reason}
        return normalized, "needs_review", {"syntax_valid": True, "domain_mx": "unknown", "reason": reason}
    except Exception as exc:  # DNS/network issue; keep source contact usable.
        return normalized, "needs_review", {"syntax_valid": True, "domain_mx": "unknown", "reason": str(exc)[:240]}

    return normalized, "passed", {"syntax_valid": True, "domain_mx": "configured"}


def check_phone(number: str, default_region: str = "IN") -> tuple[str, str, dict[str, Any]]:
    """Parse a phone number using metadata only; never assert reachability."""
    try:
        parsed = phonenumbers.parse(number, default_region)
        normalized = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        possible = phonenumbers.is_possible_number(parsed)
        valid = phonenumbers.is_valid_number(parsed)
    except phonenumbers.NumberParseException as exc:
        return number.strip(), "failed", {"parse_valid": False, "possible": False, "valid_for_numbering_plan": False, "reason": str(exc)[:240]}

    if possible and valid:
        return normalized, "passed", {"parse_valid": True, "possible": True, "valid_for_numbering_plan": True}
    return normalized, "needs_review", {"parse_valid": True, "possible": possible, "valid_for_numbering_plan": valid}


def display_status_for_contact(contact: CandidateContact, provider_status: str | None = None) -> str:
    """Map source + checks to precise UI language without overclaiming."""
    if provider_status in {"valid", "accept_all"}:
        return "deliverability_checked"
    if provider_status in {"unknown", "webmail", "disposable"}:
        return "could_not_confirm"
    if provider_status in {"invalid", "undeliverable"}:
        return "needs_review"
    if contact.basic_check_status == "failed":
        return "needs_review"
    if contact.kind == "email" and contact.source_quality == "official" and contact.basic_check_status == "passed":
        return "source_confirmed_mailbox_unverified"
    if contact.kind == "phone" and contact.source_quality == "official" and contact.basic_check_status == "passed":
        return "source_confirmed_reachability_unchecked"
    if contact.kind == "contact_form":
        return "official_route_available" if contact.source_quality == "official" else "route_needs_review"
    return "needs_review"


def run_free_contact_checks(candidate: CandidateLead, default_region: str = "IN") -> CandidateLead:
    """Normalize and annotate every contact on a candidate in-place."""
    seen: set[tuple[str, str]] = set()
    retained: list[CandidateContact] = []
    for contact in candidate.contacts:
        if not contact.value or not contact.source_url:
            continue
        if contact.kind == "email":
            normalized, status, details = check_email(contact.value)
        elif contact.kind == "phone":
            normalized, status, details = check_phone(contact.value, default_region)
        else:
            normalized, status, details = contact.value.strip(), "not_checked", {}
        identity = (contact.kind, normalized.lower())
        if identity in seen:
            continue
        seen.add(identity)
        contact.normalized_value = normalized
        contact.basic_check_status = status
        contact.basic_check_results = details
        contact.display_status = display_status_for_contact(contact)
        retained.append(contact)
    candidate.contacts = retained

    # Keep the denormalized values used by existing prospect-import code in
    # sync with the first usable sourced contact.
    email = next((c for c in retained if c.kind == "email"), None)
    phone = next((c for c in retained if c.kind == "phone"), None)
    candidate.contact_email = email.normalized_value if email else None
    candidate.contact_phone = phone.normalized_value if phone else None
    if email:
        candidate.contact_name = email.name
        candidate.contact_role = email.role
    return candidate
