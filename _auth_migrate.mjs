import fs from "node:fs";

const root = "src/packages/pms/lib";

const PROFILE = {
  listGuests: "GUEST_PROFILE_VIEW",
  getGuestDirectoryStats: "GUEST_PROFILE_VIEW",
  getGuestWorkspaceStats: "GUEST_PROFILE_VIEW",
  listGuestWorkspaceActivity: "GUEST_PROFILE_VIEW",
  findGuestDuplicates: "GUEST_PROFILE_VIEW",
  getGuest: "GUEST_PROFILE_VIEW",
  listGuestPreferenceWorkspace: "GUEST_PROFILE_VIEW",
  listGuestPreferenceRegistrationCatalogue: "GUEST_PROFILE_VIEW",
  getGuestReservationPreferenceDefaults: "GUEST_PROFILE_VIEW",
  listGuestPreferenceSummary: "GUEST_PROFILE_VIEW",
  listGuestServiceHistory: "GUEST_PROFILE_VIEW",
  listGuestServiceWorkspace: "GUEST_PROFILE_VIEW",
  listGuestDocuments: "GUEST_PROFILE_VIEW",
  listGuestIdentityDocumentTypes: "GUEST_PROFILE_VIEW",
  getGuestDocument: "GUEST_PROFILE_VIEW",
  listGuestStays: "GUEST_PROFILE_VIEW",
  getGuestBookingDetail: "GUEST_PROFILE_VIEW",
  getGuestStayOverview: "GUEST_PROFILE_VIEW",
  getGuestPreferenceCatalogues: "GUEST_PROFILE_VIEW",
  createGuest: "GUEST_PROFILE_CREATE",
  updateGuest: "GUEST_PROFILE_EDIT",
  setGuestVip: "GUEST_PROFILE_EDIT",
  saveGuestPreferences: "GUEST_PROFILE_EDIT",
  saveGuestPreferenceWorkspace: "GUEST_PROFILE_EDIT",
  saveGuestPreferenceAnswers: "GUEST_PROFILE_EDIT",
  addGuestNote: "GUEST_PROFILE_EDIT",
  createGuestServiceRequest: "GUEST_PROFILE_EDIT",
  updateGuestServiceRequest: "GUEST_PROFILE_EDIT",
  createGuestPhotoUpload: "GUEST_PROFILE_EDIT",
  saveGuestPhoto: "GUEST_PROFILE_EDIT",
  createGuestDocumentUpload: "GUEST_PROFILE_EDIT",
  registerGuestDocument: "GUEST_PROFILE_EDIT",
  reviewGuestDocument: "GUEST_PROFILE_EDIT",
  saveGuestDocument: "GUEST_PROFILE_EDIT",
  saveGuestDocumentImage: "GUEST_PROFILE_EDIT",
  clearGuestDocumentImage: "GUEST_PROFILE_EDIT",
  deleteGuestDocument: "GUEST_PROFILE_EDIT",
  saveGuestConsent: "GUEST_PROFILE_EDIT",
  setGuestStatus: "GUEST_PROFILE_ACTIVATE",
  setGuestRestriction: "GUEST_RESTRICTION_AUTHORIZE",
  liftGuestRestriction: "GUEST_RESTRICTION_AUTHORIZE",
  mergeGuests: "GUEST_MERGE_AUTHORIZE",
};

