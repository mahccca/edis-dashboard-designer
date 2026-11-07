import { describe, expect, it } from "vitest";
import { BINDING_ID, value } from "../../test/fixtures";
import { applyMessage, initialLiveState } from ".";

describe("live value messages", () => {
  it("merges value batches and keeps the test-data flag", () => {
    const s1 = applyMessage(initialLiveState, { type: "values", publishedVersionId: "pv", items: [value()] });
    expect(s1.status).toBe("live");
    expect(s1.values[BINDING_ID]?.isTestData).toBe(true);
    const s2 = applyMessage(s1, { type: "values", publishedVersionId: "pv", items: [value({ value: 1, quality: "stale" })] });
    expect(s2.values[BINDING_ID]?.quality).toBe("stale");
  });

  it("surfaces server errors such as forbidden_topic", () => {
    const s = applyMessage(initialLiveState, { type: "error", code: "forbidden_topic", message: "Topic not part of this published page" });
    expect(s.status).toBe("error");
    expect(s.error).toContain("forbidden_topic");
  });
});
