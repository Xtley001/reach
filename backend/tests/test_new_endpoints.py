"""
E-57: basic backend request validation tests for the new tag endpoints and
the new mass-upload/paste endpoint — brand-new code paths, most likely to be
hit hard on day one.

G-86 lives in the frontend test suite (frontend/src/lib/api.session.test.js)
since it's testing the client-side retry/refresh flow.
"""
import uuid


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _seed_tag_definitions(db_session, org_id):
    from backend import models
    tags = [
        ("saved", "Saved"), ("form_filled", "Form Filled"),
        ("healed", "Healed"), ("needs_followup", "Needs Follow-up"),
    ]
    for i, (code, label) in enumerate(tags):
        db_session.add(models.TagDefinition(
            id=str(uuid.uuid4()), organisation_id=org_id,
            code=code, label=label, sort_order=i,
        ))
    db_session.commit()


class TestContactTags:
    """B-16/17/18/19/20/22"""

    def test_toggle_tag_add_then_remove(self, client, db_session, seed_org_campaign_user):
        ctx = seed_org_campaign_user
        _seed_tag_definitions(db_session, ctx["org"].id)

        from backend import models
        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=ctx["user"].id,
            name="Jane Doe", phone="+2348011111111",
        )
        db_session.add(contact)
        db_session.commit()

        headers = auth_headers(ctx["token"])

        # Add
        r = client.post(f"/v1/contacts/{contact.id}/tags", json={"tag_code": "saved"}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["action"] == "added"

        r = client.get(f"/v1/contacts/{contact.id}/tags", headers=headers)
        assert r.status_code == 200
        assert [t["tag_code"] for t in r.json()["tags"]] == ["saved"]

        # B-19: toggling the SAME tag again must never 500 or duplicate —
        # it should remove it (that's the toggle contract).
        r = client.post(f"/v1/contacts/{contact.id}/tags", json={"tag_code": "saved"}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["action"] == "removed"

        r = client.get(f"/v1/contacts/{contact.id}/tags", headers=headers)
        assert r.json()["tags"] == []

    def test_multiple_tags_can_coexist(self, client, db_session, seed_org_campaign_user):
        """B-16: a contact can be `saved` AND `healed` at once, not just one status."""
        ctx = seed_org_campaign_user
        _seed_tag_definitions(db_session, ctx["org"].id)

        from backend import models
        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=ctx["user"].id,
            name="Jane Doe", phone="+2348011111112",
        )
        db_session.add(contact)
        db_session.commit()
        headers = auth_headers(ctx["token"])

        client.post(f"/v1/contacts/{contact.id}/tags", json={"tag_code": "saved"}, headers=headers)
        client.post(f"/v1/contacts/{contact.id}/tags", json={"tag_code": "healed"}, headers=headers)

        r = client.get(f"/v1/contacts/{contact.id}/tags", headers=headers)
        codes = sorted(t["tag_code"] for t in r.json()["tags"])
        assert codes == ["healed", "saved"]

    def test_unknown_tag_rejected(self, client, db_session, seed_org_campaign_user):
        ctx = seed_org_campaign_user
        _seed_tag_definitions(db_session, ctx["org"].id)
        from backend import models
        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=ctx["user"].id,
            name="Jane Doe", phone="+2348011111113",
        )
        db_session.add(contact)
        db_session.commit()
        r = client.post(
            f"/v1/contacts/{contact.id}/tags",
            json={"tag_code": "not_a_real_tag"},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 400

    def test_cannot_tag_someone_elses_contact(self, client, db_session, seed_org_campaign_user):
        """B-18: authorized the same way existing status-update endpoints are."""
        ctx = seed_org_campaign_user
        _seed_tag_definitions(db_session, ctx["org"].id)
        from backend import models
        other_volunteer = models.User(
            id=str(uuid.uuid4()), organisation_id=ctx["org"].id,
            phone="+2348099999999", name="Other Volunteer",
            role=models.UserRole.volunteer, status=models.UserStatus.active,
        )
        db_session.add(other_volunteer)
        db_session.flush()
        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=other_volunteer.id,
            name="Not Yours", phone="+2348011111114",
        )
        db_session.add(contact)
        db_session.commit()

        r = client.post(
            f"/v1/contacts/{contact.id}/tags",
            json={"tag_code": "saved"},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 403


class TestBulkPasteImport:
    """C-30/31/32/33/34/35/36"""

    def test_paste_import_creates_incomplete_contacts(self, client, seed_org_campaign_user):
        ctx = seed_org_campaign_user
        r = client.post(
            "/v1/contacts/bulk-paste",
            json={"rows": [
                {"name": "Amaka", "phone": "+2348021234567"},
                {"phone": "08031234567"},  # C-31: local format, no name
            ]},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["saved"] == 2
        assert body["skipped"] == 0
        statuses = {row["status"] for row in body["results"]}
        assert statuses == {"saved"}

    def test_paste_import_flags_duplicates(self, client, seed_org_campaign_user):
        ctx = seed_org_campaign_user
        headers = auth_headers(ctx["token"])
        client.post("/v1/contacts/bulk-paste", json={"rows": [{"phone": "+2348022222222"}]}, headers=headers)

        r = client.post(
            "/v1/contacts/bulk-paste",
            json={"rows": [{"phone": "+2348022222222"}, {"phone": "+2348033333333"}]},
            headers=headers,
        )
        body = r.json()
        assert body["saved"] == 1
        assert body["skipped"] == 1

    def test_paste_import_caps_batch_size(self, client, seed_org_campaign_user):
        """C-36: cap paste size with a clear error rather than a silent hang/crash."""
        ctx = seed_org_campaign_user
        rows = [{"phone": f"+234701{i:07d}"} for i in range(501)]
        r = client.post("/v1/contacts/bulk-paste", json={"rows": rows}, headers=auth_headers(ctx["token"]))
        assert r.status_code == 422

    def test_paste_import_rejects_invalid_phone(self, client, seed_org_campaign_user):
        ctx = seed_org_campaign_user
        r = client.post(
            "/v1/contacts/bulk-paste",
            json={"rows": [{"phone": "not-a-phone-number-at-all"}]},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 422


class TestCallLogs:
    """F-66/67/69/70/72"""

    def _make_contact(self, db_session, ctx, phone):
        from backend import models
        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=ctx["user"].id,
            name="Call Target", phone=phone,
        )
        db_session.add(contact)
        db_session.commit()
        return contact

    def test_availability_rejected_without_pickup(self, client, db_session, seed_org_campaign_user):
        """F-67: availability_code stays null until receptivity == picked_up."""
        ctx = seed_org_campaign_user
        contact = self._make_contact(db_session, ctx, "+2348041111111")
        r = client.post(
            f"/v1/contacts/{contact.id}/calls",
            json={"receptivity_code": "no_answer", "availability_code": "coming"},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 422

    def test_picked_up_with_availability_succeeds(self, client, db_session, seed_org_campaign_user):
        ctx = seed_org_campaign_user
        contact = self._make_contact(db_session, ctx, "+2348041111112")
        r = client.post(
            f"/v1/contacts/{contact.id}/calls",
            json={"receptivity_code": "picked_up", "availability_code": "coming", "comment": "will attend"},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 201, r.text

        r = client.get(f"/v1/contacts/{contact.id}/calls", headers=auth_headers(ctx["token"]))
        calls = r.json()["calls"]
        assert len(calls) == 1
        assert calls[0]["receptivity_code"] == "picked_up"
        assert calls[0]["availability_code"] == "coming"

    def test_needs_bus_sets_needs_transport(self, client, db_session, seed_org_campaign_user):
        """F-72: needs_bus wires into the existing needs_transport field."""
        ctx = seed_org_campaign_user
        contact = self._make_contact(db_session, ctx, "+2348041111113")
        r = client.post(
            f"/v1/contacts/{contact.id}/calls",
            json={"receptivity_code": "picked_up", "availability_code": "needs_bus"},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 201
        db_session.refresh(contact)
        assert contact.needs_transport is True

    def test_two_no_answers_auto_escalates(self, client, db_session, seed_org_campaign_user):
        """F-71: 2x consecutive no_answer -> auto-flagged for a different approach."""
        ctx = seed_org_campaign_user
        contact = self._make_contact(db_session, ctx, "+2348041111114")
        headers = auth_headers(ctx["token"])
        client.post(f"/v1/contacts/{contact.id}/calls", json={"receptivity_code": "no_answer"}, headers=headers)
        r = client.post(f"/v1/contacts/{contact.id}/calls", json={"receptivity_code": "no_answer"}, headers=headers)
        assert r.status_code == 201

        from backend import models
        fq = db_session.query(models.FollowUpQueue).filter(
            models.FollowUpQueue.contact_id == contact.id
        ).first()
        assert fq is not None
        assert fq.status == models.FollowUpStatus.pending


class TestDashboardRollups:
    """B-26/F-74: per-tag counts + call receptivity/availability rollups."""

    def test_minister_dashboard_includes_tag_and_call_rollups(self, client, db_session, seed_org_campaign_user):
        from backend import models
        from backend.auth import create_access_token

        ctx = seed_org_campaign_user
        _seed_tag_definitions(db_session, ctx["org"].id)

        minister = models.User(
            id=str(uuid.uuid4()), organisation_id=ctx["org"].id,
            phone="+2348055555555", name="Minister",
            role=models.UserRole.minister, status=models.UserStatus.active,
        )
        db_session.add(minister)

        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=ctx["user"].id,
            name="Rollup Target", phone="+2348051111111",
        )
        db_session.add(contact)
        db_session.commit()

        minister_headers = auth_headers(create_access_token(minister.id, minister.role.value))
        vol_headers = auth_headers(ctx["token"])

        client.post(f"/v1/contacts/{contact.id}/tags", json={"tag_code": "saved"}, headers=vol_headers)
        client.post(
            f"/v1/contacts/{contact.id}/calls",
            json={"receptivity_code": "picked_up", "availability_code": "coming"},
            headers=vol_headers,
        )

        r = client.get("/v1/dashboard/minister", headers=minister_headers)
        assert r.status_code == 200, r.text
        body = r.json()

        assert body["tag_counts"]["saved"]["count"] == 1
        # Every active tag appears even at 0 — stable bar set for the chart.
        assert body["tag_counts"]["healed"]["count"] == 0

        assert body["call_rollups"]["receptivity"]["picked_up"] == 1
        assert body["call_rollups"]["availability"]["coming"] == 1
        assert body["call_rollups"]["total_calls"] == 1


class TestCallReminders:
    """F-76: optional call-back reminder, surfaced back into the volunteer's own queue."""

    def test_reminder_surfaced_in_my_reminders(self, client, db_session, seed_org_campaign_user):
        from datetime import datetime, timedelta, timezone
        ctx = seed_org_campaign_user
        from backend import models
        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=ctx["user"].id,
            name="Remind Me", phone="+2348061111111",
        )
        db_session.add(contact)
        db_session.commit()
        headers = auth_headers(ctx["token"])

        remind_at = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r = client.post(
            f"/v1/contacts/{contact.id}/calls",
            json={"receptivity_code": "picked_up", "availability_code": "needs_reminder", "remind_at": remind_at},
            headers=headers,
        )
        assert r.status_code == 201, r.text

        r = client.get("/v1/calls/reminders", headers=headers)
        assert r.status_code == 200
        reminders = r.json()["reminders"]
        assert len(reminders) == 1
        assert reminders[0]["contact_name"] == "Remind Me"

    def test_reminder_optional_no_error_when_absent(self, client, db_session, seed_org_campaign_user):
        ctx = seed_org_campaign_user
        from backend import models
        contact = models.Contact(
            id=str(uuid.uuid4()), campaign_id=ctx["campaign"].id,
            organisation_id=ctx["org"].id, added_by=ctx["user"].id,
            name="No Reminder", phone="+2348061111112",
        )
        db_session.add(contact)
        db_session.commit()
        r = client.post(
            f"/v1/contacts/{contact.id}/calls",
            json={"receptivity_code": "no_answer"},
            headers=auth_headers(ctx["token"]),
        )
        assert r.status_code == 201
