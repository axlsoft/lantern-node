import { describe, it, expect } from "vitest";
import { buildLineOffsets, offsetToLine } from "../coverage-manager.js";

describe("buildLineOffsets", () => {
  it("single line has offset [0]", () => {
    expect(buildLineOffsets("hello")).toEqual([0]);
  });

  it("two lines", () => {
    // "abc\ndef" — newline at offset 3, next line starts at 4
    expect(buildLineOffsets("abc\ndef")).toEqual([0, 4]);
  });

  it("three lines", () => {
    expect(buildLineOffsets("a\nb\nc")).toEqual([0, 2, 4]);
  });

  it("trailing newline adds an extra offset", () => {
    expect(buildLineOffsets("a\nb\n")).toEqual([0, 2, 4]);
  });

  it("empty string", () => {
    expect(buildLineOffsets("")).toEqual([0]);
  });
});

describe("offsetToLine", () => {
  //  line 1: offsets 0–3 ("abc\n")
  //  line 2: offsets 4–7 ("def\n")
  //  line 3: offsets 8–10 ("ghi")
  const offsets = [0, 4, 8];

  it("start of first line → 1", () => {
    expect(offsetToLine(offsets, 0)).toBe(1);
  });

  it("end of first line → 1", () => {
    expect(offsetToLine(offsets, 3)).toBe(1);
  });

  it("start of second line → 2", () => {
    expect(offsetToLine(offsets, 4)).toBe(2);
  });

  it("middle of second line → 2", () => {
    expect(offsetToLine(offsets, 6)).toBe(2);
  });

  it("start of third line → 3", () => {
    expect(offsetToLine(offsets, 8)).toBe(3);
  });

  it("past last line → last line number", () => {
    expect(offsetToLine(offsets, 100)).toBe(3);
  });
});
