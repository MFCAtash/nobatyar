/* eslint-disable */
/**
 * ⚠️ خودکار از apps/api/openapi/openapi.json ساخته شده؛ دستی ویرایش نکنید.
 *   pnpm --filter @nobatyar/api openapi && pnpm --filter @nobatyar/web gen:api
 */
export interface ApiErrorBody { error: string; message?: string }

export interface Operations {
  "GET /admin/analytics/cohorts": {
    params: undefined;
    query: { from?: string; to?: string; maxWeeks?: number };
    body: undefined;
    response: unknown;
  };
  "GET /admin/analytics/experiments": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /admin/analytics/experiments/{key}": {
    params: { key: string };
    query: undefined;
    body: {
      variants: string[];
      enabled: boolean;
    };
    response: unknown;
  };
  "GET /admin/analytics/funnel": {
    params: undefined;
    query: { from?: string; to?: string; maxWeeks?: number };
    body: undefined;
    response: unknown;
  };
  "GET /admin/audit/verify": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      ok: boolean;
      broken: ({
        seq: string;
        reason: string;
      })[];
    };
  };
  "GET /admin/chaos": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/chaos/{target}": {
    params: { target: string };
    query: undefined;
    body: {
      approved: boolean;
      windowFrom?: string;
      windowTo?: string;
    };
    response: unknown;
  };
  "POST /admin/clinics": {
    params: undefined;
    query: undefined;
    body: {
      name: string;
      addressFa: string;
      phone: string;
      geoLat?: number | null;
      geoLng?: number | null;
      verified?: boolean;
    };
    response: unknown;
  };
  "PATCH /admin/clinics/{id}/verify": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /admin/data-requests": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/data-requests/{id}/review": {
    params: { id: string };
    query: undefined;
    body: {
      decision: "APPROVE" | "REJECT";
      note?: string;
    };
    response: {
      id: string;
      status: string;
      approvals: number;
    };
  };
  "GET /admin/dead-letters": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/dead-letters/{id}/escalate": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      id: string;
      escalated: boolean;
      attempts: number;
    };
  };
  "POST /admin/dead-letters/{id}/retry": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /admin/doctor-verifications": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/doctor-verifications/{id}/approve": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/doctor-verifications/{id}/reject": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /admin/finance/summary": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /admin/notification-templates": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/notification-templates/{key}/activate": {
    params: { key: string };
    query: undefined;
    body: {
      version: number;
    };
    response: unknown;
  };
  "GET /admin/organization-plans": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/organization-plans": {
    params: undefined;
    query: undefined;
    body: {
      name: string;
      seats: number;
    };
    response: unknown;
  };
  "GET /admin/organization-plans/{id}/seats": {
    params: { id: string };
    query: { used: number };
    body: undefined;
    response: unknown;
  };
  "GET /admin/payments": {
    params: undefined;
    query: { status?: "INITIATED" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED"; attention?: "true" | "false" | "1" | "0"; limit?: number };
    body: undefined;
    response: unknown;
  };
  "GET /admin/policies": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      aggregate: "APPOINTMENT";
      version: number;
      mermaid: string;
      invariants: string[];
    };
  };
  "POST /admin/policies/{version}/activate": {
    params: { version: string };
    query: undefined;
    body: {
      version: number;
    };
    response: {
      ok: boolean;
      version: number;
    };
  };
  "POST /admin/policies/simulate": {
    params: undefined;
    query: undefined;
    body: {
      version?: number;
      action: "CONFIRM" | "DOCTOR_CANCEL" | "PATIENT_CANCEL" | "START" | "COMPLETE" | "REPORT_PATIENT_NO_SHOW" | "REPORT_DOCTOR_NO_SHOW" | "EXPIRE" | "PAYMENT_SUCCEEDED";
      from: "PENDING_PAYMENT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_DOCTOR" | "EXPIRED" | "NO_SHOW_PATIENT" | "NO_SHOW_DOCTOR";
      startsAt: string;
      endsAt: string;
      autoConfirm?: boolean;
      paidRial?: string;
      now?: string;
    };
    response: {
      plan: {
        ok: boolean;
        to: string | null;
        error: string | null;
        ruleId: string | null;
      };
      rule: string | null;
      refund: string | null;
      steps: string[];
    };
  };
  "GET /admin/refunds": {
    params: undefined;
    query: { status?: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW"; limit?: number };
    body: undefined;
    response: {
      items: ({
        id: string;
        status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
        amountRial: string;
        reason: string | null;
        gateway: string | null;
        externalRef: string | null;
        tryCount: number;
        lastErrorCode: string | null;
        createdAt: string;
        processedAt: string | null;
        note: string | null;
        paymentId: string;
        appointmentId: string;
        attemptId: string | null;
        patientName: string | null;
        approval: {
          required: boolean;
          state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
          action: "EXECUTE" | "MARK_PROCESSED" | null;
          reference: string | null;
          makerId: string | null;
          makerNote: string | null;
          requestedAt: string | null;
          checkerId: string | null;
          checkerNote: string | null;
          decidedAt: string | null;
        };
      })[];
    };
  };
  "POST /admin/refunds/{id}/approval/approve": {
    params: { id: string };
    query: undefined;
    body: {
      note?: string;
    };
    response: {
      id: string;
      status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
      amountRial: string;
      reason: string | null;
      gateway: string | null;
      externalRef: string | null;
      tryCount: number;
      lastErrorCode: string | null;
      createdAt: string;
      processedAt: string | null;
      note: string | null;
      paymentId: string;
      appointmentId: string;
      attemptId: string | null;
      patientName: string | null;
      approval: {
        required: boolean;
        state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
        action: "EXECUTE" | "MARK_PROCESSED" | null;
        reference: string | null;
        makerId: string | null;
        makerNote: string | null;
        requestedAt: string | null;
        checkerId: string | null;
        checkerNote: string | null;
        decidedAt: string | null;
      };
    };
  };
  "POST /admin/refunds/{id}/approval/reject": {
    params: { id: string };
    query: undefined;
    body: {
      note: string;
    };
    response: {
      id: string;
      status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
      amountRial: string;
      reason: string | null;
      gateway: string | null;
      externalRef: string | null;
      tryCount: number;
      lastErrorCode: string | null;
      createdAt: string;
      processedAt: string | null;
      note: string | null;
      paymentId: string;
      appointmentId: string;
      attemptId: string | null;
      patientName: string | null;
      approval: {
        required: boolean;
        state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
        action: "EXECUTE" | "MARK_PROCESSED" | null;
        reference: string | null;
        makerId: string | null;
        makerNote: string | null;
        requestedAt: string | null;
        checkerId: string | null;
        checkerNote: string | null;
        decidedAt: string | null;
      };
    };
  };
  "POST /admin/refunds/{id}/execute": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      id: string;
      status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
      amountRial: string;
      reason: string | null;
      gateway: string | null;
      externalRef: string | null;
      tryCount: number;
      lastErrorCode: string | null;
      createdAt: string;
      processedAt: string | null;
      note: string | null;
      paymentId: string;
      appointmentId: string;
      attemptId: string | null;
      patientName: string | null;
      approval: {
        required: boolean;
        state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
        action: "EXECUTE" | "MARK_PROCESSED" | null;
        reference: string | null;
        makerId: string | null;
        makerNote: string | null;
        requestedAt: string | null;
        checkerId: string | null;
        checkerNote: string | null;
        decidedAt: string | null;
      };
    };
  };
  "POST /admin/refunds/{id}/mark-not-refunded": {
    params: { id: string };
    query: undefined;
    body: {
      note: string;
    };
    response: {
      id: string;
      status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
      amountRial: string;
      reason: string | null;
      gateway: string | null;
      externalRef: string | null;
      tryCount: number;
      lastErrorCode: string | null;
      createdAt: string;
      processedAt: string | null;
      note: string | null;
      paymentId: string;
      appointmentId: string;
      attemptId: string | null;
      patientName: string | null;
      approval: {
        required: boolean;
        state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
        action: "EXECUTE" | "MARK_PROCESSED" | null;
        reference: string | null;
        makerId: string | null;
        makerNote: string | null;
        requestedAt: string | null;
        checkerId: string | null;
        checkerNote: string | null;
        decidedAt: string | null;
      };
    };
  };
  "POST /admin/refunds/{id}/mark-processed": {
    params: { id: string };
    query: undefined;
    body: {
      reference: string;
      note?: string;
    };
    response: {
      id: string;
      status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
      amountRial: string;
      reason: string | null;
      gateway: string | null;
      externalRef: string | null;
      tryCount: number;
      lastErrorCode: string | null;
      createdAt: string;
      processedAt: string | null;
      note: string | null;
      paymentId: string;
      appointmentId: string;
      attemptId: string | null;
      patientName: string | null;
      approval: {
        required: boolean;
        state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
        action: "EXECUTE" | "MARK_PROCESSED" | null;
        reference: string | null;
        makerId: string | null;
        makerNote: string | null;
        requestedAt: string | null;
        checkerId: string | null;
        checkerNote: string | null;
        decidedAt: string | null;
      };
    };
  };
  "POST /admin/refunds/{id}/request-approval": {
    params: { id: string };
    query: undefined;
    body: {
      action: "EXECUTE" | "MARK_PROCESSED";
      reference?: string;
      note?: string;
    };
    response: {
      id: string;
      status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED" | "MANUAL" | "REVIEW";
      amountRial: string;
      reason: string | null;
      gateway: string | null;
      externalRef: string | null;
      tryCount: number;
      lastErrorCode: string | null;
      createdAt: string;
      processedAt: string | null;
      note: string | null;
      paymentId: string;
      appointmentId: string;
      attemptId: string | null;
      patientName: string | null;
      approval: {
        required: boolean;
        state: "NONE" | "REQUESTED" | "APPROVED" | "REJECTED";
        action: "EXECUTE" | "MARK_PROCESSED" | null;
        reference: string | null;
        makerId: string | null;
        makerNote: string | null;
        requestedAt: string | null;
        checkerId: string | null;
        checkerNote: string | null;
        decidedAt: string | null;
      };
    };
  };
  "POST /admin/runbooks": {
    params: undefined;
    query: undefined;
    body: {
      name: "restore-drill" | "redis-failover" | "payment-failover";
    };
    response: unknown;
  };
  "GET /admin/slo": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /admin/slo/{service}": {
    params: { service: string };
    query: undefined;
    body: {
      objective: number;
      window: "30d" | "7d" | "1d";
    };
    response: unknown;
  };
  "GET /admin/status/incidents": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/status/incidents": {
    params: undefined;
    query: undefined;
    body: {
      titleFa: string;
      bodyFa: string;
      impact: "NONE" | "MINOR" | "MAJOR" | "CRITICAL";
      componentId?: "api" | "database" | "realtime" | "payments" | "notifications";
    };
    response: {
      id: string;
    };
  };
  "POST /admin/status/incidents/{id}/updates": {
    params: { id: string };
    query: undefined;
    body: {
      status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
      bodyFa: string;
    };
    response: {
      id: string;
      status: string;
    };
  };
  "GET /admin/synthetic": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /admin/triage-rulesets": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /admin/triage-rulesets": {
    params: undefined;
    query: undefined;
    body: {
      version: string;
      rules: ({
        id: string;
        anyOf: string[];
        level: "EMERGENCY" | "URGENT" | "ROUTINE";
        explanationFa: string;
      })[];
      approvedByLabel: string;
    };
    response: unknown;
  };
  "POST /admin/users/{id}/reinstate": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      id: string;
      status: "ACTIVE";
    };
  };
  "POST /admin/users/{id}/revoke-sessions": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      id: string;
      revoked: true;
    };
  };
  "POST /admin/users/{id}/suspend": {
    params: { id: string };
    query: undefined;
    body: {
      reason: string;
    };
    response: {
      id: string;
      status: "SUSPENDED";
    };
  };
  "POST /analytics/funnel": {
    params: undefined;
    query: undefined;
    body: {
      step: "SEARCH" | "SLOT_VIEW" | "SLOT_SELECT" | "PAYMENT_START" | "PAYMENT_SUCCESS" | "BOOKING_CONFIRMED";
      anonymousId: string;
      meta?: {
        [key: string]: string | number | boolean;
      };
    };
    response: unknown;
  };
  "POST /appointments": {
    params: undefined;
    query: undefined;
    body: {
      doctorId: string;
      startsAt: string;
      kind?: "IN_PERSON" | "VIDEO" | "CHAT";
      reason?: string;
    };
    response: unknown;
  };
  "GET /appointments": {
    params: undefined;
    query: { status?: "PENDING_PAYMENT" | "PENDING_CONFIRMATION" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED_BY_PATIENT" | "CANCELLED_BY_DOCTOR" | "EXPIRED" | "NO_SHOW_PATIENT" | "NO_SHOW_DOCTOR"; from?: string; to?: string; limit?: number; cursor?: string };
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}/calendar.ics": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/cancel": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/complete": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/confirm": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}/health-profile": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}/prescriptions": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/prescriptions": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/report-no-show": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/reschedule": {
    params: { id: string };
    query: undefined;
    body: {
      startsAt: string;
    };
    response: {
      id: string;
      startsAt: string;
      endsAt: string;
      status: string;
      refundRial: string;
    };
  };
  "GET /appointments/{id}/scribe": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "DELETE /appointments/{id}/scribe": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/scribe/apply": {
    params: { id: string };
    query: undefined;
    body: {
      expectedVersion?: number;
    };
    response: {
      applied: true;
      signed: false;
    };
  };
  "GET /appointments/{id}/scribe/consents": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      doctor: boolean;
      patient: boolean;
      canStart: boolean;
    };
  };
  "POST /appointments/{id}/scribe/draft": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/scribe/start": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      status: "CONSENTED";
      ttlMinutes: number;
      consent: {
        doctor: true;
        patient: true;
      };
    };
  };
  "POST /appointments/{id}/scribe/transcript": {
    params: { id: string };
    query: undefined;
    body: {
      transcript: string;
    };
    response: {
      status: "TRANSCRIPT_READY";
    };
  };
  "GET /appointments/{id}/soap": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /appointments/{id}/soap": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/soap/addenda": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/soap/sign": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/{id}/start": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}/video": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}/video/gate": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}/video/policy": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /appointments/{id}/video/policy": {
    params: { id: string };
    query: undefined;
    body: {
      waitingRoom?: boolean;
      allowScreenShare?: boolean;
      captions?: boolean;
      recordConsent?: boolean;
      retentionHours?: number | null;
    };
    response: unknown;
  };
  "POST /appointments/{id}/video/recording-consent": {
    params: { id: string };
    query: undefined;
    body: {
      accept: true;
    };
    response: unknown;
  };
  "POST /appointments/{id}/video/token": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /appointments/{id}/visit-summary": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /appointments/recurring": {
    params: undefined;
    query: undefined;
    body: {
      doctorId: string;
      rrule: string;
      kind?: "IN_PERSON" | "VIDEO" | "CHAT";
      firstStartsAt: string;
    };
    response: unknown;
  };
  "GET /appointments/recurring": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "DELETE /appointments/recurring/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /auth/logout": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: void;
  };
  "POST /auth/logout-all": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: void;
  };
  "POST /auth/mfa/verify": {
    params: undefined;
    query: undefined;
    body: {
      code: string;
    };
    response: {
      verified: true;
      accessToken: string;
    };
  };
  "POST /auth/otp/request": {
    params: undefined;
    query: undefined;
    body: {
      phone: string;
    };
    response: {
      status: "accepted";
    };
  };
  "POST /auth/otp/verify": {
    params: undefined;
    query: undefined;
    body: {
      phone: string;
      code: string;
    };
    response: {
      accessToken: string;
      tokenType: "Bearer";
      expiresIn: number;
    };
  };
  "GET /auth/passkey/credentials": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "DELETE /auth/passkey/credentials/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /auth/passkey/login/options": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /auth/passkey/login/verify": {
    params: undefined;
    query: undefined;
    body: {
      id: string;
      rawId: string;
      type: "public-key";
      response: {
        clientDataJSON: string;
        attestationObject?: string;
        authenticatorData?: string;
        signature?: string;
        userHandle?: string | null;
        transports?: string[];
      };
      clientExtensionResults?: {
        [key: string]: unknown;
      };
      authenticatorAttachment?: string;
    };
    response: {
      accessToken: string;
      tokenType: "Bearer";
      expiresIn: number;
    };
  };
  "POST /auth/passkey/register/options": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /auth/passkey/register/verify": {
    params: undefined;
    query: undefined;
    body: {
      id: string;
      rawId: string;
      type: "public-key";
      response: {
        clientDataJSON: string;
        attestationObject?: string;
        authenticatorData?: string;
        signature?: string;
        userHandle?: string | null;
        transports?: string[];
      };
      clientExtensionResults?: {
        [key: string]: unknown;
      };
      authenticatorAttachment?: string;
    };
    response: unknown;
  };
  "POST /auth/refresh": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      accessToken: string;
      tokenType: "Bearer";
      expiresIn: number;
    };
  };
  "GET /clinics": {
    params: undefined;
    query: { lat?: number; lng?: number; maxKm?: number; q?: string; verifiedOnly?: "0" | "1"; limit?: number };
    body: undefined;
    response: unknown;
  };
  "GET /conversations": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /conversations/{id}/messages": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /conversations/{id}/summarize": {
    params: { id: string };
    query: undefined;
    body: {
      consentId: string;
    };
    response: unknown;
  };
  "GET /conversations/{id}/summary": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /conversations/messages/{msgId}/attachment": {
    params: { msgId: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /demo/config": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      enabled: boolean;
      role: string | null;
    };
  };
  "POST /demo/login": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      accessToken: string;
      tokenType: "Bearer";
      expiresIn: number;
    };
  };
  "GET /demo/status": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      demo: boolean;
    };
  };
  "GET /doctor/stats/daily": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctor/stats/summary": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctors": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctors/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctors/{id}/slots": {
    params: { id: string };
    query: { from?: string; to?: string; ranked?: boolean; limit?: number };
    body: undefined;
    response: unknown;
  };
  "POST /doctors/applications": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctors/applications/mine": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctors/compare": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctors/me/availability": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /doctors/me/availability": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PATCH /doctors/me/settings": {
    params: undefined;
    query: undefined;
    body: {
      slotMinutes?: number;
      autoConfirm?: boolean;
      consultationFeeRial?: string;
      bio?: string;
      clinicName?: string;
      clinicAddress?: string;
      clinicPhone?: string;
    };
    response: unknown;
  };
  "PUT /doctors/me/specialties": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /doctors/me/time-off": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /doctors/me/time-off": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "DELETE /doctors/me/time-off/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /me": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /me/consent-ledger": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/consents": {
    params: undefined;
    query: undefined;
    body: {
      type: "PRIVACY_POLICY" | "HEALTH_DATA_PROCESSING" | "TERMS" | "AMBIENT_SCRIBE";
      version: string;
    };
    response: unknown;
  };
  "GET /me/consents": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/consents/{type}/revoke": {
    params: { type: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/data-requests": {
    params: undefined;
    query: undefined;
    body: {
      type: "EXPORT" | "DELETE";
    };
    response: {
      id: string;
      type: "EXPORT" | "DELETE";
      status: "PENDING";
    };
  };
  "GET /me/data-requests": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/data-requests/{id}/cancel": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /me/data-requests/{id}/download": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      url: string;
      fileName: string;
      expiresAt: number;
    };
  };
  "GET /me/family": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/family": {
    params: undefined;
    query: undefined;
    body: {
      fullName: string;
      relation: string;
      birthYear?: number;
      nationalId?: string;
    };
    response: unknown;
  };
  "PATCH /me/family/{id}": {
    params: { id: string };
    query: undefined;
    body: {
      fullName?: string;
      relation?: string;
      birthYear?: number;
      nationalId?: string;
    };
    response: unknown;
  };
  "DELETE /me/family/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/feedback": {
    params: undefined;
    query: undefined;
    body: {
      score: number;
      step?: "SEARCH" | "SLOT_VIEW" | "SLOT_SELECT" | "PAYMENT_START" | "PAYMENT_SUCCESS" | "BOOKING_CONFIRMED";
      anonymousId?: string;
    };
    response: unknown;
  };
  "GET /me/feedback": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /me/health-profile": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /me/health-profile": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /me/health-record/fhir": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/health/export": {
    params: undefined;
    query: undefined;
    body: {
      passphrase: string;
    };
    response: unknown;
  };
  "GET /me/health/medications": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/health/medications/reconcile": {
    params: undefined;
    query: undefined;
    body: {
      items: ({
        name: string;
        dose?: string;
        note?: string;
      })[];
      reviewedBy?: string;
    };
    response: unknown;
  };
  "GET /me/health/timeline": {
    params: undefined;
    query: { kind?: "WEIGHT" | "BP" | "GLUCOSE" | "LAB"; from?: string; to?: string };
    body: undefined;
    response: unknown;
  };
  "POST /me/health/timeline": {
    params: undefined;
    query: undefined;
    body: {
      kind: "WEIGHT" | "BP" | "GLUCOSE" | "LAB";
      value: string;
      unit?: string;
      at?: string;
    };
    response: unknown;
  };
  "GET /me/mfa": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      enabled: boolean;
      required: boolean;
      enrolledAt: string | null;
      recoveryCodesLeft: number;
    };
  };
  "POST /me/mfa/disable": {
    params: undefined;
    query: undefined;
    body: {
      code: string;
    };
    response: {
      disabled: true;
    };
  };
  "POST /me/mfa/enable": {
    params: undefined;
    query: undefined;
    body: {
      code: string;
    };
    response: {
      accessToken: string;
    };
  };
  "POST /me/mfa/enroll": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      secret: string;
      uri: string;
      recoveryCodes: string[];
    };
  };
  "POST /me/mfa/rotate": {
    params: undefined;
    query: undefined;
    body: {
      code: string;
    };
    response: {
      secret: string;
      uri: string;
      recoveryCodes: string[];
    };
  };
  "GET /me/notification-preferences": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /me/notification-preferences": {
    params: undefined;
    query: undefined;
    body: {
      items: ({
        eventType: "APPOINTMENT_REMINDER" | "APPOINTMENT_CONFIRMED" | "APPOINTMENT_CANCELLED" | "PAYMENT" | "CHAT" | "SECOND_OPINION" | "SECURITY";
        channel: "inapp" | "sms" | "push" | "email";
        enabled: boolean;
      })[];
      quietFrom?: string | null;
      quietTo?: string | null;
    };
    response: unknown;
  };
  "PATCH /me/profile": {
    params: undefined;
    query: undefined;
    body: {
      fullName: string;
    };
    response: unknown;
  };
  "GET /me/quick-replies": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /me/quick-replies": {
    params: undefined;
    query: undefined;
    body: {
      text: string;
    };
    response: unknown;
  };
  "DELETE /me/quick-replies/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /me/ui-preferences": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /me/ui-preferences": {
    params: undefined;
    query: undefined;
    body: {
      theme?: "system" | "light" | "dark" | "high-contrast";
      fontScale?: number;
      contrast?: "normal" | "more" | "most";
      reducedMotion?: boolean;
      locale?: "fa" | "en";
    };
    response: unknown;
  };
  "GET /me/workspace": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PUT /me/workspace": {
    params: undefined;
    query: undefined;
    body: {
      dashboard: "CLINIC" | "TELEHEALTH" | "RESEARCH";
    };
    response: unknown;
  };
  "GET /notifications": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PATCH /notifications/{id}/read": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PATCH /notifications/read-all": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /notifications/stream": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /payments/{appointmentId}": {
    params: { appointmentId: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /payments/initiate": {
    params: undefined;
    query: undefined;
    body: {
      appointmentId: string;
      callbackUrl?: string;
    };
    response: {
      status: "REDIRECT" | "PAID";
      paymentUrl: string | null;
      gateway: string | null;
    };
  };
  "POST /payments/verify": {
    params: undefined;
    query: undefined;
    body: {
      appointmentId: string;
      authority: string;
      status?: string;
    };
    response: {
      success: boolean;
      state: "PAID" | "PENDING" | "FAILED" | "REVIEW";
      message: string;
    };
  };
  "GET /prescriptions": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /prescriptions/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /prescriptions/{id}/cancel": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /prescriptions/verify": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /push/public-key": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /push/subscribe": {
    params: undefined;
    query: undefined;
    body: {
      endpoint: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    };
    response: unknown;
  };
  "POST /push/unsubscribe": {
    params: undefined;
    query: undefined;
    body: {
      endpoint: string;
    };
    response: unknown;
  };
  "POST /records": {
    params: undefined;
    query: undefined;
    body: {
      title: string;
      content?: string;
      category?: "NOTE" | "LAB_RESULT" | "IMAGING" | "PRESCRIPTION" | "DISCHARGE_SUMMARY" | "REFERRAL" | "VACCINATION" | "OTHER";
      visitDate?: string;
      tags?: string[];
    };
    response: unknown;
  };
  "GET /records": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PATCH /records/{id}": {
    params: { id: string };
    query: undefined;
    body: {
      title?: string;
      content?: string;
      category?: "NOTE" | "LAB_RESULT" | "IMAGING" | "PRESCRIPTION" | "DISCHARGE_SUMMARY" | "REFERRAL" | "VACCINATION" | "OTHER";
      visitDate?: string;
      tags?: string[];
    };
    response: unknown;
  };
  "GET /records/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "DELETE /records/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /records/{id}/attachments": {
    params: { id: string };
    query: undefined;
    body: {
      objectKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    };
    response: unknown;
  };
  "POST /records/{id}/shares": {
    params: { id: string };
    query: undefined;
    body: {
      doctorId: string;
      expiresAt?: string;
    };
    response: unknown;
  };
  "DELETE /records/{id}/shares/{shareId}": {
    params: { id: string; shareId: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /records/attachments/{attId}/download": {
    params: { attId: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /second-opinions": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /second-opinions": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /second-opinions/settings": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /specialties": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /status": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      overall: "operational" | "degraded" | "outage";
      updatedAt: string;
      components: ({
        id: "api" | "database" | "realtime" | "payments" | "notifications";
        nameFa: string;
        status: "operational" | "degraded" | "outage";
      })[];
      incidents: ({
        id: string;
        titleFa: string;
        status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
        impact: "NONE" | "MINOR" | "MAJOR" | "CRITICAL";
        componentId: string | null;
        startedAt: string;
        resolvedAt: string | null;
        updates: ({
          status: string;
          bodyFa: string;
          at: string;
        })[];
      })[];
    };
  };
  "POST /storage/allowed-types": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /storage/finalize": {
    params: undefined;
    query: undefined;
    body: unknown;
    response: {
      objectKey: string;
      state: "PENDING" | "SCANNING" | "APPROVED" | "REJECTED";
      detectedMime: string;
    };
  };
  "POST /storage/upload-token": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /triage": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /triage-governance/evaluate": {
    params: undefined;
    query: undefined;
    body: {
      symptoms: string[];
    };
    response: unknown;
  };
  "POST /triage-governance/rulesets/{version}/evaluate": {
    params: { version: string };
    query: undefined;
    body: {
      symptoms: string[];
    };
    response: unknown;
  };
  "GET /triage-governance/rulesets/active": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /triage/catalog": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /video/webhook": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /vitals": {
    params: undefined;
    query: undefined;
    body: {
      type: "BLOOD_PRESSURE" | "BLOOD_GLUCOSE" | "WEIGHT" | "HEART_RATE" | "BODY_TEMPERATURE" | "OXYGEN_SATURATION";
      valuePrimary: number;
      valueSecondary?: number | null;
      measuredAt: string;
      source?: "MANUAL" | "DEVICE";
      note?: string;
    };
    response: unknown;
  };
  "GET /vitals": {
    params: undefined;
    query: { type?: "BLOOD_PRESSURE" | "BLOOD_GLUCOSE" | "WEIGHT" | "HEART_RATE" | "BODY_TEMPERATURE" | "OXYGEN_SATURATION"; from?: string; to?: string; limit?: number; cursor?: string };
    body: undefined;
    response: unknown;
  };
  "DELETE /vitals/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /waitlist": {
    params: undefined;
    query: undefined;
    body: {
      doctorId: string;
      kind: "IN_PERSON" | "VIDEO" | "CHAT";
      desiredFrom: string;
      desiredTo: string;
    };
    response: {
      id: string;
      status: "WAITING";
    };
  };
  "GET /waitlist": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "DELETE /waitlist/{id}": {
    params: { id: string };
    query: undefined;
    body: undefined;
    response: {
      id: string;
      status: "CANCELLED";
    };
  };
  "GET /wallet": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: {
      balanceRial: string;
      currency: string;
    };
  };
  "GET /wallet/history": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "GET /wallet/insurance": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "POST /wallet/insurance": {
    params: undefined;
    query: undefined;
    body: {
      insurer: string;
      policyNumber?: string;
      coveragePercent: number;
      validUntil?: string;
    };
    response: unknown;
  };
  "POST /wallet/insurance/settle": {
    params: undefined;
    query: undefined;
    body: {
      policyId: string;
      doctorId: string;
      amountRial: string | number;
      appointmentId?: string;
    };
    response: unknown;
  };
  "POST /wallet/payouts": {
    params: undefined;
    query: undefined;
    body: {
      amountRial: string | number;
      note?: string;
    };
    response: unknown;
  };
  "GET /wallet/payouts": {
    params: undefined;
    query: undefined;
    body: undefined;
    response: unknown;
  };
  "PATCH /wallet/payouts/{id}": {
    params: { id: string };
    query: undefined;
    body: {
      decision: "APPROVED" | "REJECTED" | "PAID";
    };
    response: unknown;
  };
  "POST /wallet/topup": {
    params: undefined;
    query: undefined;
    body: {
      amountRial: string | number;
      idempotencyKey: string;
    };
    response: unknown;
  };
}

