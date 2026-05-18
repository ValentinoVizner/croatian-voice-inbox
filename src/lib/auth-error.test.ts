import { describe, expect, it } from "vitest";
import { authNoticeForError } from "./auth-error";

describe("authNoticeForError", () => {
  it("asks for an email address before sending a magic link", () => {
    expect(authNoticeForError("")).toBe("Upiši email adresu prije slanja linka.");
  });

  it("shows the Supabase email rate limit clearly", () => {
    expect(authNoticeForError({ code: 429, message: "email rate limit exceeded" })).toBe(
      "Previše pokušaja slanja magic linka. Pričekaj minutu pa pokušaj ponovno."
    );
  });

  it("keeps missing environment variable errors specific", () => {
    expect(authNoticeForError(new Error("Missing Supabase public environment variables."))).toBe(
      "Prijava nije dostupna dok Supabase env varijable nisu podešene."
    );
  });
});
