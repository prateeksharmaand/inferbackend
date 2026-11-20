import { fmtDate, fmtLpa, titleCase } from "@/lib/utils";

describe("formatting", () => {
  it("formats LPA ranges per the salary convention", () => {
    expect(fmtLpa(25, 35)).toBe("₹25–35 LPA");
    expect(fmtLpa(30, 30)).toBe("₹30 LPA");
    expect(fmtLpa(null, null)).toBe("Not disclosed");
  });
  it("renders UTC timestamps in Asia/Kolkata", () => {
    // 20:00 UTC on 19 Nov is 01:30 on 20 Nov in IST
    expect(fmtDate("2026-11-19T20:00:00Z")).toContain("20");
    expect(fmtDate("2026-11-19T20:00:00Z", true)).toMatch(/1:30/);
    expect(fmtDate(null)).toBe("—");
  });
  it("title-cases enum values", () => expect(titleCase("awaiting_approval")).toBe("Awaiting Approval"));
});
