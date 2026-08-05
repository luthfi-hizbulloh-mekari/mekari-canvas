import { getStorage } from "@/lib/storage";
import { STAGING_RETENTION_MS } from "@/lib/trace-paths";

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();
    const storage = getStorage();
    const slugs = await storage.expiredTraceSlugs(now);
    for (const slug of slugs) await storage.delete(slug);
    const stagedDeleted = await storage.deleteStaleTraceUploads(now);
    return Response.json({
      expiredDeleted: slugs.length,
      stagedDeleted,
      stagingRetentionMinutes: STAGING_RETENTION_MS / 60_000,
    });
  } catch (error) {
    console.error("trace sweep error:", error);
    return Response.json({ error: "Sweep failed" }, { status: 500 });
  }
}
