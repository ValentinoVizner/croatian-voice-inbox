type AuthErrorLike = {
  code?: number | string;
  error_code?: string;
  message?: string;
  msg?: string;
};

function errorDetails(error: unknown): AuthErrorLike {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error === "object" && error !== null) {
    return error as AuthErrorLike;
  }

  return { message: String(error) };
}

export function authNoticeForError(error: unknown): string {
  if (typeof error === "string" && !error.trim()) {
    return "Upiši email adresu prije slanja linka.";
  }

  const details = errorDetails(error);
  const message = details.message ?? details.msg ?? "";
  const normalizedMessage = message.toLowerCase();
  const code = details.error_code ?? details.code;

  if (message.includes("Missing Supabase public environment variables")) {
    return "Prijava nije dostupna dok Supabase env varijable nisu podešene.";
  }

  if (code === 429 || code === "over_email_send_rate_limit" || normalizedMessage.includes("rate limit")) {
    return "Previše pokušaja slanja magic linka. Pričekaj minutu pa pokušaj ponovno.";
  }

  if (normalizedMessage.includes("invalid") && normalizedMessage.includes("email")) {
    return "Email adresa ne izgleda ispravno. Provjeri je pa pokušaj ponovno.";
  }

  if (message) {
    return `Prijava nije uspjela: ${message}`;
  }

  return "Prijava nije uspjela. Pokušaj ponovno.";
}
