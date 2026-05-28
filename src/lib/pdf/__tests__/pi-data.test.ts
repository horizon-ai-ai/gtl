import { dash, EM_DASH } from "../pi-data";

describe("dash()", () => {
  it("returns em-dash for null", () => {
    expect(dash(null)).toBe(EM_DASH);
    expect(dash(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(dash(undefined)).toBe(EM_DASH);
  });

  it("returns em-dash for empty string", () => {
    expect(dash("")).toBe(EM_DASH);
  });

  it("coerces zero to '0' (not em-dash)", () => {
    expect(dash(0)).toBe("0");
  });

  it("passes CJK strings through unchanged", () => {
    expect(dash("台灣")).toBe("台灣");
  });

  it("coerces non-zero numbers to their string form", () => {
    expect(dash(15)).toBe("15");
    expect(dash(3.14)).toBe("3.14");
  });
});
