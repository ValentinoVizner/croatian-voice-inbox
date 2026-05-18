export const DEFAULT_SPACES = [
  "inbox",
  "ideje",
  "projekti",
  "kupovina",
  "za_odluciti",
  "za_napraviti",
] as const;

export const PRIORITIES = ["nisko", "srednje", "visoko", "hitno"] as const;
export const STATUSES = ["novo", "u_tijeku", "gotovo"] as const;
export const PARSE_STATUSES = ["pending", "parsed", "failed"] as const;

export type Space = string;
export type Priority = (typeof PRIORITIES)[number];
export type ItemStatus = (typeof STATUSES)[number];
export type ParseStatus = (typeof PARSE_STATUSES)[number];

export type Item = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  raw_input: string;
  name: string;
  space: Space;
  tags: string[];
  priority: Priority;
  when_to_tackle: string;
  status: ItemStatus;
  dependencies: string[];
  notes: string;
  parse_status: ParseStatus;
  parse_error: string | null;
};

export const defaultSpaceLabels: Record<(typeof DEFAULT_SPACES)[number], string> = {
  inbox: "Inbox",
  ideje: "Ideje",
  projekti: "Projekti",
  kupovina: "Kupovina",
  za_odluciti: "Za odlučiti",
  za_napraviti: "Za napraviti",
};

export function spaceLabel(space: Space): string {
  return defaultSpaceLabels[space as (typeof DEFAULT_SPACES)[number]] ?? space;
}

export const priorityLabels: Record<Priority, string> = {
  nisko: "Nisko",
  srednje: "Srednje",
  visoko: "Visoko",
  hitno: "Hitno",
};

export const statusLabels: Record<ItemStatus, string> = {
  novo: "Novo",
  u_tijeku: "U tijeku",
  gotovo: "Gotovo",
};
