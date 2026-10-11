import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  accountBalanceLabel,
  accountBalanceState,
  accountWorkspaceCapabilities,
  activityTypeLabel,
  companyCreditSummary,
  countIssuedInvoices,
  recentAccountActivity,
  recentAccountDocuments,
  masterBillingCurrency,
  sourceFolioIds,
  workspaceCreditSummary,
  type ActivityLine,
} from "./cashiering-account-workspace.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const reader = read("./cashiering-account-workspace.functions.ts");
const page = read("../components/cashiering/financial-account-workspace.tsx");
const route = read("../../../routes/restaurant/pms/cashiering.accounts.$accountId.tsx");
const invoicePage = read("../components/cashiering/account-invoice-page.tsx");
const accountsPanel = read("../components/cashiering/cashiering-phase-panels.tsx");
const invoiceBuilder = read("../components/cashiering/account-invoice-builder.tsx");

function line(
  partial: Partial<ActivityLine> & Pick<ActivityLine, "id" | "type" | "amount">,
): ActivityLine {
  return {
    postedAt: "2026-10-10T12:00:00.000Z",
    category: "room",
    description: partial.description ?? partial.type,
    actorName: "Ada",
    transferId: null,
    originalTransactionId: null,
    referenceType: null,
    sourceFolioId: null,
    sourceFolioNumber: null,
    ...partial,
  };
}

