# Task management microservices

Two Python services and a React UI. Auth owns accounts and sessions. The task service owns tasks. Each has its own Postgres database.

## Run on localhost

Install nginx on this machine. On Windows, download the zip from https://nginx.org/en/download.html and unpack it.

Postgres is already running, with databases `auth` and `task`. Four processes:

```powershell
cd auth-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://auth:auth@localhost:5432/auth"
$env:JWT_SECRET = "dev-only-change-me"
uvicorn app.main:app --port 8080
```

```powershell
cd task-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://task:task@localhost:5432/task"
$env:JWT_SECRET = "dev-only-change-me"
uvicorn app.main:app --port 8081
```

```powershell
cd frontend
npm install
npm run dev
```

Vite listens on 5173. Point nginx at [frontend/nginx.local.conf](frontend/nginx.local.conf) (include it from `nginx.conf`, or copy the `server` block into `conf/nginx.conf`) and start nginx.

Open http://localhost:3000. nginx forwards `/api/auth` to port 8080, `/api/tasks` to port 8081, and everything else to Vite. The React app still calls relative `/api/...` paths.

Containers are the later step: `docker compose up --build`, then http://localhost:9000. The frontend image uses [frontend/nginx.conf](frontend/nginx.conf). Same path split, Docker service names instead of `127.0.0.1`. The UI code does not change. `docker compose down` keeps the database volumes. `docker compose down -v` deletes them.

## Architecture

The browser talks to one hostname and uses relative `/api/...` paths. nginx is that hostname. On localhost it is installed on the machine and listens on port 3000. In the container it is the frontend image. In AWS, CloudFront does the same split. The React calls stay the same.

```text
Browser
  http://localhost:3000   (nginx, phase 1)
    /              Vite on 5173
    /api/auth/*    auth on 8080
    /api/tasks/*   tasks on 8081
```

Auth does not sit on the task request path. The task service checks the access JWT locally with the shared `JWT_SECRET`.

## Tokens

The access token is an HS256 JWT. It carries `sub` (user id), `email`, and `exp`, and it lasts about 15 minutes. Both services share `JWT_SECRET`, so the task service could also sign a token. This project accepts that.

The refresh token is a random opaque string, not a JWT, and it lasts about 7 days. The auth database stores only its SHA-256 hash, plus `user_id`, `expires_at`, and `revoked_at`. A database leak does not reveal a usable refresh token. Login and refresh return a new pair. Refresh revokes the presented row and stores a new hash, so a reused refresh token is rejected. Logout revokes the current row. The task service never sees the refresh token; an opaque string fails JWT verification.

The access token stays in the Redux store and is sent as `Authorization: Bearer …`. The refresh token is an `HttpOnly` cookie on `/api/auth`, so JavaScript cannot read it. A reload calls `/api/auth/refresh` before showing login, and the new access token goes back into Redux. On a 401 the client does that refresh once and retries.

`user_id` on a task comes only from the token `sub`. The client cannot set it. A task owned by someone else is queried with that `user_id` and returns 404, the same as a missing task. There is no foreign key: the user row lives in the other database.

Passwords are hashed with bcrypt. Queries go through SQLAlchemy parameters, so request text is never concatenated into SQL. Task titles are rendered as React text, which escapes HTML. Do not render them with `dangerouslySetInnerHTML`. A script that is already running on the page can still read the Redux variable; memory only guarantees the token is gone after a reload.

Tables are created on startup with SQLAlchemy `create_all`. That creates missing tables and does not alter or wipe existing ones. Changing a column later wants Alembic. Docker volumes keep the rows across restarts.

## API

Auth (`/api/auth`):

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| POST | `/register` | `name`, `email`, `password` | 201 and a token pair |
| POST | `/login` | `email`, `password` | token pair |
| POST | `/refresh` | refresh cookie | new access token, cookie rotated |
| POST | `/logout` | refresh cookie | 204, cookie cleared, row revoked |
| GET | `/me` | `Authorization: Bearer` | `id`, `name`, `email` |

Tasks (`/api/tasks`), all requiring a bearer access token:

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/tasks` | current user's tasks, newest first |
| POST | `/api/tasks` | `title`, optional `description`, optional `status` |
| PATCH | `/api/tasks/{id}` | title, description, or status |
| DELETE | `/api/tasks/{id}` | 204 |

`status` is `todo`, `in_progress`, or `done`. Health checks are `GET /health` on ports 8001 and 8002.

## Security headers

nginx sets these on the local site. The same list becomes a CloudFront response-headers policy later. Each one is commented in [frontend/nginx.conf](frontend/nginx.conf).

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'` — the Vite build loads only its own script and CSS files. The browser refuses inline scripts and scripts from any other host.
- `X-Content-Type-Options: nosniff` — the browser honors the stated content type and does not sniff a response into a script.
- `X-Frame-Options: DENY` — the app cannot sit in another site's iframe, which blocks clickjacking. `frame-ancestors 'none'` says the same thing to current browsers.
- `Referrer-Policy: no-referrer` — the browser does not send this page's URL to other sites.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — the page cannot request the camera, microphone, or location.
- `Strict-Transport-Security` is left off on `http://localhost`. On HTTPS it tells the browser to keep using HTTPS for this host. Setting it locally makes the browser refuse the demo. Add it only in the CloudFront policy.

## AWS mapping

This is the deployment shape. It is not built in this repo.

Route 53 points the app hostname at CloudFront. The React app still calls relative `/api/auth` and `/api/tasks`.

- Default behavior: a private S3 bucket holding the Vite build. JS, CSS, and `index.html` may be cached.
- `/api/auth/*` and `/api/tasks/*`: the origin is an ALB in front of the two ECS services. Forward the `Authorization` header. Use CachingDisabled.
- Why forward the header: CloudFront's static-file policy drops `Authorization`. The task service would then see no token and return 401 while Redux still holds one.
- Why disable API caching: `GET /api/tasks` depends on the caller and changes when tasks change. A cached JSON response can show one user another user's tasks.
- SPA reload: S3 has no `dashboard` object (this app's client routes are `/`, `/login`, and `/register`). A reload of a client route would otherwise get S3's 403 (private bucket, missing key) or 404, and React would never boot. Use a CloudFront Function on the S3 behavior only: if the path does not start with `/api` and is not a real file, rewrite it to `/index.html`. React then starts, sees an empty Redux store, and redirects to `/login`. A distribution-wide custom error would also rewrite an API 404 into `index.html`, so the function stays on the S3 behavior.
- ALB path rules send `/api/auth/*` and `/api/tasks/*` to the two ECS services. Two RDS databases replace the Postgres containers through `DATABASE_URL`. `JWT_SECRET` and the database passwords come from Secrets Manager.
- The header list above becomes a CloudFront response-headers policy, plus HSTS, because the site is then on HTTPS.

The frontend image is only a local static file server. Production uploads the Vite `dist/` directory to S3. There is no frontend container on ECS.
