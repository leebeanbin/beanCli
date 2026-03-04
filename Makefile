.PHONY: up down infra build logs ps clean migrate help

# ── Full stack (build + start everything) ────────────────────
up:
	docker compose --profile app up -d --build

# ── Infra only (Postgres + Kafka, no app containers) ─────────
infra:
	docker compose up -d

# ── Stop all containers ───────────────────────────────────────
down:
	docker compose --profile app down

# ── Build images without starting ────────────────────────────
build:
	docker compose --profile app build

# ── Run DB migrations manually ───────────────────────────────
migrate:
	docker compose --profile app run --rm migrate

# ── Follow logs (all services) ───────────────────────────────
logs:
	docker compose --profile app logs -f

# ── Show running containers ───────────────────────────────────
ps:
	docker compose --profile app ps

# ── Remove containers + volumes (destructive!) ───────────────
clean:
	docker compose --profile app down -v --remove-orphans

help:
	@echo ""
	@echo "  BeanCLI Docker Commands"
	@echo "  ─────────────────────────────────────────────────"
	@echo "  make up       Build images & start all services"
	@echo "  make infra    Start infra only (Postgres + Kafka)"
	@echo "  make down     Stop all containers"
	@echo "  make build    Build Docker images (no start)"
	@echo "  make migrate  Run DB migrations"
	@echo "  make logs     Tail logs for all services"
	@echo "  make ps       Show container status"
	@echo "  make clean    Remove containers + volumes"
	@echo ""
	@echo "  Ports: web=3000  api=3100  kafka-ui=8080  pg=5432"
	@echo ""
