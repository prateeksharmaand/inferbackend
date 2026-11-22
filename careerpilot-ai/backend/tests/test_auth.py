def test_register_login_me_logout(client):
    r = client.post("/api/auth/register", json={"email": "A@Example.com", "password": "correct-horse-1"})
    assert r.status_code == 201
    assert r.json()["email"] == "a@example.com"
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    r = client.post("/api/auth/login", json={"email": "a@example.com", "password": "correct-horse-1"})
    assert r.status_code == 200
    assert client.get("/api/auth/me").json()["email"] == "a@example.com"


def test_password_hash_is_argon2id(client, db):
    from app.models import User
    client.post("/api/auth/register", json={"email": "x@example.com", "password": "correct-horse-1"})
    u = db.query(User).one()
    assert u.password_hash.startswith("$argon2id$")


def test_weak_password_rejected(client):
    r = client.post("/api/auth/register", json={"email": "a@example.com", "password": "short"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_duplicate_email(client):
    client.post("/api/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    client.cookies.clear()
    r = client.post("/api/auth/register", json={"email": "A@example.com", "password": "correct-horse-1"})
    assert r.status_code == 409


def test_wrong_password_and_lockout(client):
    client.post("/api/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    client.cookies.clear()
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "a@example.com", "password": "nope-nope-nope"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "a@example.com", "password": "correct-horse-1"})
    assert r.status_code == 423


def test_protected_endpoint_requires_auth(client):
    assert client.get("/api/profile").status_code == 401


def test_csrf_required_for_mutations(auth_client):
    r = auth_client.patch("/api/profile", json={"location": "Jaipur"}, headers={"X-CSRF-Token": "wrong"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"
    assert auth_client.patch("/api/profile", json={"location": "Jaipur"}).status_code == 200


def test_refresh_rotation_and_reuse_detection(auth_client):
    old = auth_client.cookies.get("cp_refresh")
    assert auth_client.post("/api/auth/refresh").status_code == 200
    new = auth_client.cookies.get("cp_refresh")
    assert new and new != old
    # Replaying the old (rotated) token revokes the whole family
    auth_client.cookies.clear()
    auth_client.cookies.set("cp_refresh", old)
    r = auth_client.post("/api/auth/refresh")
    assert r.status_code == 401 and r.json()["error"]["code"] == "token_reused"
    auth_client.cookies.clear()
    auth_client.cookies.set("cp_refresh", new)
    assert auth_client.post("/api/auth/refresh").status_code == 401


def test_registration_closed(client, monkeypatch):
    from app.core.config import settings
    client.post("/api/auth/register", json={"email": "a@example.com", "password": "correct-horse-1"})
    monkeypatch.setattr(settings, "ALLOW_REGISTRATION", False)
    client.cookies.clear()
    r = client.post("/api/auth/register", json={"email": "b@example.com", "password": "correct-horse-1"})
    assert r.status_code == 403


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
