import { normalizeParsedItem, type NormalizedParsedItem } from "./parser";
import type { ItemStatus, Priority, Space } from "./items";

export type CreateItemPayload = NormalizedParsedItem & {
  user_id: string;
  raw_input: string;
  parse_status: "parsed" | "failed";
  parse_error: string | null;
};

export type CreateItemDependencies = {
  getUserId: () => Promise<string | null>;
  parseNote: (rawInput: string) => Promise<NormalizedParsedItem>;
  insertItem: (payload: CreateItemPayload) => Promise<unknown>;
};

export type UpdateItemPayload = Partial<{
  name: string;
  space: Space;
  tags: string[];
  priority: Priority;
  when_to_tackle: string;
  status: ItemStatus;
  dependencies: string[];
  notes: string;
}>;

export type UpdateItemDependencies = {
  getUserId: () => Promise<string | null>;
  updateItem: (userId: string, itemId: string, patch: UpdateItemPayload) => Promise<unknown>;
};

type RawCreateItemBody = {
  rawInput?: unknown;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown parsing error.";
}

export async function handleCreateItemRequest(
  request: Request,
  dependencies: CreateItemDependencies
): Promise<Response> {
  let body: RawCreateItemBody;

  try {
    body = (await request.json()) as RawCreateItemBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawInput = typeof body.rawInput === "string" ? body.rawInput.trim() : "";

  if (!rawInput) {
    return Response.json({ error: "rawInput is required." }, { status: 400 });
  }

  const userId = await dependencies.getUserId();

  if (!userId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let payload: CreateItemPayload;

  try {
    payload = {
      user_id: userId,
      raw_input: rawInput,
      ...(await dependencies.parseNote(rawInput)),
      parse_status: "parsed",
      parse_error: null,
    };
  } catch (error) {
    payload = {
      user_id: userId,
      raw_input: rawInput,
      ...normalizeParsedItem({}, rawInput),
      parse_status: "failed",
      parse_error: errorMessage(error),
    };
  }

  try {
    const item = await dependencies.insertItem(payload);
    return Response.json(item, { status: 201 });
  } catch {
    return Response.json({ error: "Could not save item." }, { status: 500 });
  }
}

function bodyText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bodyArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => bodyText(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeBodyToken(value: unknown): string {
  return bodyText(value)
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ") ?? "";
}

function slugifyBodySpace(value: unknown): string | undefined {
  const token = normalizeBodyToken(value);

  if (!token) {
    return undefined;
  }

  if (["nepoznato", "unknown"].includes(token)) {
    return undefined;
  }

  return token.replace(/\s+/g, "_");
}

function updatePriority(value: unknown): Priority | undefined {
  const token = normalizeBodyToken(value);

  if (["nisko", "nizak"].includes(token)) return "nisko";
  if (["srednje", "srednji"].includes(token)) return "srednje";
  if (["visoko", "visok"].includes(token)) return "visoko";
  if (["hitno", "urgentno"].includes(token)) return "hitno";

  return undefined;
}

function updateStatus(value: unknown): ItemStatus | undefined {
  const token = normalizeBodyToken(value);

  if (["novo", "za napraviti"].includes(token)) return "novo";
  if (["u tijeku", "radi se"].includes(token)) return "u_tijeku";
  if (["gotovo", "zavrseno"].includes(token)) return "gotovo";

  return undefined;
}

function updateSpace(value: unknown): Space | undefined {
  const token = normalizeBodyToken(value);

  if (token === "inbox") return "inbox";
  if (["ideja", "ideje"].includes(token)) return "ideje";
  if (["projekt", "projekti"].includes(token)) return "projekti";
  if (token === "kupovina") return "kupovina";
  if (["za odluciti", "odluciti"].includes(token)) return "za_odluciti";
  if (["za napraviti", "posao", "zadatak"].includes(token)) return "za_napraviti";

  return slugifyBodySpace(value);
}

export async function handleUpdateItemRequest(
  request: Request,
  dependencies: UpdateItemDependencies
): Promise<Response> {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const itemId = bodyText(body.id);

  if (!itemId) {
    return Response.json({ error: "id is required." }, { status: 400 });
  }

  const userId = await dependencies.getUserId();

  if (!userId) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const patch: UpdateItemPayload = {};
  const name = bodyText(body.name);
  const space = updateSpace(body.space);
  const tags = bodyArray(body.tags);
  const priority = updatePriority(body.priority);
  const whenToTackle = bodyText(body.whenToTackle) ?? bodyText(body.when_to_tackle);
  const status = updateStatus(body.status);
  const dependenciesList = bodyArray(body.dependencies);
  const notes = bodyText(body.notes);

  if (name) patch.name = name;
  if (space) patch.space = space;
  if (tags) patch.tags = tags;
  if (priority) patch.priority = priority;
  if (whenToTackle) patch.when_to_tackle = whenToTackle;
  if (status) patch.status = status;
  if (dependenciesList) patch.dependencies = dependenciesList;
  if (notes !== undefined) patch.notes = notes;

  const item = await dependencies.updateItem(userId, itemId, patch);

  return Response.json(item);
}
