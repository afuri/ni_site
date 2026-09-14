from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core import error_codes as codes
from app.models.attempt import Attempt
from app.models.city import City
from app.models.olympiad import Olympiad
from app.models.region import Region
from app.models.school import School
from app.models.user import SchoolStatus, User, UserRole
from app.repos.users import UsersRepo


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_payload(login: str, *, class_grade: int = 5, school_id: int | None = 1, missing: bool = False):
    return {
        "login": login,
        "password": "StrongPass1",
        "role": "student",
        "email": f"{login.lower()}@example.com",
        "gender": "male",
        "subscription": 0,
        "surname": "Иванов",
        "name": "Иван",
        "father_name": "Иванович",
        "region_id": 1,
        "school_id": school_id,
        "school_not_found": missing,
        "class_grade": class_grade,
        "subject": None,
    }


@pytest.mark.asyncio
async def test_public_lookup_is_region_scoped_and_does_not_leak_admin_fields(client):
    response = await client.get("/api/v1/lookup/regions")
    assert response.status_code == 200
    assert response.json()[0] == {"id": 1, "name": "Москва", "country_code": "RU", "is_other": False}

    response = await client.get("/api/v1/lookup/schools", params={"region_id": 1, "query": "шк"})
    assert response.status_code == 200
    assert response.json() == [
        {"id": 1, "short_name": "Школа № 1", "full_name": "ГБОУ Школа № 1", "city": "Москва"}
    ]
    assert set(response.json()[0]) == {"id", "short_name", "full_name", "city"}

    response = await client.get("/api/v1/lookup/schools", params={"region_id": 1, "query": "%_"})
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_registration_validates_school_region_and_preschool_exception(client, db_session):
    response = await client.post("/api/v1/auth/register", json=_register_payload("selected01"))
    assert response.status_code == 201
    assert response.json()["school_status"] == "selected"
    assert response.json()["school_id"] == 1
    assert response.json()["city_name"] == "Москва"
    assert response.json()["coins"] == 0

    preschool = _register_payload("preschool01", class_grade=0, school_id=None, missing=False)
    response = await client.post("/api/v1/auth/register", json=preschool)
    assert response.status_code == 201
    assert response.json()["school_status"] == "not_required"
    assert response.json()["school_id"] is None

    other_region = Region(country_code="RU", name="Тестовый регион", normalized_name="тестовый регион")
    db_session.add(other_region)
    await db_session.commit()
    mismatch = _register_payload("mismatch01")
    mismatch["region_id"] = other_region.id
    response = await client.post("/api/v1/auth/register", json=mismatch)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == codes.SCHOOL_REGION_MISMATCH

    other = Region(
        country_code=None,
        name="Другой регион / другая страна",
        normalized_name="другой регион / другая страна",
        is_other=True,
    )
    db_session.add(other)
    await db_session.commit()
    foreign = _register_payload("foreign01", school_id=None, missing=True)
    foreign["region_id"] = other.id
    response = await client.post("/api/v1/auth/register", json=foreign)
    assert response.status_code == 201
    assert response.json()["school_status"] == "missing"

    invalid = _register_payload("noselection01", school_id=None, missing=False)
    response = await client.post("/api/v1/auth/register", json=invalid)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == codes.SCHOOL_SELECTION_REQUIRED


