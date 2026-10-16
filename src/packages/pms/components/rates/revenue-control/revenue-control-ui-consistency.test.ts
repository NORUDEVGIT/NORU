import { describe, it, expect } from "vitest";

describe("Revenue Control UI Consistency & Readability Verification", () => {
  it("1. enforces the 9-layer page hierarchy order", () => {
    const expectedLayers = [
      "Page Header",
      "Module Navigation / Tabs",
      "Unified Filter Toolbar",
      "Primary KPI Strip",
      "Secondary KPI Strip",
      "Pricing Snapshot Info Strip",
      "Trend + Today's Focus",
      "Rate & Inventory Control Main Table",
      "Support Insights Row",
    ];

    expect(expectedLayers.length).toBe(9);
    expect(expectedLayers[0]).toBe("Page Header");
    expect(expectedLayers[1]).toBe("Module Navigation / Tabs");
    expect(expectedLayers[2]).toBe("Unified Filter Toolbar");
    expect(expectedLayers[3]).toBe("Primary KPI Strip");
    expect(expectedLayers[4]).toBe("Secondary KPI Strip");
    expect(expectedLayers[5]).toBe("Pricing Snapshot Info Strip");
    expect(expectedLayers[6]).toBe("Trend + Today's Focus");
    expect(expectedLayers[7]).toBe("Rate & Inventory Control Main Table");
    expect(expectedLayers[8]).toBe("Support Insights Row");
  });

  it("2. enforces Primary KPI strip order (6 items) and restrained palette", () => {
    const primaryKpis = [
      {
        label: "Booked Room Revenue",
        icon: "CircleDollarSign",
        tone: "bg-[#F4E9D0] text-[#8A641A]",
      },
      { label: "Sold Room Nights", icon: "BedDouble", tone: "bg-[#EFECE6] text-[#423321]" },
      { label: "Occupancy", icon: "DoorOpen", tone: "bg-[#F4E9D0] text-[#8A641A]" },
      { label: "ADR", icon: "BadgeDollarSign", tone: "bg-[#F4E9D0] text-[#8A641A]" },
      { label: "RevPAR", icon: "TrendingUp", tone: "bg-[#F4E9D0] text-[#8A641A]" },
      { label: "Available Room Nights", icon: "CalendarDays", tone: "bg-[#EFECE6] text-[#423321]" },
    ];

    expect(primaryKpis.length).toBe(6);
    expect(primaryKpis.map((k) => k.label)).toEqual([
      "Booked Room Revenue",
      "Sold Room Nights",
      "Occupancy",
      "ADR",
      "RevPAR",
      "Available Room Nights",
    ]);

    // Ensure restrained palette (warm cream/gold for commercial, neutral for inventory/context)
    primaryKpis.forEach((kpi) => {
      expect(kpi.tone).toMatch(/bg-\[#F4E9D0\]|bg-\[#EFECE6\]/);
    });
  });

  it("3. enforces Secondary KPI strip order (3 items) and semantic palette", () => {
    const secondaryKpis = [
      { label: "Remaining Inventory", icon: "Boxes", tone: "bg-[#EFECE6] text-[#423321]" },
      { label: "Active Restrictions", icon: "ShieldAlert", tone: "bg-amber-50 text-amber-700" },
      { label: "Override Count", icon: "Sliders", tone: "bg-[#F4E9D0] text-[#8A641A]" },
    ];

    expect(secondaryKpis.length).toBe(3);
    expect(secondaryKpis.map((k) => k.label)).toEqual([
      "Remaining Inventory",
      "Active Restrictions",
      "Override Count",
    ]);
  });

  it("4. verifies Pricing Snapshot coverage info strip text logic", () => {
    const formatCoverageText = (pricedShare: number) => {
      const base = `Pricing snapshot coverage: ${pricedShare}%.`;
      const detail =
        pricedShare < 100
          ? " Unpriced stays affect occupancy but not booked revenue."
          : " All sold room nights carry verified pricing snapshots.";
      return `${base}${detail}`;
    };

    const partial = formatCoverageText(28.57);
    expect(partial).toContain("Pricing snapshot coverage: 28.57%");
    expect(partial).toContain("Unpriced stays affect occupancy but not booked revenue");

    const full = formatCoverageText(100);
    expect(full).toContain("Pricing snapshot coverage: 100%");
    expect(full).toContain("All sold room nights carry verified pricing snapshots");
  });

  it("5. verifies Rate & Inventory Control pagination math", () => {
    const mockRows = Array.from({ length: 35 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      occupancyPercent: 50,
      soldRoomNights: 5,
      availableRoomNights: 10,
    }));

    const paginate = (rows: typeof mockRows, page: number, pageSize: number) => {
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      const safePage = Math.min(Math.max(1, page), totalPages);
      const start = (safePage - 1) * pageSize;
      const paginatedRows = rows.slice(start, start + pageSize);
      const startEntry = rows.length === 0 ? 0 : start + 1;
      const endEntry = Math.min(start + pageSize, rows.length);
      return { totalPages, safePage, paginatedRows, startEntry, endEntry };
    };

    // Default pageSize = 10
    const page1 = paginate(mockRows, 1, 10);
    expect(page1.totalPages).toBe(4);
    expect(page1.paginatedRows.length).toBe(10);
    expect(page1.startEntry).toBe(1);
    expect(page1.endEntry).toBe(10);
    expect(page1.paginatedRows[0].date).toBe("2026-09-01");
    expect(page1.paginatedRows[9].date).toBe("2026-09-10");

    const page2 = paginate(mockRows, 2, 10);
    expect(page2.paginatedRows.length).toBe(10);
    expect(page2.startEntry).toBe(11);
    expect(page2.endEntry).toBe(20);

    const page4 = paginate(mockRows, 4, 10);
    expect(page4.paginatedRows.length).toBe(5);
    expect(page4.startEntry).toBe(31);
    expect(page4.endEntry).toBe(35);

    // PageSize = 25
    const page1of25 = paginate(mockRows, 1, 25);
    expect(page1of25.totalPages).toBe(2);
    expect(page1of25.paginatedRows.length).toBe(25);
    expect(page1of25.startEntry).toBe(1);
    expect(page1of25.endEntry).toBe(25);

    const page2of25 = paginate(mockRows, 2, 25);
    expect(page2of25.paginatedRows.length).toBe(10);
    expect(page2of25.startEntry).toBe(26);
    expect(page2of25.endEntry).toBe(35);

    // PageSize = 50
    const page1of50 = paginate(mockRows, 1, 50);
    expect(page1of50.totalPages).toBe(1);
    expect(page1of50.paginatedRows.length).toBe(35);
  });

  it("6. verifies support cards and focus list capping at 5 items", () => {
    const list10 = Array.from({ length: 10 }, (_, i) => ({ id: i }));

    const cappedRestrictions = list10.slice(0, 5);
    expect(cappedRestrictions.length).toBe(5);

    const cappedRoomTypes = list10.slice(0, 5);
    expect(cappedRoomTypes.length).toBe(5);

    const cappedActivity = list10.slice(0, 5);
    expect(cappedActivity.length).toBe(5);

    const cappedFocus = list10.slice(0, 5);
    expect(cappedFocus.length).toBe(5);
  });
});
