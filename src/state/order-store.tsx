import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MenuItem } from "@/data/menu";
import { placeOrder as placeOrderFn } from "@/lib/orders.functions";

export interface CartLine {
  lineId: string;
  item: MenuItem;
  quantity: number;
  notes?: string | undefined;
}

export type OrderStatus = "received" | "preparing" | "ready" | "served";

export const ORDER_STATUS_STEPS: { key: OrderStatus; label: string; hint: string }[] = [
  { key: "received", label: "Order Received", hint: "The kitchen has your order." },
  { key: "preparing", label: "Preparing", hint: "Your dishes are being cooked." },
  { key: "ready", label: "Ready", hint: "Plated and waiting to be brought over." },
  { key: "served", label: "Served", hint: "Enjoy your meal." },
];

export interface PlacedOrder {
  orderNumber: number;
  tableNumber: string;
  lines: CartLine[];
  total: number;
  prepMinutes: number;
}

interface OrderContextValue {
  lines: CartLine[];
  tableNumber: string;
  order: PlacedOrder | null;
  status: OrderStatus;
  itemCount: number;
  subtotal: number;
  total: number;
  addItem: (item: MenuItem, quantity?: number, notes?: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  setNotes: (lineId: string, notes: string) => void;
  removeLine: (lineId: string) => void;
  setTableNumber: (value: string) => void;
  placeOrder: () => Promise<PlacedOrder>;
  setStatus: (status: OrderStatus) => void;
  advanceStatus: () => void;
  resetOrder: () => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

const STORAGE_KEY = "garden-table-order";

interface PersistedState {
  lines: CartLine[];
  tableNumber: string;
  order: PlacedOrder | null;
  status: OrderStatus;
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [tableNumber, setTableNumber] = useState("");
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [status, setStatus] = useState<OrderStatus>("received");
  const hydrated = useRef(false);

  // Session persistence keeps the order alive across refreshes; swapping this
  // for a backend later only touches this provider.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedState;
        setLines(saved.lines ?? []);
        setTableNumber(saved.tableNumber ?? "");
        setOrder(saved.order ?? null);
        setStatus(saved.status ?? "received");
      }
    } catch {
      // ignore malformed state
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lines, tableNumber, order, status } satisfies PersistedState),
    );
  }, [lines, tableNumber, order, status]);

  const addItem = useCallback((item: MenuItem, quantity = 1, notes = "") => {
    setLines((prev) => {
      const match = prev.find(
        (line) => line.item.id === item.id && (line.notes ?? "") === notes,
      );
      if (match) {
        return prev.map((line) =>
          line.lineId === match.lineId
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [
        ...prev,
        {
          lineId: `${item.id}-${Date.now()}-${Math.round(Math.random() * 1000)}`,
          item,
          quantity,
          notes: notes || undefined,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.lineId !== lineId)
        : prev.map((line) => (line.lineId === lineId ? { ...line, quantity } : line)),
    );
  }, []);

  const setNotes = useCallback((lineId: string, notes: string) => {
    setLines((prev) =>
      prev.map((line) =>
        line.lineId === lineId ? { ...line, notes: notes || undefined } : line,
      ),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((line) => line.lineId !== lineId));
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.item.price * line.quantity, 0),
    [lines],
  );
  const itemCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );

  const placeOrder = useCallback(async () => {
    if (lines.length === 0) throw new Error("Your order is empty.");
    const table = Number.parseInt(tableNumber, 10);
    if (!tableNumber || Number.isNaN(table) || table <= 0) {
      throw new Error("Please enter your table number.");
    }

    const result = await placeOrderFn({
      data: {
        tableNumber: table,
        lines: lines.map((line) => ({
          menuItemId: line.item.id,
          name: line.item.name,
          quantity: line.quantity,
          price: line.item.price,
          specialInstructions: line.notes ?? null,
        })),
      },
    });

    const placed: PlacedOrder = {
      orderNumber: result.orderNumber,
      tableNumber,
      lines,
      total: result.total,
      prepMinutes: Math.min(40, 15 + lines.length * 3),
    };
    // Cart is only cleared once the order and its items exist in the database.
    setOrder(placed);
    setStatus("received");
    setLines([]);
    return placed;
  }, [lines, tableNumber]);

  const advanceStatus = useCallback(() => {
    setStatus((prev) => {
      const index = ORDER_STATUS_STEPS.findIndex((step) => step.key === prev);
      return ORDER_STATUS_STEPS[Math.min(index + 1, ORDER_STATUS_STEPS.length - 1)]!.key;
    });
  }, []);

  const resetOrder = useCallback(() => {
    setOrder(null);
    setStatus("received");
    setLines([]);
    setTableNumber("");
  }, []);

  const value = useMemo<OrderContextValue>(
    () => ({
      lines,
      tableNumber,
      order,
      status,
      itemCount,
      subtotal,
      total: subtotal,
      addItem,
      setQuantity,
      setNotes,
      removeLine,
      setTableNumber,
      placeOrder,
      setStatus,
      advanceStatus,
      resetOrder,
    }),
    [
      lines,
      tableNumber,
      order,
      status,
      itemCount,
      subtotal,
      addItem,
      setQuantity,
      setNotes,
      removeLine,
      placeOrder,
      advanceStatus,
      resetOrder,
    ],
  );

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) throw new Error("useOrder must be used inside OrderProvider");
  return context;
}
