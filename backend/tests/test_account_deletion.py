from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
import pytest
from sqlalchemy import select, func
from app.models.user import User, UserRole
from app.models.attempt import Attempt, AttemptAnswer, AttemptTaskGrade, AttemptStatus
from app.models.olympiad import Olympiad
from app.models.task import Task, Subject, TaskType
from app.models.teacher_student import TeacherStudent
from app.models.account_deletion import AccountDeletionRequest, AccountDeletionCleanup
from app.models.auth_token import RefreshToken
from app.models.social_account import SocialAccount
from app.models.school_submission import SchoolSubmission
from app.services import account_deletion as service


async def setup(client, create_user):
    admin = await create_user(login="eraseadmin", email="eraseadmin@example.com", password="StrongPass1", role=UserRole.admin, class_grade=None)
    user = await create_user(login="eraseuser", email="eraseuser@example.com", password="StrongPass1", role=UserRole.student)
    headers = []
    for login in (admin.login, user.login):
        response = await client.post('/api/v1/auth/login', json={'login': login, 'password': 'StrongPass1'})
        headers.append({'Authorization': f"Bearer {response.json()['access_token']}"})
    return admin, user, headers[0], headers[1]


@pytest.mark.asyncio
async def test_request_confirm_cancel_and_stale_admin_action(client, create_user, db_session):
    admin, user, ah, uh = await setup(client, create_user)
    path = '/api/v1/users/me/deletion-request'
    assert (await client.get(path, headers=uh)).json() is None
    assert (await client.post(path, headers=uh, json={'confirmed': False})).status_code == 422
    first = await client.post(path, headers=uh, json={'confirmed': True})
    assert first.status_code == 200
    again = await client.post(path, headers=uh, json={'confirmed': True})
    assert again.json()['id'] == first.json()['id']
    assert (await client.get('/api/v1/admin/account-deletions/requests', headers=uh)).status_code == 403
    assert len((await client.get('/api/v1/admin/account-deletions/requests', headers=ah)).json()) == 1
    assert (await client.delete(path, headers=uh)).status_code == 204
    stale = await client.request('DELETE', f'/api/v1/admin/account-deletions/{user.id}', headers=ah,
        json={'confirmed': True, 'expected_login': user.login, 'request_id': first.json()['id']})
    assert stale.status_code == 409
    assert await db_session.get(User, user.id) is not None
    second = await client.post(path, headers=uh, json={'confirmed': True})
    assert second.json()['id'] != first.json()['id']
    assert (await client.get(f'/api/v1/admin/account-deletions/{admin.id}', headers=ah)).status_code == 403


