import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";
import type { Database } from "@/integrations/supabase/types";
import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

const SYSTEM_PROMPT = `Você é o Finora, um assistente de organização de finanças pessoais que conversa em português brasileiro.

Tom: acolhedor, educativo, objetivo e absolutamente sem julgamentos. Nunca critique gastos. Celebre pequenos avanços. Frases curtas e claras, sem jargão financeiro.

O que você faz:
1. Entende registros em linguagem natural ("gastei 35 no mercado", "recebi 1200 de um freela") e registra a transação com a ferramenta registrar_transacao.
2. Classifica cada transação em uma destas categorias: Mercado, Transporte, Moradia, Saúde, Educação, Lazer, Assinaturas, Contas, Dívidas, Renda, Outros.
3. Mostra saldo e resumo do período quando pedirem, usando a ferramenta consultar_resumo.
4. Dá dicas de economia personalizadas com base nos dados reais da pessoa.
5. Se faltar valor ou não estiver claro se é gasto ou entrada, pergunte de forma gentil antes de registrar.

Regras:
- Valores em reais (R$), com vírgula decimal.
- Sempre confirme em uma frase o que foi registrado (valor, categoria e data) e ofereça corrigir a categoria.
- Se a pessoa disser que a categoria está errada, registre a correção com corrigir_categoria.
- Nunca invente números: só cite dados vindos das ferramentas.
- Respostas curtas (até 4 frases) salvo quando a pessoa pedir um resumo maior.`;

type ChatRequestBody = { messages?: unknown };

