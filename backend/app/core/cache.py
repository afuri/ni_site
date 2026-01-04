def olympiad_tasks_key(olympiad_id: int) -> str:
    return f"cache:olympiad:{olympiad_id}:tasks:v1"


def olympiad_meta_key(olympiad_id: int) -> str:
    return f"cache:olympiad:{olympiad_id}:meta:v1"
