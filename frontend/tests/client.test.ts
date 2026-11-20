import { ApiError, errorMessage, qs, request } from "@/services/client";

describe("api client", () => {
  beforeEach(() => {
    document.cookie = "cp_csrf=tok123";
    vi.restoreAllMocks();
  });

  it("sends CSRF header on mutations only", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await request("POST", "/api/x", { a: 1 });
    await request("GET", "/api/y");
    const post = f.mock.calls[0][1] as RequestInit;
    const get = f.mock.calls[1][1] as RequestInit;
    expect((post.headers as Record<string, string>)["X-CSRF-Token"]).toBe("tok123");
    expect((get.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
    expect(post.credentials).toBe("include");
  });

  it("refreshes once on 401 then retries", async () => {
    const f = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "token_expired", message: "x" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(request("GET", "/api/jobs")).resolves.toEqual({ ok: 1 });
    expect(f.mock.calls[1][0]).toBe("/api/auth/refresh");
  });

  it("maps error envelopes to ApiError with readable validation messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "validation_error", message: "Invalid",
      details: [{ loc: ["body", "password"], msg: "too short" }] } }), { status: 422 }));
    const e = await request("POST", "/api/auth/register", {}).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(errorMessage(e)).toBe("password: too short");
  });

  it("builds query strings skipping empty values", () => {
    expect(qs({ a: 1, b: "", c: undefined, d: ["x", "y"], e: false })).toBe("?a=1&d=x%2Cy&e=false");
  });
});