@pytest.mark.asyncio
async def test_selected_school_profile_is_locked_for_user_but_editable_by_admin(client, db_session, create_user):
    second_region = Region(
        country_code="RU",
        name="Тестовая область",
        normalized_name="тестовая область",
    )
    db_session.add(second_region)
    await db_session.flush()
    second_city = City(
        region_id=second_region.id,
        name="Тестоград",
        normalized_name="тестоград",
    )
    db_session.add(second_city)
    await db_session.flush()
    second_school = School(
        city_id=second_city.id,
        full_name="ГБОУ Тестовая школа № 2",
        short_name="Тестовая школа № 2",
        normalized_full_name="гбоу тестовая школа № 2",
        normalized_short_name="тестовая школа № 2",
        address="Тестовая улица, 2",
    )
    db_session.add(second_school)
    await db_session.commit()

    registered = await client.post("/api/v1/auth/register", json=_register_payload("lockedstudent01"))
    assert registered.status_code == 201
    student_id = registered.json()["id"]
    login = await client.post(
        "/api/v1/auth/login",
        json={"login": "lockedstudent01", "password": "StrongPass1"},
    )
    student_headers = _headers(login.json()["access_token"])

    locked = await client.put(
        "/api/v1/users/me",
        json={
            "region_id": second_region.id,
            "school_id": second_school.id,
            "school_not_found": False,
        },
        headers=student_headers,
    )
    assert locked.status_code == 409
    assert locked.json()["error"]["code"] == codes.SCHOOL_PROFILE_LOCKED

    school_not_found = await client.put(
        "/api/v1/users/me",
        json={"school_id": None, "school_not_found": True},
        headers=student_headers,
    )
    assert school_not_found.status_code == 409
    assert school_not_found.json()["error"]["code"] == codes.SCHOOL_PROFILE_LOCKED

    preschool_bypass = await client.put(
        "/api/v1/users/me",
        json={"class_grade": 0},
        headers=student_headers,
    )
    assert preschool_bypass.status_code == 409
    assert preschool_bypass.json()["error"]["code"] == codes.SCHOOL_PROFILE_LOCKED

    unchanged_geography = await client.put(
        "/api/v1/users/me",
        json={"region_id": 1, "school_id": 1, "school_not_found": False, "gender": "female"},
        headers=student_headers,
    )
    assert unchanged_geography.status_code == 200
    assert unchanged_geography.json()["gender"] == "female"
    assert unchanged_geography.json()["school_id"] == 1

    await create_user(
        login="profileadmin",
        email="profileadmin@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        class_grade=None,
        subject=None,
    )
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"login": "profileadmin", "password": "AdminPass1"},
    )
    changed = await client.put(
        f"/api/v1/admin/users/{student_id}",
        json={
            "region_id": second_region.id,
            "school_id": second_school.id,
            "school_not_found": False,
        },
        headers=_headers(admin_login.json()["access_token"]),
    )
    assert changed.status_code == 200
    assert changed.json()["region_id"] == second_region.id
    assert changed.json()["school_id"] == second_school.id
    assert changed.json()["school_status"] == "selected"


@pytest.mark.asyncio
async def test_school_submission_is_unique_and_admin_can_approve_existing_school(client, db_session, create_user):
    response = await client.post(
        "/api/v1/auth/register",
        json=_register_payload("missingschool01", school_id=None, missing=True),
    )
    assert response.status_code == 201
    assert response.json()["school_status"] == "missing"
    login = await client.post(
        "/api/v1/auth/login",
        json={"login": "missingschool01", "password": "StrongPass1"},
    )
    token = login.json()["access_token"]

    payload = {"city_name": "Москва", "school_short_name": "Новая школа"}
    response = await client.post("/api/v1/users/me/school-submissions", json=payload, headers=_headers(token))
    assert response.status_code == 201
    submission_id = response.json()["id"]
    assert response.json()["status"] == "pending"

    duplicate = await client.post("/api/v1/users/me/school-submissions", json=payload, headers=_headers(token))
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == codes.SCHOOL_SUBMISSION_EXISTS

    await create_user(
        login="schooladmin",
        email="schooladmin@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        class_grade=None,
        subject=None,
    )
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"login": "schooladmin", "password": "AdminPass1"},
    )
    admin_token = admin_login.json()["access_token"]
    approved = await client.post(
        f"/api/v1/admin/school-submissions/{submission_id}/approve",
        json={"existing_school_id": 1},
        headers=_headers(admin_token),
    )
    assert approved.status_code == 200
    assert approved.json()["submission"]["status"] == "approved"

    user = await UsersRepo(db_session).get_by_login("missingschool01")
    assert user.school_status == SchoolStatus.selected
    assert user.school_id == 1


