import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../common/decorators";
import { moduleEnabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeUiPreferences, type UiPreferences } from "./ui-preferences";

function requireFlag() {
  if (!moduleEnabled("FF_M15_WCAG")) throw new BadRequestException({ error: "module_disabled" });
}

@Injectable()
export class UiPreferencesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async get(user: AuthUser): Promise<UiPreferences> {
    requireFlag();
    const row = await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.userUiPreference.findUnique({ where: { userId: user.id } }),
    );
    return normalizeUiPreferences(row);
  }

  async put(user: AuthUser, input: Partial<UiPreferences>): Promise<UiPreferences> {
    requireFlag();
    const prefs = normalizeUiPreferences(input);
    await this.prisma.withContext({ role: user.role, userId: user.id }, (tx) =>
      tx.userUiPreference.upsert({
        where: { userId: user.id },
        update: prefs,
        create: { userId: user.id, ...prefs },
      }),
    );
    await this.audit.log({
      actorId: user.id,
      actorRole: user.role,
      action: "ui.preferences.update",
      objectType: "user_ui_preferences",
      objectId: user.id,
      meta: { theme: prefs.theme, contrast: prefs.contrast, reducedMotion: prefs.reducedMotion },
    });
    return prefs;
  }
}
