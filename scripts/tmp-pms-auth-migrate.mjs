/**
 * One-shot authorization migration. Deleted after it runs.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src/packages/pms/lib");
const failures = [];
const changed = [];

const FINANCIAL = new Set([
  "taxes-card3.functions.ts",
  "payments-card3.functions.ts",
  "billing-card3.functions.ts",
  "currency-card3.functions.ts",
  "corporate-card3.functions.ts",
  "commercial-card3.functions.ts",
  "meals-card3.functions.ts",
]);
const GUEST = new Set([
  "automation-rules-card4.functions.ts",
  "card4-readiness.functions.ts",
  "communication-channels-card4.functions.ts",
  "communication-defaults-card4.functions.ts",
  "communication-templates-card4.functions.ts",
  "company-business-card4.functions.ts",
  "group-types-card4.functions.ts",
  "identity-documents-card4.functions.ts",
  "notification-events-card4.functions.ts",
  "preferences-card4.functions.ts",
  "profile-types-card4.functions.ts",
  "required-fields-card4.functions.ts",
  "sender-settings-card4.functions.ts",
  "service-availability-card4.functions.ts",
  "service-categories-card4.functions.ts",
  "service-department-assignment-card4.functions.ts",
  "service-pricing-card4.functions.ts",
  "service-sla-rules-card4.functions.ts",
  "service-types-card4.functions.ts",
  "travel-agency-types-card4.functions.ts",
]);
const ROOMS = new Set([
  "housekeeping-card2.functions.ts",
  "inventory-rules.functions.ts",
  "rooms-amenities.functions.ts",
]);
const INTEGRATION = new Set([
  "integrations-card6.functions.ts",
  "distribution-card6.functions.ts",
  "distribution.functions.ts",
  "aiosell-workspace.functions.ts",
]);

function settingsPermission(file, fn) {
  let view = "CONFIG_PROPERTY_VIEW";
  let configure = "CONFIG_PROPERTY_CONFIGURE";
  if (FINANCIAL.has(file)) {
    view = "CONFIG_FINANCIAL_VIEW";
    configure = "CONFIG_FINANCIAL_CONFIGURE";
  } else if (GUEST.has(file)) {
    view = "CONFIG_GUEST_SETUP_VIEW";
    configure = "CONFIG_GUEST_SETUP_CONFIGURE";
  } else if (ROOMS.has(file)) {
    view = "CONFIG_ROOMS_OPS_VIEW";
    configure = "CONFIG_ROOMS_OPS_CONFIGURE";
  } else if (INTEGRATION.has(file)) {
    view = "CONFIG_INTEGRATION_VIEW";
    configure = "CONFIG_INTEGRATION_CONFIGURE";
  } else if (file.startsWith("rates-card")) {
    if (/^get/.test(fn)) return "RATES_VIEW";
    if (fn.includes("Override")) return "RATES_CALENDAR_OVERRIDE";
    if (fn.startsWith("set") && fn.includes("Active")) return "RATES_ACTIVATE";
    return "RATES_CONFIGURE";
  }
  return /^(get|list|preview)/.test(fn) ? view : configure;
}

function revenuePermission(fn) {
  if (fn.startsWith("export")) return "REPORTS_EXPORT";
  if (fn === "applyRateChanges") return "RATES_CALENDAR_OVERRIDE";
  if (fn === "applyRestrictionChanges") return "RATES_RESTRICTION_CONFIGURE";
  if (fn === "applyPromotionActivation" || fn === "applyPackageActivation") return "RATES_ACTIVATE";
  if (fn.startsWith("create") || fn.startsWith("update")) return "RATES_CONFIGURE";
  return "RATES_VIEW";
}

function ratesFunctionPermission(fn) {
  const map = {
    listRateCategories: "RATES_VIEW",
    saveRateCategory: "RATES_CONFIGURE",
    listRatePlans: "RATES_VIEW",
    saveRatePlan: "RATES_CONFIGURE",
    setRatePlanActive: "RATES_ACTIVATE",
    listRateCalendar: "RATES_VIEW",
    saveRateOverride: "RATES_CALENDAR_OVERRIDE",
    listRateRestrictions: "RATES_VIEW",
    saveRateRestriction: "RATES_RESTRICTION_CONFIGURE",
    getRevenueOverview: "REPORTS_VIEW",
  };
  return map[fn] ?? null;
}

function sliceExport(src, name) {
  const marker = `export const ${name}`;
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const next = src.indexOf("\nexport const ", start + marker.length);
  return { start, end: next < 0 ? src.length : next };
}

function gateLine(permission, assign) {
  return `${assign} requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.${permission});`;
}

function swapBody(body, permission) {
  const requireRe =
    /^([ \t]*)(const \w+ = await|await) require(?:RateManager|RoomManager|FrontOfficeAccess|DistributionManager)\(context as never, data\.restaurantId\);/m;
  const requireMatch = body.match(requireRe);
  if (requireMatch) {
    return body.replace(requireMatch[0], `${requireMatch[1]}${gateLine(permission, requireMatch[2])}`);
  }

  const deniedRe =
    /^([ \t]*)const me = await withPmsPackage\(\s*data\.restaurantId,\s*callerMembership\(context as never, data\.restaurantId\),?\s*\);\s*if \(!canEditSet1\(me\.role\)\) throw new Error\(SET1_DENIED\);/m;
  const denied = body.match(deniedRe);
  if (denied) {
    return body.replace(denied[0], `${denied[1]}${gateLine(permission, "await")}`);
  }

  const packageRe =
    /^([ \t]*)(?:const me = await|await) withPmsPackage\(\s*data\.restaurantId,\s*callerMembership\(context as never, data\.restaurantId\),?\s*\);/m;
  const packaged = body.match(packageRe);
  if (packaged) {
    const assign = packaged[0].includes("const me") ? "const me = await" : "await";
    return body.replace(packaged[0], `${packaged[1]}${gateLine(permission, assign)}`);
  }

  const moduleRe =
    /^([ \t]*)await requireModuleRole\(\s*context as never,\s*data\.restaurantId,\s*"reports_analytics",\s*REPORTS_ROLES,\s*"You don't have access to Reports & Analytics for this property\.",\s*\);/m;
  const moduleGate = body.match(moduleRe);
  if (moduleGate) {
    return body.replace(moduleGate[0], `${moduleGate[1]}${gateLine(permission, "await")}`);
  }
  return null;
}

function patchNamed(src, name, permission) {
  const loc = sliceExport(src, name);
  if (!loc) return { src, ok: false, reason: `missing ${name}` };
  const body = src.slice(loc.start, loc.end);
  const next = swapBody(body, permission);
  if (!next) return { src, ok: false, reason: `no gate in ${name}` };
  return { src: src.slice(0, loc.start) + next + src.slice(loc.end), ok: true };
}

function exportNames(src) {
  return [...src.matchAll(/export const (\w+) = createServerFn/g)].map((match) => match[1]);
}

function ensureImport(src, rel) {
  if (src.includes(`from "${rel}pms-permissions"`)) return src;
  const needsResolve = /\b(resolveEffectivePermissions|hasEffectivePermission)\b/.test(
    src.replace(/import[\s\S]*?from\s*["'][^"']+["'];?/g, ""),
  );
  const line = needsResolve
    ? `import { hasEffectivePermission, requirePmsActor, resolveEffectivePermissions } from "${rel}pms-permissions.server";\nimport { PMS_PERMISSIONS } from "${rel}pms-permissions";\n`
    : `import { requirePmsActor } from "${rel}pms-permissions.server";\nimport { PMS_PERMISSIONS } from "${rel}pms-permissions";\n`;
  const header = src.match(/^(?:\/\*\*[\s\S]*?\*\/\s*)?/);
  const head = header ? header[0] : "";
  return head + line + src.slice(head.length);
}

function stripSpecifier(src, name) {
  const body = src.replace(/import[\s\S]*?from\s*["'][^"']+["'];?/g, "");
  if (new RegExp(`\\b${name}\\b`).test(body)) return src;
  let out = src.replace(new RegExp(`(^|\\n)([ \\t]*)${name},\\s*`, "g"), "$1");
  out = out.replace(new RegExp(`${name},\\s*`, "g"), "");
  out = out.replace(new RegExp(`,\\s*${name}\\b`, "g"), "");
  out = out.replace(new RegExp(`\\{\\s*${name}\\s*\\}`, "g"), "{ }");
  out = out.replace(/import\s*\{\s*\}\s*from\s*["'][^"']+["'];?[ \t]*\r?\n/g, "");
  out = out.replace(/import\s*\{\s*,/g, "import {");
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/,\s*\}/g, " }");
  out = out.replace(/\{\s*,/g, "{ ");
  return out;
}

function finish(src, rel) {
  for (const name of [
    "requireRateManager",
    "requireRoomManager",
    "requireFrontOfficeAccess",
    "requireDistributionManager",
    "canManageDistribution",
    "canManageRates",
    "canEditSet1",
    "SET1_DENIED",
    "requireModuleRole",
    "REPORTS_ROLES",
    "callerMembership",
    "withPmsPackage",
  ]) {
    src = stripSpecifier(src, name);
  }
  if (src.includes("requirePmsActor") || src.includes("hasEffectivePermission")) {
    src = ensureImport(src, rel);
  }
  return src;
}

function writeIfChanged(file, before, after) {
  if (before === after) return;
  fs.writeFileSync(file, after);
  changed.push(path.relative(root, file));
}

function migrateSettings(fileName) {
  const file = path.join(root, fileName);
  let src = fs.readFileSync(file, "utf8");
  const before = src;
  if (fileName === "pms-property-setup-card1.functions.ts") {
    src = src.replace(
      /const me = await withPmsPackage\(\s*data\.restaurantId,\s*callerMembership\(context as never, data\.restaurantId\),\s*\);\s*if \(!canEditSet1\(me\.role\)\) throw new Error\(SET1_DENIED\);/g,
      "await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.CONFIG_PROPERTY_CONFIGURE);",
    );
    src = src.replace(
      /const me = await withPmsPackage\(\s*data\.restaurantId,\s*callerMembership\(context as never, data\.restaurantId\),\s*\);/,
      `const me = await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.CONFIG_PROPERTY_VIEW);
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    const canEdit = hasEffectivePermission(resolved, PMS_PERMISSIONS.CONFIG_PROPERTY_CONFIGURE);`,
    );
    src = src.replaceAll("canEditSet1(me.role)", "canEdit");
  } else if (fileName === "distribution.functions.ts") {
    src = src.replace(
      `const me = await callerMembership(context as never, data.restaurantId);
    return { role: me.role, canManage: canManageDistribution(me.role) };`,
      `const me = await callerMembership(context as never, data.restaurantId);
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    return {
      role: me.role,
      canManage: hasEffectivePermission(resolved, PMS_PERMISSIONS.CONFIG_INTEGRATION_CONFIGURE),
    };`,
    );
  }
  for (const name of exportNames(src)) {
    if (name === "getDistributionAccess") continue;
    const loc = sliceExport(src, name);
    const body = src.slice(loc.start, loc.end);
    if (!/require(?:RoomManager|FrontOfficeAccess|DistributionManager)|withPmsPackage\(/.test(body)) continue;
    const permission = settingsPermission(fileName, name);
    const result = patchNamed(src, name, permission);
    if (!result.ok) failures.push(`${fileName}:${result.reason}`);
    else src = result.src;
  }
  src = finish(src, "./");
  writeIfChanged(file, before, src);
}

function migrateRevenue(fileName) {
  const file = path.join(root, "revenue", fileName);
  let src = fs.readFileSync(file, "utf8");
  const before = src;
  src = src.replace("after requireRateManager", "after requirePmsActor");
  for (const name of exportNames(src)) {
    const loc = sliceExport(src, name);
    const body = src.slice(loc.start, loc.end);
    if (!body.includes("requireRateManager")) continue;
    const result = patchNamed(src, name, revenuePermission(name));
    if (!result.ok) failures.push(`revenue/${fileName}:${result.reason}`);
    else src = result.src;
  }
  src = finish(src, "../");
  writeIfChanged(file, before, src);
}

function migrateRatesFunctions() {
  const file = path.join(root, "rates.functions.ts");
  let src = fs.readFileSync(file, "utf8");
  const before = src;
  src = src.replace(
    `const me = await callerMembership(context as never, data.restaurantId);
    return { role: me.role, canManage: canManageRates(me.role) };`,
    `const me = await callerMembership(context as never, data.restaurantId);
    const resolved = await resolveEffectivePermissions(context as never, data.restaurantId);
    const canManage = [
      PMS_PERMISSIONS.RATES_CONFIGURE,
      PMS_PERMISSIONS.RATES_ACTIVATE,
      PMS_PERMISSIONS.RATES_CALENDAR_OVERRIDE,
      PMS_PERMISSIONS.RATES_RESTRICTION_CONFIGURE,
    ].some((code) => hasEffectivePermission(resolved, code));
    return { role: me.role, canManage };`,
  );
  for (const name of exportNames(src)) {
    if (name === "repriceReservation" || name === "getRatesAccess") continue;
    const permission = ratesFunctionPermission(name);
    if (!permission) continue;
    const loc = sliceExport(src, name);
    const body = src.slice(loc.start, loc.end);
    if (!/requireRateManager|requireModuleRole/.test(body)) continue;
    const result = patchNamed(src, name, permission);
    if (!result.ok) failures.push(`rates.functions.ts:${result.reason}`);
    else src = result.src;
  }
  src = finish(src, "./");
  writeIfChanged(file, before, src);
}

const settingsFiles = [
  "pms-property-setup-card1.functions.ts",
  ...FINANCIAL,
  ...GUEST,
  ...ROOMS,
  ...INTEGRATION,
  "rates-card2.functions.ts",
  "rates-card3.functions.ts",
];
for (const file of settingsFiles) migrateSettings(file);

const revenueDir = path.join(root, "revenue");
for (const file of fs.readdirSync(revenueDir)) {
  if (!file.endsWith(".functions.ts")) continue;
  if (file === "revenue-approval.functions.ts" || file === "revenue-access.functions.ts") continue;
  const src = fs.readFileSync(path.join(revenueDir, file), "utf8");
  if (!src.includes("requireRateManager")) continue;
  migrateRevenue(file);
}
migrateRatesFunctions();

console.log("CHANGED");
for (const file of changed) console.log(file);
console.log("FAILURES");
for (const failure of failures) console.log(failure);
