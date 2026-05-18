"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type ItemStatus,
  type ParseStatus,
  type Priority,
  type Space,
  DEFAULT_SPACES,
  PRIORITIES,
  STATUSES,
  priorityLabels,
  spaceLabel,
  statusLabels,
} from "@/lib/items";
import { authNoticeForError } from "@/lib/auth-error";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type InboxItem = {
  id: string;
  raw_input: string;
  name: string;
  space: Space;
  tags: string[];
  priority: Priority;
  when_to_tackle: string;
  due_date: string | null;
  status: ItemStatus;
  dependencies: string[];
  details: { label: string; value: string }[];
  notes: string;
  parse_status: ParseStatus;
  parse_error: string | null;
};

type ViewMode = "lista" | "status";

type BrowserSpeechRecognitionResultEvent = Event & {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionResultEvent) => void) | null;
  start: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const sampleItems: InboxItem[] = [
  {
    id: "sample-1",
    raw_input:
      "Trebam kupiti daske i vijke za izradu povišenih vrtnih gredica ovaj vikend.",
    name: "Kupiti materijal za vrtne gredice",
    space: "kupovina",
    tags: ["Vrtlarstvo", "Drvodjelstvo"],
    priority: "visoko",
    when_to_tackle: "Ovaj tjedan",
    due_date: null,
    status: "novo",
    dependencies: ["Izmjeriti dimenzije gredica"],
    details: [
      { label: "Količina", value: "10 m dasaka" },
      { label: "Materijal", value: "vijci za drvo" },
    ],
    notes: "Provjeriti jesu li daske impregnirane za vanjsku upotrebu.",
    parse_status: "parsed",
    parse_error: null,
  },
  {
    id: "sample-2",
    raw_input:
      "Popravak keramičkih pločica u hodniku, prvo treba naći iste ili slične pločice.",
    name: "Popraviti keramičke pločice",
    space: "za_odluciti",
    tags: ["Keramika", "Kuća"],
    priority: "srednje",
    when_to_tackle: "Kasnije",
    due_date: null,
    status: "novo",
    dependencies: ["Naći zamjenske pločice"],
    details: [{ label: "Materijal", value: "zamjenske pločice" }],
    notes: "Možda fotografirati postojeće pločice prije odlaska u trgovinu.",
    parse_status: "parsed",
    parse_error: null,
  },
];

const suggestedTags = ["Drvodjelstvo", "Malerija", "Vrtlarstvo", "Keramika"];
const statusColumns: ItemStatus[] = ["novo", "u_tijeku", "gotovo"];

const colorThemes = {
  blue: { bg: "#dbeafe", text: "#1e3a8a", border: "#bfdbfe" },
  green: { bg: "#dcfce7", text: "#14532d", border: "#bbf7d0" },
  amber: { bg: "#fef3c7", text: "#78350f", border: "#fde68a" },
  orange: { bg: "#ffedd5", text: "#7c2d12", border: "#fed7aa" },
  brown: { bg: "#ede0d4", text: "#5c4033", border: "#d6c0ae" },
  purple: { bg: "#ede9fe", text: "#4c1d95", border: "#ddd6fe" },
  rose: { bg: "#ffe4e6", text: "#881337", border: "#fecdd3" },
  slate: { bg: "#e2e8f0", text: "#0f172a", border: "#cbd5e1" },
};

function colorKey(value: string): keyof typeof colorThemes {
  const token = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (token.includes("vrt") || token.includes("bilj") || token.includes("garden")) return "green";
  if (token.includes("kup") || token.includes("materijal")) return "green";
  if (token.includes("drvo") || token.includes("gred") || token.includes("stolar")) return "brown";
  if (token.includes("maler") || token.includes("boja") || token.includes("farb")) return "orange";
  if (token.includes("odluc") || token.includes("cek")) return "purple";
  if (token.includes("hitno") || token.includes("keram")) return "rose";
  if (token.includes("projekt") || token.includes("idej")) return "blue";
  if (token.includes("gotovo")) return "green";
  if (token.includes("tijek")) return "amber";

  return "slate";
}