/** فراداده‌ی هر عملیات (مسیر، متد، عمومی‌بودن، الزام Idempotency-Key). */
export const OPERATIONS = {
  "GET /admin/analytics/cohorts": { method: "GET", path: "/admin/analytics/cohorts", public: false, idempotency: null, summary: "گزارش cohort/retention" },
  "GET /admin/analytics/experiments": { method: "GET", path: "/admin/analytics/experiments", public: false, idempotency: null, summary: "فهرست آزمایش‌ها" },
  "PUT /admin/analytics/experiments/{key}": { method: "PUT", path: "/admin/analytics/experiments/{key}", public: false, idempotency: null, summary: "ایجاد/به‌روزرسانی آزمایش A/B" },
  "GET /admin/analytics/funnel": { method: "GET", path: "/admin/analytics/funnel", public: false, idempotency: null, summary: "گزارش فونل و cohort" },
  "GET /admin/audit/verify": { method: "GET", path: "/admin/audit/verify", public: false, idempotency: null, summary: "بررسی یکپارچگی زنجیره هش ممیزی" },
  "GET /admin/chaos": { method: "GET", path: "/admin/chaos", public: false, idempotency: null, summary: "تاریخ chaos drill" },
  "POST /admin/chaos/{target}": { method: "POST", path: "/admin/chaos/{target}", public: false, idempotency: null, summary: "اجرای chaos با گیت‌های ایمنی" },
  "POST /admin/clinics": { method: "POST", path: "/admin/clinics", public: false, idempotency: null, summary: "ثبت کلینیک" },
  "PATCH /admin/clinics/{id}/verify": { method: "PATCH", path: "/admin/clinics/{id}/verify", public: false, idempotency: null, summary: "تأیید کلینیک" },
  "GET /admin/data-requests": { method: "GET", path: "/admin/data-requests", public: false, idempotency: null, summary: "صف درخواستهای حذف/خروجی" },
  "POST /admin/data-requests/{id}/review": { method: "POST", path: "/admin/data-requests/{id}/review", public: false, idempotency: null, summary: "رأی دو نفره ادمین (پس از ۲ تأیید، اجرا ۳۰ روز بعد)" },
  "GET /admin/dead-letters": { method: "GET", path: "/admin/dead-letters", public: false, idempotency: null, summary: "صف نامه‌های مرده (DLQ)" },
  "POST /admin/dead-letters/{id}/escalate": { method: "POST", path: "/admin/dead-letters/{id}/escalate", public: false, idempotency: null, summary: "ارتقای تلفنی on-call پس از ناکامی کانالها" },
  "POST /admin/dead-letters/{id}/retry": { method: "POST", path: "/admin/dead-letters/{id}/retry", public: false, idempotency: null, summary: "علامت‌گذاری برای ارسال مجدد" },
  "GET /admin/doctor-verifications": { method: "GET", path: "/admin/doctor-verifications", public: false, idempotency: null, summary: "مدارک پزشکان در انتظار بررسی" },
  "POST /admin/doctor-verifications/{id}/approve": { method: "POST", path: "/admin/doctor-verifications/{id}/approve", public: false, idempotency: null, summary: "تأیید مدارک پزشک" },
  "POST /admin/doctor-verifications/{id}/reject": { method: "POST", path: "/admin/doctor-verifications/{id}/reject", public: false, idempotency: null, summary: "رد مدارک پزشک با دلیل" },
  "GET /admin/finance/summary": { method: "GET", path: "/admin/finance/summary", public: false, idempotency: null, summary: "خلاصه‌ی مالی و موارد نیازمند توجه" },
  "GET /admin/notification-templates": { method: "GET", path: "/admin/notification-templates", public: false, idempotency: null, summary: "فهرست قالب‌های نسخه‌دار اعلان" },
  "POST /admin/notification-templates/{key}/activate": { method: "POST", path: "/admin/notification-templates/{key}/activate", public: false, idempotency: null, summary: "فعال‌سازی نسخهٔ قالب" },
  "GET /admin/organization-plans": { method: "GET", path: "/admin/organization-plans", public: false, idempotency: null, summary: "طرح‌های سازمانی" },
  "POST /admin/organization-plans": { method: "POST", path: "/admin/organization-plans", public: false, idempotency: null, summary: "ایجاد طرح سازمانی" },
  "GET /admin/organization-plans/{id}/seats": { method: "GET", path: "/admin/organization-plans/{id}/seats", public: false, idempotency: null, summary: "بررسی ظرفیت صندلی" },
  "GET /admin/payments": { method: "GET", path: "/admin/payments", public: false, idempotency: null, summary: "فهرست پرداخت‌ها (فیلتر وضعیت)" },
  "GET /admin/policies": { method: "GET", path: "/admin/policies", public: false, idempotency: null, summary: "دریافت نسخهٔ قواعد ماشین وضعیت و نمودار Mermaid" },
  "POST /admin/policies/{version}/activate": { method: "POST", path: "/admin/policies/{version}/activate", public: false, idempotency: null, summary: "فعالسازی نسخهٔ قواعد (ثبت در audit)" },
  "POST /admin/policies/simulate": { method: "POST", path: "/admin/policies/simulate", public: false, idempotency: null, summary: "شبیهسازی انتقال وضعیت و بازپرداخت (بدون اثر بر DB)" },
  "GET /admin/refunds": { method: "GET", path: "/admin/refunds", public: false, idempotency: null, summary: "فهرست استردادها" },
  "POST /admin/refunds/{id}/approval/approve": { method: "POST", path: "/admin/refunds/{id}/approval/approve", public: false, idempotency: "required", summary: "Checker (غیر از Maker): تأیید" },
  "POST /admin/refunds/{id}/approval/reject": { method: "POST", path: "/admin/refunds/{id}/approval/reject", public: false, idempotency: "required", summary: "Checker (غیر از Maker): رد با دلیل" },
  "POST /admin/refunds/{id}/execute": { method: "POST", path: "/admin/refunds/{id}/execute", public: false, idempotency: "required", summary: "اجرای استرداد روی درگاه (نیازمند تأیید یک‌بارمصرف)" },
  "POST /admin/refunds/{id}/mark-not-refunded": { method: "POST", path: "/admin/refunds/{id}/mark-not-refunded", public: false, idempotency: "required", summary: "بررسی شد؛ استرداد انجام نشده (REVIEW ⇒ FAILED)" },
  "POST /admin/refunds/{id}/mark-processed": { method: "POST", path: "/admin/refunds/{id}/mark-processed", public: false, idempotency: "required", summary: "ثبت انجام دستی (فقط با «همان مرجع» ی تأییدشده)" },
  "POST /admin/refunds/{id}/request-approval": { method: "POST", path: "/admin/refunds/{id}/request-approval", public: false, idempotency: "required", summary: "Maker: درخواست تأیید برای اجرا یا ثبت دستی" },
  "POST /admin/runbooks": { method: "POST", path: "/admin/runbooks", public: false, idempotency: null, summary: "درخواست اجرای runbook" },
  "GET /admin/slo": { method: "GET", path: "/admin/slo", public: false, idempotency: null, summary: "بودجهٔ خطا و burn rate" },
  "PUT /admin/slo/{service}": { method: "PUT", path: "/admin/slo/{service}", public: false, idempotency: null, summary: "تعریف/به‌روزرسانی SLO سرویس" },
  "GET /admin/status/incidents": { method: "GET", path: "/admin/status/incidents", public: false, idempotency: null, summary: "حوادث (۵۰ مورد آخر)" },
  "POST /admin/status/incidents": { method: "POST", path: "/admin/status/incidents", public: false, idempotency: null, summary: "ثبت حادثه‌ی عمومی (متن نباید داده‌ی شخصی داشته باشد)" },
  "POST /admin/status/incidents/{id}/updates": { method: "POST", path: "/admin/status/incidents/{id}/updates", public: false, idempotency: null, summary: "به‌روزرسانی/حل حادثه (حادثه‌ی حل‌شده قابل ویرایش نیست)" },
  "GET /admin/synthetic": { method: "GET", path: "/admin/synthetic", public: false, idempotency: null, summary: "بررسی synthetic زنده" },
  "GET /admin/triage-rulesets": { method: "GET", path: "/admin/triage-rulesets", public: false, idempotency: null, summary: "فهرست قواعد triage" },
  "POST /admin/triage-rulesets": { method: "POST", path: "/admin/triage-rulesets", public: false, idempotency: null, summary: "ایجاد قواعد (اعتبارسنجی fail-closed)" },
  "POST /admin/users/{id}/reinstate": { method: "POST", path: "/admin/users/{id}/reinstate", public: false, idempotency: null, summary: "بازگردانی کاربر معلق" },
  "POST /admin/users/{id}/revoke-sessions": { method: "POST", path: "/admin/users/{id}/revoke-sessions", public: false, idempotency: null, summary: "بستن همه‌ی نشست‌های کاربر (بدون تغییر وضعیت)" },
  "POST /admin/users/{id}/suspend": { method: "POST", path: "/admin/users/{id}/suspend", public: false, idempotency: null, summary: "تعلیق کاربر؛ همه‌ی توکن‌ها و سوکت‌ها همین حالا باطل می‌شوند" },
  "POST /analytics/funnel": { method: "POST", path: "/analytics/funnel", public: false, idempotency: null, summary: "ثبت مرحلهٔ فونل (بدون PHI)" },
  "POST /appointments": { method: "POST", path: "/appointments", public: false, idempotency: null, summary: "رزرو نوبت (ضد double-booking)" },
  "GET /appointments": { method: "GET", path: "/appointments", public: false, idempotency: null, summary: "فهرست نوبت‌های کاربر (cursor)" },
  "GET /appointments/{id}": { method: "GET", path: "/appointments/{id}", public: false, idempotency: null, summary: "جزئیات نوبت" },
  "GET /appointments/{id}/calendar.ics": { method: "GET", path: "/appointments/{id}/calendar.ics", public: false, idempotency: null, summary: "M3: خروجی تقویم ICS (فاقد PHI)" },
  "POST /appointments/{id}/cancel": { method: "POST", path: "/appointments/{id}/cancel", public: false, idempotency: null, summary: "لغو نوبت (بازپرداخت طبق سیاست)" },
  "POST /appointments/{id}/complete": { method: "POST", path: "/appointments/{id}/complete", public: false, idempotency: null, summary: "پایان ویزیت" },
  "POST /appointments/{id}/confirm": { method: "POST", path: "/appointments/{id}/confirm", public: false, idempotency: null, summary: "پزشک: تأیید نوبت" },
  "GET /appointments/{id}/health-profile": { method: "GET", path: "/appointments/{id}/health-profile", public: false, idempotency: null, summary: "پروفایل سلامت بیمار برای پزشک همان نوبت" },
  "GET /appointments/{id}/prescriptions": { method: "GET", path: "/appointments/{id}/prescriptions", public: false, idempotency: null, summary: "نسخههای نوبت" },
  "POST /appointments/{id}/prescriptions": { method: "POST", path: "/appointments/{id}/prescriptions", public: false, idempotency: null, summary: "صدور نسخه" },
  "POST /appointments/{id}/report-no-show": { method: "POST", path: "/appointments/{id}/report-no-show", public: false, idempotency: null, summary: "گزارش غیبت" },
  "POST /appointments/{id}/reschedule": { method: "POST", path: "/appointments/{id}/reschedule", public: false, idempotency: null, summary: "جابهجایی اتمی نوبت (بدون لغو/بازپرداخت/پرداخت مجدد)" },
  "GET /appointments/{id}/scribe": { method: "GET", path: "/appointments/{id}/scribe", public: false, idempotency: null, summary: "دریافت پیشنویس (در صورت وجود)" },
  "DELETE /appointments/{id}/scribe": { method: "DELETE", path: "/appointments/{id}/scribe", public: false, idempotency: null, summary: "پاکسازی فوری متن موقت و پیشنویس" },
  "POST /appointments/{id}/scribe/apply": { method: "POST", path: "/appointments/{id}/scribe/apply", public: false, idempotency: null, summary: "انتقال پیشنویس به SOAP به وضعیت DRAFT (با version خوشبینانه)" },
  "GET /appointments/{id}/scribe/consents": { method: "GET", path: "/appointments/{id}/scribe/consents", public: false, idempotency: null, summary: "چکلیست رضایت صریح دو طرف قبل از شروع" },
  "POST /appointments/{id}/scribe/draft": { method: "POST", path: "/appointments/{id}/scribe/draft", public: false, idempotency: null, summary: "تولید پیشنویس SOAP (هرگز امضا نمیشود)" },
  "POST /appointments/{id}/scribe/start": { method: "POST", path: "/appointments/{id}/scribe/start", public: false, idempotency: null, summary: "شروع جلسه منوط به رضایت صریح هر دو طرف" },
  "POST /appointments/{id}/scribe/transcript": { method: "POST", path: "/appointments/{id}/scribe/transcript", public: false, idempotency: null, summary: "بارگذاری متن گفتار (پاکسازی PII و رمزنگاری موقت)" },
  "GET /appointments/{id}/soap": { method: "GET", path: "/appointments/{id}/soap", public: false, idempotency: null, summary: "یادداشت SOAP پزشک" },
  "PUT /appointments/{id}/soap": { method: "PUT", path: "/appointments/{id}/soap", public: false, idempotency: null, summary: "ذخیره پیشنویس SOAP" },
  "POST /appointments/{id}/soap/addenda": { method: "POST", path: "/appointments/{id}/soap/addenda", public: false, idempotency: null, summary: "افزودن الحاقیه پس از امضا" },
  "POST /appointments/{id}/soap/sign": { method: "POST", path: "/appointments/{id}/soap/sign", public: false, idempotency: null, summary: "امضای SOAP و انتشار خلاصه بیمار" },
  "POST /appointments/{id}/start": { method: "POST", path: "/appointments/{id}/start", public: false, idempotency: null, summary: "شروع ویزیت" },
  "GET /appointments/{id}/video": { method: "GET", path: "/appointments/{id}/video", public: false, idempotency: null, summary: "وضعیت اتاق ویدئو" },
  "GET /appointments/{id}/video/gate": { method: "GET", path: "/appointments/{id}/video/gate", public: false, idempotency: null, summary: "وضعیت اتاق انتظار" },
  "GET /appointments/{id}/video/policy": { method: "GET", path: "/appointments/{id}/video/policy", public: false, idempotency: null, summary: "سیاست اتاق و وضعیت رضایت ضبط" },
  "PUT /appointments/{id}/video/policy": { method: "PUT", path: "/appointments/{id}/video/policy", public: false, idempotency: null, summary: "به‌روزرسانی سیاست اتاق (پزشک)" },
  "POST /appointments/{id}/video/recording-consent": { method: "POST", path: "/appointments/{id}/video/recording-consent", public: false, idempotency: null, summary: "ثبت رضایت ضبط هر طرف" },
  "POST /appointments/{id}/video/token": { method: "POST", path: "/appointments/{id}/video/token", public: false, idempotency: null, summary: "دریافت توکن پیوستن به اتاق" },
  "GET /appointments/{id}/visit-summary": { method: "GET", path: "/appointments/{id}/visit-summary", public: false, idempotency: null, summary: "خلاصه ویزیت منتشرشده" },
  "POST /appointments/recurring": { method: "POST", path: "/appointments/recurring", public: false, idempotency: null, summary: "M3: ایجاد رزرو تکرارشونده (پشت feature flag)" },
  "GET /appointments/recurring": { method: "GET", path: "/appointments/recurring", public: false, idempotency: null, summary: "M3: فهرست سریهای تکرارشونده" },
  "DELETE /appointments/recurring/{id}": { method: "DELETE", path: "/appointments/recurring/{id}", public: false, idempotency: null, summary: "M3: لغو سری و نوبتهای آینده آن" },
  "POST /auth/logout": { method: "POST", path: "/auth/logout", public: true, idempotency: null, summary: "خروج از این دستگاه؛ access token همین حالا باطل می‌شود" },
  "POST /auth/logout-all": { method: "POST", path: "/auth/logout-all", public: false, idempotency: null, summary: "خروج از همه‌ی دستگاه‌ها" },
  "POST /auth/mfa/verify": { method: "POST", path: "/auth/mfa/verify", public: false, idempotency: null, summary: "تأیید step-up (TOTP یا کد پشتیبان تکبارمصرف)" },
  "POST /auth/otp/request": { method: "POST", path: "/auth/otp/request", public: true, idempotency: null, summary: "درخواست کد OTP (پاسخ همیشه یکسان است)" },
  "POST /auth/otp/verify": { method: "POST", path: "/auth/otp/verify", public: true, idempotency: null, summary: "تأیید OTP و دریافت access token (+ کوکی HttpOnly ی refresh)" },
  "GET /auth/passkey/credentials": { method: "GET", path: "/auth/passkey/credentials", public: false, idempotency: null, summary: "اعتبارنامههای passkey من" },
  "DELETE /auth/passkey/credentials/{id}": { method: "DELETE", path: "/auth/passkey/credentials/{id}", public: false, idempotency: null, summary: "حذف اعتبارنامه passkey" },
  "POST /auth/passkey/login/options": { method: "POST", path: "/auth/passkey/login/options", public: true, idempotency: null, summary: "چالش ورود با passkey" },
  "POST /auth/passkey/login/verify": { method: "POST", path: "/auth/passkey/login/verify", public: true, idempotency: null, summary: "ورود با passkey و صدور نشست" },
  "POST /auth/passkey/register/options": { method: "POST", path: "/auth/passkey/register/options", public: false, idempotency: null, summary: "گزینههای ثبت passkey" },
  "POST /auth/passkey/register/verify": { method: "POST", path: "/auth/passkey/register/verify", public: false, idempotency: null, summary: "تأیید ثبت passkey" },
  "POST /auth/refresh": { method: "POST", path: "/auth/refresh", public: true, idempotency: null, summary: "تمدید نشست با کوکی refresh (چرخشی؛ استفاده‌ی دوباره ⇒ ابطال کل نشست)" },
  "GET /clinics": { method: "GET", path: "/clinics", public: false, idempotency: null, summary: "فهرست کلینیک‌ها با فاصله/جست‌وجو" },
  "GET /conversations": { method: "GET", path: "/conversations", public: false, idempotency: null, summary: "فهرست مکالمات" },
  "GET /conversations/{id}/messages": { method: "GET", path: "/conversations/{id}/messages", public: false, idempotency: null, summary: "پیامهای مکالمه" },
  "POST /conversations/{id}/summarize": { method: "POST", path: "/conversations/{id}/summarize", public: false, idempotency: null, summary: "خلاصهٔ استخراجی مکالمه با رضایت بیمار" },
  "GET /conversations/{id}/summary": { method: "GET", path: "/conversations/{id}/summary", public: false, idempotency: null, summary: "دریافت خلاصهٔ ذخیره‌شده" },
  "GET /conversations/messages/{msgId}/attachment": { method: "GET", path: "/conversations/messages/{msgId}/attachment", public: false, idempotency: null, summary: "لینک موقت پیوست پیام" },
  "GET /demo/config": { method: "GET", path: "/demo/config", public: true, idempotency: null, summary: "وضعیت ورود دمو (فقط غیر production)" },
  "POST /demo/login": { method: "POST", path: "/demo/login", public: true, idempotency: null, summary: "ورود خودکار دمو با نشست استاندارد" },
  "GET /demo/status": { method: "GET", path: "/demo/status", public: false, idempotency: null, summary: "وضعیت ورود دمو" },
  "GET /doctor/stats/daily": { method: "GET", path: "/doctor/stats/daily", public: false, idempotency: null, summary: "آمار روزانه پزشک (Read Model)" },
  "GET /doctor/stats/summary": { method: "GET", path: "/doctor/stats/summary", public: false, idempotency: null, summary: "خلاصه عملکرد پزشک" },
  "GET /doctors": { method: "GET", path: "/doctors", public: true, idempotency: null, summary: "جستجوی پزشکان فهرستشده" },
  "GET /doctors/{id}": { method: "GET", path: "/doctors/{id}", public: true, idempotency: null, summary: "جزئیات پزشک" },
  "GET /doctors/{id}/slots": { method: "GET", path: "/doctors/{id}/slots", public: true, idempotency: null, summary: "اسلاتهای آزاد پزشک در بازه (M3: ranked=true پیشنهاد رتبهبندیشده)" },
  "POST /doctors/applications": { method: "POST", path: "/doctors/applications", public: false, idempotency: null, summary: "ارسال درخواست پزشکی" },
  "GET /doctors/applications/mine": { method: "GET", path: "/doctors/applications/mine", public: false, idempotency: null, summary: "وضعیت درخواست پزشک من" },
  "GET /doctors/compare": { method: "GET", path: "/doctors/compare", public: false, idempotency: null, summary: "مقایسه حداکثر ۳ پزشک" },
  "GET /doctors/me/availability": { method: "GET", path: "/doctors/me/availability", public: false, idempotency: null, summary: "برنامه هفتگی و تنظیمات پزشک" },
  "PUT /doctors/me/availability": { method: "PUT", path: "/doctors/me/availability", public: false, idempotency: null, summary: "جایگزینی کامل برنامه هفتگی" },
  "PATCH /doctors/me/settings": { method: "PATCH", path: "/doctors/me/settings", public: false, idempotency: null, summary: "تنظیمات پزشک شامل اطلاعات عمومی مطب" },
  "PUT /doctors/me/specialties": { method: "PUT", path: "/doctors/me/specialties", public: false, idempotency: null, summary: "تنظیم تخصصها (حداکثر ۳)" },
  "GET /doctors/me/time-off": { method: "GET", path: "/doctors/me/time-off", public: false, idempotency: null, summary: "مرخصیهای آینده پزشک" },
  "POST /doctors/me/time-off": { method: "POST", path: "/doctors/me/time-off", public: false, idempotency: null, summary: "ثبت مرخصی" },
  "DELETE /doctors/me/time-off/{id}": { method: "DELETE", path: "/doctors/me/time-off/{id}", public: false, idempotency: null, summary: "حذف مرخصی" },
  "GET /me": { method: "GET", path: "/me", public: false, idempotency: null, summary: "کاربر جاری" },
  "GET /me/consent-ledger": { method: "GET", path: "/me/consent-ledger", public: false, idempotency: null, summary: "دفتر رضایت‌نامه‌ها و رسیدها" },
  "POST /me/consents": { method: "POST", path: "/me/consents", public: false, idempotency: null, summary: "ثبت رضایت‌نامه" },
  "GET /me/consents": { method: "GET", path: "/me/consents", public: false, idempotency: null, summary: "فهرست رضایتنامهها" },
  "POST /me/consents/{type}/revoke": { method: "POST", path: "/me/consents/{type}/revoke", public: false, idempotency: null, summary: "ابطال رضایتنامه" },
  "POST /me/data-requests": { method: "POST", path: "/me/data-requests", public: false, idempotency: null, summary: "درخواست خروجی کامل یا حذف داده" },
  "GET /me/data-requests": { method: "GET", path: "/me/data-requests", public: false, idempotency: null, summary: "فهرست درخواستهای داده" },
  "POST /me/data-requests/{id}/cancel": { method: "POST", path: "/me/data-requests/{id}/cancel", public: false, idempotency: null, summary: "لغو درخواست در انتظار" },
  "GET /me/data-requests/{id}/download": { method: "GET", path: "/me/data-requests/{id}/download", public: false, idempotency: null, summary: "لینک موقت دانلود خروجی کامل" },
  "GET /me/family": { method: "GET", path: "/me/family", public: false, idempotency: null, summary: "اعضای خانواده (کد ملی ماسک‌شده)" },
  "POST /me/family": { method: "POST", path: "/me/family", public: false, idempotency: null, summary: "افزودن عضو (کد ملی رمزنگاری می‌شود)" },
  "PATCH /me/family/{id}": { method: "PATCH", path: "/me/family/{id}", public: false, idempotency: null, summary: "ویرایش عضو" },
  "DELETE /me/family/{id}": { method: "DELETE", path: "/me/family/{id}", public: false, idempotency: null, summary: "حذف عضو" },
  "POST /me/feedback": { method: "POST", path: "/me/feedback", public: false, idempotency: null, summary: "ثبت NPS (۰..۱۰)" },
  "GET /me/feedback": { method: "GET", path: "/me/feedback", public: false, idempotency: null, summary: "خلاصهٔ NPS کاربر" },
  "GET /me/health-profile": { method: "GET", path: "/me/health-profile", public: false, idempotency: null, summary: "پروفایل سلامت من" },
  "PUT /me/health-profile": { method: "PUT", path: "/me/health-profile", public: false, idempotency: null, summary: "ذخیره پروفایل سلامت" },
  "GET /me/health-record/fhir": { method: "GET", path: "/me/health-record/fhir", public: false, idempotency: null, summary: "خروجی کامل پرونده به صورت FHIR R4 Bundle" },
  "POST /me/health/export": { method: "POST", path: "/me/health/export", public: false, idempotency: null, summary: "خروجی رمزشدهٔ پرونده با کلید بیمار" },
  "GET /me/health/medications": { method: "GET", path: "/me/health/medications", public: false, idempotency: null, summary: "آخرین بازبینی داروها" },
  "POST /me/health/medications/reconcile": { method: "POST", path: "/me/health/medications/reconcile", public: false, idempotency: null, summary: "بازبینی داروها و هشدارهای غیرتشخیصی" },
  "GET /me/health/timeline": { method: "GET", path: "/me/health/timeline", public: false, idempotency: null, summary: "تایم‌لاین سلامت با روند" },
  "POST /me/health/timeline": { method: "POST", path: "/me/health/timeline", public: false, idempotency: null, summary: "افزودن نقطهٔ سلامت" },
  "GET /me/mfa": { method: "GET", path: "/me/mfa", public: false, idempotency: null, summary: "وضعیت TOTP کاربر جاری" },
  "POST /me/mfa/disable": { method: "POST", path: "/me/mfa/disable", public: false, idempotency: null, summary: "غیرفعالسازی TOTP (در صورت الزام سیاست ادمین ممنوع)" },
  "POST /me/mfa/enable": { method: "POST", path: "/me/mfa/enable", public: false, idempotency: null, summary: "فعالسازی TOTP با کد تأیید و صدور access token دارای claim ی mfa" },
  "POST /me/mfa/enroll": { method: "POST", path: "/me/mfa/enroll", public: false, idempotency: null, summary: "ساخت راز TOTP و کدهای پشتیبان (فقط یکبار نمایش داده میشود)" },
  "POST /me/mfa/rotate": { method: "POST", path: "/me/mfa/rotate", public: false, idempotency: null, summary: "چرخش راز TOTP حساب فعال (فقط با کد فعلی)" },
  "GET /me/notification-preferences": { method: "GET", path: "/me/notification-preferences", public: false, idempotency: null, summary: "ماتریس ترجیحات اعلان و ساعات سکوت" },
  "PUT /me/notification-preferences": { method: "PUT", path: "/me/notification-preferences", public: false, idempotency: null, summary: "به‌روزرسانی ترجیحات اعلان" },
  "PATCH /me/profile": { method: "PATCH", path: "/me/profile", public: false, idempotency: null, summary: "ویرایش پروفایل" },
  "GET /me/quick-replies": { method: "GET", path: "/me/quick-replies", public: false, idempotency: null, summary: "پاسخ‌های سریع پزشک" },
  "POST /me/quick-replies": { method: "POST", path: "/me/quick-replies", public: false, idempotency: null, summary: "افزودن پاسخ سریع" },
  "DELETE /me/quick-replies/{id}": { method: "DELETE", path: "/me/quick-replies/{id}", public: false, idempotency: null, summary: "حذف پاسخ سریع" },
  "GET /me/ui-preferences": { method: "GET", path: "/me/ui-preferences", public: false, idempotency: null, summary: "ترجیحات ظاهر/دسترس‌پذیری" },
  "PUT /me/ui-preferences": { method: "PUT", path: "/me/ui-preferences", public: false, idempotency: null, summary: "به‌روزرسانی ترجیحات ظاهر/دسترس‌پذیری" },
  "GET /me/workspace": { method: "GET", path: "/me/workspace", public: false, idempotency: null, summary: "داشبورد کاری پزشک" },
  "PUT /me/workspace": { method: "PUT", path: "/me/workspace", public: false, idempotency: null, summary: "تغییر داشبورد کاری پزشک" },
  "GET /notifications": { method: "GET", path: "/notifications", public: false, idempotency: null, summary: "فهرست اعلان‌ها (cursor)" },
  "PATCH /notifications/{id}/read": { method: "PATCH", path: "/notifications/{id}/read", public: false, idempotency: null, summary: "علامت خوانده‌شده" },
  "PATCH /notifications/read-all": { method: "PATCH", path: "/notifications/read-all", public: false, idempotency: null, summary: "همه خوانده شد" },
  "GET /notifications/stream": { method: "GET", path: "/notifications/stream", public: false, idempotency: null, summary: "جریان SSE اعلانها" },
  "GET /payments/{appointmentId}": { method: "GET", path: "/payments/{appointmentId}", public: false, idempotency: null, summary: "وضعیت پرداخت نوبت" },
  "POST /payments/initiate": { method: "POST", path: "/payments/initiate", public: false, idempotency: "required", summary: "شروع پرداخت نوبت (⇒ نشانی درگاه)" },
  "POST /payments/verify": { method: "POST", path: "/payments/verify", public: false, idempotency: "optional", summary: "بازگشت از درگاه: تأیید با «سرور درگاه» (Status ی مرورگر بی‌اثر است)" },
  "GET /prescriptions": { method: "GET", path: "/prescriptions", public: false, idempotency: null, summary: "فهرست نسخهها" },
  "GET /prescriptions/{id}": { method: "GET", path: "/prescriptions/{id}", public: false, idempotency: null, summary: "جزئیات نسخه" },
  "POST /prescriptions/{id}/cancel": { method: "POST", path: "/prescriptions/{id}/cancel", public: false, idempotency: null, summary: "ابطال نسخه" },
  "GET /prescriptions/verify": { method: "GET", path: "/prescriptions/verify", public: true, idempotency: null, summary: "استعلام اعتبار نسخه توسط داروساز" },
  "GET /push/public-key": { method: "GET", path: "/push/public-key", public: true, idempotency: null, summary: "کلید عمومی VAPID" },
  "POST /push/subscribe": { method: "POST", path: "/push/subscribe", public: false, idempotency: null, summary: "ثبت اشتراک Web Push" },
  "POST /push/unsubscribe": { method: "POST", path: "/push/unsubscribe", public: false, idempotency: null, summary: "لغو اشتراک Web Push" },
  "POST /records": { method: "POST", path: "/records", public: false, idempotency: null, summary: "ایجاد پرونده‌ی سلامت" },
  "GET /records": { method: "GET", path: "/records", public: false, idempotency: null, summary: "فهرست پرونده سلامت" },
  "PATCH /records/{id}": { method: "PATCH", path: "/records/{id}", public: false, idempotency: null, summary: "ویرایش پرونده" },
  "GET /records/{id}": { method: "GET", path: "/records/{id}", public: false, idempotency: null, summary: "جزئیات پرونده" },
  "DELETE /records/{id}": { method: "DELETE", path: "/records/{id}", public: false, idempotency: null, summary: "حذف پرونده" },
  "POST /records/{id}/attachments": { method: "POST", path: "/records/{id}/attachments", public: false, idempotency: null, summary: "ثبت پیوست (پس از آپلود به MinIO)" },
  "POST /records/{id}/shares": { method: "POST", path: "/records/{id}/shares", public: false, idempotency: null, summary: "اشتراک پرونده با یک پزشک" },
  "DELETE /records/{id}/shares/{shareId}": { method: "DELETE", path: "/records/{id}/shares/{shareId}", public: false, idempotency: null, summary: "لغو اشتراک" },
  "GET /records/attachments/{attId}/download": { method: "GET", path: "/records/attachments/{attId}/download", public: false, idempotency: null, summary: "لینک موقت دانلود پیوست" },
  "GET /second-opinions": { method: "GET", path: "/second-opinions", public: false, idempotency: null, summary: "فهرست درخواستهای نظر دوم" },
  "POST /second-opinions": { method: "POST", path: "/second-opinions", public: false, idempotency: null, summary: "درخواست نظر دوم" },
  "GET /second-opinions/settings": { method: "GET", path: "/second-opinions/settings", public: false, idempotency: null, summary: "تنظیمات پذیرش نظر دوم پزشک" },
  "GET /specialties": { method: "GET", path: "/specialties", public: true, idempotency: null, summary: "فهرست تخصصها" },
  "GET /status": { method: "GET", path: "/status", public: true, idempotency: null, summary: "وضعیت عمومی سامانه (cache ی ۳۰ثانیه‌ای؛ بدون هیچ عدد داخلی)" },
  "POST /storage/allowed-types": { method: "POST", path: "/storage/allowed-types", public: false, idempotency: null, summary: "انواع فایل مجاز" },
  "POST /storage/finalize": { method: "POST", path: "/storage/finalize", public: false, idempotency: null, summary: "تحلیل، قرنطینه و اسکن فایل آپلودشده (فقط APPROVED قابل ارائه)" },
  "POST /storage/upload-token": { method: "POST", path: "/storage/upload-token", public: false, idempotency: null, summary: "توکن آپلود محدود به نوع/اندازه" },
  "POST /triage": { method: "POST", path: "/triage", public: false, idempotency: null, summary: "ارزیابی اولیه (غیرتشخیصی)" },
  "POST /triage-governance/evaluate": { method: "POST", path: "/triage-governance/evaluate", public: false, idempotency: null, summary: "ارزیابی توضیح‌پذیر علائم با نسخهٔ فعال" },
  "POST /triage-governance/rulesets/{version}/evaluate": { method: "POST", path: "/triage-governance/rulesets/{version}/evaluate", public: false, idempotency: null, summary: "ارزیابی با نسخهٔ مشخص" },
  "GET /triage-governance/rulesets/active": { method: "GET", path: "/triage-governance/rulesets/active", public: false, idempotency: null, summary: "نسخهٔ فعال قواعد triage" },
  "GET /triage/catalog": { method: "GET", path: "/triage/catalog", public: true, idempotency: null, summary: "کاتالوگ علائم و سوالات" },
  "POST /video/webhook": { method: "POST", path: "/video/webhook", public: true, idempotency: null, summary: "webhook رویدادهای LiveKit" },
  "POST /vitals": { method: "POST", path: "/vitals", public: false, idempotency: null, summary: "ثبت اندازهگیری (فشارخون/قند/وزن/ضربان/دما/اکسیژن)" },
  "GET /vitals": { method: "GET", path: "/vitals", public: false, idempotency: null, summary: "فهرست اندازهگیریها و روند" },
  "DELETE /vitals/{id}": { method: "DELETE", path: "/vitals/{id}", public: false, idempotency: null, summary: "حذف اندازهگیری توسط ثبتکننده" },
  "POST /waitlist": { method: "POST", path: "/waitlist", public: false, idempotency: null, summary: "پیوستن به لیست انتظار یک پزشک" },
  "GET /waitlist": { method: "GET", path: "/waitlist", public: false, idempotency: null, summary: "ورودیهای لیست انتظار من" },
  "DELETE /waitlist/{id}": { method: "DELETE", path: "/waitlist/{id}", public: false, idempotency: null, summary: "خروج از لیست انتظار" },
  "GET /wallet": { method: "GET", path: "/wallet", public: false, idempotency: null, summary: "موجودی کیف پول" },
  "GET /wallet/history": { method: "GET", path: "/wallet/history", public: false, idempotency: null, summary: "تاریخچه دفتر کل من" },
  "GET /wallet/insurance": { method: "GET", path: "/wallet/insurance", public: false, idempotency: null, summary: "بیمههای من" },
  "POST /wallet/insurance": { method: "POST", path: "/wallet/insurance", public: false, idempotency: null, summary: "افزودن بیمه (شماره رمزنگاریشده)" },
  "POST /wallet/insurance/settle": { method: "POST", path: "/wallet/insurance/settle", public: false, idempotency: null, summary: "تسویه سهم بیمه با پزشک" },
  "POST /wallet/payouts": { method: "POST", path: "/wallet/payouts", public: false, idempotency: null, summary: "درخواست تسویه پزشک" },
  "GET /wallet/payouts": { method: "GET", path: "/wallet/payouts", public: false, idempotency: null, summary: "درخواستهای تسویه" },
  "PATCH /wallet/payouts/{id}": { method: "PATCH", path: "/wallet/payouts/{id}", public: false, idempotency: null, summary: "تصمیم ادمین درباره تسویه" },
  "POST /wallet/topup": { method: "POST", path: "/wallet/topup", public: false, idempotency: "required", summary: "شارژ کیف پول (sandbox)" },
} as const;

export type OperationKey = keyof Operations;
