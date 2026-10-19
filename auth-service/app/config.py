import os

from dotenv import load_dotenv

# Local .env. Existing process env (Compose, ECS) is not overwritten.
load_dotenv()


class Settings:
    database_url: str = os.environ["DATABASE_URL"]
    # Shared with the task service. Auth signs access tokens; task verifies them.
    jwt_secret: str = os.environ["JWT_SECRET"]
    access_token_expire_minutes: int = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    refresh_token_expire_days: int = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    # False on http://localhost. True on CloudFront HTTPS or the browser may drop the cookie.
    cookie_secure: bool = os.environ.get("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")


settings = Settings()
