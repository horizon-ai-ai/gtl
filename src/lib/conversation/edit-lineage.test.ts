import { isEditWithinGenerationLineage } from "./edit-lineage";

// Conversation shape:
//   m1 (user, consultative) -> m2 (assistant reply)
//   m3 (user, instruction)  -> gen1 (generation_result, source = m3)
const messages = [
  { id: "m1", parentMessageId: null },
  { id: "m2", parentMessageId: "m1" },
  { id: "m3", parentMessageId: "m2" },
  { id: "gen1", parentMessageId: "m3" },
];

const generation = { messageId: "gen1", sourceMessageId: "m3" };

describe("isEditWithinGenerationLineage", () => {
  it("regenerates when the edited message is the generation's instruction message", () => {
    expect(
      isEditWithinGenerationLineage({ editedMessageId: "m3", generation, messages }),
    ).toBe(true);
  });

  it("regenerates when the edited message is an ancestor on the generation's branch path", () => {
    expect(
      isEditWithinGenerationLineage({ editedMessageId: "m1", generation, messages }),
    ).toBe(true);
  });

  it("does not regenerate for an unrelated consultative message", () => {
    const withSideBranch = [
      ...messages,
      // Sibling branch off m2 that the generation does not descend from.
      { id: "m3-side", parentMessageId: "m2" },
      { id: "m4-side", parentMessageId: "m3-side" },
    ];
    expect(
      isEditWithinGenerationLineage({
        editedMessageId: "m4-side",
        generation,
        messages: withSideBranch,
      }),
    ).toBe(false);
    expect(
      isEditWithinGenerationLineage({
        editedMessageId: "m3-side",
        generation,
        messages: withSideBranch,
      }),
    ).toBe(false);
  });

  it("does not regenerate when there is no target generation", () => {
    expect(
      isEditWithinGenerationLineage({ editedMessageId: "m3", generation: null, messages }),
    ).toBe(false);
  });

  it("falls back to the instruction message's chain when the result message is not loaded", () => {
    const withoutResult = messages.filter((m) => m.id !== "gen1");
    expect(
      isEditWithinGenerationLineage({
        editedMessageId: "m1",
        generation,
        messages: withoutResult,
      }),
    ).toBe(true);
  });

  it("survives a parent cycle without looping forever", () => {
    const cyclic = [
      { id: "a", parentMessageId: "b" },
      { id: "b", parentMessageId: "a" },
      { id: "gen1", parentMessageId: "a" },
    ];
    expect(
      isEditWithinGenerationLineage({
        editedMessageId: "zz",
        generation: { messageId: "gen1", sourceMessageId: null },
        messages: cyclic,
      }),
    ).toBe(false);
  });
});