describe("financial account workspace", () => {
  it("loads the financial account number and the company or group master", () => {
    assert.match(reader, /account_number/);
    assert.match(reader, /from\("guest_account_masters"\)/);
    assert.match(reader, /name, code, account_type/);
    assert.match(page, /workspace\.account\.accountNumber/);
    assert.match(page, /workspace\.master\.name/);
    assert.match(page, /isGroup \? "Group" : isCompany \? "Company"/);
    assert.match(route, /cashiering\/accounts\/\$accountId/);
    assert.match(invoicePage, /FinancialAccountWorkspacePage/);
  });

  it("takes current balance from the account ledger", () => {
    assert.match(reader, /rpc\("financial_account_balance"/);
    assert.doesNotMatch(reader, /balance:\s*invoice/);
    assert.match(page, /accountBalanceLabel\(balance\)/);
    assert.match(page, /Current balance/);
  });

  it("labels a positive balance as amount due", () => {
    assert.equal(accountBalanceState(120.5), "due");
    assert.equal(accountBalanceLabel(120.5), "Amount Due");
  });

  it("labels a negative balance as credit balance", () => {
    assert.equal(accountBalanceState(-40), "credit");
    assert.equal(accountBalanceLabel(-40), "Credit Balance");
  });

  it("labels a zero balance as settled", () => {
    assert.equal(accountBalanceState(0), "settled");
    assert.equal(accountBalanceState(0.004), "settled");
    assert.equal(accountBalanceLabel(0), "Settled");
  });

  it("computes company available credit from the receivable", () => {
    const credit = companyCreditSummary(1000, 250.25);
    assert.ok(credit);
    assert.equal(credit.used, 250.25);
    assert.equal(credit.available, 749.75);
    assert.equal(credit.utilization, 250.25 / 1000);
    assert.equal(credit.exceeded, false);
    assert.equal(companyCreditSummary(null, 10), null);
    assert.equal(companyCreditSummary(0, 10), null);
  });

  it("marks a company balance above the limit as exceeded", () => {
    const credit = companyCreditSummary(500, 640);
    assert.ok(credit);
    assert.equal(credit.used, 640);
    assert.equal(credit.available, -140);
    assert.equal(credit.exceeded, true);
    assert.match(page, /Credit limit exceeded/);
    assert.match(page, /Transfer credit limit/);
    assert.match(page, /does not block payments or/);
  });

  it("hides company credit for a group account", () => {
    assert.equal(workspaceCreditSummary("group", 1000, 200), null);
    assert.ok(workspaceCreditSummary("company", 1000, 200));
    assert.match(page, /isCompany && workspace\.credit/);
    assert.doesNotMatch(page, /isGroup && workspace\.credit/);
  });

  it("counts only issued invoice documents", () => {
    assert.equal(
      countIssuedInvoices([
        { issuedNumber: "AINV-0001" },
        { issuedNumber: null },
        { issuedNumber: "  " },
        { issuedNumber: "AINV-0002" },
      ]),
      2,
    );
    assert.match(reader, /countIssuedInvoices/);
    assert.match(reader, /\.not\("issued_number", "is", null\)/);
    assert.match(page, /Issued invoices/);
  });

  it("does not present open, paid, partial, or outstanding invoice state", () => {
    assert.doesNotMatch(page, /Open Invoices/);
    assert.doesNotMatch(page, /Partially Paid/);
    assert.doesNotMatch(page, /Outstanding/);
    assert.doesNotMatch(page, /Overdue/);
    assert.doesNotMatch(page, /Aging/);
    assert.doesNotMatch(page, /A\/R/);
    assert.doesNotMatch(page, /\bPaid\b/);
  });

  it("counts source folios from transfer ownership only", () => {
    const accountId = "acct-1";
    const folioA = "folio-a";
    const folioB = "folio-b";
    const ids = sourceFolioIds(accountId, [
      {
        transferId: "tr-1",
        folioId: null,
        financialAccountId: accountId,
        type: "transfer_in",
        category: "transfer",
        originalTransactionId: null,
      },
      {
        transferId: "tr-1",
        folioId: folioA,
        financialAccountId: null,
        type: "transfer_out",
        category: "transfer",
        originalTransactionId: "charge-1",
      },
      {
        transferId: "tr-1",
        folioId: folioA,
        financialAccountId: null,
        type: "transfer_out",
        category: "transfer",
        originalTransactionId: "tax-1",
      },
      {
        transferId: "tr-2",
        folioId: null,
        financialAccountId: accountId,
        type: "transfer_in",
        category: "transfer",
        originalTransactionId: null,
      },
      {
        transferId: "tr-2",
        folioId: folioB,
        financialAccountId: null,
        type: "transfer_out",
        category: "transfer",
        originalTransactionId: null,
      },
    ]);
    assert.deepEqual(ids.sort(), [folioA, folioB].sort());
  });

  it("does not count a reservation company link without a transfer", () => {
    const ids = sourceFolioIds("acct-1", [
      {
        transferId: null,
        folioId: "folio-linked-on-reservation",
        financialAccountId: null,
        type: "charge",
        category: "room",
        originalTransactionId: null,
      },
    ]);
    assert.deepEqual(ids, []);
    const returned = sourceFolioIds("acct-1", [
      {
        transferId: "tr-back",
        folioId: null,
        financialAccountId: "acct-1",
        type: "transfer_out",
        category: "transfer",
        originalTransactionId: null,
      },
      {
        transferId: "tr-back",
        folioId: "folio-destination",
        financialAccountId: null,
        type: "transfer_in",
        category: "transfer",
        originalTransactionId: null,
      },
    ]);
    assert.deepEqual(returned, []);
  });

  it("keeps account status and profile status separate", () => {
    assert.match(page, /Account: \{workspace\.account\.status === "open" \? "Open" : "Closed"\}/);
    assert.match(page, /Profile: \{profileStatusLabel/);
    assert.match(page, /data-testid="account-status"/);
    assert.match(page, /data-testid="profile-status"/);
  });

  it("hides mutating actions when the account is closed", () => {
    const closed = accountWorkspaceCapabilities({
      role: "owner",
      status: "closed",
      balance: 0,
      accountKind: "company",
    });
    assert.equal(closed.canReceivePayment, false);
    assert.equal(closed.canRefund, false);
    assert.equal(closed.canCreateInvoice, false);
    assert.equal(closed.canWriteOff, false);
    assert.equal(closed.canClose, false);
    assert.equal(closed.canViewProfile, true);
    assert.match(page, /This account is closed/);
    assert.doesNotMatch(page, /Reopen/);
  });

  it("refuses to close a non-zero account", () => {
    assert.equal(
      accountWorkspaceCapabilities({
        role: "manager",
        status: "open",
        balance: 12,
        accountKind: "company",
      }).canClose,
      false,
    );
    assert.equal(
      accountWorkspaceCapabilities({
        role: "owner",
        status: "open",
        balance: -3,
        accountKind: "group",
      }).canClose,
      false,
    );
    assert.match(page, /Account balance must be zero before closing/);
  });

  it("allows an owner or manager to close a zero account", () => {
    for (const role of ["owner", "manager"] as const) {
      assert.equal(
        accountWorkspaceCapabilities({
          role,
          status: "open",
          balance: 0,
          accountKind: "company",
        }).canClose,
        true,
      );
    }
  });

  it("does not let a cashier close an account", () => {
    const cashier = accountWorkspaceCapabilities({
      role: "cashier",
      status: "open",
      balance: 0,
      accountKind: "company",
    });
    assert.equal(cashier.canClose, false);
    assert.equal(cashier.canWriteOff, false);
    assert.equal(cashier.canCreateInvoice, false);
    assert.equal(cashier.canReceivePayment, true);
    assert.equal(cashier.canRefund, false);
    assert.match(page, /membership\.role === "owner" \|\| membership\.role === "manager"/);
  });

  it("keeps an accountant read only", () => {
    const accountant = accountWorkspaceCapabilities({
      role: "accountant",
      status: "open",
      balance: 80,
      accountKind: "group",
    });
    assert.equal(accountant.canReceivePayment, false);
    assert.equal(accountant.canRefund, false);
    assert.equal(accountant.canCreateInvoice, false);
    assert.equal(accountant.canWriteOff, false);
    assert.equal(accountant.canClose, false);
    assert.equal(accountant.canViewProfile, true);
  });

  it("links company and group profiles on the existing guest route", () => {
    assert.match(page, /to="\/restaurant\/pms\/guests\/\$guestId"/);
    assert.match(page, /guestProfileSearch\(\{ type: profileType, nav: "overview" \}\)/);
    assert.match(page, /View company profile/);
    assert.match(page, /View group profile/);
    assert.match(page, /isGroup \? "group" : "company"/);
  });

  it("keeps the existing account invoice workflow inside the shell", () => {
    assert.match(page, /AccountInvoiceWorkspace/);
    assert.match(invoiceBuilder, /export function AccountInvoiceWorkspace/);
    assert.match(invoiceBuilder, /DebitNoteSection/);
    assert.match(accountsPanel, /openFinancialAccount/);
    assert.match(accountsPanel, /to: "\/restaurant\/pms\/cashiering\/accounts\/\$accountId"/);
    assert.doesNotMatch(page, /Post Charge/);
    assert.doesNotMatch(page, /Adjust Balance/);
    assert.doesNotMatch(page, /Payment Allocation/);
  });

  it("collapses transfer components and skips tax children in recent activity", () => {
    const rows = recentAccountActivity([
      line({
        id: "tax",
        type: "charge",
        category: "tax",
        amount: 15,
        originalTransactionId: "parent",
        postedAt: "2026-10-10T12:02:00.000Z",
      }),
      line({
        id: "in-tax",
        type: "transfer_in",
        category: "transfer",
        amount: 15,
        transferId: "tr-1",
        description: "Room",
        postedAt: "2026-10-10T12:01:00.000Z",
      }),
      line({
        id: "in-parent",
        type: "transfer_in",
        category: "transfer",
        amount: 100,
        transferId: "tr-1",
        description: "Room",
        postedAt: "2026-10-10T12:00:00.000Z",
      }),
      line({
        id: "pay",
        type: "payment",
        category: "payment",
        amount: -50,
        postedAt: "2026-10-09T12:00:00.000Z",
      }),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.type, "transfer_in");
    assert.equal(rows[0]?.amount, 115);
    assert.equal(activityTypeLabel(rows[0]!), "Transfer in");
    assert.equal(
      activityTypeLabel(
        line({
          id: "wo",
          type: "adjustment",
          amount: -10,
          description: "Settlement write-off: Authorized settlement write-off",
          referenceType: "settlement_write_off",
        }),
      ),
      "Write-off",
    );
  });

  it("lists invoices, credit notes, and debit notes without settlement fields", () => {
    const docs = recentAccountDocuments([
      {
        id: "1",
        number: "AINV-1",
        documentType: "invoice",
        issuedAt: "2026-10-01T00:00:00.000Z",
        amount: 10,
      },
      {
        id: "2",
        number: "CN-1",
        documentType: "credit_note",
        issuedAt: "2026-10-02T00:00:00.000Z",
        amount: -4,
      },
      {
        id: "3",
        number: "DN-1",
        documentType: "debit_note",
        issuedAt: "2026-10-03T00:00:00.000Z",
        amount: 2,
      },
    ]);
    assert.deepEqual(
      docs.map((doc) => doc.number),
      ["DN-1", "CN-1", "AINV-1"],
    );
    assert.match(page, /No invoices or account documents have been issued/);
    assert.match(page, /No financial activity yet/);
    assert.doesNotMatch(page, /Due date/i);
  });

  it("prefills a new financial account with the company billing currency and still allows an override", () => {
    assert.equal(
      masterBillingCurrency({ billing_currency_code: "etb", account_operations: { billing: { currency: "USD" } } }),
      "ETB",
    );
    assert.equal(
      masterBillingCurrency({ billing_currency_code: null, account_operations: { billing: { currency: "usd" } } }),
      "USD",
    );
    assert.equal(masterBillingCurrency({ billing_currency_code: " ", account_operations: {} }), null);
    assert.match(accountsPanel, /getMasterBillingCurrency/);
    assert.match(accountsPanel, /setCurrencyEdited\(true\)/);
    assert.doesNotMatch(accountsPanel, /useState\("GBP"\)/);
  });
});
