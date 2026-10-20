# Zifo task app — low-level design

AWS account `229691749767` · region `ap-southeast-2` · CloudFront `E4EDW133P7EXJ`

The browser talks to **one hostname**: `https://d1fh72q9mw0l25.cloudfront.net`. React uses relative `/api/auth` and `/api/tasks`. It never calls S3, ECS, or RDS. Locally nginx `:3000` (or Docker `:9000`) did the same job.

Open [lld.html](lld.html) in a browser → **Ctrl+P** → **Save as PDF** for a downloadable copy.

## Dummy story

1. Person opens the CloudFront URL (HTTPS 443). That is the shop front.
2. HTML/JS/CSS come from a locked S3 cupboard. Only CloudFront has the key (OAC + bucket policy).
3. Login and tasks go through an ALB: `/api/auth*` → auth, `/api/tasks*` → task.
4. Each service uses its own Postgres database on one RDS instance. Secrets are in Secrets Manager, not GitHub.

## Runtime

```mermaid
flowchart TB
  U[Browser] -->|HTTPS 443| CF[CloudFront d1fh72q9mw0l25.cloudfront.net]
  CF -->|/api/auth*| B1[Behavior auth CachingDisabled AllViewerExceptHostHeader]
  CF -->|/api/tasks*| B2[Behavior tasks same policies]
  CF -->|* else| B0[Default GET HEAD CachingOptimized spa-index-rewrite headers policy]
  B0 -->|OAC signed GET 443| S3[S3 jayan-zifo-test private]
  B1 -->|HTTP 80| ALB[ALB jayan-test-zifo-alb SG alb inbound 80]
  B2 -->|HTTP 80| ALB
  ALB -->|/api/auth*| TG1[TG auth HTTP 8000 /health]
  ALB -->|/api/tasks*| TG2[TG task HTTP 8000 /health]
  ALB -->|other paths| R404[fixed 404]
  TG1 -->|8000 from ALB SG| AUTH[ECS auth jayan/zifo-auth:latest]
  TG2 -->|8000 from ALB SG| TASK[ECS task jayan/zifo-task:latest]
  AUTH -->|5432 from ECS SG| RDS[RDS database-1 DBs auth and task]
  TASK --> RDS
  SM[Secrets Manager three secrets] -.-> AUTH
  SM -.-> TASK
```

## Path split

```mermaid
flowchart LR
  REQ[Request URI] --> Q{match}
  Q -->|/api/auth*| A[ALB then ECS auth :8000]
  Q -->|/api/tasks*| T[ALB then ECS task :8000]
  Q -->|/login /register no dot| F[Function rewrites to /index.html]
  Q -->|/assets/*.js has a dot| S[S3 object as-is]
  Q -->|/ | R[default root index.html]
  F --> S3[S3 bucket]
  S --> S3
  R --> S3
```

Function `spa-index-rewrite` is on the **S3 behavior only**.

## Login and tokens

```mermaid
sequenceDiagram
  participant B as Browser
  participant CF as CloudFront 443
  participant S3 as S3
  participant ALB as ALB 80
  participant Auth as ECS auth 8000
  participant DB as RDS auth
  participant Task as ECS task 8000
  B->>CF: GET /
  CF->>S3: OAC GetObject index.html
  S3-->>B: SPA
  B->>CF: POST /api/auth/login
  CF->>ALB: HTTP POST Cookie and body
  ALB->>Auth: port 8000
  Auth->>DB: bcrypt verify
  Auth-->>B: access_token JSON plus refresh cookie Path=/api/auth HttpOnly Secure SameSite=Lax
  Note over B: access JWT only in Redux
  B->>CF: GET /api/tasks Authorization Bearer
  CF->>ALB: Authorization forwarded
  ALB->>Task: port 8000
  Task->>Task: verify HS256 with shared JWT_SECRET
```

ECS sets `COOKIE_SECURE=true`. Local Compose uses `false`.

## Deploy

```mermaid
flowchart TB
  GIT[git push main] --> GHA[GitHub Actions]
  GHA -->|frontend/** IAM keys| S3[s3 sync dist to jayan-zifo-test]
  GHA -->|auth-service/**| ECR1[ECR jayan/zifo-auth:latest]
  GHA -->|task-service/**| ECR2[ECR jayan/zifo-task:latest]
  ECR1 -.-> AUTH[ECS auth needs new deployment to pick image]
  ECR2 -.-> TASK[ECS task]
  S3 -.-> CF[CloudFront may cache old index.html]
```

CI uses GitHub `AWS_*` secrets. It does not read Secrets Manager. ECS uses ARN suffix `:DATABASE_URL::` / `:JWT_SECRET::`.

## Ports

| Hop | Port | Allow |
| --- | --- | --- |
| Browser → CloudFront | 443 | Internet |
| CloudFront → S3 | 443 | Distribution E4EDW133P7EXJ via OAC + bucket policy |
| CloudFront → ALB | 80 | SG `jayan-test-zifo-alb` inbound 80 |
| ALB → ECS | 8000 | SG `jayan-test-zifo-ecs` inbound 8000 from ALB SG |
| ECS → RDS | 5432 | SG `jayan-test-zifo-rds` inbound 5432 from ECS SG |
| GitHub Actions → AWS APIs | 443 | IAM keys in GitHub |

## Named resources

| Piece | Name |
| --- | --- |
| CloudFront | https://d1fh72q9mw0l25.cloudfront.net |
| S3 | jayan-zifo-test |
| SPA function | spa-index-rewrite |
| Headers | zifo-spa-security-headers |
| ALB | jayan-test-zifo-alb-1511092230.ap-southeast-2.elb.amazonaws.com |
| TGs | jayan-test-zifo-auth-tg, jayan-test-zifo-task-tg |
| ECS | cluster jayan-test-zifo, services auth / task |
| ECR | jayan/zifo-auth, jayan/zifo-task |
| RDS | database-1, databases auth and task |
| Secrets | jayan-zifo/auth/database-url, jayan-zifo/task/database-url, jayan-zifo/jwt-secret |
| VPC | vpc-0bb18839614a614d0 |

Do not use the ALB DNS or S3 URL as the product site. Do not attach `spa-index-rewrite` to API behaviors.