@pytest.mark.asyncio
async def test_hard_delete_cascades_and_retries_files(client, create_user, db_session, monkeypatch):
    admin, user, ah, uh = await setup(client, create_user)
    teacher = await create_user(login='eraseteacher', email='eraseteacher@example.com', password='StrongPass1', role=UserRole.teacher, subject='Математика', class_grade=None)
    teacher.manual_teachers = [{'id': user.id, 'full_name': 'Удаляемый', 'subject': 'Математика'}, {'id': admin.id, 'full_name': 'Другой', 'subject': 'Математика'}]
    db_session.add(TeacherStudent(teacher_id=teacher.id, student_id=user.id, status='confirmed'))
    now = datetime.now(timezone.utc)
    olympiad = Olympiad(title='Удаление тест', description='', age_group='5-6', duration_sec=600, attempts_limit=1,
        available_from=now, available_to=now + timedelta(days=1), pass_percent=60, created_by_user_id=admin.id)
    task = Task(subject=Subject.math, title='Тест', content='Тест', task_type=TaskType.short_text, payload={}, created_by_user_id=admin.id)
    db_session.add_all([olympiad, task]); await db_session.flush()
    attempt = Attempt(user_id=user.id, olympiad_id=olympiad.id, started_at=now, deadline_at=now + timedelta(minutes=10), duration_sec=600, status=AttemptStatus.submitted)
    db_session.add(attempt); await db_session.flush()
    db_session.add(AttemptAnswer(attempt_id=attempt.id, task_id=task.id, answer_payload={'text': '1'}, updated_at=now))
    db_session.add(AttemptTaskGrade(attempt_id=attempt.id, task_id=task.id, is_correct=True, score=1, max_score=1, graded_at=now))
    await db_session.commit()
    db_session.add(SocialAccount(provider='vk', provider_user_id='test-erase', user_id=user.id))
    db_session.add(SchoolSubmission(user_id=user.id, region_id=1, city_name='Москва', school_short_name='Новая школа', school_full_name='Новая школа', url='www.school.ru'))
    await db_session.commit()
    await client.post('/api/v1/users/me/deletion-request', headers=uh, json={'confirmed': True})
    purge = Mock(side_effect=RuntimeError('storage unavailable'))
    monkeypatch.setattr(service, 'purge_files', purge)
    path = f'/api/v1/admin/account-deletions/{user.id}'
    assert (await client.request('DELETE', path, headers=uh, json={'confirmed': True, 'expected_login': user.login})).status_code == 403
    assert (await client.request('DELETE', path, headers=ah, json={'confirmed': True, 'expected_login': 'wrong'})).status_code == 409
    response = await client.request('DELETE', path, headers=ah, json={'confirmed': True, 'expected_login': user.login})
    assert response.status_code == 200, response.text
    assert response.json()['files_pending'] is True
    assert (await client.get('/api/v1/users/me', headers=uh)).status_code == 401
    assert await db_session.scalar(select(User.id).where(User.id == user.id)) is None
    for model in (Attempt, AttemptAnswer, AttemptTaskGrade, TeacherStudent, AccountDeletionRequest, SocialAccount, SchoolSubmission):
        assert await db_session.scalar(select(func.count()).select_from(model)) == 0
    await db_session.refresh(teacher)
    assert [row['id'] for row in teacher.manual_teachers] == [admin.id]
    assert await db_session.get(AccountDeletionCleanup, user.id) is not None
    monkeypatch.setattr(service, 'purge_files', Mock())
    response = await client.post(path + '/cleanup', headers=ah)
    assert response.json()['files_pending'] is False
    assert await db_session.scalar(select(AccountDeletionCleanup.user_id)) is None
    assert await db_session.scalar(select(Task.id)) == task.id
    assert await db_session.scalar(select(RefreshToken.id).where(RefreshToken.user_id == user.id)) is None


def test_versioned_storage_deletes_old_versions_without_touching_other_accounts(monkeypatch):
    client = Mock()
    current = Mock()
    current.paginate.return_value = [{'Contents': []}]
    versions = Mock()
    versions.paginate.return_value = [{'Versions': [
        {'Key': 'attempt_34.jpg', 'VersionId': 'old'},
        {'Key': 'attempt_345.jpg', 'VersionId': 'foreign'},
        {'Key': 'certificates/teachers/2026_2027/certificate_12_2026_2027_01.jpg', 'VersionId': 'cert'},
    ], 'DeleteMarkers': [{'Key': 'attempt_34.jpg', 'VersionId': 'marker'}]}]
    client.get_paginator.side_effect = lambda name: current if name == 'list_objects_v2' else versions
    client.get_bucket_versioning.return_value = {'Status': 'Enabled'}
    client.delete_objects.return_value = {}
    monkeypatch.setattr(service, '_get_s3_client', lambda: client)
    service.purge_files(12, [34])
    deleted = [item for call in client.delete_objects.call_args_list for item in call.kwargs['Delete']['Objects']]
    assert {'Key': 'attempt_34.jpg', 'VersionId': 'old'} in deleted
    assert {'Key': 'attempt_34.jpg', 'VersionId': 'marker'} in deleted
    assert not any(item['Key'] == 'attempt_345.jpg' for item in deleted)


def test_file_deletion_is_exact_and_partial_failure_is_not_success(monkeypatch):
    client = Mock()
    client.get_paginator.return_value.paginate.return_value = [{'Contents': [
        {'Key': 'certificates/teachers/2026_2027/certificate_12_2026_2027_01.jpg'},
        {'Key': 'certificates/teachers/2026_2027/certificate_123_2026_2027_01.jpg'}]}]
    client.delete_objects.return_value = {}
    client.get_bucket_versioning.return_value = {}
    monkeypatch.setattr(service, '_get_s3_client', lambda: client)
    service.purge_files(12, [34])
    objects = client.delete_objects.call_args.kwargs['Delete']['Objects']
    assert {item['Key'] for item in objects} == {'attempt_34.jpg', 'certificates/teachers/2026_2027/certificate_12_2026_2027_01.jpg'}
    client.delete_objects.return_value = {'Errors': [{'Code': 'AccessDenied'}]}
    with pytest.raises(RuntimeError):
        service.purge_files(12, [34])