const ACCOUNT_VIEW = [
  "getCompanyBusinessWorkspace",
  "listCompanyWorkspace",
  "findCompanyDuplicates",
  "exportCompaniesCsv",
  "previewCompanyImport",
  "getCompanyDetailWorkspace",
  "listCompanyContacts",
  "getCompanyContactCatalogues",
  "listCompanyReservations",
  "listCompanyTravelers",
  "listCompanyNotes",
  "listCompanyHistory",
  "listCompanyBilling",
  "listCompanyDocuments",
  "listCompanyContracts",
  "getCompanyCreateContext",
  "getCompanyBillingCreditCreateConfig",
  "getCompanyEditDraft",
  "getTravelAgentDetailWorkspace",
  "listTravelAgentContacts",
  "listTravelAgentReservations",
  "listTravelAgentNotes",
  "listTravelAgentDocuments",
  "listTravelAgentAgreements",
  "listTravelAgentBilling",
  "listTravelAgentSettingsCatalogues",
  "listTravelAgentCommissionPlans",
  "listTravelAgentCommissionEntries",
  "listTravelAgentAllotments",
  "listTravelAgentNotificationPrefs",
  "getTravelAgentWorkspaceSummary",
  "getTravelAgentCreateContext",
  "getTravelAgencyStep4Config",
  "getTravelAgencyCommissionRatesConfig",
  "listTravelAgencyTypesForSelect",
  "listGroupCatalogues",
  "getGroupDetailWorkspace",
  "listGroupMembers",
  "listGroupReservations",
  "listGroupRooming",
  "getGroupFinancials",
  "listGroupActivity",
  "searchGroupPartners",
  "searchGuestsForGroup",
  "listGroupItinerary",
  "listGroupCommunications",
  "listGroupDocuments",
  "listGroupTemplates",
  "listGroupTypes",
  "getGroupCreateContext",
  "loadGroupCreateCredit",
  "listGuestAccounts",
  "getGuestAccount",
  "listGuestAccountHistory",
  "listGuestAccountLinks",
  "getAccountLoyaltyValue",
  "listPmsContractTypes",
  "listPmsNoShowPolicies",
  "listPmsCompanyDocumentTypes",
  "getCompanyContractCreateConfig",
  "previewGroupMemberImport",
];

const ACCOUNT_CREATE = [
  "confirmCompanyImport",
  "saveCompanyCreateDraft",
  "deleteCompanyCreateDraft",
  "persistCompanyCreate",
  "getNextCorporateContractCode",
  "saveTravelAgentCreateDraft",
  "deleteTravelAgentCreateDraft",
  "persistTravelAgentCreate",
  "saveGroupCreateDraft",
  "deleteGroupCreateDraft",
  "persistGroupCreate",
  "duplicateGroupMaster",
  "createGuestAccount",
];

const ACCOUNT_EDIT = [
  "createCompanyLogoUpload",
  "saveCompanyLogo",
  "saveCompanyContact",
  "setCompanyContactPrimary",
  "createCompanyContactPhotoUpload",
  "addCompanyNote",
  "updateCompanyNote",
  "archiveCompanyNote",
  "createCompanyDocumentUpload",
  "saveCompanyDocument",
  "reviewCompanyDocument",
  "deleteCompanyDocument",
  "createTravelAgentLogoUpload",
  "saveTravelAgentLogo",
  "saveTravelAgentContact",
  "setTravelAgentContactPrimary",
  "createTravelAgentContactPhotoUpload",
  "addTravelAgentNote",
  "updateTravelAgentNote",
  "archiveTravelAgentNote",
  "createTravelAgentDocumentUpload",
  "saveTravelAgentDocument",
  "reviewTravelAgentDocument",
  "deleteTravelAgentDocument",
  "saveTravelAgentAgreement",
  "expireTravelAgentAgreement",
  "updateTravelAgentSettings",
  "saveTravelAgentCommissionPlan",
  "updateTravelAgentCommissionStatus",
  "saveTravelAgentAllotment",
  "saveTravelAgentNotificationPrefs",
  "saveTravelAgencyStep4",
  "createTravelAgencyDraftDocumentUpload",
  "saveTravelAgencyCommissionRates",
  "saveGroupMaster",
  "addGroupMember",
  "updateGroupMember",
  "confirmGroupMemberImport",
  "applyGroupTemplate",
  "sendGroupCommunication",
  "createGroupItineraryItem",
  "updateGroupItineraryItem",
  "createGroupDocumentUpload",
  "saveGroupDocument",
  "updateGuestAccount",
  "linkGuestAccount",
  "linkGuestAccountsBulk",
  "unlinkGuestAccount",
];

const ACCOUNT_ACTIVATE = ["setCompanyStatus", "setTravelAgentStatus", "setGroupStatus"];

const GUEST_SETUP_CONFIGURE = [
  "saveGroupTemplate",
  "deleteGroupTemplate",
  "saveGroupType",
  "savePmsContractType",
  "setPmsContractTypeActive",
  "savePmsNoShowPolicy",
  "setPmsNoShowPolicyActive",
  "savePmsCompanyDocumentType",
  "setPmsCompanyDocumentTypeActive",
  "setPmsCompanyDocumentTypeRequired",
  "deletePmsCompanyDocumentType",
];

function fill(names, code, target) {
  for (const name of names) target[name] = code;
}

