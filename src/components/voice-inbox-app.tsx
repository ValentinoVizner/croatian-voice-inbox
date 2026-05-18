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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type InboxItem = {
  id: string;
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
    status: "novo",
    dependencies: ["Izmjeriti dimenzije gredica"],
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
    status: "novo",
    dependencies: ["Naći zamjenske pločice"],
    notes: "Možda fotografirati postojeće pločice prije odlaska u trgovinu.",
    parse_status: "parsed",
    parse_error: null,
  },
];

const suggestedTags = ["Drvodjelstvo", "Malerija", "Vrtlarstvo", "Keramika"];

function createLocalDraft(rawInput: string): InboxItem {
  return {
    id: crypto.randomUUID(),
    raw_input: rawInput,
    name: rawInput.split(/[,.]/)[0]?.slice(0, 80) || "Novi unos",
    space: "inbox",
    tags: [],
    priority: "srednje",
    when_to_tackle: "Kasnije",
    status: "novo",
    dependencies: [],
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
  const [isListening, setIsListening] = useState(false);

  const allTags = useMemo(() => {
    return ["Sve", ...Array.from(new Set(items.flatMap((item) => item.tags)))];
  }, [items]);

  const allSpaces = useMemo(() => {
    return Array.from(new Set([...DEFAULT_SPACES, ...customSpaces, ...items.map((item) => item.space)]));
  }, [customSpaces, items]);

  const visibleItems = items.filter((item) => {
    const spaceMatch = activeSpace === "sve" || item.space === activeSpace;
    const tagMatch = activeTag === "Sve" || item.tags.includes(activeTag);

    return spaceMatch && tagMatch;
  });

  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();

      supabase.auth.getSession().then(async ({ data }) => {
        const userEmail = data.session?.user.email ?? null;
        setSessionEmail(userEmail);

        if (userEmail) {
          const response = await fetch("/api/items");
          if (response.ok) {
            setItems((await response.json()) as InboxItem[]);
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

      const createdItem = (await response.json()) as InboxItem;
      setItems((currentItems) => [createdItem, ...currentItems]);
      setRawInput("");
      setNotice("Spremljeno i parsirano.");
    } catch {
      setItems((currentItems) => [createLocalDraft(trimmedInput), ...currentItems]);
      setRawInput("");
      setNotice("Spremljeno lokalno za pregled. API parsiranje se dodaje u sljedećem koraku.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      setNotice("Provjeri email za magic link.");
    } catch {
      setNotice("Prijava nije dostupna dok Supabase env varijable nisu podešene.");
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

    setCustomSpaces((currentSpaces) =>
      currentSpaces.includes(trimmedSpace) ? currentSpaces : [...currentSpaces, trimmedSpace]
    );
    setActiveSpace(trimmedSpace);
    setNewSpace("");
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

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f3efe6] text-slate-950">
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
              <button
                key={space}
                className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                  activeSpace === space ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10"
                }`}
                onClick={() => setActiveSpace(space)}
              >
                {spaceLabel(space)}
              </button>
            ))}
          </nav>

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
                      className="min-w-0 rounded-xl px-3 py-2 text-slate-950"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="email"
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

          <div className="grid min-w-0 gap-5 xl:grid-cols-[420px_1fr]">
            <form
              onSubmit={handleSubmit}
              className="min-w-0 rounded-[2rem] border border-white/80 bg-[#fffaf0] p-5 shadow-xl shadow-slate-900/5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Novi unos</p>
                  <h3 className="text-2xl font-semibold">Glasovni inbox</h3>
                </div>
                <button
                  aria-label="Pokreni glasovni unos"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg shadow-blue-700/30 ring-4 ring-blue-100 transition active:scale-95"
                  onClick={handleVoiceInput}
                  type="button"
                >
                  <MicrophoneIcon className="h-8 w-8" />
                </button>
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
                    <button
                      key={space}
                      className={`rounded-full px-4 py-2 text-sm font-medium ${
                        activeSpace === space ? "bg-slate-950 text-white" : "bg-white text-slate-600"
                      }`}
                      onClick={() => setActiveSpace(space)}
                    >
                      {spaceLabel(space)}
                    </button>
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
                      onClick={() => setActiveTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {visibleItems.map((item) => (
                  <article key={item.id} className="min-w-0 rounded-3xl border border-slate-200 bg-[#fffdf7] p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
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
                            {allSpaces.map((space) => (
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

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
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
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
