import { db } from "@/lib/db";
import { handleSearchRequest } from "@/search/handle-search";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const { status, body } = await handleSearchRequest(db, payload);
  return Response.json(body, { status });
}
