from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORM


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(default="", max_length=160)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


class UserOut(ORM):
    id: int
    email: str
    full_name: str
