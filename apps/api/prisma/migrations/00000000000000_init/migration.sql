-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR', 'EXPIRED', 'NO_SHOW_PATIENT', 'NO_SHOW_DOCTOR');

-- CreateEnum
CREATE TYPE "AppointmentKind" AS ENUM ('IN_PERSON', 'VIDEO', 'CHAT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('ZARINPAL', 'ZIBAL', 'IDPAY', 'SANDBOX');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'VERIFIED', 'FAILED', 'EXPIRED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'MANUAL', 'REVIEW');

-- CreateEnum
CREATE TYPE "RefundApprovalState" AS ENUM ('NONE', 'REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundApprovalAction" AS ENUM ('EXECUTE', 'MARK_PROCESSED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PRIVACY_POLICY', 'HEALTH_DATA_PROCESSING', 'TERMS', 'AMBIENT_SCRIBE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IncidentImpact" AS ENUM ('NONE', 'MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSED', 'DEAD');

-- CreateEnum
CREATE TYPE "IdempotencyState" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'FILE', 'IMAGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SecondOpinionStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED', 'ANSWERED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SoapStatus" AS ENUM ('DRAFT', 'SIGNED');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VideoEventKind" AS ENUM ('ROOM_STARTED', 'PARTICIPANT_JOINED', 'PARTICIPANT_LEFT', 'ROOM_FINISHED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('APPOINTMENT_REMINDER', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_CANCELLED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'SECOND_OPINION_READY', 'SECOND_OPINION_REQUESTED', 'SECOND_OPINION_ACCEPTED', 'SECOND_OPINION_DECLINED', 'VISIT_SUMMARY_READY', 'PRESCRIPTION_ISSUED', 'PRESCRIPTION_CANCELLED', 'VIDEO_ROOM_READY', 'APPOINTMENT_RESCHEDULED', 'VITAL_ALERT', 'SCRIBE_DRAFT_READY', 'WAITLIST_OFFER', 'DATA_REQUEST_READY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RecordCategory" AS ENUM ('NOTE', 'LAB_RESULT', 'IMAGING', 'PRESCRIPTION', 'DISCHARGE_SUMMARY', 'REFERRAL', 'VACCINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "VitalType" AS ENUM ('BLOOD_PRESSURE', 'BLOOD_GLUCOSE', 'WEIGHT', 'HEART_RATE', 'BODY_TEMPERATURE', 'OXYGEN_SATURATION');

-- CreateEnum
CREATE TYPE "VitalSource" AS ENUM ('MANUAL', 'DEVICE');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScribeStatus" AS ENUM ('CONSENTED', 'TRANSCRIPT_READY', 'DRAFT_GENERATED', 'DISCARDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('EXPORT', 'DELETE');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerTxKind" AS ENUM ('TOPUP', 'PAYMENT', 'REFUND', 'PAYOUT', 'INSURANCE_SETTLEMENT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone_hash" TEXT NOT NULL,
    "phone_enc" BYTEA NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfa_secret_enc" BYTEA,
    "mfa_enabled_at" TIMESTAMPTZ,
    "mfa_recovery_hash" TEXT,
    "mfa_failed_count" INTEGER NOT NULL DEFAULT 0,
    "mfa_locked_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_profiles" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "birth_date_enc" BYTEA,
    "gender" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "doctor_profiles" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "medical_council_no" TEXT,
    "bio" TEXT,
    "consultation_fee_rial" BIGINT NOT NULL DEFAULT 0,
    "slot_minutes" INTEGER NOT NULL DEFAULT 20,
    "auto_confirm" BOOLEAN NOT NULL DEFAULT false,
    "is_listed" BOOLEAN NOT NULL DEFAULT false,
    "accepts_second_opinions" BOOLEAN NOT NULL DEFAULT false,
    "clinic_name" TEXT,
    "clinic_address" TEXT,
    "clinic_phone" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name_fa" TEXT NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_specialties" (
    "doctor_id" UUID NOT NULL,
    "specialty_id" INTEGER NOT NULL,

    CONSTRAINT "doctor_specialties_pkey" PRIMARY KEY ("doctor_id","specialty_id")
);

-- CreateTable
CREATE TABLE "doctor_verifications" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "document_key" TEXT NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_offs" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "reason" TEXT,

    CONSTRAINT "time_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "kind" "AppointmentKind" NOT NULL DEFAULT 'VIDEO',
    "reason_enc" BYTEA,
    "price_rial" BIGINT NOT NULL,
    "hold_expires_at" TIMESTAMPTZ,
    "reminder_24_sent_at" TIMESTAMPTZ,
    "reminder_1_sent_at" TIMESTAMPTZ,
    "no_show_risk" INTEGER,
    "risk_scored_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" BIGSERIAL NOT NULL,
    "appointment_id" UUID NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus" NOT NULL,
    "actor_id" UUID,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "gateway_ref" TEXT,
    "gateway" "PaymentGateway",
    "idempotency_key" TEXT NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "paid_at" TIMESTAMPTZ,
    "appointment_synced_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "authority" TEXT NOT NULL,
    "pay_url" TEXT,
    "amount_rial" BIGINT NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
    "ref_id" TEXT,
    "card_pan_masked" TEXT,
    "fee_rial" BIGINT,
    "failure_code" TEXT,
    "check_count" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMPTZ,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_incidents" (
    "id" UUID NOT NULL,
    "title_fa" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'INVESTIGATING',
    "impact" "IncidentImpact" NOT NULL,
    "component_id" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "status_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_incident_updates" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "body_fa" TEXT NOT NULL,
    "author_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "state" "IdempotencyState" NOT NULL DEFAULT 'IN_PROGRESS',
    "locked_until" TIMESTAMPTZ NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_id" UUID,
    "gateway" "PaymentGateway",
    "external_ref" TEXT,
    "try_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "claimed_at" TIMESTAMPTZ,
    "processed_at" TIMESTAMPTZ,
    "processed_by" UUID,
    "note" TEXT,
    "approval_state" "RefundApprovalState" NOT NULL DEFAULT 'NONE',
    "approval_action" "RefundApprovalAction",
    "approval_ref" TEXT,
    "maker_id" UUID,
    "maker_note" TEXT,
    "requested_at" TIMESTAMPTZ,
    "checker_id" UUID,
    "checker_note" TEXT,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_records" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content_enc" BYTEA NOT NULL,
    "category" "RecordCategory" NOT NULL DEFAULT 'NOTE',
    "visit_date" DATE,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "health_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_attachments" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_shares" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "record_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body_enc" BYTEA NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "attachment_mime" TEXT,
    "attachment_bytes" INTEGER,
    "read_at" TIMESTAMPTZ,
    "edited_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_sessions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "answers_enc" BYTEA NOT NULL,
    "result_enc" BYTEA,
    "engine_version" TEXT NOT NULL DEFAULT 'rules-1.0.0',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "second_opinions" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "status" "SecondOpinionStatus" NOT NULL DEFAULT 'REQUESTED',
    "request_enc" BYTEA NOT NULL,
    "response_enc" BYTEA,
    "include_visit_summary" BOOLEAN NOT NULL DEFAULT false,
    "shared_record_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "accept_deadline_at" TIMESTAMPTZ NOT NULL,
    "answer_deadline_at" TIMESTAMPTZ,
    "shares_expire_at" TIMESTAMPTZ NOT NULL,
    "responded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "second_opinions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_health_profiles" (
    "patient_id" UUID NOT NULL,
    "data_enc" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "patient_health_profiles_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "soap_notes" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "SoapStatus" NOT NULL DEFAULT 'DRAFT',
    "content_enc" BYTEA NOT NULL,
    "patient_summary_enc" BYTEA,
    "version" INTEGER NOT NULL DEFAULT 1,
    "signed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "soap_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soap_addenda" (
    "id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "body_enc" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soap_addenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_summaries" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "summary_enc" BYTEA NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "appointment_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "items_enc" BYTEA NOT NULL,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "cancel_reason_enc" BYTEA,
    "warnings_acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_rooms" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "room_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doctor_first_join_at" TIMESTAMPTZ,
    "patient_first_join_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,

    CONSTRAINT "video_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_events" (
    "id" BIGSERIAL NOT NULL,
    "event_id" TEXT NOT NULL,
    "room_id" UUID NOT NULL,
    "kind" "VideoEventKind" NOT NULL,
    "role" TEXT,
    "at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "seq" BIGINT,
    "actor_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT,
    "meta" JSONB,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prev_hash" TEXT,
    "hash" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_chain_head" (
    "id" SMALLINT NOT NULL,
    "last_seq" BIGINT NOT NULL DEFAULT 0,
    "hash" TEXT,

    CONSTRAINT "audit_chain_head_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_busy" (
    "appointment_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "appointment_busy_pkey" PRIMARY KEY ("appointment_id")
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "national_id" BYTEA,
    "birth_year" INTEGER,
    "relation" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title_fa" TEXT NOT NULL,
    "body_fa" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint_hash" TEXT NOT NULL,
    "endpoint_enc" BYTEA NOT NULL,
    "p256dh_enc" BYTEA NOT NULL,
    "auth_enc" BYTEA NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_success_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_readings" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "type" "VitalType" NOT NULL,
    "value_primary" DOUBLE PRECISION NOT NULL,
    "value_secondary" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "measured_at" TIMESTAMPTZ NOT NULL,
    "source" "VitalSource" NOT NULL DEFAULT 'MANUAL',
    "note_enc" BYTEA,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vital_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_waitlist" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "kind" "AppointmentKind" NOT NULL DEFAULT 'VIDEO',
    "desired_from" TIMESTAMPTZ NOT NULL,
    "desired_to" TIMESTAMPTZ NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notified_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scribe_sessions" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "ScribeStatus" NOT NULL DEFAULT 'CONSENTED',
    "doctor_consent_at" TIMESTAMPTZ NOT NULL,
    "patient_consent_at" TIMESTAMPTZ NOT NULL,
    "transcript_enc" BYTEA,
    "draft_enc" BYTEA,
    "model" TEXT NOT NULL DEFAULT 'local-rules-1',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "userId" UUID,

    CONSTRAINT "scribe_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'PENDING',
    "object_key" TEXT,
    "note" TEXT,
    "execute_at" TIMESTAMPTZ,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_request_reviews" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "decision" VARCHAR(16) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_request_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT,
    "device_type" TEXT,
    "backed_up" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "code" VARCHAR(40),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IRR',
    "balance_rial" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "kind" "LedgerTxKind" NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "insurer" TEXT NOT NULL,
    "policy_number_enc" BYTEA,
    "coverage_percent" INTEGER NOT NULL DEFAULT 0,
    "valid_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_hash_key" ON "users"("phone_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE INDEX "consents_user_id_type_idx" ON "consents"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_profiles_medical_council_no_key" ON "doctor_profiles"("medical_council_no");

-- CreateIndex
CREATE INDEX "doctor_profiles_is_listed_idx" ON "doctor_profiles"("is_listed");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_slug_key" ON "specialties"("slug");

-- CreateIndex
CREATE INDEX "doctor_verifications_doctor_id_idx" ON "doctor_verifications"("doctor_id");

-- CreateIndex
CREATE INDEX "availability_rules_doctor_id_weekday_idx" ON "availability_rules"("doctor_id", "weekday");

-- CreateIndex
CREATE INDEX "time_offs_doctor_id_starts_at_idx" ON "time_offs"("doctor_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_starts_at_idx" ON "appointments"("doctor_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_starts_at_idx" ON "appointments"("patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_status_hold_expires_at_idx" ON "appointments"("status", "hold_expires_at");

-- CreateIndex
CREATE INDEX "appointment_status_history_appointment_id_at_idx" ON "appointment_status_history"("appointment_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_appointment_id_key" ON "payments"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_gateway_ref_idx" ON "payments"("gateway_ref");

-- CreateIndex
CREATE INDEX "payments_status_appointment_synced_at_idx" ON "payments"("status", "appointment_synced_at");

-- CreateIndex
CREATE INDEX "payment_attempts_payment_id_idx" ON "payment_attempts"("payment_id");

-- CreateIndex
CREATE INDEX "payment_attempts_status_created_at_idx" ON "payment_attempts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_gateway_authority_key" ON "payment_attempts"("gateway", "authority");

-- CreateIndex
CREATE INDEX "status_incidents_created_at_idx" ON "status_incidents"("created_at");

-- CreateIndex
CREATE INDEX "status_incident_updates_incident_id_created_at_idx" ON "status_incident_updates"("incident_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_status_created_at_idx" ON "refunds"("status", "created_at");

-- CreateIndex
CREATE INDEX "health_records_patient_id_idx" ON "health_records"("patient_id");

-- CreateIndex
CREATE INDEX "record_attachments_record_id_idx" ON "record_attachments"("record_id");

-- CreateIndex
CREATE INDEX "record_shares_doctor_id_idx" ON "record_shares"("doctor_id");

-- CreateIndex
CREATE UNIQUE INDEX "record_shares_record_id_doctor_id_key" ON "record_shares"("record_id", "doctor_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_appointment_id_key" ON "conversations"("appointment_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "triage_sessions_patient_id_created_at_idx" ON "triage_sessions"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "second_opinions_patient_id_status_idx" ON "second_opinions"("patient_id", "status");

-- CreateIndex
CREATE INDEX "second_opinions_doctor_id_status_idx" ON "second_opinions"("doctor_id", "status");

-- CreateIndex
CREATE INDEX "second_opinions_appointment_id_idx" ON "second_opinions"("appointment_id");

-- CreateIndex
CREATE INDEX "second_opinions_status_accept_deadline_at_idx" ON "second_opinions"("status", "accept_deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "soap_notes_appointment_id_key" ON "soap_notes"("appointment_id");

-- CreateIndex
CREATE INDEX "soap_notes_doctor_id_created_at_idx" ON "soap_notes"("doctor_id", "created_at");

-- CreateIndex
CREATE INDEX "soap_notes_patient_id_idx" ON "soap_notes"("patient_id");

-- CreateIndex
CREATE INDEX "soap_addenda_note_id_created_at_idx" ON "soap_addenda"("note_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "visit_summaries_appointment_id_key" ON "visit_summaries"("appointment_id");

-- CreateIndex
CREATE INDEX "visit_summaries_patient_id_published_at_idx" ON "visit_summaries"("patient_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_number_key" ON "prescriptions"("number");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_issued_at_idx" ON "prescriptions"("patient_id", "issued_at");

-- CreateIndex
CREATE INDEX "prescriptions_doctor_id_issued_at_idx" ON "prescriptions"("doctor_id", "issued_at");

-- CreateIndex
CREATE INDEX "prescriptions_appointment_id_idx" ON "prescriptions"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_rooms_appointment_id_key" ON "video_rooms"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_rooms_room_name_key" ON "video_rooms"("room_name");

-- CreateIndex
CREATE UNIQUE INDEX "video_events_event_id_key" ON "video_events"("event_id");

-- CreateIndex
CREATE INDEX "video_events_room_id_at_idx" ON "video_events"("room_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_at_idx" ON "audit_logs"("actor_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_object_type_object_id_idx" ON "audit_logs"("object_type", "object_id");

-- CreateIndex
CREATE INDEX "appointment_busy_doctor_id_starts_at_idx" ON "appointment_busy"("doctor_id", "starts_at");

-- CreateIndex
CREATE INDEX "family_members_owner_id_idx" ON "family_members"("owner_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_hash_key" ON "push_subscriptions"("endpoint_hash");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "vital_readings_patient_id_type_measured_at_idx" ON "vital_readings"("patient_id", "type", "measured_at");

-- CreateIndex
CREATE INDEX "appointment_waitlist_doctor_id_status_desired_from_idx" ON "appointment_waitlist"("doctor_id", "status", "desired_from");

-- CreateIndex
CREATE INDEX "appointment_waitlist_patient_id_status_idx" ON "appointment_waitlist"("patient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scribe_sessions_appointment_id_key" ON "scribe_sessions"("appointment_id");

-- CreateIndex
CREATE INDEX "scribe_sessions_doctor_id_created_at_idx" ON "scribe_sessions"("doctor_id", "created_at");

-- CreateIndex
CREATE INDEX "scribe_sessions_status_expires_at_idx" ON "scribe_sessions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "data_requests_user_id_requested_at_idx" ON "data_requests"("user_id", "requested_at");

-- CreateIndex
CREATE INDEX "data_requests_status_requested_at_idx" ON "data_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "data_request_reviews_request_id_idx" ON "data_request_reviews"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_request_reviews_request_id_admin_id_key" ON "data_request_reviews"("request_id", "admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "webauthn_credentials_user_id_idx" ON "webauthn_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_user_id_key" ON "wallet_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_code_key" ON "wallet_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotency_key_key" ON "ledger_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_transactions_kind_created_at_idx" ON "ledger_transactions"("kind", "created_at");

-- CreateIndex
CREATE INDEX "ledger_transactions_reference_type_reference_id_idx" ON "ledger_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- CreateIndex
CREATE INDEX "payouts_doctor_id_requested_at_idx" ON "payouts"("doctor_id", "requested_at");

-- CreateIndex
CREATE INDEX "payouts_status_requested_at_idx" ON "payouts"("status", "requested_at");

-- CreateIndex
CREATE INDEX "insurance_policies_patient_id_idx" ON "insurance_policies"("patient_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_specialties" ADD CONSTRAINT "doctor_specialties_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_specialties" ADD CONSTRAINT "doctor_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_verifications" ADD CONSTRAINT "doctor_verifications_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_offs" ADD CONSTRAINT "time_offs_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_incident_updates" ADD CONSTRAINT "status_incident_updates_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "status_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_attachments" ADD CONSTRAINT "record_attachments_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "health_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_shares" ADD CONSTRAINT "record_shares_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "health_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_shares" ADD CONSTRAINT "record_shares_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_sessions" ADD CONSTRAINT "triage_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "second_opinions" ADD CONSTRAINT "second_opinions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "second_opinions" ADD CONSTRAINT "second_opinions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "second_opinions" ADD CONSTRAINT "second_opinions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_health_profiles" ADD CONSTRAINT "patient_health_profiles_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_addenda" ADD CONSTRAINT "soap_addenda_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "soap_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_summaries" ADD CONSTRAINT "visit_summaries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_summaries" ADD CONSTRAINT "visit_summaries_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_summaries" ADD CONSTRAINT "visit_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_rooms" ADD CONSTRAINT "video_rooms_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_events" ADD CONSTRAINT "video_events_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "video_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "patient_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_readings" ADD CONSTRAINT "vital_readings_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_waitlist" ADD CONSTRAINT "appointment_waitlist_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scribe_sessions" ADD CONSTRAINT "scribe_sessions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scribe_sessions" ADD CONSTRAINT "scribe_sessions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scribe_sessions" ADD CONSTRAINT "scribe_sessions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scribe_sessions" ADD CONSTRAINT "scribe_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_request_reviews" ADD CONSTRAINT "data_request_reviews_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "data_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

