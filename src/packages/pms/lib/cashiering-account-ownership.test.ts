import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildAccountChargeGroups,
  chargeCapabilities,
  currentSourceFolioIds,
  queryChargeGroups,
  querySourceFolios,
  rollupSourceFolios,
  type OwnershipLedgerRow,
  type SourceFolioRow,
} from "./cashiering-account-ownership.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const ACCOUNT = "acct-1";
const FOLIO_A = "folio-a";
const FOLIO_B = "folio-b";

function row(
  partial: Partial<OwnershipLedgerRow> & Pick<OwnershipLedgerRow, "id" | "type" | "amount">,
): OwnershipLedgerRow {
  return {
    accountId: null,
    folioId: null,
    category: "room",
    description: partial.id,
    postedAt: "2026-10-05T10:00:00.000Z",
    originalTransactionId: null,
    postedByMembershipId: "member-1",
    quantity: null,
    unitAmount: null,
    ...partial,
  };
}

function guestGroup(input: {
  folioId: string;
  parentId: string;
  parent: number;
  tax?: number;
  service?: number;
  transferredParent: number;
  transferredTax?: number;
  transferredService?: number;
  returnedParent?: number;
  postedAt?: string;
}) {
  const postedAt = input.postedAt ?? "2026-10-05T10:00:00.000Z";
  const lines: OwnershipLedgerRow[] = [
    row({
      id: input.parentId,
      folioId: input.folioId,
      type: "charge",
      amount: input.parent,
      description: "Room charge",
      postedAt,
    }),
  ];
  if (input.tax) {
    lines.push(
      row({
        id: `${input.parentId}-tax`,
        folioId: input.folioId,
        type: "charge",
        category: "tax",
        amount: input.tax,
        description: "VAT",
        originalTransactionId: input.parentId,
        postedAt,
      }),
    );
  }
  if (input.service) {
    lines.push(
      row({
        id: `${input.parentId}-svc`,
        folioId: input.folioId,
        type: "charge",
        category: "service_charge",
        amount: input.service,
        description: "Service",
        originalTransactionId: input.parentId,
        postedAt,
      }),
    );
  }
  lines.push(
    row({
      id: `${input.parentId}-in`,
      accountId: ACCOUNT,
      type: "transfer_in",
      category: "transfer",
      amount: input.transferredParent,
      description: "Room charge",
      originalTransactionId: input.parentId,
      postedAt,
    }),
  );
  if (input.transferredTax) {
    lines.push(
      row({
        id: `${input.parentId}-tax-in`,
        accountId: ACCOUNT,
        type: "transfer_in",
        category: "transfer",
        amount: input.transferredTax,
        originalTransactionId: `${input.parentId}-tax`,
        postedAt,
      }),
    );
  }
  if (input.transferredService) {
    lines.push(
      row({
        id: `${input.parentId}-svc-in`,
        accountId: ACCOUNT,
        type: "transfer_in",
        category: "transfer",
        amount: input.transferredService,
        originalTransactionId: `${input.parentId}-svc`,
        postedAt,
      }),
    );
  }
  if (input.returnedParent) {
    lines.push(
      row({
        id: `${input.parentId}-out`,
        accountId: ACCOUNT,
        type: "transfer_out",
        category: "transfer",
        amount: -input.returnedParent,
        originalTransactionId: `${input.parentId}-in`,
        postedAt: "2026-10-06T10:00:00.000Z",
      }),
    );
  }
  return lines;
}

function folioRow(
  partial: Partial<SourceFolioRow> & Pick<SourceFolioRow, "sourceFolioId">,
): SourceFolioRow {
  return {
    folioNumber: partial.sourceFolioId,
    guestId: null,
    guestName: null,
    reservationId: null,
    reservationNumber: null,
    roomNumber: null,
    arrivalDate: null,
    departureDate: null,
    folioStatus: "open",
    stayStatus: "checked_in",
    transferredInGross: 0,
    returnedToGuestGross: 0,
    accountOwnedRemaining: 0,
    chargeGroupCount: 1,
    invoicedGroupCount: 0,
    uninvoicedGroupCount: 1,
    coverage: "uninvoiced",
    lastTransferAt: "2026-10-05T10:00:00.000Z",
    lastActivityAt: "2026-10-05T10:00:00.000Z",
    ...partial,
  };
}

