import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { FinoraChat } from "@/components/finora/FinoraChat";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import logo from "@/assets/finora-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Finora — organize suas finanças conversando" },
      {
        name: "description",
        content:
          "O Finora entende frases como 'gastei R$ 35 no mercado', classifica seus gastos e mostra seu saldo de forma simples.",
      },
      { property: "og:title", content: "Finora — organize suas finanças conversando" },
      {
        property: "og:description",
        content: "Assistente de finanças pessoais por conversa, em português, sem planilhas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }
      if (!active) return;
      setToken(session.access_token);

      const { data: rows } = await supabase
        .from("messages")
        .select("id, role, parts")
        .order("created_at", { ascending: true });

      if (!active) return;
      setInitialMessages(
        (rows ?? []).map((row) => ({
          id: row.id,
          role: row.role as UIMessage["role"],
          parts: (row.parts ?? []) as UIMessage["parts"],
        })),
      );
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [navigate]);

  if (!token || !initialMessages) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <img src={logo} alt="Finora" width={64} height={64} className="h-16 w-16 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
            <div>
              <p className="font-display text-lg leading-none text-foreground">Finora</p>
              <p className="text-xs text-muted-foreground">seu assistente de finanças</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-1 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>
      <FinoraChat initialMessages={initialMessages} token={token} />
    </div>
  );
}
