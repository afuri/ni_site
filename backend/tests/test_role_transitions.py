import pytest
from sqlalchemy import select

from app.models.user import UserRole, SchoolStatus
from app.models.teacher_student import TeacherStudent


async def setup_user(client, db_session, create_user, role, grade):
    admin = await create_user(login='roleadmin', email='roleadmin@example.com', password='StrongPass1', role=UserRole.admin, class_grade=None)
    user = await create_user(login='roleuser', email='roleuser@example.com', password='StrongPass1', role=role, class_grade=grade, subject='Математика' if role == UserRole.teacher else None)
    user.region_id = 1
    user.school_id = None if grade == 0 else 1
    user.school_status = SchoolStatus.not_required if grade == 0 else SchoolStatus.selected
    await db_session.commit()
    login = await client.post('/api/v1/auth/login', json={'login': admin.login, 'password': 'StrongPass1'})
    return user, {'Authorization': f"Bearer {login.json()['access_token']}"}


@pytest.mark.asyncio
@pytest.mark.parametrize('old_role,grade,payload,expected', [
    (UserRole.student, 0, {'role': 'teacher', 'subject': 'Математика', 'school_id': 1}, 'role_transition_not_allowed'),
    (UserRole.student, 0, {'class_grade': 1}, 'school_selection_required'),
    (UserRole.student, 0, {'class_grade': 1, 'school_not_found': True}, 'school_selection_required'),
    (UserRole.student, 5, {'role': 'teacher'}, 'subject_required'),
    (UserRole.student, 5, {'role': 'teacher', 'subject': '   '}, 'subject_required'),
    (UserRole.student, 5, {'role': 'teacher', 'subject': 'Math'}, 'validation_error'),
    (UserRole.teacher, None, {'role': 'student'}, 'class_grade_required'),
    (UserRole.teacher, None, {'role': 'student', 'class_grade': 0}, 'class_grade_required'),
    (UserRole.teacher, None, {'role': 'student', 'class_grade': 12}, 'class_grade_required'),
    (UserRole.teacher, None, {'role': 'student', 'class_grade': 5, 'school_id': None}, 'school_selection_required'),
])
async def test_rejected_transition_does_not_change_user(client, db_session, create_user, old_role, grade, payload, expected):
    user, headers = await setup_user(client, db_session, create_user, old_role, grade)
    response = await client.put(f'/api/v1/admin/users/{user.id}', json=payload, headers=headers)
    assert response.status_code == 422, response.text
    assert response.json()['error']['code'] == expected
    await db_session.refresh(user)
    assert user.role == old_role
    assert user.class_grade == grade


@pytest.mark.asyncio
@pytest.mark.parametrize('old_role,grade,payload', [
    (UserRole.student, 0, {'class_grade': 1, 'school_id': 1}),
    (UserRole.student, 5, {'role': 'teacher', 'subject': 'Математика', 'class_grade': 5}),
    (UserRole.teacher, None, {'role': 'student', 'class_grade': 5, 'subject': 'Математика', 'is_moderator': True}),
])
async def test_valid_transition_cleans_fields_and_links(client, db_session, create_user, old_role, grade, payload):
    user, headers = await setup_user(client, db_session, create_user, old_role, grade)
    peer = await create_user(login='rolepeer', email='rolepeer@example.com', password='StrongPass1', role=UserRole.teacher if old_role == UserRole.student else UserRole.student)
    link = TeacherStudent(teacher_id=peer.id if old_role == UserRole.student else user.id, student_id=user.id if old_role == UserRole.student else peer.id, status='confirmed')
    db_session.add(link)
    await db_session.commit()
    response = await client.put(f'/api/v1/admin/users/{user.id}', json=payload, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['school_id'] == 1 and data['school_status'] == 'selected'
    if payload.get('role') == 'teacher':
        assert data['class_grade'] is None and data['subject'] == 'Математика'
        assert data['manual_teachers'] == []
    else:
        assert data['subject'] is None and data['class_grade'] == payload['class_grade']
        assert not data['is_moderator'] and not data['moderator_requested']
    found = await db_session.scalar(select(TeacherStudent.id).where(TeacherStudent.id == link.id))
    assert (found is None) == ('role' in payload)


@pytest.mark.asyncio
async def test_preschool_self_update_also_requires_school(client, db_session, create_user):
    user, _ = await setup_user(client, db_session, create_user, UserRole.student, 0)
    login = await client.post('/api/v1/auth/login', json={'login': user.login, 'password': 'StrongPass1'})
    headers = {'Authorization': f"Bearer {login.json()['access_token']}"}
    response = await client.put('/api/v1/users/me', json={'class_grade': 1}, headers=headers)
    assert response.status_code == 422, response.text
    response = await client.put('/api/v1/users/me', json={'class_grade': 1, 'school_id': 1}, headers=headers)
    assert response.status_code == 200, response.text