const ACCOUNT = {};
fill(ACCOUNT_VIEW, "GUEST_ACCOUNT_VIEW", ACCOUNT);
fill(ACCOUNT_CREATE, "GUEST_ACCOUNT_CREATE", ACCOUNT);
fill(ACCOUNT_EDIT, "GUEST_ACCOUNT_EDIT", ACCOUNT);
fill(ACCOUNT_ACTIVATE, "GUEST_ACCOUNT_ACTIVATE", ACCOUNT);
fill(GUEST_SETUP_CONFIGURE, "CONFIG_GUEST_SETUP_CONFIGURE", ACCOUNT);

const ROOMS_VIEW = [
  "listRoomAmenities",
  "listRoomTypes",
  "checkRoomTypeCodeAvailable",
  "checkRoomNumberAvailable",
  "listRooms",
  "listRoomTypeImages",
  "getRoomsDashboard",
  "listRoomClassifications",
  "listRoomTypeInventoryAvailability",
  "listRoomInventoryEvents",
  "listOperationalBlocks",
  "evaluateRoomAssignment",
  "listRoomBoardOccupancy",
  "listRoomBoardBlocks",
];
const ROOMS_CONFIG_VIEW = ["evaluateCard2RoomTypesReadiness"];
const ROOMS_CONFIGURE = [
  "saveRoomType",
  "setRoomTypeActive",
  "saveRoom",
  "setRoomActive",
  "releaseRoomFromRoomType",
  "bulkCreateRooms",
  "createRoomTypeImageUpload",
  "registerRoomTypeImage",
  "setRoomTypeImageCover",
  "reorderRoomTypeImages",
  "deleteRoomTypeImage",
  "addCustomRoomCategory",
  "addCustomRoomClass",
];
const ROOMS = {};
fill(ROOMS_VIEW, "ROOM_INVENTORY_VIEW", ROOMS);
fill(ROOMS_CONFIG_VIEW, "CONFIG_ROOMS_OPS_VIEW", ROOMS);
fill(ROOMS_CONFIGURE, "CONFIG_ROOMS_OPS_CONFIGURE", ROOMS);
fill(
  ["createOperationalBlock", "activateOperationalBlock", "approveOperationalBlock", "releaseOperationalBlock", "cancelOperationalBlock"],
  "ROOM_BLOCK_EDIT",
  ROOMS,
);

const HK_VIEW = [
  "getHousekeepingAccess",
  "listHousekeepingStaff",
  "getHousekeepingDashboard",
  "listRoomRack",
  "listHousekeepingTasks",
  "listInspections",
  "listDiscrepancies",
  "listHousekeepingExceptions",
  "listHousekeepingHistory",
  "listHousekeepingGuestRequests",
];
const HK = {};
fill(HK_VIEW, "HOUSEKEEPING_VIEW", HK);
HK.createHousekeepingTask = "HOUSEKEEPING_TASK_CREATE";
HK.completeHousekeepingTask = "HOUSEKEEPING_TASK_EDIT";
HK.createDiscrepancy = "HOUSEKEEPING_TASK_EDIT";
HK.resolveDiscrepancy = "HOUSEKEEPING_TASK_EDIT";
HK.updateHousekeepingGuestRequest = "HOUSEKEEPING_TASK_EDIT";
HK.setRoomRestriction = "ROOM_RESTRICTION_EDIT";
HK.listMaintenanceRequests = "MAINTENANCE_VIEW";
HK.createMaintenanceRequest = "MAINTENANCE_CREATE";
HK.updateMaintenanceRequest = "MAINTENANCE_EDIT";

const MAINT = {
  getMaintenanceRules: "CONFIG_ROOMS_OPS_VIEW",
  getMaintenanceSummary: "CONFIG_ROOMS_OPS_VIEW",
  listMaintenanceDepartments: "CONFIG_ROOMS_OPS_VIEW",
  evaluateCard2MaintenanceReadiness: "CONFIG_ROOMS_OPS_VIEW",
  saveMaintenanceRules: "CONFIG_ROOMS_OPS_CONFIGURE",
};

const TAX = {
  listGuestTaxIdentities: "GUEST_PROFILE_VIEW",
  createGuestTaxIdentity: "GUEST_PROFILE_EDIT",
  updateGuestTaxIdentity: "GUEST_PROFILE_EDIT",
  setDefaultGuestTaxIdentity: "GUEST_PROFILE_EDIT",
  deactivateGuestTaxIdentity: "GUEST_PROFILE_ACTIVATE",
  reactivateGuestTaxIdentity: "GUEST_PROFILE_ACTIVATE",
};

