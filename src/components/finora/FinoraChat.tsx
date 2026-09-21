import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { toast } from "sonner";
import logo from "@/assets/finora-logo.png";

const SUGGESTIONS = [
  "Gastei R$ 35 no mercado hoje",
  "Recebi R$ 1.200 de um freela",
  "Como está meu mês?",
  "Me dá uma dica de economia",
];

export function FinoraChat({
  initialMessages,
  token,
}: {
  initialMessages: UIMessage[];
  token: string;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );

  const { messages, sendMessage, status } = useChat({
    id: "finora",
    messages: initialMessages,
    transport,
    onError: (error) => {
      toast.error(error.message || "Não consegui responder agora. Tente novamente.");
    },
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  async function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setInput("");
    const { data } = await supabase.auth.getSession();
    await sendMessage(
      { text: value },
      data.session?.access_token
        ? { headers: { Authorization: `Bearer ${data.session.access_token}` } }
        : undefined,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-2xl px-4 pb-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center py-14 text-center">
              <img src={logo} alt="Finora" width={80} height={80} className="h-20 w-20" />
              <h2 className="mt-4 font-display text-2xl text-foreground">
                Vamos organizar seu dinheiro juntos
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Escreva como você fala. Eu anoto, classifico e explico — sem planilhas e sem
                cobranças.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="rounded-full border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent
                className={
                  message.role === "assistant" ? "bg-transparent p-0 text-foreground" : undefined
                }
              >
                {message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>
                    );
                  }
                  if (part.type.startsWith("tool-")) {
                    const toolPart = part as unknown as {
                      type: string;
                      state: Parameters<typeof ToolHeader>[0]["state"];
                      input?: unknown;
                      output?: unknown;
                      errorText?: string;
                    };
                    return (
                      <Tool key={`${message.id}-${index}`} defaultOpen={false}>
                        <ToolHeader
                          type={
                            toolPart.type
                              .replace("tool-", "")
                              .replace(/_/g, " ") as `tool-${string}`
                          }
                          state={toolPart.state}
                        />
                        <ToolContent>
                          <ToolInput input={toolPart.input} />
                          <ToolOutput
                            output={toolPart.output as never}
                            errorText={toolPart.errorText as never}
                          />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && (
            <div className="px-1 py-2">
              <Shimmer>Pensando...</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-background/80 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          <PromptInput
            onSubmit={(_message, event) => {
              event.preventDefault();
              void submit(input);
            }}
          >
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ex.: gastei 25 no almoço"
              autoFocus
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={!input.trim() || busy} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            O Finora anota seus registros com segurança. Só você vê seus dados.
          </p>
        </div>
      </div>
    </div>
  );
}
