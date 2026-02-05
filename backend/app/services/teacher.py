from datetime import datetime, timezone
import math

from app.models.attempt import AttemptStatus
from app.models.teacher_student import TeacherStudentStatus
from app.models.user import User, UserRole
from app.repos.attempts import AttemptsRepo
from app.repos.olympiads import OlympiadsRepo
from app.repos.teacher import TeacherRepo
from app.repos.teacher_students import TeacherStudentsRepo
from app.services.attempts import AttemptsService
from app.core import error_codes as codes


class TeacherService:
    def __init__(self, teacher_repo: TeacherRepo, olymp_repo: OlympiadsRepo, links_repo: TeacherStudentsRepo):
        self.teacher_repo = teacher_repo
        self.olymp_repo = olymp_repo
        self.links_repo = links_repo

    async def _ensure_olympiad(self, *, olympiad_id: int):
        olympiad = await self.olymp_repo.get(olympiad_id)
        if not olympiad:
            raise ValueError(codes.OLYMPIAD_NOT_FOUND)
        return olympiad

    async def get_attempt_view(self, *, teacher: User, attempt_id: int):
        pair = await self.teacher_repo.get_attempt_with_user(attempt_id)
        if not pair:
            raise ValueError(codes.ATTEMPT_NOT_FOUND)
        attempt, user = pair

        olympiad = await self._ensure_olympiad(olympiad_id=attempt.olympiad_id)
        if teacher.role != UserRole.admin:
            link = await self.links_repo.get_link(teacher.id, user.id)
            if not link or link.status != TeacherStudentStatus.confirmed:
                raise ValueError(codes.FORBIDDEN)

        tasks = await self.teacher_repo.list_tasks(attempt.olympiad_id)
        answers = await self.teacher_repo.list_answers(attempt.id)
        answers_by_task = {a.task_id: a for a in answers}

        now = datetime.now(timezone.utc)
        needs_expire_grade = False
        if attempt.status == AttemptStatus.active and now > attempt.deadline_at:
            needs_expire_grade = True
        elif attempt.status == AttemptStatus.expired and (attempt.graded_at is None or attempt.score_max == 0):
            needs_expire_grade = True

        if needs_expire_grade:
            grader = AttemptsService(AttemptsRepo(self.teacher_repo.db))
            score_total = 0
            score_max = 0
            now_ts = grader._now_utc()

            await grader.repo.delete_grades(attempt.id)
            for olymp_task, task in tasks:
                score_max += int(olymp_task.max_score)
                answer = answers_by_task.get(task.id)
                answer_payload = None if answer is None else answer.answer_payload
                is_correct = grader._grade_task(task.task_type, task.payload, answer_payload)
                score = int(olymp_task.max_score) if is_correct else 0
                score_total += score

                await grader.repo.add_grade(
                    attempt_id=attempt.id,
                    task_id=task.id,
                    is_correct=is_correct,
                    score=score,
                    max_score=int(olymp_task.max_score),
                    graded_at=now_ts,
                )

            pass_score = math.ceil(score_max * int(olympiad.pass_percent) / 100) if score_max > 0 else 0
            passed = score_total >= pass_score

            await grader.repo.mark_expired_with_grade(
                attempt_id=attempt.id,
                score_total=score_total,
                score_max=score_max,
                passed=passed,
                graded_at=now_ts,
            )
            attempt = await grader.repo.get_attempt(attempt.id)

        return attempt, user, olympiad, tasks, answers_by_task

    async def list_olympiad_attempts(self, *, teacher: User, olympiad_id: int):
        olympiad = await self._ensure_olympiad(olympiad_id=olympiad_id)
        if teacher.role == UserRole.admin:
            rows = await self.teacher_repo.list_attempts_for_olympiad_with_users(olympiad_id)
        else:
            rows = await self.teacher_repo.list_attempts_for_olympiad_with_users_for_teacher(olympiad_id, teacher.id)
        return olympiad, rows
