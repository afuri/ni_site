"""Add canonical region, city and school directory.

Revision ID: b8e7c6d5a4f3
Revises: 6b7c8d9e0f1a
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b8e7c6d5a4f3"
down_revision: Union[str, None] = "6b7c8d9e0f1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


school_status_enum = postgresql.ENUM(
    "selected",
    "missing",
    "submission_pending",
    "submission_rejected",
    "not_required",
    name="school_status_enum",
    create_type=False,
)
submission_status_enum = postgresql.ENUM(
    "pending",
    "approved",
    "rejected",
    name="school_submission_status_enum",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    school_status_enum.create(bind, checkfirst=True)
    submission_status_enum.create(bind, checkfirst=True)

    op.rename_table("schools", "schools_legacy")

    op.create_table(
        "regions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("country_code", sa.String(length=2), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("normalized_name", sa.String(length=120), nullable=False),
        sa.Column("is_other", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "uq_regions_country_normalized_name",
        "regions",
        ["country_code", "normalized_name"],
        unique=True,
        postgresql_where=sa.text("is_other = false"),
    )
    op.create_index(
        "uq_regions_active_other",
        "regions",
        ["is_other"],
        unique=True,
        postgresql_where=sa.text("is_other = true AND is_active = true"),
    )
    op.create_index("ix_regions_normalized_name", "regions", ["normalized_name"])

    op.create_table(
        "cities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("region_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("normalized_name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("region_id", "normalized_name", name="uq_cities_region_normalized_name"),
    )
    op.create_index("ix_cities_region_id", "cities", ["region_id"])
    op.create_index("ix_cities_region_normalized_name", "cities", ["region_id", "normalized_name"])

    op.create_table(
        "schools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("city_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=512), nullable=False),
        sa.Column("short_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_full_name", sa.String(length=512), nullable=False),
        sa.Column("normalized_short_name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.String(length=512), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("is_sirius", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_consortium", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_peterson", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_partner", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_platform", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("curator", sa.String(length=255), nullable=True),
        sa.Column("info", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_schools_city_id", "schools", ["city_id"])
    op.create_index("ix_school_directory_city_active", "schools", ["city_id", "is_active"])
    op.create_index("ix_school_directory_normalized_short", "schools", ["normalized_short_name"])
    op.create_index("ix_school_directory_normalized_full", "schools", ["normalized_full_name"])

    # pg_trgm is optional in hosted PostgreSQL. Lack of privileges must not make
    # the structural migration unusable; btree indexes above remain the fallback.
    op.execute(
        """
        DO $$
        BEGIN
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'pg_trgm was not installed: insufficient privilege';
        END $$
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
                CREATE INDEX ix_school_directory_short_trgm
                    ON schools USING gin (normalized_short_name gin_trgm_ops);
                CREATE INDEX ix_school_directory_full_trgm
                    ON schools USING gin (normalized_full_name gin_trgm_ops);
            END IF;
        END $$
        """
    )

    op.add_column("users", sa.Column("region_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("school_id", sa.Integer(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "school_status",
            school_status_enum,
            server_default=sa.text("'missing'::school_status_enum"),
            nullable=False,
        ),
    )
    op.add_column("users", sa.Column("coins", sa.BigInteger(), server_default=sa.text("0"), nullable=False))
    op.create_foreign_key("fk_users_region_id", "users", "regions", ["region_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_users_school_id", "users", "schools", ["school_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_users_region_id", "users", ["region_id"])
    op.create_index("ix_users_school_id", "users", ["school_id"])
    op.create_index("ix_users_school_status", "users", ["school_status"])
    op.create_check_constraint("ck_users_coins_nonnegative", "users", "coins >= 0")
    op.create_check_constraint(
        "ck_users_school_status_consistency",
        "users",
        "(school_status = 'selected' AND school_id IS NOT NULL) OR "
        "(school_status IN ('missing', 'submission_pending', 'submission_rejected', 'not_required') "
        "AND school_id IS NULL)",
    )

    op.create_table(
        "school_submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("region_id", sa.Integer(), nullable=False),
        sa.Column("country_name", sa.String(length=120), nullable=True),
        sa.Column("region_name", sa.String(length=120), nullable=True),
        sa.Column("city_name", sa.String(length=120), nullable=False),
        sa.Column("school_short_name", sa.String(length=255), nullable=False),
        sa.Column("school_full_name", sa.String(length=512), nullable=True),
        sa.Column("address", sa.String(length=512), nullable=True),
        sa.Column("url", sa.String(length=2048), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            submission_status_enum,
            server_default=sa.text("'pending'::school_submission_status_enum"),
            nullable=False,
        ),
        sa.Column("admin_comment", sa.Text(), nullable=True),
        sa.Column("resolved_school_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["resolved_school_id"], ["schools.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "status <> 'approved' OR "
            "(resolved_school_id IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_school_submissions_approved_resolution",
        ),
        sa.CheckConstraint(
            "status <> 'rejected' OR "
            "(admin_comment IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_school_submissions_rejected_review",
        ),
    )
    op.create_index("ix_school_submissions_user_id", "school_submissions", ["user_id"])
    op.create_index("ix_school_submissions_region_id", "school_submissions", ["region_id"])
    op.create_index("ix_school_submissions_status_created", "school_submissions", ["status", "created_at"])
    op.create_index(
        "uq_school_submissions_pending_user",
        "school_submissions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.create_table(
        "school_import_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.String(length=120), nullable=False),
        sa.Column("schools_sha256", sa.String(length=64), nullable=False),
        sa.Column("users_sha256", sa.String(length=64), nullable=False),
        sa.Column("stats", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("batch_id", name="uq_school_import_batches_batch_id"),
    )
    op.create_table(
        "school_source_map",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.String(length=120), nullable=False),
        sa.Column("source_school_id", sa.Integer(), nullable=False),
        sa.Column("school_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["school_import_batches.batch_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("batch_id", "source_school_id", name="uq_school_source_map_batch_source"),
    )
    op.create_index("ix_school_source_map_batch_id", "school_source_map", ["batch_id"])
    op.create_index("ix_school_source_map_source_school_id", "school_source_map", ["source_school_id"])
    op.create_index("ix_school_source_map_school_id", "school_source_map", ["school_id"])


def downgrade() -> None:
    op.drop_table("school_source_map")
    op.drop_table("school_import_batches")
    op.drop_table("school_submissions")

    op.drop_constraint("ck_users_school_status_consistency", "users", type_="check")
    op.drop_constraint("ck_users_coins_nonnegative", "users", type_="check")
    op.drop_index("ix_users_school_status", table_name="users")
    op.drop_index("ix_users_school_id", table_name="users")
    op.drop_index("ix_users_region_id", table_name="users")
    op.drop_constraint("fk_users_school_id", "users", type_="foreignkey")
    op.drop_constraint("fk_users_region_id", "users", type_="foreignkey")
    op.drop_column("users", "coins")
    op.drop_column("users", "school_status")
    op.drop_column("users", "school_id")
    op.drop_column("users", "region_id")

    op.execute("DROP INDEX IF EXISTS ix_school_directory_full_trgm")
    op.execute("DROP INDEX IF EXISTS ix_school_directory_short_trgm")
    op.drop_table("schools")
    op.drop_table("cities")
    op.drop_table("regions")
    op.rename_table("schools_legacy", "schools")

    submission_status_enum.drop(op.get_bind(), checkfirst=True)
    school_status_enum.drop(op.get_bind(), checkfirst=True)
