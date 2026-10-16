import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Coins, Landmark, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  ACCOUNT_TENDER_METHODS,
  accountBalancePresentation,
  accountMethodLabel,
  accountPaymentDescription,
  overpaymentCredit,
  parsePositiveAmount,
  projectedAccountBalance,
  type AccountTenderMethod,
} from "@/packages/pms/lib/cashiering-account-payments";
import {
  cashieringPropertyHotelName,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";
import { getCashieringDocumentProperty } from "@/packages/pms/lib/cashiering-invoices.functions";
import { postFinancialAccountEntry } from "@/packages/pms/lib/cashiering-phases.functions";
import { formatBalance } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import { type TenderReceipt } from "@/packages/pms/components/cashiering/folio-dialogs";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

export type AccountPaymentKind = "payment" | "deposit";

function postingKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function AccountPaymentDialog({
  open,
  initialKind = "payment",
  restaurantId,
  accountId,
  accountName,
  accountNumber,
  contactPhone,
  contactEmail,
  currency,
  balance,
  money,
  dateTime,
  onOpenChange,
  onPosted,
  onReceipt,
}: {
  open: boolean;
  initialKind?: AccountPaymentKind;
  restaurantId: string;
  accountId: string;
  accountName: string;
  accountNumber: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  currency: string;
  balance: number;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onOpenChange: (open: boolean) => void;
  onPosted: () => void;
  onReceipt?: (receipt: TenderReceipt) => void;
}) {
  const queryClient = useQueryClient();
  const post = useServerFn(postFinancialAccountEntry);
  const fetchProperty = useServerFn(getCashieringDocumentProperty);

  const propertyQuery = useQuery({
    queryKey: ["cashiering-document-property", restaurantId],
    queryFn: () => fetchProperty({ data: { restaurantId } }),
    enabled: open,
  });
  const documentProperty: CashieringDocumentProperty | null = propertyQuery.data ?? null;

  const [kind, setKind] = useState<AccountPaymentKind>(initialKind);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [receivedFrom, setReceivedFrom] = useState(accountName);
  const [notes, setNotes] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const [currentPostingKey, setCurrentPostingKey] = useState("");

  const parsed = parsePositiveAmount(amount);
  const credit = parsed != null ? overpaymentCredit(balance, parsed) : null;
  const projected =
    parsed != null ? projectedAccountBalance(balance, kind, parsed) : null;
  const description = accountPaymentDescription(receivedFrom, notes);

  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setAmount("");
      setMethod("cash");
      setReceivedFrom(accountName);
      setNotes("");
      setPrintReceipt(true);
      setCurrentPostingKey(postingKey(initialKind === "deposit" ? "dep" : "pay"));
    }
  }, [open, initialKind, accountName]);

  const mutation = useMutation({
    mutationFn: () => {
      if (parsed == null || !method || !receivedFrom.trim() || description.length > 200) {
        throw new Error("Enter the amount, payment method, and who the tender was received from.");
      }
      return post({
        data: {
          restaurantId,
          accountId,
          type: kind,
          amount: parsed,
          method,
          description,
          idempotencyKey: currentPostingKey,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      const receiptData: TenderReceipt = {
        kind,
        transactionId: result.id || currentPostingKey,
        postedAt: new Date().toISOString(),
        receivedFrom: receivedFrom.trim(),
        amount: parsed ?? 0,
        method: accountMethodLabel(method as AccountTenderMethod),
        notes: notes.trim(),
        folioNumber: accountNumber,
        guestName: accountName,
        guestPhone: contactPhone ?? null,
        guestEmail: contactEmail ?? null,
        propertyName: cashieringPropertyHotelName(documentProperty) || "Property",
        property: documentProperty,
        currencyCode: currency,
        folioBalance: projected ?? balance,
      };

      toast.success(kind === "deposit" ? "Deposit received." : "Payment received.");
      onOpenChange(false);
      onPosted();

      if (printReceipt) {
        onReceipt?.(receiptData);
        window.setTimeout(() => {
          window.print();
        }, 120);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isDeposit = kind === "deposit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border border-[#E8E1D7] bg-white rounded-2xl p-0 overflow-hidden shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b border-[#E8E1D7] bg-[#F7F4EE]/70">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-xs",
                isDeposit
                  ? "bg-[#C89933]/15 text-[#8a6a1f]"
                  : "bg-emerald-100 text-[#146C43]",
              )}
            >
              {isDeposit ? <Wallet className="size-5" /> : <Landmark className="size-5" />}
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-[#251605]">
                {isDeposit ? "Receive Deposit" : "Receive Payment"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-[#7A7167]">
                {accountName} · #{accountNumber} · {currency}
              </DialogDescription>
            </div>
          </div>

          {/* Kind Switcher */}
          <div className="mt-3 flex rounded-lg bg-[#EAE4D9]/70 p-0.5 text-xs font-semibold">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md py-1.5 transition-all text-center",
                kind === "payment"
                  ? "bg-white text-[#251605] shadow-xs"
                  : "text-[#7A7167] hover:text-[#251605]",
              )}
              onClick={() => setKind("payment")}
            >
              Payment
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md py-1.5 transition-all text-center",
                kind === "deposit"
                  ? "bg-white text-[#251605] shadow-xs"
                  : "text-[#7A7167] hover:text-[#251605]",
              )}
              onClick={() => setKind("deposit")}
            >
              Deposit
            </button>
          </div>
        </DialogHeader>

        {/* Form Body */}
        <div className="p-5 space-y-3.5 text-xs">
          {/* Amount */}
          <div className="space-y-1">
            <Label htmlFor="account-entry-amount" className="text-xs font-semibold text-[#5F554B]">
              Amount ({currency}) *
            </Label>
            <Input
              id="account-entry-amount"
              inputMode="decimal"
              type="number"
              step="0.01"
              value={amount}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 text-base font-bold tabular-nums border-[#E8E1D7] focus-visible:ring-[#C89933]"
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-1">
            <Label htmlFor="account-entry-method" className="text-xs font-semibold text-[#5F554B]">
              Payment Method *
            </Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="account-entry-method" className="h-10 border-[#E8E1D7] bg-white">
                <SelectValue placeholder="Choose payment method" />
              </SelectTrigger>
              <SelectContent className="border-[#E8E1D7]">
                {ACCOUNT_TENDER_METHODS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {accountMethodLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Received From */}
          <div className="space-y-1">
            <Label htmlFor="account-entry-received-from" className="text-xs font-semibold text-[#5F554B]">
              Received from *
            </Label>
            <Input
              id="account-entry-received-from"
              value={receivedFrom}
              maxLength={80}
              placeholder="Person or organization paying"
              onChange={(e) => setReceivedFrom(e.target.value)}
              className="h-10 border-[#E8E1D7] focus-visible:ring-[#C89933]"
            />
          </div>

          {/* Reference / Notes */}
          <div className="space-y-1">
            <Label htmlFor="account-entry-notes" className="text-xs font-semibold text-[#5F554B]">
              Reference / Notes
            </Label>
            <Textarea
              id="account-entry-notes"
              value={notes}
              maxLength={120}
              rows={2}
              placeholder="Transaction reference, check #, or operational note"
              onChange={(e) => setNotes(e.target.value)}
              className="border-[#E8E1D7] resize-none focus-visible:ring-[#C89933]"
            />
          </div>

          {/* Print receipt checkbox */}
          <label className="flex items-center gap-2.5 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3.5 py-2.5 text-xs font-semibold text-[#251605] cursor-pointer hover:bg-[#F5F1E8]">
            <Checkbox
              checked={printReceipt}
              onCheckedChange={(checked) => setPrintReceipt(checked === true)}
            />
            <span>Print receipt</span>
          </label>

          {/* Projected Balance Summary */}
          {parsed != null && projected != null ? (
            <div className="rounded-xl border border-[#E8E1D7] bg-[#FAF8F4] p-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#7A7167]">
                <span>Current balance</span>
                <span className="font-medium tabular-nums text-[#251605]">
                  {formatBalance(money, balance)}
                </span>
              </div>
              <div className="flex justify-between text-[#7A7167]">
                <span>{isDeposit ? "Deposit amount" : "Payment amount"}</span>
                <span className="font-semibold tabular-nums text-emerald-700">
                  -{money(parsed)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#E8E1D7]/70 pt-1.5 font-semibold">
                <span className="text-[#251605]">Projected balance</span>
                <span className="text-sm font-bold tabular-nums text-[#251605]">
                  {accountBalancePresentation(projected).label} {formatBalance(money, projected)}
                </span>
              </div>
              {credit != null ? (
                <div className="flex items-start gap-1.5 pt-1 text-[11px] text-[#8A6A24]">
                  <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                  <span>This payment leaves a credit balance of {money(credit)}.</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {method === "cash" ? (
            <p className="text-[11px] text-[#7A7167] italic">
              Cash tender will be accounted into your current active drawer / shift.
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-[#E8E1D7] bg-[#F7F4EE]/50 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#E8E1D7] hover:bg-[#F7F4EE]"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || parsed == null || !method || !receivedFrom.trim()}
            className={cn(
              "font-semibold text-white shadow-xs",
              isDeposit
                ? "bg-[#C89933] hover:bg-[#b88928] text-[#251605]"
                : "bg-[#146C43] hover:bg-[#0E5232]",
            )}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Posting..."
              : isDeposit
                ? "Receive Deposit"
                : credit != null
                  ? "Post payment and leave credit"
                  : "Receive Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
