import { describe, expect, it, vi } from "vitest";
import { handleCreateItemRequest, handleUpdateItemRequest } from "./item-api";
import type { NormalizedParsedItem } from "./parser";

const parsedItem: NormalizedParsedItem = {
  name: "Kupiti daske",
  space: "kupovina",
  tags: ["Vrtlarstvo"],
  priority: "visoko",
  when_to_tackle: "Ovaj tjedan",
  status: "novo",
  dependencies: ["Izmjeriti gredice"],
  notes: "Provjeriti impregnaciju.",
};

describe("handleCreateItemRequest", () => {
  it("parses and saves a Croatian raw note for the signed-in user", async () => {
    const insertItem = vi.fn(async (payload) => ({ id: "item-1", ...payload }));

    const response = await handleCreateItemRequest(
      new Request("http://app.test/api/items", {
        method: "POST",
        body: JSON.stringify({ rawInput: "Trebam kupiti daske." }),
      }),
      {
        getUserId: async () => "user-1",
        parseNote: async () => parsedItem,
        insertItem,
      }
    );

    expect(response.status).toBe(201);
    expect(insertItem).toHaveBeenCalledWith({
      user_id: "user-1",
      raw_input: "Trebam kupiti daske.",
      ...parsedItem,
      parse_status: "parsed",
      parse_error: null,
    });
    await expect(response.json()).resolves.toMatchObject({ id: "item-1" });
  });

  it("keeps the raw note when AI parsing fails", async () => {
    const insertItem = vi.fn(async (payload) => ({ id: "item-2", ...payload }));

    const response = await handleCreateItemRequest(
      new Request("http://app.test/api/items", {
        method: "POST",
        body: JSON.stringify({ rawInput: "Popraviti pločice." }),
      }),
      {
        getUserId: async () => "user-1",
        parseNote: async () => {
          throw new Error("Invalid JSON from model.");
        },
        insertItem,
      }
    );

    expect(response.status).toBe(201);
    expect(insertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        raw_input: "Popraviti pločice.",
        name: "Popraviti pločice.",
        parse_status: "failed",
        parse_error: "Invalid JSON from model.",
      })
    );
  });

  it("rejects invalid JSON without saving", async () => {
    const insertItem = vi.fn();

    const response = await handleCreateItemRequest(
      new Request("http://app.test/api/items", {
        method: "POST",
        body: "{not-json",
      }),
      {
        getUserId: async () => "user-1",
        parseNote: async () => parsedItem,
        insertItem,
      }
    );

    expect(response.status).toBe(400);
    expect(insertItem).not.toHaveBeenCalled();
  });
});

describe("handleUpdateItemRequest", () => {
  it("updates editable fields for the signed-in user", async () => {
    const updateItem = vi.fn(async (_userId, itemId, patch) => ({ id: itemId, ...patch }));

    const response = await handleUpdateItemRequest(
      new Request("http://app.test/api/items", {
        method: "PATCH",
        body: JSON.stringify({
          id: "item-1",
          priority: "Hitno",
          status: "U tijeku",
          dependencies: ["Kupiti boju"],
          notes: "Prvo zaštititi rubove.",
        }),
      }),
      {
        getUserId: async () => "user-1",
        updateItem,
      }
    );

    expect(response.status).toBe(200);
    expect(updateItem).toHaveBeenCalledWith("user-1", "item-1", {
      priority: "hitno",
      status: "u_tijeku",
      dependencies: ["Kupiti boju"],
      notes: "Prvo zaštititi rubove.",
    });
  });
});