function colorStyle(value: string) {
  const theme = colorThemes[colorKey(value)];

  return {
    backgroundColor: theme.bg,
    borderColor: theme.border,
    color: theme.text,
  };
}

function createLocalDraft(rawInput: string): InboxItem {
  return {
    id: crypto.randomUUID(),
    raw_input: rawInput,
    name: rawInput.split(/[,.]/)[0]?.slice(0, 80) || "Novi unos",
    space: "inbox",
    tags: [],
    priority: "srednje",
    when_to_tackle: "Kasnije",
    due_date: null,
    status: "novo",
    dependencies: [],
    details: [],
    notes: "",
    parse_status: "pending",
    parse_error: null,
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function detailsText(details: InboxItem["details"]): string {
  return details.map((detail) => `${detail.label}: ${detail.value}`).join("\n");
}

function splitDetails(value: string): InboxItem["details"] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split(":");
      const detailValue = rest.join(":").trim();

      return detailValue ? { label: label.trim(), value: detailValue } : { label: "Detalj", value: line };
    });
}

function hydrateItem(item: Partial<InboxItem>): InboxItem {
  return {
    id: item.id ?? crypto.randomUUID(),
    raw_input: item.raw_input ?? "",
    name: item.name ?? "Novi unos",
    space: item.space ?? "inbox",
    tags: Array.isArray(item.tags) ? item.tags : [],
    priority: item.priority ?? "srednje",
    when_to_tackle: item.when_to_tackle ?? "Kasnije",
    due_date: item.due_date ?? null,
    status: item.status ?? "novo",
    dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
    details: Array.isArray(item.details) ? item.details : [],
    notes: item.notes ?? "",
    parse_status: item.parse_status ?? "pending",
    parse_error: item.parse_error ?? null,
  };
}

function comparableSpaceText(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function MicrophoneIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 14.5a4 4 0 0 0 4-4V6.75a4 4 0 0 0-8 0v3.75a4 4 0 0 0 4 4Z" />
      <path d="M6.25 10.25a.9.9 0 0 1 1.8 0 3.95 3.95 0 0 0 7.9 0 .9.9 0 0 1 1.8 0 5.76 5.76 0 0 1-4.85 5.68v2.22h2.35a.9.9 0 1 1 0 1.8h-6.5a.9.9 0 1 1 0-1.8h2.35v-2.22a5.76 5.76 0 0 1-4.85-5.68Z" />
    </svg>
  );
}