describe("financial account ownership", () => {
  it("shows a transferred guest folio and groups tax with the parent", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        ...guestGroup({
          folioId: FOLIO_A,
          parentId: "room",
          parent: 5000,
          tax: 750,
          service: 250,
          transferredParent: 5000,
          transferredTax: 750,
          transferredService: 250,
        }),
        row({
          id: "laundry",
          folioId: FOLIO_A,
          type: "charge",
          category: "manual",
          amount: 500,
          description: "Laundry",
        }),
      ],
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.grossAmount, 6000);
    assert.equal(groups[0]?.sourceFolioId, FOLIO_A);
    assert.equal(groups[0]?.components.length, 3);
    const folios = rollupSourceFolios(groups);
    assert.equal(folios.length, 1);
    assert.equal(folios[0]?.accountOwnedRemaining, 6000);
  });

  it("ignores a reservation company link and a group member with no transfer", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        row({
          id: "company-stay",
          folioId: "company-linked-folio",
          type: "charge",
          amount: 1000,
          description: "Room on company reservation",
        }),
        row({
          id: "member-stay",
          folioId: "group-member-folio",
          type: "charge",
          amount: 800,
          description: "Group member room",
        }),
      ],
    });
    assert.deepEqual(currentSourceFolioIds(groups), []);
  });

  it("keeps a direct account charge out of source folios", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        row({
          id: "direct",
          accountId: ACCOUNT,
          type: "charge",
          amount: 2000,
          description: "Direct account charge",
        }),
      ],
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.sourceKind, "direct");
    assert.equal(groups[0]?.sourceFolioId, null);
    assert.deepEqual(rollupSourceFolios(groups), []);
  });

  it("rolls multiple groups from one folio into one source row and keeps other folios separate", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        ...guestGroup({
          folioId: FOLIO_A,
          parentId: "a1",
          parent: 1000,
          transferredParent: 1000,
        }),
        ...guestGroup({
          folioId: FOLIO_A,
          parentId: "a2",
          parent: 400,
          transferredParent: 400,
          postedAt: "2026-10-06T10:00:00.000Z",
        }),
        ...guestGroup({
          folioId: FOLIO_B,
          parentId: "b1",
          parent: 700,
          transferredParent: 700,
        }),
      ],
    });
    const folios = rollupSourceFolios(groups);
    assert.equal(folios.length, 2);
    const folioA = folios.find((row) => row.sourceFolioId === FOLIO_A);
    assert.equal(folioA?.chargeGroupCount, 2);
    assert.equal(folioA?.accountOwnedRemaining, 1400);
    assert.equal(currentSourceFolioIds(groups).length, 2);
  });

  it("uses the transferred share, not the original guest gross", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: guestGroup({
        folioId: FOLIO_A,
        parentId: "room",
        parent: 5000,
        tax: 750,
        service: 250,
        transferredParent: 2500,
        transferredTax: 375,
        transferredService: 125,
      }),
    });
    assert.equal(groups[0]?.grossAmount, 3000);
    assert.equal(rollupSourceFolios(groups)[0]?.accountOwnedRemaining, 3000);
  });

  it("reduces remaining ownership when part of the transfer is returned", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: guestGroup({
        folioId: FOLIO_A,
        parentId: "room",
        parent: 6000,
        transferredParent: 6000,
        returnedParent: 2000,
      }),
    });
    assert.equal(groups[0]?.transferredInAmount, 6000);
    assert.equal(groups[0]?.returnedAmount, 2000);
    assert.equal(groups[0]?.remainingAmount, 4000);
    assert.equal(rollupSourceFolios(groups)[0]?.accountOwnedRemaining, 4000);
  });

  it("hides a fully returned folio from current ownership and keeps it in history", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: guestGroup({
        folioId: FOLIO_A,
        parentId: "room",
        parent: 1000,
        transferredParent: 1000,
        returnedParent: 1000,
      }),
    });
    assert.deepEqual(rollupSourceFolios(groups, "current"), []);
    assert.equal(rollupSourceFolios(groups, "history")[0]?.accountOwnedRemaining, 0);
  });

  it("does not allocate an account payment onto the source folio", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        ...guestGroup({
          folioId: FOLIO_A,
          parentId: "room",
          parent: 10000,
          transferredParent: 10000,
        }),
        row({
          id: "pay",
          accountId: ACCOUNT,
          type: "payment",
          category: "payment",
          amount: -4000,
          description: "Account payment",
        }),
      ],
    });
    assert.equal(rollupSourceFolios(groups)[0]?.accountOwnedRemaining, 10000);
    assert.equal(groups.find((group) => group.chargeGroupId === "room")?.remainingAmount, 10000);
  });

  it("counts invoice coverage and blocks correction and return once covered", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: guestGroup({
        folioId: FOLIO_B,
        parentId: "billed",
        parent: 6000,
        transferredParent: 6000,
      }),
      coverage: [
        {
          sourceGroupId: "billed",
          componentTransactionId: "billed-in",
          invoiceId: "inv-1",
          invoiceNumber: "INV-000111",
        },
      ],
    });
    assert.equal(groups[0]?.coverage, "invoiced");
    assert.equal(groups[0]?.invoiceNumber, "INV-000111");
    assert.equal(rollupSourceFolios(groups)[0]?.invoicedGroupCount, 1);
    const caps = chargeCapabilities({
      role: "manager",
      accountStatus: "open",
      group: groups[0]!,
    });
    assert.equal(caps.canCorrect, false);
    assert.equal(caps.canReturnToGuest, false);
    assert.equal(caps.canViewInvoice, true);
    assert.equal(caps.canViewSourceFolio, true);
  });

  it("lets a manager correct or return an uninvoiced direct charge, and keeps other roles read only", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        row({
          id: "direct",
          accountId: ACCOUNT,
          type: "charge",
          amount: 6000,
          description: "Direct",
          postedByMembershipId: "ada",
        }),
        row({
          id: "discount",
          accountId: ACCOUNT,
          type: "discount",
          category: "discount",
          amount: -1000,
          originalTransactionId: "direct",
          description: "Discount",
        }),
      ],
    });
    assert.equal(groups[0]?.correctedAmount, 1000);
    assert.equal(groups[0]?.remainingAmount, 5000);
    assert.equal(groups[0]?.actorMembershipId, "ada");
    const manager = chargeCapabilities({
      role: "manager",
      accountStatus: "open",
      group: groups[0]!,
    });
    assert.equal(manager.canCorrect, true);
    assert.equal(manager.canReturnToGuest, true);
    for (const role of ["cashier", "accountant"]) {
      const caps = chargeCapabilities({ role, accountStatus: "open", group: groups[0]! });
      assert.equal(caps.canCorrect, false);
      assert.equal(caps.canReturnToGuest, false);
      assert.equal(caps.canView, true);
    }
    const closed = chargeCapabilities({
      role: "owner",
      accountStatus: "closed",
      group: groups[0]!,
    });
    assert.equal(closed.canCorrect, false);
    assert.equal(closed.canReturnToGuest, false);
  });

  it("does not offer return of a transferred group through the charge writer", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: guestGroup({
        folioId: FOLIO_A,
        parentId: "room",
        parent: 1000,
        transferredParent: 1000,
      }),
    });
    const caps = chargeCapabilities({
      role: "owner",
      accountStatus: "open",
      group: groups[0]!,
    });
    assert.equal(groups[0]?.sourceKind, "transferred");
    assert.equal(caps.canReturnToGuest, false);
    assert.equal(caps.canCorrect, false);
    assert.equal(caps.canViewSourceFolio, true);
  });

  it("keeps the mixed ownership example consistent", () => {
    const groups = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        ...guestGroup({
          folioId: FOLIO_A,
          parentId: "gone",
          parent: 1000,
          transferredParent: 1000,
          returnedParent: 1000,
        }),
        ...guestGroup({
          folioId: FOLIO_A,
          parentId: "kept",
          parent: 2000,
          transferredParent: 2000,
        }),
        ...guestGroup({
          folioId: FOLIO_B,
          parentId: "billed",
          parent: 3000,
          transferredParent: 3000,
        }),
      ],
      coverage: [
        {
          sourceGroupId: "billed",
          componentTransactionId: "billed-in",
          invoiceId: "inv-b",
          invoiceNumber: "INV-000200",
        },
      ],
    });
    assert.deepEqual(currentSourceFolioIds(groups).sort(), [FOLIO_A, FOLIO_B].sort());
    const visible = groups.filter((group) => group.remainingAmount > 0.009);
    assert.deepEqual(visible.map((group) => group.chargeGroupId).sort(), ["billed", "kept"].sort());
    assert.equal(groups.find((group) => group.chargeGroupId === "billed")?.coverage, "invoiced");
    assert.equal(groups.find((group) => group.chargeGroupId === "kept")?.coverage, "uninvoiced");
  });

  it("searches, filters, and paginates source folios and charges", () => {
    const folios = querySourceFolios(
      [
        folioRow({
          sourceFolioId: FOLIO_A,
          folioNumber: "FOL-000521",
          guestName: "Daniel Tadesse",
          reservationNumber: "RES-9",
          roomNumber: "201",
          stayStatus: "checked_in",
        }),
        folioRow({
          sourceFolioId: FOLIO_B,
          folioNumber: "FOL-000522",
          guestName: "Sara Bekele",
          stayStatus: "checked_out",
          coverage: "invoiced",
          invoicedGroupCount: 1,
          uninvoicedGroupCount: 0,
        }),
      ],
      { search: "daniel", stay: "in_house", page: 1, pageSize: 10 },
    );
    assert.equal(folios.total, 1);
    assert.equal(folios.rows[0]?.folioNumber, "FOL-000521");
    const paged = querySourceFolios(
      Array.from({ length: 12 }, (_, index) => folioRow({ sourceFolioId: `folio-${index}` })),
      { page: 2, pageSize: 10 },
    );
    assert.equal(paged.total, 12);
    assert.equal(paged.page, 2);
    assert.equal(paged.rows.length, 2);
    const first = querySourceFolios(
      [1, 2, 3].map((index) => folioRow({ sourceFolioId: `folio-${index}` })),
      { page: 1, pageSize: 10 },
    );
    assert.equal(first.rows.length, 3);
    const charges = buildAccountChargeGroups({
      accountId: ACCOUNT,
      rows: [
        ...guestGroup({ folioId: FOLIO_A, parentId: "room", parent: 10, transferredParent: 10 }),
        row({
          id: "direct",
          accountId: ACCOUNT,
          type: "charge",
          amount: 5,
          description: "Minibar",
        }),
      ],
    }).map((group) => ({
      ...group,
      guestName: group.sourceFolioId ? "Daniel Tadesse" : null,
      folioNumber: group.sourceFolioId ? "FOL-000521" : null,
      actorName: "Ada",
    }));
    const found = queryChargeGroups(charges, { search: "minibar", source: "direct" });
    assert.equal(found.total, 1);
    const byFolio = queryChargeGroups(charges, { sourceFolioId: FOLIO_A });
    assert.equal(byFolio.total, 1);
    assert.equal(byFolio.rows[0]?.chargeGroupId, "room");
  });

  it("keeps the phase 2 panels off payment and open-folio language", () => {
    const page = read("../components/cashiering/financial-account-ownership-panels.tsx");
    const workspace = read("../components/cashiering/financial-account-workspace.tsx");
    assert.match(page, /No source folios yet/);
    assert.match(page, /Account-owned amount/);
    assert.match(page, /Return to guest folio/);
    assert.match(page, /guest tax and service engine/);
    assert.doesNotMatch(page, /Open Folios/);
    assert.doesNotMatch(page, /Post Charge/);
    assert.doesNotMatch(page, /\bPaid\b/);
    assert.doesNotMatch(page, /Outstanding/);
    assert.match(workspace, /FinancialAccountSourceFolios/);
    assert.match(workspace, /FinancialAccountCharges/);
    assert.match(workspace, /FinancialAccountHistory/);
  });
});