const CUSTOM = {
  listGuestCustomFieldValues: "GUEST_PROFILE_VIEW",
  saveGuestCustomFieldValues: "GUEST_PROFILE_EDIT",
  hasOperationalFieldValues: "CONFIG_GUEST_SETUP_VIEW",
};

const CREATE = {
  getGuestCreateContext: "GUEST_PROFILE_CREATE",
  saveGuestCreateDraft: "GUEST_PROFILE_CREATE",
  deleteGuestCreateDraft: "GUEST_PROFILE_CREATE",
};

const PRIVACY = {
  getGuestActivityHub: "GUEST_PROFILE_VIEW",
  getGuestAccountActivityHub: "GUEST_ACCOUNT_VIEW",
  recordGuestCommunication: "GUEST_PROFILE_EDIT",
  recordGuestAccountCommunication: "GUEST_ACCOUNT_EDIT",
  sendGuestMessage: "GUEST_PROFILE_EDIT",
  sendGuestAccountMessage: "GUEST_ACCOUNT_EDIT",
  listGuestPrivacyAudit: "GUEST_PROFILE_VIEW",
  listGuestAccountPrivacyAudit: "GUEST_ACCOUNT_VIEW",
  exportGuestProfile: "GUEST_PRIVACY_EXPORT",
  exportGuestAccount: "GUEST_PRIVACY_EXPORT",
  anonymiseGuest: "GUEST_PRIVACY_DELETE",
  anonymiseGuestAccount: "GUEST_PRIVACY_DELETE",
  listGuestUnmergeCandidates: "GUEST_PROFILE_VIEW",
  unmergeGuests: "GUEST_MERGE_AUTHORIZE",
};

const files = {
  "guests.functions.ts": PROFILE,
  "guest-create.functions.ts": CREATE,
  "guest-custom-fields.functions.ts": CUSTOM,
  "guest-privacy.functions.ts": PRIVACY,
  "guest-companies.functions.ts": ACCOUNT,
  "guest-company-detail.functions.ts": ACCOUNT,
  "guest-company-create.functions.ts": ACCOUNT,
  "guest-group-detail.functions.ts": ACCOUNT,
  "guest-group-create.functions.ts": ACCOUNT,
  "guest-group-templates.ts": ACCOUNT,
  "guest-group-types.ts": ACCOUNT,
  "guest-travel-agent-detail.functions.ts": ACCOUNT,
  "guest-travel-agent-create.functions.ts": ACCOUNT,
  "guest-travel-agency-step4.functions.ts": ACCOUNT,
  "guest-travel-agency-step3-commission-rates.functions.ts": ACCOUNT,
  "guest-travel-agency-types.ts": ACCOUNT,
  "guest-accounts.functions.ts": ACCOUNT,
  "guest-tax-identities.functions.ts": TAX,
  "corporate-contracts.functions.ts": ACCOUNT,
  "rooms.functions.ts": ROOMS,
  "room-inventory.functions.ts": ROOMS,
  "room-board.functions.ts": ROOMS,
  "housekeeping.functions.ts": HK,
  "maintenance.functions.ts": MAINT,
};

const AUTH =
  /require(?:GuestManager|GuestPrivacyOfficer|RoomManager|FrontOfficeAccess|HousekeepingManager|HousekeepingAccess|HousekeepingOperator|HousekeepingSupervisor|MaintenanceAccess|OperationalBlockManager)\(([^)]*)\)/;

function rewriteCall(line, permission) {
  const match = line.match(AUTH);
  if (!match) return line;
  const args = match[1];
  const id = /data\.restaurantId/.test(args)
    ? "data.restaurantId"
    : /\brestaurantId\b/.test(args)
      ? "restaurantId"
      : "data.restaurantId";
  const ctx = /context as never/.test(args) ? "context as never" : "context as never";
  const call = `requirePmsActor(${ctx}, ${id}, PMS_PERMISSIONS.${permission})`;
  return line.replace(AUTH, call);
}