@pytest.mark.asyncio
async def test_direct_diploma_is_blocked_while_school_submission_is_pending(client, db_session, create_user):
    user = await create_user(
        login="diplomapending",
        email="diplomapending@example.com",
        password="StrongPass1",
        role=UserRole.student,
        class_grade=7,
        subject=None,
    )
    admin = await create_user(
        login="diplomaadmin",
        email="diplomaadmin@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        class_grade=None,
        subject=None,
    )
    now = datetime.now(timezone.utc)
    olympiad = Olympiad(
        title="Diploma gate",
        age_group="7-8",
        duration_sec=600,
        available_from=now - timedelta(hours=1),
        available_to=now + timedelta(hours=1),
        created_by_user_id=admin.id,
    )
    db_session.add(olympiad)
    await db_session.flush()
    attempt = Attempt(
        olympiad_id=olympiad.id,
        user_id=user.id,
        started_at=now,
        deadline_at=now + timedelta(minutes=10),
        duration_sec=600,
    )
    db_session.add(attempt)
    await db_session.commit()

    login = await client.post(
        "/api/v1/auth/login",
        json={"login": "diplomapending", "password": "StrongPass1"},
    )
    response = await client.get(
        f"/api/v1/attempts/{attempt.id}/diploma",
        headers=_headers(login.json()["access_token"]),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == codes.DIPLOMA_SCHOOL_PENDING


@pytest.mark.asyncio
async def test_admin_school_crud_supports_directory_flags_and_soft_deactivation(client, create_user, db_session):
    await create_user(
        login="directoryadmin",
        email="directoryadmin@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        class_grade=None,
        subject=None,
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"login": "directoryadmin", "password": "AdminPass1"},
    )
    headers = _headers(login.json()["access_token"])
    payload = {
        "city_id": 1,
        "full_name": "ГБОУ Тестовый лицей",
        "short_name": "Тестовый лицей",
        "address": "Тестовая улица, 1",
        "is_sirius": True,
        "is_consortium": False,
        "is_peterson": True,
        "is_partner": True,
        "is_platform": False,
    }
    created = await client.post("/api/v1/admin/schools", json=payload, headers=headers)
    assert created.status_code == 201
    school_id = created.json()["id"]
    assert created.json()["region_name"] == "Москва"
    assert created.json()["is_sirius"] is True
    assert created.json()["user_count"] == 0

    cities = await client.get("/api/v1/admin/schools/cities", params={"region_id": 1}, headers=headers)
    assert cities.status_code == 200
    assert any(city["id"] == 1 and city["name"] == "Москва" for city in cities.json())

    filtered_summary = await client.get(
        "/api/v1/admin/schools/summary",
        params={"region_id": 1, "query": "Тестовый", "is_sirius": True},
        headers=headers,
    )
    assert filtered_summary.status_code == 200
    assert filtered_summary.json()["total_count"] == 1

    registered = await client.post(
        "/api/v1/auth/register",
        json=_register_payload("schoolcount01", school_id=school_id),
    )
    assert registered.status_code == 201
    listed = await client.get(
        "/api/v1/admin/schools",
        params={"query": "Тестовый", "limit": 1, "offset": 0},
        headers=headers,
    )
    sql_count = await db_session.scalar(select(func.count(User.id)).where(User.school_id == school_id))
    assert listed.status_code == 200
    assert listed.json()[0]["user_count"] == sql_count == 1

    updated = await client.patch(
        f"/api/v1/admin/schools/{school_id}",
        json={"is_consortium": True, "is_active": False},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["is_consortium"] is True
    assert updated.json()["is_active"] is False

    public = await client.get("/api/v1/lookup/schools", params={"region_id": 1, "query": "тестовый"})
    assert public.status_code == 200
    assert public.json() == []


@pytest.mark.asyncio
async def test_admin_rejection_changes_user_status_and_requires_comment(client, db_session, create_user):
    registered = await client.post(
        "/api/v1/auth/register",
        json=_register_payload("rejectschool01", school_id=None, missing=True),
    )
    assert registered.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        json={"login": "rejectschool01", "password": "StrongPass1"},
    )
    user_headers = _headers(login.json()["access_token"])
    submission = await client.post(
        "/api/v1/users/me/school-submissions",
        json={"city_name": "Москва", "school_short_name": "Несуществующая школа"},
        headers=user_headers,
    )

    await create_user(
        login="rejectadmin",
        email="rejectadmin@example.com",
        password="AdminPass1",
        role=UserRole.admin,
        class_grade=None,
        subject=None,
    )
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"login": "rejectadmin", "password": "AdminPass1"},
    )
    rejected = await client.post(
        f"/api/v1/admin/school-submissions/{submission.json()['id']}/reject",
        json={"admin_comment": "Уточните официальное название школы"},
        headers=_headers(admin_login.json()["access_token"]),
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["admin_comment"] == "Уточните официальное название школы"

    user = await UsersRepo(db_session).get_by_login("rejectschool01")
    assert user.school_status == SchoolStatus.submission_rejected
