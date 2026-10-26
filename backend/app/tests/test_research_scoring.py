from app.services.research.scorer import CandidateContact, CandidateLead, score_and_rank_candidates


EVENT = {
    "event_type": "hackathon",
    "primary_audience": "college student developers",
    "support_types_needed": ["cloud_credits", "prizes"],
    "venue_city": "Bengaluru",
    "event_format": "in_person",
}


def test_generic_well_known_company_cannot_rank_high_without_specific_evidence() -> None:
    candidate = CandidateLead(
        company_name="Large Technology Company",
        domain="example.com",
        website_url="https://example.com",
        industry="technology",
        description="A global technology company.",
        location="India",
        evidence=[{
            "claim": "Company homepage was discovered.",
            "evidence_type": "other",
            "source_url": "https://example.com",
            "source_quality": "official",
        }],
    )

    scored = score_and_rank_candidates([candidate], EVENT)[0]

    assert scored.match_score < 75
    assert scored.match_score_components["sponsorship_program_evidence"]["rating"] == 0
    assert scored.match_score_components["contribution_fit"]["rating"] == 1


def test_scores_are_deterministic_and_keep_contact_checks_separate_from_verification() -> None:
    candidate = CandidateLead(
        company_name="Evidence Cloud",
        domain="evidence.example",
        website_url="https://evidence.example",
        industry="cloud developer tools",
        description="Cloud credits and APIs for student developers.",
        location="Bengaluru",
        evidence=[
            {
                "claim": "The community program sponsors student hackathons with cloud credits.",
                "evidence_type": "sponsorship_history",
                "source_url": "https://evidence.example/community",
                "source_quality": "official",
            },
            {
                "claim": "Partnership applications are accepted through the community team.",
                "evidence_type": "brand_partnership",
                "source_url": "https://evidence.example/partners",
                "source_quality": "official",
            },
        ],
        contacts=[
            CandidateContact(
                kind="email",
                value="partners@evidence.example",
                source_url="https://evidence.example/contact",
                source_quality="official",
                basic_check_status="passed",
                display_status="source_confirmed_mailbox_unverified",
            )
        ],
    )

    scored = score_and_rank_candidates([candidate], EVENT)[0]

    assert scored.match_score >= 75
    assert scored.confidence_score >= 75
    assert sum(item["score"] for item in scored.match_score_components.values()) == scored.match_score
    assert sum(item["score"] for item in scored.confidence_score_components.values()) == scored.confidence_score
    assert scored.contacts[0].display_status == "source_confirmed_mailbox_unverified"
