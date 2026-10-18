import { EXAMPLE_CACHE_HEADERS, loadExample } from "@/examples/cached-answers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/examples/[slug]">,
) {
  const { slug } = await params;
  try {
    const example = await loadExample(db, slug);
    return example
      ? Response.json(example, { headers: EXAMPLE_CACHE_HEADERS })
      : Response.json({ error: "example not found" }, { status: 404 });
  } catch (error) {
    logger.error({ err: error, slug }, "example failed to load");
    return Response.json({ error: "example failed to load" }, { status: 500 });
  }
}
