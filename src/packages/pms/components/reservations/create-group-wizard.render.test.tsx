import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async () => [],
}));

vi.mock("@/packages/pms/lib/groups.functions", () => ({
  addGroupBlock: {},
  createGroup: {},
}));

vi.mock("@/packages/pms/lib/guests.functions", () => ({
  guestListItems: () => [],
  listGuests: {},
}));

vi.mock("@/packages/pms/lib/rates.functions", () => ({ listRatePlans: {} }));
vi.mock("@/packages/pms/lib/reservations.functions", () => ({
  getRoomTypeAvailability: {},
}));
vi.mock("@/packages/pms/lib/rooms.functions", () => ({ listRoomTypes: {} }));
vi.mock("@/packages/pms/lib/inventory-rules.functions", () => ({
  getInventoryRules: {},
}));
vi.mock("@/packages/pms/lib/pms-set6-sales-distribution.functions", () => ({
  getPmsSet6Snapshot: {},
}));

vi.mock("@/packages/pms/components/reservations/reservation-workspace-overlay", () => ({
  ReservationWorkspaceOverlay: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-testid": "create-group-wizard-host" }, children),
}));

vi.mock("@/packages/pms/components/bookings/create-reservation-master-picker", () => ({
  CreateReservationMasterPicker: () => null,
}));

vi.mock("@/packages/pms/lib/groups-create-wizard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/packages/pms/lib/groups-create-wizard")>();
  return {
    ...actual,
    emptyGroupCreateDraft: () => ({
      ...actual.emptyGroupCreateDraft(),
      name: "Crew allotment",
      arrivalDate: "2026-11-10",
      departureDate: "2026-11-12",
      allotments: [actual.emptyAllotmentRow("2026-11-10", "2026-11-12", "row-1")],
    }),
  };
});

describe("CreateGroupWizard availability memo", () => {
  it("renders allotment rows without a groupStayIsValid ReferenceError", async () => {
    const { CreateGroupWizard } = await import("./create-group-wizard");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let markup = "";
    expect(() => {
      markup = renderToString(
        createElement(
          QueryClientProvider,
          { client },
          createElement(CreateGroupWizard, {
            restaurantId: "rest-1",
            open: true,
            onOpenChange: () => undefined,
            onCreated: () => undefined,
          }),
        ),
      );
    }).not.toThrow(/groupStayIsValid is not defined/);
    expect(markup).toContain("create-group-wizard");
  });
});
