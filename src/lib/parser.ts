import { GoogleGenAI } from "@google/genai";
import type { ItemStatus, Priority, Space } from "./items";

export type NormalizedParsedItem = {
  name: string;
  space: Space;
  tags: string[];
  priority: Priority;
  when_to_tackle: string;
  status: ItemStatus;
  dependencies: string[];
  notes: string;
};

type RawParsedItem = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToken(value: unknown): string {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ");
}

function slugifySpace(value: unknown): string {
  return normalizeToken(value).replace(/\s+/g, "_");
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => text(item))
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function normalizeSpace(value: unknown): Space {
  const token = normalizeToken(value);

  if (["inbox", "ulaz", "ulazno", "novo"].includes(token)) return "inbox";
  if (["ideja", "ideje", "idea"].includes(token)) return "ideje";
  if (["projekt", "projekti", "project"].includes(token)) return "projekti";
  if (["kupovina", "kupiti", "shopping"].includes(token)) return "kupovina";
  if (["za odluciti", "odluciti", "decision", "decide"].includes(token)) return "za_odluciti";
  if (["za napraviti", "posao", "zadatak", "task", "rad"].includes(token)) return "za_napraviti";
  if (["nepoznato", "unknown", "ostalo", "other"].includes(token)) return "inbox";

  return slugifySpace(value) || "inbox";
}

function normalizePriority(value: unknown): Priority {
  const token = normalizeToken(value);

  if (["nisko", "nizak", "low"].includes(token)) return "nisko";
  if (["visoko", "visok", "high"].includes(token)) return "visoko";
  if (["hitno", "urgentno", "urgent"].includes(token)) return "hitno";

  return "srednje";
}

function normalizeStatus(value: unknown): ItemStatus {
  const token = normalizeToken(value);

  if (["u tijeku", "radi se", "in progress"].includes(token)) return "u_tijeku";
  if (["gotovo", "zavrseno", "done"].includes(token)) return "gotovo";

  return "novo";
}

function fallbackName(rawInput: string): string {
  return rawInput.trim().slice(0, 80) || "Novi unos";
}

export function normalizeParsedItem(
  parsedItem: RawParsedItem,
  rawInput: string
): NormalizedParsedItem {
  const whenToTackle = text(parsedItem.whenToTackle) || text(parsedItem.when_to_tackle);

  return {
    name: text(parsedItem.name) || fallbackName(rawInput),
    space: normalizeSpace(parsedItem.space),
    tags: arrayOfStrings(parsedItem.tags),
    priority: normalizePriority(parsedItem.priority),
    when_to_tackle: whenToTackle || "Kasnije",
    status: normalizeStatus(parsedItem.status),
    dependencies: arrayOfStrings(parsedItem.dependencies),
    notes: text(parsedItem.notes),
  };
}

export function extractGeminiJson(content: string): RawParsedItem {
  const trimmedContent = content.trim();
  const fencedMatch = trimmedContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonContent = fencedMatch?.[1] ?? trimmedContent;

  return JSON.parse(jsonContent) as RawParsedItem;
}

const parserSystemPrompt = `You parse Croatian home/project voice notes into structured JSON.
Return only valid JSON with these keys:
name, space, tags, priority, whenToTackle, status, dependencies, notes.

Preferred space labels: Inbox, Ideje, Projekti, Kupovina, Za odlučiti, Za napraviti.
If none fit, return a short custom Croatian space label.
Allowed priority labels: Nisko, Srednje, Visoko, Hitno.
Allowed status labels: Novo, U tijeku, Gotovo.
Tags are flexible Croatian craft/work areas, for example Drvodjelstvo, Malerija, Vrtlarstvo, Keramika, Kuća.
Dependencies should be an array of prerequisite actions or missing inputs.`;

export async function parseCroatianNote(rawInput: string): Promise<NormalizedParsedItem> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: `${parserSystemPrompt}\n\nCroatian note:\n${rawInput}`,
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const content = response.text;

  if (!content) {
    throw new Error("Gemini returned an empty parser response.");
  }

  return normalizeParsedItem(extractGeminiJson(content), rawInput);
}
