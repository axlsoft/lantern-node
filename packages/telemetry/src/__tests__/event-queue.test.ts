import { describe, it, expect } from "vitest";
import { create } from "@bufbuild/protobuf";
import { CoverageSchema } from "../generated/lantern/v1/coverage_pb.js";
import { EventQueue } from "../event-queue.js";

function makeEvent(testId: string) {
  return create(CoverageSchema, {
    filePath: "src/foo.ts",
    lineStart: 1,
    lineEnd: 1,
    hitCount: 1,
    testId,
  });
}

describe("EventQueue", () => {
  describe("dropOldest policy", () => {
    it("enqueue and drain", () => {
      const q = new EventQueue(10, "dropOldest");
      q.enqueue(makeEvent("a"));
      q.enqueue(makeEvent("b"));
      expect(q.length).toBe(2);
      const drained = q.drain(10);
      expect(drained).toHaveLength(2);
      expect(drained[0]?.testId).toBe("a");
      expect(drained[1]?.testId).toBe("b");
      expect(q.length).toBe(0);
      expect(q.isEmpty).toBe(true);
    });

    it("drops oldest when capacity exceeded", () => {
      const q = new EventQueue(3, "dropOldest");
      q.enqueue(makeEvent("a"));
      q.enqueue(makeEvent("b"));
      q.enqueue(makeEvent("c"));
      q.enqueue(makeEvent("d")); // drops 'a'
      const drained = q.drainAll();
      expect(drained.map((e) => e.testId)).toEqual(["b", "c", "d"]);
    });
  });

  describe("dropNewest policy", () => {
    it("drops newest when capacity exceeded", () => {
      const q = new EventQueue(3, "dropNewest");
      q.enqueue(makeEvent("a"));
      q.enqueue(makeEvent("b"));
      q.enqueue(makeEvent("c"));
      q.enqueue(makeEvent("d")); // dropped
      const drained = q.drainAll();
      expect(drained.map((e) => e.testId)).toEqual(["a", "b", "c"]);
    });
  });

  it("drain(max) respects limit", () => {
    const q = new EventQueue(10, "dropOldest");
    q.enqueueAll(["a", "b", "c", "d", "e"].map(makeEvent));
    const first = q.drain(2);
    expect(first).toHaveLength(2);
    expect(q.length).toBe(3);
    const rest = q.drain(10);
    expect(rest).toHaveLength(3);
    expect(q.isEmpty).toBe(true);
  });

  it("circular buffer wraps correctly without overflow", () => {
    const q = new EventQueue(4, "dropOldest");
    // Fill to 3, drain 2 (head advances to index 2), fill 3 more → tail wraps past end
    q.enqueueAll(["a", "b", "c"].map(makeEvent));
    q.drain(2); // removes 'a', 'b'; head=2, size=1
    q.enqueueAll(["d", "e", "f"].map(makeEvent)); // fills exactly to capacity (size=4)
    const drained = q.drainAll();
    expect(drained.map((e) => e.testId)).toEqual(["c", "d", "e", "f"]);
  });

  it("circular buffer wraps and drops oldest on overflow", () => {
    const q = new EventQueue(3, "dropOldest");
    q.enqueueAll(["a", "b", "c"].map(makeEvent)); // full
    q.drain(1); // removes 'a'; size=2
    q.enqueueAll(["d", "e"].map(makeEvent)); // fills to capacity again; no drop
    q.enqueue(makeEvent("f")); // drops oldest ('b')
    const drained = q.drainAll();
    expect(drained.map((e) => e.testId)).toEqual(["c", "d", "e", "f"].slice(1)); // ['d','e','f']
  });
});
