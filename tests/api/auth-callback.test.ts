import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  exchange: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: {
      exchangeCodeForSession: fake.exchange,
      verifyOtp: fake.verify,
    },
  }),
}));

import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    fake.exchange.mockReset();
    fake.verify.mockReset();
  });

  it("exchanges a PKCE code and redirects to a safe in-app path", async () => {
    fake.exchange.mockResolvedValue({ error: null });
    const res = await GET(new Request("http://localhost:3000/auth/callback?code=abc&next=%2Fapp%2Fconnections%3Fwelcome%3D1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app/connections?welcome=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fake.exchange).toHaveBeenCalledWith("abc");
  });

  it("verifies a token_hash link", async () => {
    fake.verify.mockResolvedValue({ error: null });
    const res = await GET(new Request("http://localhost:3000/auth/callback?token_hash=t&type=signup"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
    expect(fake.verify).toHaveBeenCalledWith({ token_hash: "t", type: "signup" });
  });

  it("never follows an off-site next", async () => {
    fake.exchange.mockResolvedValue({ error: null });
    const res = await GET(new Request("http://localhost:3000/auth/callback?code=abc&next=https%3A%2F%2Fevil.example"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("sends failures and bare visits back to login with a notice", async () => {
    fake.exchange.mockResolvedValue({ error: { message: "invalid" } });
    const failed = await GET(new Request("http://localhost:3000/auth/callback?code=bad"));
    expect(failed.headers.get("location")).toBe("http://localhost:3000/login?notice=link_invalid");
    const bare = await GET(new Request("http://localhost:3000/auth/callback"));
    expect(bare.headers.get("location")).toBe("http://localhost:3000/login?notice=link_invalid");
    expect(fake.verify).not.toHaveBeenCalled();
  });
});
