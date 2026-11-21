import { Controller, Get, Inject } from "@nestjs/common";
import { Roles } from "../common/decorators";
import { AuditVerifierService } from "../audit/audit-verifier.service";

@Roles("ADMIN")
@Controller("admin/audit")
export class AuditController {
  constructor(@Inject(AuditVerifierService) private readonly verifier: AuditVerifierService) {}

  @Get("verify")
  verify() {
    return this.verifier.verify();
  }
}
