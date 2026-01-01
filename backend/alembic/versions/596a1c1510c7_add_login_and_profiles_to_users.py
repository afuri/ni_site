"""add login and profiles to users

Revision ID: 596a1c1510c7
Revises: 83183979a20c
Create Date: 2026-01-01 19:37:57.829562

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision = "596a1c1510c7"
down_revision = "83183979a20c"
branch_labels = None
depends_on = None


def upgrade():
    # email уже есть и уникальный; делаем его nullable и снимаем уникальность
    op.drop_index("ix_users_email", table_name="users")
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=True)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)

    # login + профильные поля
    op.add_column("users", sa.Column("login", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_users_login"), "users", ["login"], unique=True)

    op.add_column("users", sa.Column("surname", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("father_name", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("school", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("class_grade", sa.Integer(), nullable=True))

    op.add_column("users", sa.Column("subject", sa.String(length=20), nullable=True))

    op.add_column("users", sa.Column("teacher_math", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("teacher_cs", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("teacher_math_link", sa.String(length=2048), nullable=True))
    op.add_column("users", sa.Column("teacher_cs_link", sa.String(length=2048), nullable=True))

    # Если в БД уже есть пользователи, нужно заполнить login, иначе будет NULL.
    # Для MVP: заполним login из email (если есть), иначе "user_<id>".
    op.execute("""
    UPDATE users
    SET login = COALESCE(NULLIF(split_part(email, '@', 1), ''), 'user_' || id::text)
    WHERE login IS NULL
    """)

    # Теперь делаем login NOT NULL
    op.alter_column("users", "login", existing_type=sa.String(length=64), nullable=False)


def downgrade():
    op.drop_index(op.f("ix_users_login"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")

    op.drop_column("users", "teacher_cs_link")
    op.drop_column("users", "teacher_math_link")
    op.drop_column("users", "teacher_cs")
    op.drop_column("users", "teacher_math")

    op.drop_column("users", "subject")

    op.drop_column("users", "class_grade")
    op.drop_column("users", "school")
    op.drop_column("users", "city")
    op.drop_column("users", "father_name")
    op.drop_column("users", "name")
    op.drop_column("users", "surname")

    op.drop_column("users", "login")

    # вернуть email к исходному состоянию: NOT NULL + уникальный индекс
    op.alter_column("users", "email", existing_type=sa.String(length=255), nullable=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
