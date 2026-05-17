import { describe, expect, it } from "vitest";
import { extractGeminiJson, normalizeParsedItem } from "./parser";

describe("normalizeParsedItem", () => {
  it("normalizes Croatian AI labels into database values", () => {
    const item = normalizeParsedItem(
      {
        name: "Kupiti daske",
        space: "Kupovina",
        tags: [" Vrtlarstvo ", "Drvodjelstvo", ""],
        priority: "Visok",
        whenToTackle: "Ovaj tjedan",
        status: "Za napraviti",
        dependencies: ["Izmjeriti gredice"],
        notes: "Provjeriti impregnaciju.",
      },
      "Trebam kupiti daske za vrtne gredice."
    );

    expect(item).toEqual({
      name: "Kupiti daske",
      space: "kupovina",
      tags: ["Vrtlarstvo", "Drvodjelstvo"],
      priority: "visoko",
      when_to_tackle: "Ovaj tjedan",
      status: "novo",
      dependencies: ["Izmjeriti gredice"],
      notes: "Provjeriti impregnaciju.",
    });
  });

  it("defaults missing or invalid AI fields without losing the raw idea", () => {
    const item = normalizeParsedItem(
      {
        name: "",
        space: "nepoznato",
        tags: "Vrtlarstvo",
        priority: "nekad",
        status: "blokirano",
        dependencies: null,
      },
      "Popraviti keramičke pločice u hodniku jer se jedna klima."
    );

    expect(item).toEqual({
      name: "Popraviti keramičke pločice u hodniku jer se jedna klima.",
      space: "ideja",
      tags: [],
      priority: "srednje",
      when_to_tackle: "Kasnije",
      status: "novo",
      dependencies: [],
      notes: "",
    });
  });
});

describe("extractGeminiJson", () => {
  it("accepts plain JSON returned by Gemini", () => {
    expect(extractGeminiJson('{"name":"Kupiti boju"}')).toEqual({ name: "Kupiti boju" });
  });

  it("accepts JSON wrapped in a markdown code fence", () => {
    expect(extractGeminiJson('```json\n{"name":"Kupiti boju"}\n```')).toEqual({
      name: "Kupiti boju",
    });
  });
});
