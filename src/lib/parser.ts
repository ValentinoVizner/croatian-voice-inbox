import { GoogleGenAI } from "@google/genai";
import type { ItemDetail, ItemStatus, Priority, Space } from "./items";

export type NormalizedParsedItem = {
  name: string;
  space: Space;
  tags: string[];
  priority: Priority;
  when_to_tackle: string;
  due_date: string | null;
  status: ItemStatus;
  dependencies: string[];
  details: ItemDetail[];
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

function normalizeDetails(value: unknown): ItemDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { label: "Detalj", value: item.trim() };
      }

      if (typeof item !== "object" || item === null) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = text(record.label) || text(record.name) || text(record.type) || "Detalj";
      const detailValue = text(record.value) || text(record.amount) || text(record.quantity) || text(record.text);

      return detailValue ? { label, value: detailValue } : null;
    })
    .filter((item): item is ItemDetail => Boolean(item))
    .filter(
      (item, index, array) =>
        array.findIndex((candidate) => candidate.label === item.label && candidate.value === item.value) === index
    );
}

function normalizeDueDate(value: unknown): string | null {
  const date = text(value);

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
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
  const dueDate = parsedItem.dueDate ?? parsedItem.due_date;

  return {
    name: text(parsedItem.name) || fallbackName(rawInput),
    space: normalizeSpace(parsedItem.space),
    tags: arrayOfStrings(parsedItem.tags),
    priority: normalizePriority(parsedItem.priority),
    when_to_tackle: whenToTackle || "Kasnije",
    due_date: normalizeDueDate(dueDate),
    status: normalizeStatus(parsedItem.status),
    dependencies: arrayOfStrings(parsedItem.dependencies),
    details: normalizeDetails(parsedItem.details),
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
name, space, tags, priority, whenToTackle, dueDate, status, dependencies, details, notes.

Preferred space labels: Inbox, Ideje, Projekti, Kupovina, Za odlučiti, Za napraviti.
If none fit, return a short custom Croatian space label.
Allowed priority labels: Nisko, Srednje, Visoko, Hitno.
Allowed status labels: Novo, U tijeku, Gotovo.
Tags are flexible Croatian craft/work areas, for example Drvodjelstvo, Malerija, Vrtlarstvo, Keramika, Kuća.
Dependencies should be an array of prerequisite actions or missing inputs.
dueDate should be YYYY-MM-DD when the user gives a concrete date, otherwise null.
details should be an array of important flexible facts as { "label": "...", "value": "..." }, especially quantities, measurements, materials, store names, dimensions, and constraints. Examples: { "label": "Količina", "value": "10 m letvica" }, { "label": "Materijal", "value": "vijci za drvo" }.`;

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