function ensureImports(src) {
  const needsActor = src.includes("requirePmsActor(");
  const needsAll = src.includes("requirePmsActorAll(");
  const needsAny = src.includes("requirePmsActorAny(");
  const needsPerms = src.includes("PMS_PERMISSIONS.");
  const needsResolve = src.includes("resolveEffectivePermissions(");
  const needsHas = src.includes("hasEffectivePermission(");
  const ts = /from "\.\/[^"]+\.ts"/.test(src);
  const ext = ts ? ".ts" : "";
  const lines = [];
  if ((needsActor || needsAll || needsAny || needsResolve || needsHas) && !src.includes("pms-permissions.server")) {
    const names = [];
    if (needsActor) names.push("requirePmsActor");
    if (needsAll) names.push("requirePmsActorAll");
    if (needsAny) names.push("requirePmsActorAny");
    if (needsResolve) names.push("resolveEffectivePermissions");
    if (needsHas) names.push("hasEffectivePermission");
    lines.push(`import { ${names.join(", ")} } from "./pms-permissions.server${ext}";`);
  }
  if (needsPerms && !src.includes('from "./pms-permissions') && !src.includes("from './pms-permissions")) {
    lines.push(`import { PMS_PERMISSIONS } from "./pms-permissions${ext}";`);
  }
  if (lines.length === 0) return src;
  const importEnd = src.search(/\n(?!import )/);
  if (importEnd === -1) return `${lines.join("\n")}\n${src}`;
  return `${src.slice(0, importEnd)}\n${lines.join("\n")}${src.slice(importEnd)}`;
}

function dropUnusedName(src, name) {
  const body = src.replace(/^import[\s\S]*?;/gm, "");
  if (body.includes(name)) return src;
  let next = src.replace(new RegExp(`,\\s*${name}\\b`), "");
  next = next.replace(new RegExp(`\\b${name}\\s*,\\s*`), "");
  next = next.replace(new RegExp(`import\\s*\\{\\s*${name}\\s*\\}\\s*from\\s*["'][^"']+["'];?\\n`), "");
  return next;
}

const leftovers = [];

for (const [file, map] of Object.entries(files)) {
  const path = `${root}/${file}`;
  let src = fs.readFileSync(path, "utf8");
  const lines = src.split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^export const (\w+)/);
    if (m) starts.push({ name: m[1], index: i });
  }
  for (let s = 0; s < starts.length; s++) {
    const { name, index } = starts[s];
    const end = s + 1 < starts.length ? starts[s + 1].index : lines.length;
    const permission = map[name];
    let replaced = 0;
    for (let i = index; i < end; i++) {
      if (!AUTH.test(lines[i])) continue;
      if (!permission) {
        leftovers.push(`${file}:${i + 1} ${name} UNMAPPED ${lines[i].trim()}`);
        continue;
      }
      if (file === "housekeeping.functions.ts" && name === "updateHousekeepingTask") continue;
      if (file === "housekeeping.functions.ts" && name === "inspectRoom") continue;
      if (file === "housekeeping.functions.ts" && name === "getHousekeepingAccess") continue;
      lines[i] = rewriteCall(lines[i], permission);
      replaced++;
      if (file === "housekeeping.functions.ts" && !lines[i + 1]?.includes("requireHousekeepingEnabled")) {
        const indent = lines[i].match(/^\s*/)[0];
        const id = lines[i].includes("data.restaurantId") ? "data.restaurantId" : "restaurantId";
        lines.splice(i + 1, 0, `${indent}await requireHousekeepingEnabled(${id});`);
        if (s + 1 < starts.length) starts[s + 1].index++;
        for (let k = s + 1; k < starts.length; k++) {
          if (k === s + 1) continue;
          starts[k].index++;
        }
        i++;
        endAdjusted();
      }
    }
    function endAdjusted() {
      /* splice shifts later indexes already */
    }
    if (permission && replaced === 0 && file !== "housekeeping.functions.ts") {
      const chunk = lines.slice(index, end).join("\n");
      if (!chunk.includes("requirePmsActor") && !chunk.includes("requireReservationManager") && !chunk.includes("requireCashieringAccess")) {
        leftovers.push(`${file} ${name} had no auth call`);
      }
    }
  }
  src = lines.join("\n");
  src = ensureImports(src);
  for (const name of [
    "requireGuestManager",
    "requireGuestPrivacyOfficer",
    "requireRoomManager",
    "requireFrontOfficeAccess",
    "requireHousekeepingManager",
    "requireHousekeepingAccess",
    "requireHousekeepingOperator",
    "requireHousekeepingSupervisor",
    "requireMaintenanceAccess",
    "requireOperationalBlockManager",
  ]) {
    src = dropUnusedName(src, name);
  }
  fs.writeFileSync(path, src);
}

console.log(leftovers.join("\n") || "no leftovers from mapper");
