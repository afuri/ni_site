from app.db.base import Base
from app.models.user import User  # noqa
from app.models.olympiad import Olympiad, OlympiadTask  # noqa
from app.models.attempt import Attempt, AttemptAnswer  # noqa

target_metadata = Base.metadata
