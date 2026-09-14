from dataclasses import dataclass

from app.core import error_codes as codes
from app.models.region import Region
from app.models.school import School
from app.models.user import SchoolStatus, User, UserRole
from app.repos.regions import RegionsRepo
from app.repos.schools import SchoolsRepo


@dataclass(frozen=True)
class SchoolChoice:
    region: Region
    school: School | None
    status: SchoolStatus

    @property
    def legacy_values(self) -> dict[str, str | None]:
        if self.school is not None:
            return {
                "country": "Россия" if self.region.country_code == "RU" else self.region.name,
                "city": self.school.city.name,
                "school": self.school.short_name,
            }
        return {
            "country": "Россия" if self.region.country_code == "RU" else None,
            "city": None,
            "school": None,
        }


class SchoolProfileService:
    def __init__(self, db):
        self.db = db
        self.regions = RegionsRepo(db)
        self.schools = SchoolsRepo(db)

    async def resolve_choice(
        self,
        *,
        role: UserRole,
        class_grade: int | None,
        region_id: int,
        school_id: int | None,
        school_not_found: bool,
    ) -> SchoolChoice:
        region = await self.regions.get(region_id)
        if region is None:
            raise ValueError(codes.REGION_NOT_FOUND)
        if not region.is_active:
            raise ValueError(codes.REGION_INACTIVE)

        if role == UserRole.student and class_grade == 0:
            if school_id is not None:
                raise ValueError(codes.SCHOOL_SELECTION_REQUIRED)
            return SchoolChoice(region=region, school=None, status=SchoolStatus.not_required)

        if region.is_other:
            if school_id is not None or not school_not_found:
                raise ValueError(codes.SCHOOL_SELECTION_REQUIRED)
            return SchoolChoice(region=region, school=None, status=SchoolStatus.missing)

        if (school_id is None) == (not school_not_found):
            raise ValueError(codes.SCHOOL_SELECTION_REQUIRED)
        if school_id is None:
            return SchoolChoice(region=region, school=None, status=SchoolStatus.missing)

        school = await self.schools.get(school_id)
        if school is None:
            raise ValueError(codes.SCHOOL_NOT_FOUND)
        if not school.is_active or not school.city.is_active:
            raise ValueError(codes.SCHOOL_INACTIVE)
        if school.city.region_id != region.id:
            raise ValueError(codes.SCHOOL_REGION_MISMATCH)
        return SchoolChoice(region=region, school=school, status=SchoolStatus.selected)

    async def apply_profile_fields(
        self,
        user: User,
        data: dict,
        *,
        allow_selected_geography_change: bool = False,
    ) -> dict:
        patch = dict(data)
        new_grade = patch.get("class_grade", user.class_grade)

        if user.school_status == SchoolStatus.selected and not allow_selected_geography_change:
            requested_region_id = patch.get("region_id", user.region_id)
            requested_school_id = patch.get("school_id", user.school_id)
            requested_school_not_found = patch.get("school_not_found", False)
            selected_school_would_be_cleared = (
                user.role == UserRole.student
                and user.class_grade != 0
                and new_grade == 0
            )
            if (
                requested_region_id != user.region_id
                or requested_school_id != user.school_id
                or requested_school_not_found is True
                or selected_school_would_be_cleared
            ):
                raise ValueError(codes.SCHOOL_PROFILE_LOCKED)

            # Older clients submit the unchanged directory fields on every
            # profile save. Ignore them so unrelated edits remain possible and
            # an inactive directory entry does not block saving personal data.
            patch.pop("region_id", None)
            patch.pop("school_id", None)
            patch.pop("school_not_found", None)

        school_id_supplied = "school_id" in patch
        not_found_supplied = "school_not_found" in patch
        region_supplied = "region_id" in patch
        school_id = patch.pop("school_id", user.school_id)
        school_not_found = patch.pop("school_not_found", None)
        region_id = patch.pop("region_id", user.region_id)

        if user.role == UserRole.student and new_grade is None:
            raise ValueError(codes.CLASS_GRADE_REQUIRED)
        if user.role == UserRole.teacher and "class_grade" in patch and new_grade is not None:
            raise ValueError(codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER)

        geography_touched = region_supplied or school_id_supplied or not_found_supplied
        if user.role == UserRole.student and new_grade == 0:
            if school_id_supplied and school_id is not None:
                raise ValueError(codes.SCHOOL_SELECTION_REQUIRED)
            if region_id is None:
                raise ValueError(codes.REGION_NOT_FOUND)
            choice = await self.resolve_choice(
                role=user.role,
                class_grade=new_grade,
                region_id=region_id,
                school_id=None,
                school_not_found=False,
            )
            patch.update(region_id=choice.region.id, school_id=None, school_status=choice.status, **choice.legacy_values)
            return patch

        if geography_touched:
            if region_id is None:
                raise ValueError(codes.REGION_NOT_FOUND)
            if region_supplied and region_id != user.region_id and not school_id_supplied:
                school_id = None
            if school_not_found is None:
                school_not_found = school_id is None
            choice = await self.resolve_choice(
                role=user.role,
                class_grade=new_grade,
                region_id=region_id,
                school_id=school_id,
                school_not_found=school_not_found,
            )
            patch.update(
                region_id=choice.region.id,
                school_id=choice.school.id if choice.school else None,
                school_status=choice.status,
                **choice.legacy_values,
            )
        elif (
            user.role == UserRole.student
            and user.class_grade == 0
            and new_grade != 0
            and user.school_status == SchoolStatus.not_required
        ):
            patch.update(school_id=None, school_status=SchoolStatus.missing, city=None, school=None)
        return patch
