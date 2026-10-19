import os

from dotenv import load_dotenv

# Local .env. Existing process env (Compose, ECS) is not overwritten.
load_dotenv()


class Settings:
    database_url: str = os.environ["DATABASE_URL"]
    # Same HMAC secret the auth service uses to sign access tokens.
    jwt_secret: str = os.environ["JWT_SECRET"]


settings = Settings()
