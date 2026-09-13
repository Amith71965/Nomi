export const runtime = "nodejs";

/** Liveness only. No secrets, account metadata, or provider status here. */
export async function GET(): Promise<Response> {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
