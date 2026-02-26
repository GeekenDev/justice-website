import { NextRequest, NextResponse } from "next/server";
import {
  getDeletedDocDescriptions,
  getTopUpvotedDeletedDocs,
  saveDeletedDocDescriptions,
} from "@/lib/db";

export const dynamic = "force-dynamic";

function inProd() {
  return process.env.NODE_ENV === "production";
}

export async function GET(request: NextRequest) {
  if (inProd()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "200");
    const topRows = await getTopUpvotedDeletedDocs(limit);
    const descriptions = await getDeletedDocDescriptions(
      topRows.map((row) => row.efta_id),
    );

    return NextResponse.json({
      rows: topRows.map((row) => ({
        efta_id: row.efta_id,
        dataset: row.dataset,
        vote_count: row.vote_count,
        original_link: row.original_link,
        document_description: descriptions[row.efta_id] ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load admin deleted descriptions", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (inProd()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      eftaId?: string;
      documentDescription?: string | null;
    };

    const eftaId = (body.eftaId ?? "").trim().toUpperCase();
    if (!eftaId) {
      return NextResponse.json({ error: "Missing eftaId" }, { status: 400 });
    }

    const normalizedDescription =
      typeof body.documentDescription === "string"
        ? body.documentDescription.trim() || null
        : null;

    await saveDeletedDocDescriptions([
      {
        eftaId,
        documentDescription: normalizedDescription,
      },
    ]);

    return NextResponse.json({
      ok: true,
      eftaId,
      documentDescription: normalizedDescription,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save admin deleted description", details: String(error) },
      { status: 500 },
    );
  }
}