function getSupabase(token: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Missing Supabase configuration");

  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) {
          return new Response("Não autenticado", { status: 401 });
        }

        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Mensagens obrigatórias", { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response("Assistente indisponível: chave de IA ausente", { status: 500 });
        }

        const supabase = getSupabase(token);
        const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (claimsError || !userId) {
          return new Response("Não autenticado", { status: 401 });
        }

        const uiMessages = messages as UIMessage[];
        const lastMessage = uiMessages[uiMessages.length - 1];
        if (lastMessage?.role === "user") {
          const { error } = await supabase.from("messages").insert({
            user_id: userId,
            role: "user",
            parts: lastMessage.parts as never,
          });
          if (error) console.error("Erro ao salvar mensagem do usuário:", error);
        }

        const initialRunId = getLovableAiGatewayRunId(request);
        const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const today = new Date().toISOString().slice(0, 10);

        const result = streamText({
          model: lovable.responses("openai/gpt-6-astra"),
          system: `${SYSTEM_PROMPT}\n\nHoje é ${today}.`,
          messages: await convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(50),
          tools: {
            registrar_transacao: tool({
              description:
                "Registra um gasto ou uma entrada de dinheiro da pessoa, já classificado em uma categoria.",
              inputSchema: z.object({
                amount: z.number().describe("Valor em reais, sempre positivo"),
                type: z.enum(["expense", "income"]).describe("expense = gasto, income = entrada"),
                category: z.string().describe("Categoria da transação"),
                description: z.string().describe("Descrição curta do que foi gasto ou recebido"),
                occurred_on: z
                  .string()
                  .nullable()
                  .describe("Data no formato YYYY-MM-DD, ou null para hoje"),
              }),
              execute: async ({ amount, type, category, description, occurred_on }) => {
                const cents = Math.round(Math.abs(amount) * 100);
                if (cents <= 0) return { ok: false, erro: "Valor precisa ser maior que zero" };
                const { data, error } = await supabase
                  .from("transactions")
                  .insert({
                    user_id: userId,
                    amount_cents: cents,
                    type,
                    category,
                    description,
                    occurred_at: occurred_on
                      ? new Date(`${occurred_on}T12:00:00Z`).toISOString()
                      : new Date().toISOString(),
                  })
                  .select("id, amount_cents, type, category, description, occurred_at")
                  .single();
                if (error) return { ok: false, erro: error.message };
                return { ok: true, transacao: data };
              },
            }),
            corrigir_categoria: tool({
              description: "Corrige a categoria da transação registrada mais recentemente.",
              inputSchema: z.object({
                category: z.string().describe("Nova categoria"),
              }),
              execute: async ({ category }) => {
                const { data: last, error: lastError } = await supabase
                  .from("transactions")
                  .select("id")
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (lastError || !last) return { ok: false, erro: "Nenhuma transação encontrada" };
                const { error } = await supabase
                  .from("transactions")
                  .update({ category })
                  .eq("id", last.id);
                if (error) return { ok: false, erro: error.message };
                return { ok: true, category };
              },
            }),
            consultar_resumo: tool({
              description:
                "Consulta as transações da pessoa em um período para calcular saldo, totais e gastos por categoria.",
              inputSchema: z.object({
                from: z.string().describe("Data inicial YYYY-MM-DD"),
                to: z.string().describe("Data final YYYY-MM-DD"),
              }),
              execute: async ({ from, to }) => {
                const { data, error } = await supabase
                  .from("transactions")
                  .select("amount_cents, type, category, description, occurred_at")
                  .gte("occurred_at", `${from}T00:00:00Z`)
                  .lte("occurred_at", `${to}T23:59:59Z`)
                  .order("occurred_at", { ascending: false });
                if (error) return { ok: false, erro: error.message };

                const rows = data ?? [];
                let entradas = 0;
                let gastos = 0;
                const porCategoria: Record<string, number> = {};
                for (const row of rows) {
                  const valor = row.amount_cents / 100;
                  if (row.type === "income") entradas += valor;
                  else {
                    gastos += valor;
                    porCategoria[row.category] = (porCategoria[row.category] ?? 0) + valor;
                  }
                }
                return {
                  ok: true,
                  periodo: { from, to },
                  entradas,
                  gastos,
                  saldo: entradas - gastos,
                  por_categoria: porCategoria,
                  quantidade: rows.length,
                };
              },
            }),
            criar_meta: tool({
              description: "Cria uma meta financeira para a pessoa.",
              inputSchema: z.object({
                name: z.string().describe("Nome da meta"),
                target_amount: z.number().describe("Valor desejado em reais"),
                deadline: z.string().nullable().describe("Prazo YYYY-MM-DD, ou null"),
              }),
              execute: async ({ name, target_amount, deadline }) => {
                const cents = Math.round(Math.abs(target_amount) * 100);
                if (cents <= 0) return { ok: false, erro: "Valor precisa ser maior que zero" };
                const { data, error } = await supabase
                  .from("goals")
                  .insert({
                    user_id: userId,
                    name,
                    target_amount_cents: cents,
                    deadline: deadline,
                  })
                  .select("id, name, target_amount_cents, current_amount_cents, deadline")
                  .single();
                if (error) return { ok: false, erro: error.message };
                return { ok: true, meta: data };
              },
            }),
            consultar_metas: tool({
              description: "Lista as metas financeiras da pessoa e o progresso de cada uma.",
              inputSchema: z.object({}),
              execute: async () => {
                const { data, error } = await supabase
                  .from("goals")
                  .select("id, name, target_amount_cents, current_amount_cents, deadline")
                  .order("created_at", { ascending: false });
                if (error) return { ok: false, erro: error.message };
                return { ok: true, metas: data ?? [] };
              },
            }),
          },
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
          headers: getLovableAiGatewayResponseHeaders(undefined, {
            ...(initialRunId ? { "X-Lovable-AIG-Run-ID": initialRunId } : {}),
          }),
          onFinish: async ({ responseMessage }) => {
            const { error } = await supabase.from("messages").insert({
              user_id: userId,
              role: "assistant",
              parts: responseMessage.parts as never,
            });
            if (error) console.error("Erro ao salvar resposta do assistente:", error);
          },
        });

        return withLovableAiGatewayRunIdHeader(response, runIdFetch);
      },
    },
  },
});
