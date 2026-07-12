import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";

describe("toCsv", () => {
  it("escapes quoted cells", () => {
    expect(toCsv([{ Name: 'A "quoted" name' }], ["Name"])).toContain('"A ""quoted"" name"');
  });
});
