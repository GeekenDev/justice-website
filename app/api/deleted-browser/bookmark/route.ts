import { NextRequest, NextResponse } from "next/server";
import { bookmarkDeletedDoc, getDeletedDocBookmarkByEftaId } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const eftaId = searchParams.get("eftaId")?.trim() ?? "";
    if (!eftaId) {
      return NextResponse.json({ error: "Missing eftaId" }, { status: 400 });
    }

    const result = await getDeletedDocBookmarkByEftaId(eftaId, voterId);
    return NextResponse.json({
      eftaId: eftaId.toUpperCase(),
      bookmarked: result.bookmarked,
      note: result.note,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load bookmark note", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const voterId = request.headers.get("x-voter-id")?.trim() ?? "";
    if (!voterId) {
      return NextResponse.json({ error: "Missing voter ID" }, { status: 400 });
    }

    const body = (await request.json()) as {
      eftaId?: string;
      dataset?: string | null;
      filePath?: string | null;
      sources?: {
        original_link?: string | null;
        doj_link?: string | null;
      };
      note?: string | null;
    };

    const eftaId = body.eftaId?.trim() ?? "";
    if (!eftaId) {
      return NextResponse.json({ error: "Missing eftaId" }, { status: 400 });
    }

    const result = await bookmarkDeletedDoc({
      eftaId,
      dataset: body.dataset ?? null,
      filePath: body.filePath ?? null,
      originalLink: body.sources?.original_link ?? null,
      dojLink: body.sources?.doj_link ?? null,
      note: body.note ?? null,
      voterId,
    });

    return NextResponse.json({
      eftaId: eftaId.toUpperCase(),
      alreadyBookmarked: result.alreadyBookmarked,
      totalBookmarks: result.totalBookmarks,
      note: result.note ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to bookmark deleted doc", details: String(error) },
      { status: 500 },
    );
  }
}
