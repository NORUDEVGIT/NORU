import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("NORU PMS — Guest Profile: Edit Mode Guarantees Across All 4 Profile Types", async (t) => {
  const root = process.cwd();
  const guestModalSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-create-modal.tsx"),
    "utf8",
  );
  const companyModalSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-company-create-modal.tsx"),
    "utf8",
  );
  const travelAgencyModalSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-travel-agency-create-modal.tsx"),
    "utf8",
  );
  const groupModalSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-group-create-modal.tsx"),
    "utf8",
  );

  const guestFormDialogSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-form-dialog.tsx"),
    "utf8",
  );
  const companyDirSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-company-directory.tsx"),
    "utf8",
  );
  const companyDetailSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/workspaces/guest-company-detail-workspace.tsx"),
    "utf8",
  );
  const taDirSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-travel-agent-directory.tsx"),
    "utf8",
  );
  const taDetailSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/workspaces/guest-travel-agent-detail-workspace.tsx"),
    "utf8",
  );
  const groupDirSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/guests/guest-group-directory.tsx"),
    "utf8",
  );
  const groupDetailSrc = fs.readFileSync(
    path.join(root, "src/packages/pms/components/workspaces/guest-group-detail-workspace.tsx"),
    "utf8",
  );

  await t.test("1. All 4 modals accept edit mode props and bypass local creation holds", () => {
    // Guest
    assert.ok(guestModalSrc.includes('mode?: "create" | "edit"'));
    assert.ok(guestModalSrc.includes("!isEdit && open ? readGuestCreateHold"));
    assert.ok(guestModalSrc.includes("guestProfileToCreateDraft"));

    // Company
    assert.ok(companyModalSrc.includes('mode?: "create" | "edit"'));
    assert.ok(companyModalSrc.includes("!isEdit && open ? readGuestCompanyCreateHold"));
    assert.ok(companyModalSrc.includes("companyProfileToCreateDraft"));

    // Travel Agency
    assert.ok(travelAgencyModalSrc.includes('mode?: "create" | "edit"'));
    assert.ok(travelAgencyModalSrc.includes("!isEdit && open ? readGuestTravelAgentCreateHold"));
    assert.ok(travelAgencyModalSrc.includes("agencyProfileToCreateDraft"));

    // Group
    assert.ok(groupModalSrc.includes('mode?: "create" | "edit"'));
    assert.ok(groupModalSrc.includes("!isEdit && open ? readGuestGroupCreateHold"));
    assert.ok(groupModalSrc.includes("groupDetailToDraft"));
  });

  await t.test("2. Hold writes and debounced server drafts are completely disabled in edit mode", () => {
    // Guest
    assert.ok(guestModalSrc.includes("if (!open || !defaultsApplied || created || isEdit) return;"));

    // Company
    assert.ok(companyModalSrc.includes("if (!open || !defaultsApplied || created || isEdit) return;"));

    // Travel Agency
    assert.ok(travelAgencyModalSrc.includes("if (isEdit || !defaultsApplied || created) return;"));

    // Group
    assert.ok(groupModalSrc.includes("if (isEdit || !open || !defaultsApplied || created) return;"));
  });

  await t.test("3. All 4 modals provide direct Save Changes CTA in sticky footer during edit", () => {
    assert.ok(guestModalSrc.includes('data-testid="edit-guest-save-btn"'));
    assert.ok(guestModalSrc.includes("Save Changes"));

    assert.ok(companyModalSrc.includes('data-testid="edit-company-save-btn"'));
    assert.ok(companyModalSrc.includes("Save Changes"));

    assert.ok(travelAgencyModalSrc.includes('data-testid="edit-travel-agency-save-btn"'));
    assert.ok(travelAgencyModalSrc.includes("Save Changes"));

    assert.ok(groupModalSrc.includes('data-testid="edit-group-save-btn"'));
    assert.ok(groupModalSrc.includes("Save Changes"));
  });

  await t.test("4. Direct step jumping without blocking validation is allowed during edit mode", () => {
    assert.ok(guestModalSrc.includes("if (isEdit) {\n      setStep(next);\n      return;\n    }"));
    assert.ok(companyModalSrc.includes("if (isEdit) {\n      setStep(next);\n      return;\n    }"));
    assert.ok(travelAgencyModalSrc.includes("if (isEdit) {\n      setStep(next);\n      return;\n    }"));
    assert.ok(groupModalSrc.includes("if (isEdit) {\n      setStep(next);\n      return;\n    }"));
  });

  await t.test("5. Edit entry points across directory and detail views use new wide modals and stay in place", () => {
    // Guest
    assert.ok(guestFormDialogSrc.includes("<GuestCreateModal"));
    assert.ok(guestFormDialogSrc.includes('mode="edit"'));
    assert.ok(guestFormDialogSrc.includes("guest={props.guest}"));

    // Company Directory & Detail
    assert.ok(companyDirSrc.includes("<GuestCompanyCreateModal"));
    assert.ok(companyDirSrc.includes('mode={editId ? "edit" : "create"}'));
    assert.ok(companyDetailSrc.includes("<GuestCompanyCreateModal"));
    assert.ok(companyDetailSrc.includes('mode="edit"'));

    // Travel Agency Directory & Detail
    assert.ok(taDirSrc.includes("<GuestTravelAgencyCreateModal"));
    assert.ok(taDirSrc.includes('mode="edit"'));
    assert.ok(taDetailSrc.includes("<GuestTravelAgencyCreateModal"));
    assert.ok(taDetailSrc.includes('mode="edit"'));

    // Group Directory & Detail
    assert.ok(groupDirSrc.includes("<GuestGroupCreateModal"));
    assert.ok(groupDirSrc.includes('mode="edit"'));
    assert.ok(groupDetailSrc.includes("<GuestGroupCreateModal"));
    assert.ok(groupDetailSrc.includes('mode="edit"'));
  });

  await t.test("6. Directories do NOT redirect to detail page on edit save (user stays exactly where opened)", () => {
    // In company directory, editing does NOT call openCompany(id)
    assert.ok(!companyDirSrc.includes("openCompany(editingCompanyId)"));
    // In TA directory, invalidates queries and clears editAgencyId
    assert.ok(taDirSrc.includes("setEditAgencyId(null)"));
    // In Group directory, invalidates queries and clears editingGroupId
    assert.ok(groupDirSrc.includes("setEditingGroupId(null)"));
  });

  await t.test("7. Strict modal independence is maintained (no cross-modal imports)", () => {
    assert.ok(!guestModalSrc.includes("GuestCompanyCreateModal"));
    assert.ok(!guestModalSrc.includes("GuestTravelAgencyCreateModal"));
    assert.ok(!guestModalSrc.includes("GuestGroupCreateModal"));

    assert.ok(!companyModalSrc.includes("GuestCreateModal"));
    assert.ok(!companyModalSrc.includes("GuestTravelAgencyCreateModal"));
    assert.ok(!companyModalSrc.includes("GuestGroupCreateModal"));

    assert.ok(!travelAgencyModalSrc.includes("GuestCreateModal"));
    assert.ok(!travelAgencyModalSrc.includes("GuestCompanyCreateModal"));
    assert.ok(!travelAgencyModalSrc.includes("GuestGroupCreateModal"));

    assert.ok(!groupModalSrc.includes("GuestCreateModal"));
    assert.ok(!groupModalSrc.includes("GuestCompanyCreateModal"));
    assert.ok(!groupModalSrc.includes("GuestTravelAgencyCreateModal"));
  });

  await t.test("8. Guest edit modal populates saved identity documents and persists them on save", () => {
    // Queries existing guest documents on open
    assert.ok(guestModalSrc.includes("listGuestDocuments"));
    assert.ok(guestModalSrc.includes("getGuestDocument"));
    assert.ok(guestModalSrc.includes("deleteGuestDocument"));

    // Maps loaded documents into draft.documents with unmasked numbers and images
    assert.ok(guestModalSrc.includes("loadDocs({ data: { restaurantId, guestId: guest.id } })"));
    assert.ok(guestModalSrc.includes("loadDocDetail"));
    assert.ok(guestModalSrc.includes("existingDocumentId: doc.id"));

    // Prepopulates fallback document if guest has idDocumentNumber/Type on profile
    assert.ok(guestModalSrc.includes("guest.idDocumentNumber || guest.idDocumentType"));

    // Identity step shows existing scan indicators and allows removing existing documents
    assert.ok(guestModalSrc.includes("onRemoveExistingDoc"));
    assert.ok(guestModalSrc.includes("Front scan on file"));

    // saveEditMutation persists documents, syncs primary doc to profile, and invalidates queries
    assert.ok(guestModalSrc.includes("documentId: document.existingDocumentId"));
    assert.ok(guestModalSrc.includes('["guest-documents", restaurantId, guest?.id]'));
  });

  await t.test("9. New Reservation modal redirects back to originating profile on close or finish", () => {
    const resRouteSrc = fs.readFileSync(
      path.join(root, "src/routes/restaurant/pms/reservations.index.tsx"),
      "utf8",
    );
    const resWorkspaceSrc = fs.readFileSync(
      path.join(root, "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
      "utf8",
    );
    const createPageSrc = fs.readFileSync(
      path.join(root, "src/packages/pms/components/bookings/create-reservation-page.tsx"),
      "utf8",
    );
    const confirmationSrc = fs.readFileSync(
      path.join(root, "src/packages/pms/components/bookings/create-reservation-confirmation.tsx"),
      "utf8",
    );

    // Route supports returnTo search parameter and forwards it
    assert.ok(resRouteSrc.includes("returnTo?: string;"));
    assert.ok(resRouteSrc.includes('search["returnTo"]'));
    assert.ok(resRouteSrc.includes("initialReturnTo={search.returnTo}"));

    // ReservationsWorkspace supports initialReturnTo and derives returnTo for all profile types
    assert.ok(resWorkspaceSrc.includes("initialReturnTo?: string | undefined"));
    assert.ok(resWorkspaceSrc.includes("if (initialGuestId) return `/restaurant/pms/guests/${initialGuestId}`"));
    assert.ok(resWorkspaceSrc.includes("if (initialCompanyId)"));
    assert.ok(resWorkspaceSrc.includes("if (initialTravelAgentId)"));
    assert.ok(resWorkspaceSrc.includes("if (initialGroupId)"));

    // ReservationsWorkspace derives contextual labels
    assert.ok(resWorkspaceSrc.includes('"Return to Guest Profile"'));
    assert.ok(resWorkspaceSrc.includes('"Return to Company Profile"'));
    assert.ok(resWorkspaceSrc.includes('"Return to Travel Agency Profile"'));
    assert.ok(resWorkspaceSrc.includes('"Return to Group Profile"'));

    // closeWorkspaceOverlay redirects to returnTo when present
    assert.ok(resWorkspaceSrc.includes("if (returnTo) {"));
    assert.ok(resWorkspaceSrc.includes("navigateToReturnPath(navigate, returnTo)"));

    // CreateReservationPage forwards returnToLabel to CreateReservationConfirmation
    assert.ok(createPageSrc.includes("returnToLabel?: string | undefined"));
    assert.ok(createPageSrc.includes("returnToLabel={returnToLabel}"));

    // CreateReservationConfirmation renders returnToLabel on return button
    assert.ok(confirmationSrc.includes("returnToLabel?: string | undefined"));
    assert.ok(confirmationSrc.includes('{returnToLabel || "Return to Reservation Desk"}'));
  });

  await t.test("10. Card 4 Fields tab shows individual creation fields and manage drawer, hiding them for non-individual types", () => {
    const card4Src = fs.readFileSync(
      path.join(root, "src/packages/pms/components/settings/pms-card4-profile-types.tsx"),
      "utf8",
    );
    const drawerSrc = fs.readFileSync(
      path.join(
        root,
        "src/packages/pms/components/settings/catalog-sheets/manage-guest-fields-drawer.tsx",
      ),
      "utf8",
    );
    const defsSrc = fs.readFileSync(
      path.join(root, "src/packages/pms/lib/guest-creation-field-definitions.ts"),
      "utf8",
    );

    // Definitions include basic step fields (personal, contact, address) and essential flags
    assert.ok(defsSrc.includes('"FIRST_NAME"'));
    assert.ok(defsSrc.includes('"LAST_NAME"'));
    assert.ok(defsSrc.includes('"PHONE"'));
    assert.ok(defsSrc.includes('"EMAIL"'));
    assert.ok(defsSrc.includes('"NATIONALITY"'));
    assert.ok(defsSrc.includes('"DATE_OF_BIRTH"'));
    assert.ok(defsSrc.includes('"COUNTRY"'));
    assert.ok(defsSrc.includes('"CITY"'));
    assert.ok(defsSrc.includes('"MIDDLE_NAME"'));
    assert.ok(defsSrc.includes('"TITLE"'));
    assert.ok(defsSrc.includes('"PREFERRED_NAME"'));
    assert.ok(defsSrc.includes('"GENDER"'));
    assert.ok(defsSrc.includes('"LANGUAGE"'));
    assert.ok(defsSrc.includes('"PHONE_ALT"'));
    assert.ok(defsSrc.includes('"EMAIL_ALT"'));
    assert.ok(defsSrc.includes('"REGION"'));
    assert.ok(defsSrc.includes('"POSTAL_CODE"'));
    assert.ok(defsSrc.includes('"ADDRESS_LINE1"'));
    assert.ok(defsSrc.includes("essential: true"));
    assert.ok(defsSrc.includes("essential: false"));

    // Card 4 isolates individual guest fields and hides them for non-individual types
    assert.ok(card4Src.includes("const isIndividual ="));
    assert.ok(card4Src.includes("!isIndividual"));
    assert.ok(card4Src.includes("No Individual Guest Fields"));
    assert.ok(card4Src.includes('data-testid="non-individual-fields-notice"'));

    // Card 4 mounts ManageGuestFieldsDrawer and has Manage Fields button
    assert.ok(card4Src.includes("<ManageGuestFieldsDrawer"));
    assert.ok(card4Src.includes('data-testid="manage-fields-btn"'));
    assert.ok(card4Src.includes("Manage Fields"));

    // Card 4 table controls requirements for individual guest
    assert.ok(card4Src.includes("Required for"));
    assert.ok(card4Src.includes("System required"));
    assert.ok(card4Src.includes("mark("));
    assert.ok(card4Src.includes('"requiredFieldIds"'));

    // Drawer provides checkboxes for selection and marks essential fields
    assert.ok(drawerSrc.includes("data-testid=\"manage-guest-fields-drawer\""));
    assert.ok(drawerSrc.includes("isEssential || selectedCodes.has(def.code)"));
    assert.ok(drawerSrc.includes("disabled={!canEdit || isEssential}"));
    assert.ok(drawerSrc.includes("Essential"));
    assert.ok(drawerSrc.includes("onToggleCode(def.code, checked === true)"));
  });

  await t.test("11. Field catalog 'Required' toggle is synced with Individual Profile Type requirements and avoids 'Global Req'", () => {
    const catalogSheetSrc = fs.readFileSync(
      path.join(root, "src/packages/pms/components/settings/catalog-sheets/guest-field-catalog-sheet.tsx"),
      "utf8",
    );
    const card4FnSrc = fs.readFileSync(
      path.join(root, "src/packages/pms/lib/required-fields-card4.functions.ts"),
      "utf8",
    );
    const profileTypeFnSrc = fs.readFileSync(
      path.join(root, "src/packages/pms/lib/profile-types-card4.functions.ts"),
      "utf8",
    );

    // Global Req is removed in favor of standard Required toggle in catalog
    assert.ok(!catalogSheetSrc.includes("<TableHead>Global Req</TableHead>"));
    assert.ok(!catalogSheetSrc.includes("Global Required"));
    assert.ok(catalogSheetSrc.includes("<TableHead>Required</TableHead>"));

    // Catalog mutations invalidate profile-types query
    assert.ok(catalogSheetSrc.includes('"pms-card4-profile-types"'));

    // Server functions synchronize pms_guest_fields.required and pms_guest_profile_types.required_field_ids
    assert.ok(card4FnSrc.includes("pms_guest_profile_types"));
    assert.ok(card4FnSrc.includes("required_field_ids"));
    assert.ok(profileTypeFnSrc.includes("pms_guest_fields"));
    assert.ok(profileTypeFnSrc.includes("required: shouldBeReq"));

    // First Name is system required and locked from customization, deactivation, and deletion
    assert.ok(catalogSheetSrc.includes('row.code === "FIRST_NAME"'));
    assert.ok(catalogSheetSrc.includes("System Required"));
    assert.ok(catalogSheetSrc.includes("Locked"));
    assert.ok(card4FnSrc.includes('currentField?.code === "FIRST_NAME"'));
    assert.ok(card4FnSrc.includes('fieldToCheck.data?.code === "FIRST_NAME"'));
  });
});

