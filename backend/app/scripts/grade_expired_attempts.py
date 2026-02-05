"""Recalculate grades for expired attempts without scores."""
from __future__ import annotations

import argparse
import asyncio
import math
from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import delete, select, update, or_

from app.db.session import SessionLocal
from app.models.attempt import Attempt, AttemptStatus, AttemptTaskGrade
from app.repos.attempts import AttemptsRepo
from app.services.attempts import AttemptsService


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def _load_attempts(repo: AttemptsRepo, limit: int | None) -> Sequence[Attempt]:
    stmt = (
        select(Attempt)
        .where(
            Attempt.status == AttemptStatus.expired,
            or_(Attempt.graded_at.is_(None), Attempt.score_max == 0),
        )
        .order_by(Attempt.id.asc())
    )
    if limit:
        stmt = stmt.limit(limit)
    res = await repo.db.execute(stmt)
    return list(res.scalars().all())


async def _grade_attempt(
    repo: AttemptsRepo,
    service: AttemptsService,
    attempt: Attempt,
    *,
    use_now: bool,
    dry_run: bool,
) -> tuple[int, int, bool, datetime]:
    olympiad = await repo.get_olympiad(attempt.olympiad_id)
    if not olympiad:
        raise RuntimeError(f"Olympiad {attempt.olympiad_id} not found for attempt {attempt.id}")

    tasks = await repo.list_tasks_full(attempt.olympiad_id)
    answers = await repo.list_answers(attempt.id)
    answers_by_task = {a.task_id: a for a in answers}

    score_total = 0
    score_max = 0
    graded_at = _now_utc() if use_now else (attempt.deadline_at or _now_utc())

    grades: list[AttemptTaskGrade] = []
    for olymp_task, task in tasks:
        score_max += int(olymp_task.max_score)
        answer = answers_by_task.get(task.id)
        answer_payload = None if answer is None else answer.answer_payload
        is_correct = service._grade_task(task.task_type, task.payload, answer_payload)
        score = int(olymp_task.max_score) if is_correct else 0
        score_total += score
        grades.append(
            AttemptTaskGrade(
                attempt_id=attempt.id,
                task_id=task.id,
                is_correct=is_correct,
                score=score,
                max_score=int(olymp_task.max_score),
                graded_at=graded_at,
            )
        )

    pass_score = math.ceil(score_max * int(olympiad.pass_percent) / 100) if score_max > 0 else 0
    passed = score_total >= pass_score

    if dry_run:
        return score_total, score_max, passed, graded_at

    await repo.db.execute(delete(AttemptTaskGrade).where(AttemptTaskGrade.attempt_id == attempt.id))
    for grade in grades:
        repo.db.add(grade)

    await repo.db.execute(
        update(Attempt)
        .where(Attempt.id == attempt.id)
        .values(
            status=AttemptStatus.expired,
            score_total=score_total,
            score_max=score_max,
            passed=passed,
            graded_at=graded_at,
        )
    )
    await repo.db.commit()
    return score_total, score_max, passed, graded_at


async def _run(limit: int | None, dry_run: bool, use_now: bool) -> int:
    async with SessionLocal() as session:
        repo = AttemptsRepo(session)
        service = AttemptsService(repo)

        attempts = await _load_attempts(repo, limit)
        print(f"Found {len(attempts)} expired attempts without grades.")
        if not attempts:
            return 0

        processed = 0
        for attempt in attempts:
            try:
                score_total, score_max, passed, graded_at = await _grade_attempt(
                    repo,
                    service,
                    attempt,
                    use_now=use_now,
                    dry_run=dry_run,
                )
                processed += 1
                status = "DRY_RUN" if dry_run else "UPDATED"
                print(
                    f"[{status}] attempt={attempt.id} olympiad={attempt.olympiad_id} "
                    f"score={score_total}/{score_max} passed={passed} graded_at={graded_at.isoformat()}"
                )
            except Exception as exc:
                print(f"[ERROR] attempt={attempt.id} error={exc}")
        return processed


def main() -> None:
    parser = argparse.ArgumentParser(description="Recalculate grades for expired attempts.")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of attempts to process.")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing to DB.")
    parser.add_argument(
        "--use-now",
        action="store_true",
        help="Use current time for graded_at instead of attempt deadline.",
    )
    args = parser.parse_args()

    processed = asyncio.run(_run(args.limit, args.dry_run, args.use_now))
    print(f"Processed: {processed}")


if __name__ == "__main__":
    main()
