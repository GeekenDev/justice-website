import { NextRequest, NextResponse } from "next/server";
import { reportDeletedDoc } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }

    const body = (await request.json()) as { eftaId?: string };
    const eftaId = body.eftaId?.trim() ?? "";
    if (!eftaId) {
      return NextResponse.json({ error: "Missing eftaId" }, { status: 400 });
    }

    const result = await reportDeletedDoc({ eftaId, voterId });
    return NextResponse.json({
      eftaId: eftaId.toUpperCase(),
      reportCount: result.reportCount,
      alreadyReported: result.alreadyReported,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to report deleted doc", details: String(error) },
      { status: 500 },
    );
  }
}
