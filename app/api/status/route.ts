import { NextResponse } from "next/server";
import { databaseConfigured } from "@/lib/db";
import { visionConfigured } from "@/lib/vision";

export async function GET() {
  return NextResponse.json({
    databaseConfigured: databaseConfigured(),
    visionConfigured: visionConfigured(),
    storage: databaseConfigured() ? "mongodb" : "local-demo",
  });
}