#!/usr/bin/env python3
"""
beanllm AI Sidecar for beanCli — FastAPI + SSE Streaming

Connects to beanllm's full capabilities:
  - SSE streaming chat (/chat/stream)
  - Non-streaming chat (/chat)
  - Model listing (/models)
  - Agentic mode (/chat/agentic)

Usage:
    python3 scripts/ai-sidecar.py

    # or with uvicorn directly:
    BEANLLM_PATH=../beanllm uvicorn scripts.ai-sidecar:app --port 3200

Environment:
    BEANLLM_MODEL   Default model (default: qwen2.5:0.5b)
    BEANLLM_PATH    Path to beanllm install (default: ../beanllm)
    BEANLLM_PORT    Port to listen on (default: 3200)
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import AsyncIterator

BEANLLM_PATH = os.getenv("BEANLLM_PATH", str(Path(__file__).parent.parent.parent / "beanllm"))
BEANLLM_MODEL = os.getenv("BEANLLM_MODEL", "qwen2.5:0.5b")
BEANLLM_PORT = int(os.getenv("BEANLLM_PORT", "3200"))

sys.path.insert(0, str(Path(BEANLLM_PATH) / "src"))

beanllm_env = Path(BEANLLM_PATH) / ".env"
if beanllm_env.exists():
    for line in beanllm_env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip()
            if key and value and key not in os.environ:
                os.environ[key] = value

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, StreamingResponse
    import uvicorn
except ImportError:
    print("ERROR: fastapi and uvicorn are required.")
    print("  pip install fastapi uvicorn")
    sys.exit(1)


app = FastAPI(title="beanllm Sidecar", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_client = None
_client_ready = False
_registry = None


def _get_client():
    global _client, _client_ready
    if _client_ready:
        return _client
    try:
        from beanllm import Client
        _client = Client(model=BEANLLM_MODEL)
        _client_ready = True
    except Exception as e:
        print(f"  beanllm Client init failed: {e}")
        _client = None
        _client_ready = True
    return _client


def _get_registry():
    global _registry
    if _registry is not None:
        return _registry
    try:
        from beanllm.infrastructure.registry import get_model_registry
        _registry = get_model_registry()
    except Exception:
        _registry = None
    return _registry


def _extract_sql(text: str) -> str | None:
    patterns = [
        r"```sql\s*\n(.*?)```",
        r"```\s*\n((?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|EXPLAIN).*?)```",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).strip()
    lines = text.strip().split("\n")
    sql_lines: list[str] = []
    capturing = False
    for line in lines:
        stripped = line.strip().upper()
        if not capturing and any(
            stripped.startswith(kw)
            for kw in ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "EXPLAIN"]
        ):
            capturing = True
        if capturing:
            sql_lines.append(line)
            if line.rstrip().endswith(";"):
                break
    return "\n".join(sql_lines).strip() if sql_lines else None


# ─── Endpoints ───────────────────────────────────────────


@app.get("/health")
async def health():
    client = _get_client()
    registry = _get_registry()
    providers: list[str] = []
    if registry:
        try:
            providers = [p.name for p in registry.get_active_providers()]
        except Exception:
            pass
    return {
        "status": "ok" if client else "degraded",
        "model": BEANLLM_MODEL,
        "client_ready": client is not None,
        "active_providers": providers,
    }


@app.post("/chat")
async def chat(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model")
    temperature = body.get("temperature", 0.7)

    if not messages:
        return JSONResponse(status_code=400, content={"error": "messages required"})

    client = _get_client()
    if client is None:
        return JSONResponse(
            status_code=503,
            content={"error": "beanllm client not available", "sql": None},
        )

    use_model = model or BEANLLM_MODEL
    try:
        from beanllm import Client
        c = Client(model=use_model)
        response = await c.chat(
            messages=[{"role": m["role"], "content": m["content"]} for m in messages],
            temperature=temperature,
        )
        content = response.content if hasattr(response, "content") else str(response)
        sql = _extract_sql(content)
        return {"content": content, "sql": sql, "model": use_model}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "content": f"Error: {e}", "sql": None},
        )


@app.post("/chat/stream")
async def chat_stream(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model")
    temperature = body.get("temperature", 0.7)
    system = body.get("system", "")

    if not messages:
        return JSONResponse(status_code=400, content={"error": "messages required"})

    use_model = model or BEANLLM_MODEL

    async def event_generator() -> AsyncIterator[str]:
        full_content = ""
        try:
            from beanllm import Client
            c = Client(model=use_model)
            stream = c.stream_chat(
                messages=[{"role": m["role"], "content": m["content"]} for m in messages],
                system=system,
                temperature=temperature,
            )
            async for chunk in stream:
                full_content += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            return

        sql = _extract_sql(full_content)
        yield f"data: {json.dumps({'type': 'done', 'content': full_content, 'sql': sql, 'model': use_model})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.get("/models")
async def list_models():
    registry = _get_registry()
    if registry is None:
        return {
            "models": [{"name": BEANLLM_MODEL, "provider": "default", "active": True}],
            "default": BEANLLM_MODEL,
            "providers": [],
        }

    try:
        models = registry.get_available_models()
        active_providers = {p.name for p in registry.get_active_providers()}
        model_list = []
        for m in models:
            model_list.append({
                "name": m.model_name,
                "provider": m.provider,
                "active": m.provider in active_providers,
            })
        return {
            "models": model_list,
            "default": BEANLLM_MODEL,
            "providers": list(active_providers),
        }
    except Exception as e:
        return {
            "models": [{"name": BEANLLM_MODEL, "provider": "default", "active": True}],
            "default": BEANLLM_MODEL,
            "providers": [],
            "error": str(e),
        }


@app.post("/chat/agentic")
async def chat_agentic(request: Request):
    """Agentic chat — intent classification + tool routing (if beanllm supports it)."""
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model")
    temperature = body.get("temperature", 0.7)
    system = body.get("system", "")

    if not messages:
        return JSONResponse(status_code=400, content={"error": "messages required"})

    use_model = model or BEANLLM_MODEL

    try:
        from beanllm.agentic.orchestrator import AgenticOrchestrator
        from beanllm.agentic.classifier import IntentClassifier

        classifier = IntentClassifier(model=use_model)
        last_msg = messages[-1]["content"] if messages else ""
        intent_result = await classifier.classify(last_msg)

        async def agentic_generator() -> AsyncIterator[str]:
            yield f"data: {json.dumps({'type': 'intent', 'intent': intent_result.intent, 'confidence': intent_result.confidence})}\n\n"

            orchestrator = AgenticOrchestrator(model=use_model)
            full_content = ""
            async for chunk in orchestrator.execute_stream(
                messages=messages,
                intent=intent_result,
                system=system,
                temperature=temperature,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

            sql = _extract_sql(full_content)
            yield f"data: {json.dumps({'type': 'done', 'content': full_content, 'sql': sql, 'model': use_model, 'intent': intent_result.intent})}\n\n"

        return StreamingResponse(
            agentic_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    except ImportError:
        async def fallback_generator() -> AsyncIterator[str]:
            yield f"data: {json.dumps({'type': 'intent', 'intent': 'chat', 'confidence': 1.0})}\n\n"

            full_content = ""
            try:
                from beanllm import Client
                c = Client(model=use_model)
                stream = c.stream_chat(
                    messages=[{"role": m["role"], "content": m["content"]} for m in messages],
                    system=system,
                    temperature=temperature,
                )
                async for chunk in stream:
                    full_content += chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                return

            sql = _extract_sql(full_content)
            yield f"data: {json.dumps({'type': 'done', 'content': full_content, 'sql': sql, 'model': use_model, 'intent': 'chat'})}\n\n"

        return StreamingResponse(
            fallback_generator(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )


if __name__ == "__main__":
    print(f"\n{'=' * 50}")
    print(f"  beanllm AI Sidecar (FastAPI)")
    print(f"{'=' * 50}")
    print(f"  Port:  {BEANLLM_PORT}")
    print(f"  Model: {BEANLLM_MODEL}")
    print(f"  Path:  {BEANLLM_PATH}")

    asyncio.get_event_loop().run_in_executor(None, _get_client)

    print(f"  Listening on http://0.0.0.0:{BEANLLM_PORT}")
    print(f"{'=' * 50}\n")

    uvicorn.run(app, host="0.0.0.0", port=BEANLLM_PORT, log_level="warning")
