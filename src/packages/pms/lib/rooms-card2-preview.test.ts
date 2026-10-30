import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bulkPreviewBlocksCreate,
  classifyBulkRoomPreview,
} from "./rooms-card2-preview.ts";

describe("classifyBulkRoomPreview", () => {
  const labels = [
    { roomNumber: "101", roomCode: "101" },
    { roomNumber: "102", roomCode: "102" },
    { roomNumber: "103", roomCode: "103" },
    { roomNumber: "104", roomCode: "104" },
  ];

  it("marks available, conflict, and excluded", () => {
    const { items, summary } = classifyBulkRoomPreview({
      labels,
      existing: [
        {
          roomNumber: "103",
          roomCode: "103",
          roomTypeName: "Standard Twin",
          building: "Main Building",
          floor: "Floor 1",
        },
      ],
      excludedNumbers: ["104"],
    });
    assert.equal(items.find((i) => i.roomNumber === "101")?.status, "AVAILABLE");
    assert.equal(items.find((i) => i.roomNumber === "103")?.status, "CONFLICT");
    assert.equal(items.find((i) => i.roomNumber === "104")?.status, "EXCLUDED");
    assert.deepEqual(summary, { generated: 4, ready: 2, excluded: 1, conflicts: 1 });
    assert.equal(bulkPreviewBlocksCreate(summary), true);
  });

  it("excluded conflict no longer blocks when removed from conflict set", () => {
    const { summary } = classifyBulkRoomPreview({
      labels: labels.slice(0, 3),
      existing: [{ roomNumber: "103", roomCode: "103", roomTypeName: "Twin" }],
      excludedNumbers: ["103"],
    });
    assert.equal(summary.conflicts, 0);
    assert.equal(summary.excluded, 1);
    assert.equal(summary.ready, 2);
    assert.equal(bulkPreviewBlocksCreate(summary), false);
  });
});
