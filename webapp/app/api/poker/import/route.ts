import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { POKER_IMPORT_MAX_FILE_BYTES } from "@/lib/poker/import-template";
import {
  importPokerSessionsFromCsv,
  type PokerImportStreamEvent,
} from "@/lib/poker/import-sessions";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const ALLOWED_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
]);

function hasCsvExtension(filename: string): boolean {
  return filename.toLowerCase().endsWith(".csv");
}

function isValidUtf8(buffer: ArrayBuffer): boolean {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function ndjsonLine(event: PokerImportStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing CSV file (field: file)" }, { status: 400 });
  }

  if (!hasCsvExtension(file.name)) {
    console.info("[api/poker/import] rejected extension", { userId: user.id, name: file.name });
    return NextResponse.json({ error: "Only .csv files are accepted" }, { status: 400 });
  }

  const mime = (file.type || "").toLowerCase();
  if (mime && !ALLOWED_MIME_TYPES.has(mime)) {
    console.info("[api/poker/import] rejected mime", { userId: user.id, mime });
    return NextResponse.json({ error: "Invalid file type — CSV only" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  if (file.size > POKER_IMPORT_MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (max ${Math.round(POKER_IMPORT_MAX_FILE_BYTES / 1024)} KB)`,
      },
      { status: 400 }
    );
  }

  const buffer = await file.arrayBuffer();
  if (!isValidUtf8(buffer)) {
    return NextResponse.json({ error: "File must be valid UTF-8 text" }, { status: 400 });
  }

  const csvText = new TextDecoder("utf-8").decode(buffer);
  if (!csvText.trim()) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();

  console.info("[api/poker/import] starting", {
    userId: user.id,
    fileName: file.name,
    bytes: file.size,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PokerImportStreamEvent) => {
        controller.enqueue(ndjsonLine(event));
      };

      try {
        const result = await importPokerSessionsFromCsv(supabase, user.id, csvText, (progress) => {
          send({ type: "progress", ...progress });
        });

        if (!result.ok) {
          console.info("[api/poker/import] failed", {
            userId: user.id,
            errors: result.errors.length,
            rolledBack: result.rolledBack ?? false,
          });
          send({
            type: "error",
            error: result.errors[0]?.message ?? "Import failed",
            errors: result.errors,
            rolledBack: result.rolledBack ?? false,
            partialCount: result.partialCount,
          });
          return;
        }

        console.info("[api/poker/import] success", {
          userId: user.id,
          imported: result.imported,
          warnings: result.warnings.length,
          ledgerSynced: result.ledgerSynced,
        });

        send({
          type: "complete",
          imported: result.imported,
          warnings: result.warnings,
          sessions: result.sessions,
          ledgerSynced: result.ledgerSynced,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Import failed";
        console.error("[api/poker/import] stream error", { userId: user.id, msg });
        send({
          type: "error",
          error: msg,
          errors: [{ row: 0, message: msg }],
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
