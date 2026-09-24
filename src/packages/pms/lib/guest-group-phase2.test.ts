import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { GUEST_ACCOUNT_EVENT_TYPES } from "./guest-profile-wave4.ts";
import {
  GROUP_COMMS_TEMPLATES_UNAVAILABLE,
  GROUP_CONVERT_UNAVAILABLE,
  GROUP_DETAIL_NAV,
  GROUP_DOCUMENTS_COPY,
  GROUP_EVENTS_UNAVAILABLE,
  GROUP_INVOICE_SERVICE_UNAVAILABLE,
  GROUP_ITINERARY_COPY,
  GROUP_TEMPLATES_MIGRATION_FILE,
  GROUP_TRANSPORT_UNAVAILABLE,
  groupActionAllowed,
} from "./guest-group-detail-workspace.ts";
import {
  getGroupInvoices,
  groupCommunicationTemplateService,
  groupInvoiceService,
} from "./guest-group-financials.ts";
import { emptyGuestGroupCreateDraft } from "./guest-group-create-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Group Phase 2", () => {
  it("adds itinerary and documents to live group nav", () => {
    assert.deepEqual(
      GROUP_DETAIL_NAV.map((item) => item.id),
      ["overview", "members", "reservations", "rooming", "itinerary", "financial", "communication", "documents", "history"],
    );
    const workspace = readRel("../components/workspaces/guest-group-detail-workspace.tsx");
    assert.match(workspace, /GuestGroupItinerary/);
    assert.match(workspace, /GuestGroupDocuments/);
    assert.match(workspace, /group-nav-\$\{item\.id\}/);
  });

  it("keeps 0098 as templates only — no invoice, itinerary, or rooming tables", () => {
    const supabase = readRel("../../../../supabase/migrations/0098_pms_group_phase2.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0098_pms_group_phase2.sql");
    assert.equal(supabase, drizzle);
    assert.equal(GROUP_TEMPLATES_MIGRATION_FILE, "0098_pms_group_phase2.sql");
    assert.match(supabase, /CREATE TABLE IF NOT EXISTS public\.pms_group_templates/);
    assert.match(supabase, /template_applied/);
    assert.match(supabase, /duplicated/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.pms_groups\b/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.group_rooming/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.group_invoices/);
    assert.doesNotMatch(supabase, /CREATE TABLE IF NOT EXISTS public\.group_itinerary/);
  });

  it("swaps and bulk-assigns through assignGroupRoom and listAssignableRooms", () => {
    const functions = readRel("./guest-group-detail.functions.ts");
    assert.match(functions, /export const swapGroupRooms/);
    assert.match(functions, /export const bulkAssignGroupRooms/);
    assert.match(functions, /export const moveGroupCheckedInRoom/);
    assert.match(functions, /listAssignableRooms/);
    assert.match(functions, /assignGroupRoom/);
    assert.match(functions, /moveReservationRoom/);
    assert.doesNotMatch(functions, /from\("group_rooming"\)/);
  });

  it("keeps invoices as an empty service and financial writes on cashiering", () => {
    assert.deepEqual(getGroupInvoices().invoices, []);
    assert.equal(groupInvoiceService.create().available, false);
    assert.equal(groupInvoiceService.draft().available, false);
    assert.equal(groupInvoiceService.finalize().available, false);
    assert.equal(groupInvoiceService.send().available, false);
    assert.equal(groupInvoiceService.create().reason, GROUP_INVOICE_SERVICE_UNAVAILABLE);
    const financials = readRel("../components/guests/guest-group-financials.tsx");
    const functions = readRel("./guest-group-detail.functions.ts");
    assert.match(financials, /\/restaurant\/cashiering\/folios\/\$folioId/);
    assert.doesNotMatch(financials, /postFolioEntry/);
    assert.doesNotMatch(functions, /postFolioEntry/);
  });

  it("builds itinerary from guest services and keeps events/transport unavailable", () => {
    const functions = readRel("./guest-group-detail.functions.ts");
    const itinerary = readRel("../components/guests/guest-group-itinerary.tsx");
    assert.match(functions, /from\("guest_service_history"\)/);
    assert.match(functions, /createGuestServiceRequest/);
    assert.match(itinerary, /GROUP_EVENTS_UNAVAILABLE/);
    assert.match(itinerary, /GROUP_TRANSPORT_UNAVAILABLE/);
    assert.match(GROUP_EVENTS_UNAVAILABLE, /not available/);
    assert.match(GROUP_TRANSPORT_UNAVAILABLE, /not available/);
    assert.match(GROUP_ITINERARY_COPY, /guest service/);
  });

  it("reuses guest_company_documents for group files", () => {
    const functions = readRel("./guest-group-detail.functions.ts");
    const documents = readRel("../components/guests/guest-group-documents.tsx");
    assert.match(functions, /from\("guest_company_documents"\)/);
    assert.match(functions, /from\("pms_company_document_types"\)/);
    assert.match(functions, /document_uploaded/);
    assert.match(documents, /createGroupDocumentUpload/);
    assert.match(GROUP_DOCUMENTS_COPY, /guest_company_documents/);
  });

  it("duplicates identity fields only and never copies money or stays", () => {
    const functions = readRel("./guest-group-detail.functions.ts");
    const start = functions.indexOf("export const duplicateGroupMaster");
    const end = functions.indexOf("export const applyGroupTemplate");
    const dupe = functions.slice(start, end);
    assert.match(dupe, /accountStatus: "pending"/);
    assert.match(dupe, /eventType: "duplicated"/);
    assert.match(dupe, /sourceGroupId/);
    assert.doesNotMatch(dupe, /folio_transactions/);
    assert.doesNotMatch(dupe, /hotel_reservations/);
    assert.doesNotMatch(dupe, /guest_account_links/);
  });

  it("applies templates as a copy into a new draft or group", () => {
    const functions = readRel("./guest-group-detail.functions.ts");
    const templates = readRel("./guest-group-templates.ts");
    const create = readRel("../components/workspaces/guest-group-create-workspace.tsx");
    assert.equal(emptyGuestGroupCreateDraft().groupId, null);
    assert.match(templates, /export function applyGroupTemplateToDraft/);
    assert.match(templates, /emptyGuestGroupCreateDraft\(\)/);
    assert.match(templates, /draft.groupTypeId = payload.groupTypeId/);
    assert.match(templates, /not a live group/);
    assert.match(create, /applyGroupTemplateToDraft/);
    assert.doesNotMatch(templates, /draft.groupId = payload/);
    assert.match(functions, /export const applyGroupTemplate/);
    assert.match(functions, /eventType: "template_applied"/);
    assert.match(functions, /templateId: data.templateId/);
    assert.match(functions, /accountStatus: "pending"/);
    assert.equal(GUEST_ACCOUNT_EVENT_TYPES.includes("template_applied"), true);
    assert.equal(GUEST_ACCOUNT_EVENT_TYPES.includes("duplicated"), true);
  });

  it("gates header actions by status and keeps unavailable actions disabled", () => {
    assert.equal(groupActionAllowed("edit", "pending"), true);
    assert.equal(groupActionAllowed("edit", "inactive"), false);
    assert.equal(groupActionAllowed("assign_rooms", "pending", { hasReservations: true }), true);
    assert.equal(groupActionAllowed("assign_rooms", "inactive", { hasReservations: true }), false);
    assert.equal(groupActionAllowed("confirm", "pending", { canConfirm: true }), true);
    assert.equal(groupActionAllowed("confirm", "active"), false);
    assert.equal(groupActionAllowed("reopen", "active"), true);
    assert.equal(groupActionAllowed("reopen", "inactive"), true);
    assert.equal(groupActionAllowed("duplicate", "inactive"), true);
    assert.equal(groupActionAllowed("export_rooming", "inactive"), true);
    assert.equal(groupActionAllowed("generate_invoice", "active"), false);
    assert.equal(groupActionAllowed("convert_individual", "pending"), false);
    const header = readRel("../components/guests/guest-group-header.tsx");
    assert.match(header, /groupActionAllowed/);
    assert.match(header, /duplicateGroupMaster/);
    assert.match(header, /GROUP_CONVERT_UNAVAILABLE/);
    assert.equal(groupCommunicationTemplateService.list().templates.length, 0);
    assert.equal(groupCommunicationTemplateService.list().reason, GROUP_COMMS_TEMPLATES_UNAVAILABLE);
    assert.match(GROUP_CONVERT_UNAVAILABLE, /not available/);
  });
});
