import { NextRequest, NextResponse } from "next/server";
import { getFilesChangeLogDailySummariesByDayKeys } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const dayParams = request.nextUrl.searchParams.getAll("day");
    const timeZone = request.nextUrl.searchParams.get("tz")?.trim() || "UTC";
    const days = await getFilesChangeLogDailySummariesByDayKeys(dayParams, {
      timeZone,
    });

    return NextResponse.json({
      days,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load daily log summary",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
