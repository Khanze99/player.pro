"""УМО/ТМО — docs/plan-medical-exams.md. Матрица доступа — tests/test_authz.py;
здесь — валидация дат, порядок истории и current_status."""

from datetime import date, timedelta

from app.models.enums import MedicalExamKind
from app.models.medical_exam import MedicalExam
from app.services import medical_exam_service
from tests.test_authz import build_org


async def test_valid_until_before_passed_date_rejected(client):
    org = await build_org(client)
    a1_id = org["athlete1"]["user_id"]
    payload = {
        "kind": "umo",
        "passed_date": str(date.today()),
        "valid_until": str(date.today() - timedelta(days=1)),
    }
    resp = await client.post(
        f"/api/v1/medical-exams/athletes/{a1_id}", json=payload, headers=org["medic"]["headers"]
    )
    assert resp.status_code == 422


async def test_history_sorted_newest_first_and_current_status(client):
    org = await build_org(client)
    a1_id = org["athlete1"]["user_id"]
    today = date.today()

    for offset in (60, 5):  # старая запись первой, свежая — второй
        payload = {
            "kind": "umo",
            "passed_date": str(today - timedelta(days=offset)),
            "valid_until": str(today - timedelta(days=offset) + timedelta(days=180)),
        }
        resp = await client.post(
            f"/api/v1/medical-exams/athletes/{a1_id}", json=payload, headers=org["medic"]["headers"]
        )
        assert resp.status_code == 201, resp.text

    resp = await client.get(f"/api/v1/medical-exams/athletes/{a1_id}", headers=org["medic"]["headers"])
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["exams"]) == 2
    # Новыми сверху: первая запись в списке — та, что была 5 дней назад, не 60.
    assert body["exams"][0]["passed_date"] == str(today - timedelta(days=5))
    assert body["exams"][1]["passed_date"] == str(today - timedelta(days=60))

    # current_umo — самая свежая по passed_date запись (5 дней назад), не 60.
    assert body["current_umo"]["passed_date"] == str(today - timedelta(days=5))
    assert body["current_tmo"] is None  # ТМО вообще не создавали


def test_current_status_picks_latest_passed_date_per_kind():
    old_umo = MedicalExam(
        athlete_id=None,
        created_by=None,
        kind=MedicalExamKind.umo,
        passed_date=date(2026, 1, 1),
        valid_until=date(2026, 7, 1),
    )
    new_umo = MedicalExam(
        athlete_id=None,
        created_by=None,
        kind=MedicalExamKind.umo,
        passed_date=date(2026, 6, 1),
        valid_until=date(2026, 12, 1),
    )
    tmo = MedicalExam(
        athlete_id=None,
        created_by=None,
        kind=MedicalExamKind.tmo,
        passed_date=date(2026, 3, 1),
        valid_until=date(2026, 4, 1),
    )

    current = medical_exam_service.current_status([old_umo, new_umo, tmo])

    assert current[MedicalExamKind.umo] is new_umo
    assert current[MedicalExamKind.tmo] is tmo


def test_is_valid_today():
    exam = MedicalExam(
        athlete_id=None,
        created_by=None,
        kind=MedicalExamKind.tmo,
        passed_date=date(2026, 1, 1),
        valid_until=date(2026, 6, 1),
    )
    assert medical_exam_service.is_valid_today(exam, today=date(2026, 5, 1)) is True
    assert medical_exam_service.is_valid_today(exam, today=date(2026, 7, 1)) is False
    assert medical_exam_service.is_valid_today(None, today=date(2026, 5, 1)) is False
