from ryaa.skills.calendar import CalendarSkill, EventExtraction


def test_gate_rejects_low_confidence(fake_provider):
    # Arrange: a fake wose structured() returns a low confidence score
    provider = fake_provider(
        structured_return=EventExtraction(
            description="...",
            is_calendar_event=True,
            confidence_score=0.4,  # below the threshold
        )
    )
    skill = CalendarSkill(provider=provider)

    # Act: process a non-calendar request
    result = skill.process("Schedule something")
    # Assert: the result is None
    assert result is None