export function VoiceInboxApp() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rawInput, setRawInput] = useState("");
  const [items, setItems] = useState<InboxItem[]>(sampleItems);
  const [activeSpace, setActiveSpace] = useState<Space | "sve">("sve");
  const [activeTag, setActiveTag] = useState<string>("Sve");
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [newSpace, setNewSpace] = useState("");
  const [customSpaces, setCustomSpaces] = useState<Space[]>([]);
  const [removedSpaces, setRemovedSpaces] = useState<Space[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("lista");

  const allTags = useMemo(() => {
    return ["Sve", ...Array.from(new Set(items.flatMap((item) => item.tags)))];
  }, [items]);

  const allSpaces = useMemo(() => {
    const spaces = Array.from(new Set([...DEFAULT_SPACES, ...customSpaces, ...items.map((item) => item.space)]));

    return spaces.filter((space) => !removedSpaces.includes(space));
  }, [customSpaces, items, removedSpaces]);

  const visibleItems = items.filter((item) => {
    const spaceMatch = activeSpace === "sve" || item.space === activeSpace;
    const tagMatch = activeTag === "Sve" || item.tags.includes(activeTag);

    return spaceMatch && tagMatch;
  });

  const itemsByStatus = statusColumns.map((status) => ({
    status,
    items: visibleItems.filter((item) => item.status === status),
  }));

  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();

      supabase.auth.getSession().then(async ({ data }) => {
        const userEmail = data.session?.user.email ?? null;
        setSessionEmail(userEmail);

        if (userEmail) {
          const response = await fetch("/api/items");
          if (response.ok) {
            const loadedItems = (await response.json()) as Partial<InboxItem>[];
            setItems(loadedItems.map(hydrateItem));
          }
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setSessionEmail(session?.user.email ?? null);
      });

      return () => subscription.unsubscribe();
    } catch {
      return undefined;
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = rawInput.trim();
    if (!trimmedInput) {
      setNotice("Upiši ili izdiktiraj bilješku prije spremanja.");
      return;
    }

    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: trimmedInput }),
      });

      if (!response.ok) {
        throw new Error("API route is not ready yet.");
      }

      const createdItem = hydrateItem((await response.json()) as Partial<InboxItem>);
      setItems((currentItems) => [createdItem, ...currentItems]);
      setRawInput("");
      setNotice("Spremljeno i parsirano.");
      setIsCaptureOpen(false);
    } catch {
      setItems((currentItems) => [createLocalDraft(trimmedInput), ...currentItems]);
      setRawInput("");
      setNotice("Spremljeno lokalno za pregled. API parsiranje se dodaje u sljedećem koraku.");
      setIsCaptureOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setNotice(authNoticeForError(trimmedEmail));
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      setNotice("Provjeri email za magic link.");
    } catch (error) {
      setNotice(authNoticeForError(error));
    }
  }

  async function handleSignOut() {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      setSessionEmail(null);
      setNotice("Odjavljen si.");
    } catch {
      setNotice("Odjava nije uspjela.");
    }
  }

  async function updateItem(itemId: string, patch: Partial<InboxItem>) {
    setItems((currentItems) =>
      currentItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );

    try {
      await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, ...patch }),
      });
    } catch {
      setNotice("Promjena je spremljena lokalno. Sinkronizacija će se ponoviti kad API bude dostupan.");
    }
  }

  function addCustomSpace() {
    const trimmedSpace = newSpace.trim();

    if (!trimmedSpace) {
      return;
    }

    const comparableSpace = comparableSpaceText(trimmedSpace);
    const defaultSpace = DEFAULT_SPACES.find(
      (space) => comparableSpaceText(space) === comparableSpace || comparableSpaceText(spaceLabel(space)) === comparableSpace
    );
    const spaceToAdd = defaultSpace ?? trimmedSpace;

    setCustomSpaces((currentSpaces) =>
      currentSpaces.includes(spaceToAdd) || DEFAULT_SPACES.some((space) => space === spaceToAdd)
        ? currentSpaces
        : [...currentSpaces, spaceToAdd]
    );
    setRemovedSpaces((currentSpaces) => currentSpaces.filter((space) => space !== spaceToAdd));
    setActiveSpace(spaceToAdd);
    setNewSpace("");
  }

  function removeSpace(spaceToRemove: Space) {
    setRemovedSpaces((currentSpaces) =>
      currentSpaces.includes(spaceToRemove) ? currentSpaces : [...currentSpaces, spaceToRemove]
    );
    setCustomSpaces((currentSpaces) => currentSpaces.filter((space) => space !== spaceToRemove));

    if (activeSpace === spaceToRemove) {
      setActiveSpace("sve");
    }
  }

  function itemSpaceOptions(itemSpace: Space) {
    return allSpaces.includes(itemSpace) ? allSpaces : [itemSpace, ...allSpaces];
  }

  function handleVoiceInput() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      textareaRef.current?.focus();
      setNotice("Na iPhoneu dodirni polje za unos pa mikrofon na tipkovnici za diktiranje.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "hr-HR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();

      if (transcript) {
        setRawInput((currentInput) => [currentInput, transcript].filter(Boolean).join(" "));
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      textareaRef.current?.focus();
      setNotice("Diktiranje nije uspjelo. Možeš koristiti mikrofon na tipkovnici.");
    };
    recognition.onend = () => setIsListening(false);

    setIsListening(true);
    recognition.start();
  }

  function captureForm() {
    return (
      <form
        onSubmit={handleSubmit}
        className="max-h-[calc(100vh-5rem)] min-w-0 overflow-y-auto rounded-t-[2rem] border border-white/80 bg-[#fffaf0] p-5 shadow-2xl shadow-slate-950/30 sm:rounded-[2rem]"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Novi unos</p>
            <h3 className="text-2xl font-semibold">Glasovni inbox</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm"
              onClick={() => setIsCaptureOpen(false)}
              type="button"
            >
              Zatvori
            </button>
            <button
              aria-label="Pokreni glasovni unos"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg shadow-blue-700/30 ring-4 ring-blue-100 transition active:scale-95"
              onClick={handleVoiceInput}
              type="button"
            >
              <MicrophoneIcon className="h-8 w-8" />
            </button>
          </div>
        </div>

        <button
          className="mt-5 flex w-full flex-col items-center justify-center gap-3 rounded-3xl border border-blue-200 bg-blue-50 px-5 py-6 text-lg font-semibold text-blue-950 shadow-inner shadow-white/70 transition active:scale-[0.99]"
          onClick={handleVoiceInput}
          type="button"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-700 text-white shadow-xl shadow-blue-700/25 ring-8 ring-white">
            <MicrophoneIcon className="h-10 w-10" />
          </span>
          <span>{isListening ? "Slušam..." : "Dodirni mikrofon i govori"}</span>
          <span className="text-sm font-medium text-blue-700">Hrvatski glasovni unos</span>
        </button>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Ako se na iPhoneu ne pojavi dozvola za mikrofon, dodirni polje ispod i koristi mikrofon na tipkovnici.
        </p>

        <label className="mt-6 block">
          <span className="sr-only">Croatian voice note</span>
          <textarea
            ref={textareaRef}
            className="min-h-52 w-full resize-none rounded-3xl border border-slate-200 bg-white/80 p-5 text-lg leading-8 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
            placeholder="Reci ili upiši: Trebam kupiti daske za vrtne gredice..."
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
          />
        </label>

        <button
          className="mt-4 w-full max-w-full rounded-2xl bg-blue-700 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-blue-700/25 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving ? "Spremam..." : "Spremi i parsiraj"}
        </button>

        {notice ? <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p> : null}

        <div className="mt-6">
          <p className="text-sm font-semibold text-slate-500">Brzi tagovi</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestedTags.map((tag) => (
              <span key={tag} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </form>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f3efe6] pb-28 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[260px_1fr] lg:py-8">
        <aside className="hidden rounded-[2rem] border border-white/60 bg-[#07131f] p-5 text-white shadow-2xl shadow-slate-900/20 lg:flex lg:flex-col">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.35em] text-blue-200/70">Planovi</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Glasovni inbox</h1>
          </div>

          <nav className="space-y-2">
            <button
              className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                activeSpace === "sve" ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10"
              }`}
              onClick={() => setActiveSpace("sve")}
            >
              Sve stavke
            </button>
            {allSpaces.map((space) => (
              <div
                key={space}
                className={`flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm transition ${
                  activeSpace === space ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10"
                }`}
              >
                <button className="min-w-0 flex-1 text-left" onClick={() => setActiveSpace(space)} type="button">
                  {spaceLabel(space)}
                </button>
                <button
                  aria-label={`Ukloni kategoriju ${spaceLabel(space)}`}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition ${
                    activeSpace === space ? "text-slate-500 hover:bg-slate-100" : "text-slate-500 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => removeSpace(space)}
                  title="Ukloni kategoriju"
                  type="button"
                >
                  x
                </button>
              </div>
            ))}
          </nav>

          <div className="mt-4 flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
            <input
              className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-slate-500"
              onChange={(event) => setNewSpace(event.target.value)}
              placeholder="Novi prostor..."
              value={newSpace}
            />
            <button
              aria-label="Dodaj kategoriju"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold text-slate-950 transition hover:bg-blue-100"
              onClick={addCustomSpace}
              type="button"
            >
              +
            </button>
          </div>

          <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-blue-100">Fokus prostora</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Prvo uhvati misao. AI zatim predloži kategoriju, rok, prioritet i što čeka.
            </p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-5">
          <header className="min-w-0 rounded-[2rem] border border-white/80 bg-white/70 p-5 shadow-xl shadow-slate-900/5 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-blue-700">AI inbox</p>
                <h2 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
                  Reci, spremi, razvrstaj.
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                  Hrvatski glasovni unos za kućne projekte, materijale, čekanja i ideje.
                </p>
              </div>
              {sessionEmail ? (
                <button
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white"
                  onClick={handleSignOut}
                  type="button"
                >
                  {sessionEmail} · Odjava
                </button>
              ) : (
                <form className="flex flex-col gap-2 rounded-2xl bg-slate-950 p-3 text-sm text-white" onSubmit={handleSignIn}>
                  <span>Sinkronizacija preko Supabase računa</span>
                  <div className="flex gap-2">
                    <input
                      className="min-w-0 rounded-xl bg-white px-3 py-2 text-slate-950 caret-blue-700 placeholder:text-slate-500"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="email"
                      required
                      type="email"
                      value={email}
                    />
                    <button className="rounded-xl bg-blue-700 px-3 py-2 font-semibold" type="submit">
                      Link
                    </button>
                  </div>
                </form>
              )}
            </div>
          </header>

          {notice ? <p className="rounded-2xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p> : null}

          <div className="flex w-fit gap-2 rounded-full bg-white/70 p-1 shadow-sm">
            {(["lista", "status"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  viewMode === mode ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                }`}
                onClick={() => setViewMode(mode)}
                type="button"
              >
                {mode === "lista" ? "Lista" : "Status"}
              </button>
            ))}
          </div>

          <div className="grid min-w-0 gap-5">
            <div className="min-w-0 rounded-[2rem] border border-white/80 bg-white/70 p-4 shadow-xl shadow-slate-900/5 backdrop-blur">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      activeSpace === "sve" ? "bg-slate-950 text-white" : "bg-white text-slate-600"
                    }`}
                    onClick={() => setActiveSpace("sve")}
                  >
                    Sve
                  </button>
                  {allSpaces.map((space) => (
                    <span
                      key={space}
                      className={`rounded-full px-4 py-2 text-sm font-medium ${
                        activeSpace === space ? "bg-slate-950 text-white" : "bg-white text-slate-600"
                      }`}
                      style={activeSpace === space ? undefined : colorStyle(spaceLabel(space))}
                    >
                      <button onClick={() => setActiveSpace(space)} type="button">
                        {spaceLabel(space)}
                      </button>
                      <button
                        aria-label={`Ukloni kategoriju ${spaceLabel(space)}`}
                        className={`ml-2 rounded-full px-1 ${
                          activeSpace === space ? "text-white/70 hover:text-white" : "text-slate-400 hover:text-slate-950"
                        }`}
                        onClick={() => removeSpace(space)}
                        title="Ukloni kategoriju"
                        type="button"
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm"
                    onChange={(event) => setNewSpace(event.target.value)}
                    placeholder="Dodaj prostor..."
                    value={newSpace}
                  />
                  <button
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white"
                    onClick={addCustomSpace}
                    type="button"
                  >
                    Dodaj
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                        activeTag === tag
                          ? "border-blue-700 bg-blue-700 text-white"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      style={activeTag === tag ? undefined : colorStyle(tag)}
                      onClick={() => setActiveTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {viewMode === "lista" ? (
              <div className="mt-4 space-y-3">
                {visibleItems.map((item) => (
                  <article key={item.id} className="min-w-0 rounded-3xl border border-slate-200 bg-[#fffdf7] p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full border px-3 py-1 text-xs font-medium"
                            style={colorStyle(spaceLabel(item.space))}
                          >
                            {spaceLabel(item.space)}
                          </span>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                            {priorityLabels[item.priority]}
                          </span>
                        </div>
                        <input
                          className="mt-3 w-full rounded-2xl border border-transparent bg-transparent text-xl font-semibold text-slate-950 outline-none transition focus:border-blue-200 focus:bg-white focus:px-3 focus:py-2"
                          value={item.name}
                          onChange={(event) => updateItem(item.id, { name: event.target.value })}
                        />
                        <p className="mt-2 text-sm leading-6 text-slate-500">{item.raw_input}</p>
                      </div>

                      <div className="grid shrink-0 grid-cols-2 gap-2 text-sm md:w-80">
                        <label className="space-y-1">
                          <span className="text-slate-500">Prostor</span>
                          <select
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                            value={item.space}
                            onChange={(event) => updateItem(item.id, { space: event.target.value })}
                          >
                            {itemSpaceOptions(item.space).map((space) => (
                              <option key={space} value={space}>
                                {spaceLabel(space)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500">Prioritet</span>
                          <select
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                            value={item.priority}
                            onChange={(event) => updateItem(item.id, { priority: event.target.value as Priority })}
                          >
                            {PRIORITIES.map((priority) => (
                              <option key={priority} value={priority}>
                                {priorityLabels[priority]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500">Kada</span>
                          <input
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                            value={item.when_to_tackle}
                            onChange={(event) => updateItem(item.id, { when_to_tackle: event.target.value })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500">Datum</span>
                          <input
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                            type="date"
                            value={item.due_date ?? ""}
                            onChange={(event) => updateItem(item.id, { due_date: event.target.value || null })}
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-slate-500">Status</span>
                          <select
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                            value={item.status}
                            onChange={(event) => updateItem(item.id, { status: event.target.value as ItemStatus })}
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {statusLabels[status]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    {item.details.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.details.map((detail) => (
                          <span
                            key={`${detail.label}-${detail.value}`}
                            className="rounded-full border px-3 py-1 text-sm"
                            style={colorStyle(detail.label)}
                          >
                            {detail.label}: {detail.value}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Tagovi
                        </span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={item.tags.join(", ")}
                          onChange={(event) => updateItem(item.id, { tags: splitList(event.target.value) })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Ovisnosti
                        </span>
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={item.dependencies.join(", ")}
                          onChange={(event) => updateItem(item.id, { dependencies: splitList(event.target.value) })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Detalji
                        </span>
                        <textarea
                          className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={detailsText(item.details)}
                          onChange={(event) => updateItem(item.id, { details: splitDetails(event.target.value) })}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Bilješke
                        </span>
                        <textarea
                          className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={item.notes}
                          onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
              ) : (
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {itemsByStatus.map(({ status, items: statusItems }) => (
                    <section key={status} className="rounded-3xl border border-slate-200 bg-white/70 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900">{statusLabels[status]}</h3>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {statusItems.length}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {statusItems.map((item) => (
                          <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fffdf7] p-3">
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full border px-2 py-1 text-xs" style={colorStyle(spaceLabel(item.space))}>
                                {spaceLabel(item.space)}
                              </span>
                              {item.due_date ? (
                                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800">{item.due_date}</span>
                              ) : null}
                            </div>
                            <p className="mt-3 font-semibold text-slate-950">{item.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{item.when_to_tackle}</p>
                            {item.details.length ? (
                              <div className="mt-3 flex flex-wrap gap-1">
                                {item.details.slice(0, 3).map((detail) => (
                                  <span key={`${detail.label}-${detail.value}`} className="rounded-full border px-2 py-1 text-xs" style={colorStyle(detail.label)}>
                                    {detail.label}: {detail.value}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {!isCaptureOpen ? (
        <button
          aria-label="Otvori glasovni unos"
          className="fixed right-4 z-40 flex items-center gap-3 rounded-full bg-slate-950 py-2 pl-4 pr-2 text-sm font-semibold text-white shadow-2xl shadow-slate-950/30 ring-1 ring-white/40 transition active:scale-95"
          onClick={() => setIsCaptureOpen(true)}
          style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          type="button"
        >
          <span>Novi unos</span>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 shadow-lg shadow-blue-700/30">
            <MicrophoneIcon className="h-7 w-7" />
          </span>
        </button>
      ) : null}

      {isCaptureOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 px-0 pt-16 backdrop-blur-sm sm:items-center sm:px-6"
          role="dialog"
        >
          <button
            aria-label="Zatvori glasovni unos"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsCaptureOpen(false)}
            type="button"
          />
          <div className="relative w-full sm:max-w-xl">{captureForm()}</div>
        </div>
      ) : null}
    </main>
  );
}
