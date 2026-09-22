export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseBRLToCents(value: string): number | null {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const cents = Math.round(Math.abs(parsed) * 100);
  return cents > 0 ? cents : null;
}

export function firstName(fullName: string | null | undefined, fallback = "você") {
  const name = (fullName ?? "").trim();
  if (!name) return fallback;
  return name.split(/\s+/)[0]!;
}

export function initials(fullName: string | null | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "F";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Mensagens de erro de autenticação em português, sem expor detalhes técnicos. */
export function authErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.toLowerCase();
  if (message.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (message.includes("email not confirmed"))
    return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (message.includes("user already registered") || message.includes("already been registered"))
    return "Já existe uma conta com esse e-mail. Tente entrar.";
  if (message.includes("password") && message.includes("weak"))
    return "Essa senha é muito fácil de descobrir. Escolha uma senha mais forte.";
  if (message.includes("password should be at least"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (message.includes("invalid email") || message.includes("email address"))
    return "Confira o e-mail digitado.";
  if (message.includes("rate limit") || message.includes("too many"))
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
  if (message.includes("same password"))
    return "A nova senha precisa ser diferente da anterior.";
  if (message.includes("network") || message.includes("fetch"))
    return "Sem conexão agora. Tente novamente em instantes.";
  return "Não foi possível continuar. Tente novamente.";
}

export const CATEGORIES = [
  "Mercado",
  "Transporte",
  "Moradia",
  "Saúde",
  "Educação",
  "Lazer",
  "Assinaturas",
  "Contas",
  "Dívidas",
  "Renda",
  "Outros",
] as const;
