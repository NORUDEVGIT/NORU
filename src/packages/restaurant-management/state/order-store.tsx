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
import type { MenuItem } from "@/shared/lib/menu";
import { placeOrder as placeOrderFn } from "@/packages/restaurant-management/lib/orders.functions";
import type { RmBillTotals } from "@/packages/restaurant-management/lib/rm-tax";

export interface CartLine {
  lineId: string;
  item: MenuItem;
  quantity: number;
  notes?: string | undefined;
}

export type TableSource = "qr" | "manual" | null;

export type OrderStatus = "received" | "preparing" | "ready" | "served";

export const ORDER_STATUS_STEPS: { key: OrderStatus; label: string; hint: string }[] = [
  { key: "received", label: "Order Received", hint: "The kitchen has your order." },
  { key: "preparing", label: "Preparing", hint: "Your dishes are being cooked." },
  { key: "ready", label: "Ready", hint: "Plated and waiting to be brought over." },
  { key: "served", label: "Served", hint: "Enjoy your meal." },
];

export interface PlacedOrder {
  /** Database id — used by the secure status route. */
  id: string;
  /**
   * One-time guest tracking token returned by the server. Stored in
   * sessionStorage only: it dies with the tab, is scoped to one order, grants
   * read-only access to that order alone, and is the only way an anonymous
   * guest can survive a refresh on the status page. Tradeoff accepted in
   * preference to asking dine-in guests to create an account.
   */
  trackingToken: string;
  orderNumber: number;
  tableNumber: string;
  lines: CartLine[];
  total: number;
  bill?: RmBillTotals;
  prepMinutes: number;
}

interface OrderContextValue {
  lines: CartLine[];
  restaurantSlug: string;
  setRestaurantSlug: (slug: string) => void;
  /** Authoritative table identity (restaurant_tables.id) when known. */
  restaurantTableId: string | null;
  /** Display-only table label. */
  tableNumber: string;
  /** How the current table was established. QR tables skip manual entry. */
  tableSource: TableSource;
  setTableContext: (context: {
    slug: string;
    tableId: string | null;
    tableNumber: string;
    source?: TableSource;
  }) => void;
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
  placeOrder: (slug: string) => Promise<PlacedOrder>;
  setStatus: (status: OrderStatus) => void;
  advanceStatus: () => void;
  resetOrder: () => void;
}

const OrderContext = createContext<OrderContextValue | null>(null);

const STORAGE_KEY = "garden-table-order";

interface PersistedState {
  lines: CartLine[];
  restaurantSlug?: string;
  restaurantTableId?: string | null;
  tableNumber: string;
  tableSource?: TableSource;
  order: PlacedOrder | null;
  status: OrderStatus;
}

export function OrderProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [restaurantSlug, setRestaurantSlugState] = useState("");
  const [restaurantTableId, setRestaurantTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumberState] = useState("");
  const [tableSource, setTableSource] = useState<TableSource>(null);
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
        setRestaurantSlugState(saved.restaurantSlug ?? "");
        setRestaurantTableId(saved.restaurantTableId ?? null);
        setTableNumberState(saved.tableNumber ?? "");
        setTableSource(saved.tableSource ?? null);
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
      JSON.stringify({
        lines,
        restaurantSlug,
        restaurantTableId,
        tableNumber,
        tableSource,
        order,
        status,
      } satisfies PersistedState),
    );
  }, [lines, restaurantSlug, restaurantTableId, tableNumber, tableSource, order, status]);

  // Selecting a different restaurant starts a fresh cart: lines are priced and
  // validated per tenant server-side, so they must never cross restaurants.
  const setRestaurantSlug = useCallback((slug: string) => {
    setRestaurantSlugState((prev) => {
      if (prev && prev !== slug) {
        setLines([]);
        // Table context belongs to the previous tenant — never carry it over.
        setRestaurantTableId(null);
        setTableNumberState("");
        setTableSource(null);
      }
      return slug;
    });
  }, []);

  /**
   * Applied when a QR code (or a resolved manual entry) identifies a table.
   * Scanning another table in the SAME restaurant keeps the cart and simply
   * moves the order to the new table; a different restaurant clears the cart.
   */
  const setTableContext = useCallback(
    ({
      slug,
      tableId,
      tableNumber: number,
      source = "qr",
    }: {
      slug: string;
      tableId: string | null;
      tableNumber: string;
      source?: TableSource;
    }) => {
      setRestaurantSlugState((prev) => {
        if (prev && prev !== slug) setLines([]);
        return slug;
      });
      setRestaurantTableId(tableId);
      setTableNumberState(number);
      setTableSource(source);
    },
    [],
  );

  /** Manual typing only edits the label; it clears any resolved table id. */
  const setTableNumber = useCallback((value: string) => {
    setTableNumberState(value);
    setRestaurantTableId(null);
    setTableSource(null);
  }, []);

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

  const placeOrder = useCallback(
    async (slug: string) => {
    // The tenant always comes from the URL-driven caller, never from a default.
    if (!slug) {
      throw new Error(
        "Restaurant context is missing. Please return to the restaurant menu and try again.",
      );
    }
    if (lines.length === 0) throw new Error("Your order is empty.");
    if (!tableNumber.trim() && !restaurantTableId) {
      throw new Error("Please enter your table number.");
    }

    const result = await placeOrderFn({
      data: {
        restaurantSlug: slug,
        restaurantTableId,
        tableNumber: tableNumber.trim(),
        lines: lines.map((line) => ({
          menuItemId: line.item.id,
          name: line.item.name,
          quantity: line.quantity,
          price: line.item.price,
          specialInstructions: line.notes ?? null,
        })),
      },
    });

    if (!result.ok) {
      throw new Error(result.message);
    }

    const placed: PlacedOrder = {
      id: result.id,
      trackingToken: result.trackingToken,
      orderNumber: result.orderNumber,
      tableNumber: result.tableNumber,
      lines,
      total: result.total,
      bill: result.bill,
      prepMinutes: Math.min(40, 15 + lines.length * 3),
    };
    // Cart is only cleared once the order and its items exist in the database.
    setOrder(placed);
    setStatus("received");
    setLines([]);
    return placed;
    },
    [lines, tableNumber, restaurantTableId],
  );

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
    setTableNumberState("");
    setRestaurantTableId(null);
    setTableSource(null);
  }, []);

  const value = useMemo<OrderContextValue>(
    () => ({
      lines,
      restaurantSlug,
      setRestaurantSlug,
      restaurantTableId,
      tableNumber,
      tableSource,
      setTableContext,
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
      restaurantSlug,
      setRestaurantSlug,
      restaurantTableId,
      tableSource,
      setTableContext,
      setTableNumber,
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
