import { SOURCES } from "@/lib/sources";

/** GET /api/sources — every portal checked, including ones that are not fetched. */
export function GET() {
  return Response.json(SOURCES);
}
