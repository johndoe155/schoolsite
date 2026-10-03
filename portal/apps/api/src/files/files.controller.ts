import {
  BadRequestException, Controller, Get, Inject, NotFoundException, Param, Post, Req,
  Res, UploadedFile, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Request, Response } from "express";
import { FilesService } from "./files.service";
import { config } from "../config";
import { Perm } from "../common/guards";
import { insertAudit } from "../common/audit";
import { withActor } from "../db/actor";
import { DB_TOKEN } from "../db/token";
import type { Db } from "../db/client";

/**
 * File upload + download. Uploading requires a signed-in account with a
 * capability (students upload homework, staff upload materials); downloading
 * requires nothing beyond being allowed to see the file, which is decided by
 * RLS on every request.
 */
@Controller()
export class FilesController {
  constructor(
    private svc: FilesService,
    @Inject(DB_TOKEN) private db: Db,
  ) {}

  /**
   * POST /files — multipart, field name `file`.
   *
   * The temp copy goes to the OS temp dir, not the destination: only
   * FilesService.store() decides what is acceptable, and it does so after
   * hashing. A failed upload therefore leaves nothing behind in the store.
   */
  /* Any signed-in account may upload: a pupil hands in homework, a teacher
     posts a resource. Authority is the permission to attach the file to
     something (checked by the classwork/messaging endpoints), plus RLS on
     read. A parent never reaches here — ParentGuard blocks the write. */
  @Post("files")
  @UseInterceptors(FileInterceptor("file", {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        const tmp = `${config.files.dir}/tmp`;
        fs.mkdirSync(tmp, { recursive: true });
        cb(null, tmp);
      },
      filename: (_req, _file, cb) => cb(null, `incoming-${randomUUID()}`),
    }),
    limits: { fileSize: config.files.maxUploadMb * 1024 * 1024, files: 1 },
  }))
  async upload(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: "no_file",
        detail: "Attach the file as the 'file' field of a multipart form.",
      });
    }
    const p = req.principal!;
    try {
      const row = await this.svc.store({
        ownerUserId: p.userId,
        tempPath: file.path,
        filename: file.originalname,
        mimeType: file.mimetype,
      });
      await withActor(this.db, { userId: p.userId, role: p.activeRole }, (tx) =>
        insertAudit(tx, {
          actorUserId: p.userId, action: "file.uploaded", entityType: "file",
          entityId: row.id, after: { filename: row.filename, bytes: row.bytes }, ip: req.ip,
        }));
      res.status(201);
      return {
        id: row.id, filename: row.filename, mimeType: row.mimeType,
        bytes: row.bytes, sha256: row.sha256,
      };
    } catch (err) {
      // Never leave an orphan temp file because validation failed downstream.
      if (file.path) fs.rmSync(file.path, { force: true });
      throw err;
    }
  }

  /**
   * GET /files/:id — the only way to reach stored bytes.
   *
   * Served as an attachment by default: a school's uploads are documents, and
   * rendering untrusted HTML/SVG inline in the portal's origin is exactly how
   * a stored-XSS gets invited in. Images are the one exception (they are
   * useful inline and are covered by the MIME allowlist + nosniff).
   */
  @Get("files/:id")
  async download(
    @Req() req: Request,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const p = req.principal!;
    const row = await this.svc.readable({ userId: p.userId, role: p.activeRole }, id);
    if (!row) throw new NotFoundException({ code: "not_found" });

    const abs = this.svc.pathFor(row.storedName);
    if (!fs.existsSync(abs)) {
      throw new NotFoundException({ code: "file_missing" });
    }
    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Length", String(row.bytes));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    const inline = row.mimeType.startsWith("image/") && row.mimeType !== "image/svg+xml";
    const safeName = row.filename.replace(/["\\\r\n]/g, "");
    res.setHeader("Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    fs.createReadStream(abs).pipe(res);
  }
}
