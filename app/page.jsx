"use client";

import { useState, useRef, useEffect } from "react";
import { 
  Send, 
  Bot, 
  User, 
  Trash2, 
  Zap, 
  Copy, 
  Check, 
  Square, 
  Sparkles,
  RefreshCw,
  Cpu,
  Clock,
  Gauge,
  BarChart3,
  Activity,
  AlertCircle,
  Database
} from "lucide-react";

const AVAILABLE_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", tag: "Potente & Preciso", provider: "OpenAI" },
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", tag: "Ultra Rápido", provider: "Alibaba" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", tag: "Ligero & Ágil", provider: "OpenAI" },
  { id: "groq/compound-mini", name: "Compound Mini", tag: "Balanceado", provider: "Groq" }
];

const SUGGESTIONS = [
  "⚡ ¿Por qué la inferencia en las LPU de Groq es tan rápida?",
  "🐍 Escribe una función en Python para procesar streams de datos",
  "🛡️ ¿Cómo funciona un túnel WireGuard y cómo elude bloqueos?",
  "🚀 Diseña la arquitectura de un Agente IA para soporte al cliente"
];

const INITIAL_MESSAGE = {
  role: "assistant",
  content: "¡Hola! Soy tu asistente impulsado por las LPU de **Groq**. La conexión está lista y el registro de métricas de sesión está activo. ¿Qué exploramos hoy?",
  metrics: null
};

const STORAGE_KEYS = {
  MESSAGES: "groq_chat_messages_v2",
  SESSION_USAGE: "groq_chat_session_usage_v2",
  SELECTED_MODEL: "groq_chat_selected_model_v2"
};

const DEFAULT_SESSION_USAGE = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  request_count: 0
};

export default function ChatPage() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [sessionUsage, setSessionUsage] = useState(DEFAULT_SESSION_USAGE);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("openai/gpt-oss-120b");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoadedFromStorage, setIsLoadedFromStorage] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Cargar estado guardado en localStorage al montar el componente (sobrevive recarga de pestaña)
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }

      const savedUsage = localStorage.getItem(STORAGE_KEYS.SESSION_USAGE);
      if (savedUsage) {
        const parsedUsage = JSON.parse(savedUsage);
        if (parsedUsage && typeof parsedUsage.total_tokens === "number") {
          setSessionUsage(parsedUsage);
        }
      }

      const savedModel = localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL);
      if (savedModel) {
        setSelectedModel(savedModel);
      }
    } catch (e) {
      console.error("Error al cargar datos desde localStorage:", e);
    } finally {
      setIsLoadedFromStorage(true);
    }
  }, []);

  // Guardar mensajes automáticamente en localStorage al cambiar
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.error("Error al guardar mensajes en localStorage:", e);
    }
  }, [messages, isLoadedFromStorage]);

  // Guardar consumo de sesión en localStorage al cambiar
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem(STORAGE_KEYS.SESSION_USAGE, JSON.stringify(sessionUsage));
    } catch (e) {
      console.error("Error al guardar consumo en localStorage:", e);
    }
  }, [sessionUsage, isLoadedFromStorage]);

  // Guardar modelo seleccionado en localStorage al cambiar
  useEffect(() => {
    if (!isLoadedFromStorage) return;
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, selectedModel);
    } catch (e) {
      console.error("Error al guardar modelo en localStorage:", e);
    }
  }, [selectedModel, isLoadedFromStorage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleClear = () => {
    if (confirm("¿Deseas limpiar el historial de conversación y restablecer los contadores de la sesión?")) {
      const resetMessages = [INITIAL_MESSAGE];
      setMessages(resetMessages);
      setSessionUsage(DEFAULT_SESSION_USAGE);
      setErrorMessage("");
      try {
        localStorage.removeItem(STORAGE_KEYS.MESSAGES);
        localStorage.removeItem(STORAGE_KEYS.SESSION_USAGE);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e, forcedText = null) => {
    if (e) e.preventDefault();
    const textToSend = (forcedText !== null ? forcedText : input).trim();
    if (!textToSend || isLoading) return;

    setErrorMessage("");
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const newMessages = [...messages, { role: "user", content: textToSend, metrics: null }];
    setMessages(newMessages);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Agregar mensaje vacío para el asistente
    setMessages((prev) => [...prev, { role: "assistant", content: "", metrics: null }]);

    try {
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          model: selectedModel
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}: Respuesta no válida`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const item = JSON.parse(line);

            if (item.type === "delta" && item.text) {
              accumulatedText += item.text;
              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: accumulatedText
                };
                return updated;
              });
            } else if (item.type === "metrics") {
              // Recibir métricas de Groq
              const usage = item.usage || {};
              const respModel = item.model || selectedModel;

              // Actualizar mensaje con sus métricas específicas
              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  metrics: {
                    model: respModel,
                    prompt_tokens: usage.prompt_tokens || 0,
                    completion_tokens: usage.completion_tokens || 0,
                    total_tokens: usage.total_tokens || 0,
                    total_time: usage.total_time || "0.000",
                    tokens_per_second: usage.tokens_per_second || 0
                  }
                };
                return updated;
              });

              // Acumular el consumo en la sesión global
              setSessionUsage((prev) => ({
                prompt_tokens: prev.prompt_tokens + (usage.prompt_tokens || 0),
                completion_tokens: prev.completion_tokens + (usage.completion_tokens || 0),
                total_tokens: prev.total_tokens + (usage.total_tokens || 0),
                request_count: prev.request_count + 1
              }));
            }
          } catch (parseErr) {
            console.warn("Línea no JSON o parcial:", line);
          }
        }
      }

    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Generación cancelada por el usuario");
      } else {
        console.error("Chat error:", err);
        setErrorMessage(err.message || "Ocurrió un error inesperado.");
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last.role === "assistant" && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto px-3 sm:px-6 py-2">
      {/* Header */}
      <header className="flex flex-col gap-2 pb-2.5 border-b border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-500/20">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight">Groq Chat LPU</h1>
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  En línea
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  <Database className="w-3 h-3" />
                  Auto-guardado
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Inferencia ultrarrápida con métricas de tokens y persistencia activa</p>
            </div>
          </div>

          {/* Controles de cabecera */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-lg pl-3 pr-8 py-1.5 hover:border-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500 transition cursor-pointer"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.tag})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <Cpu className="w-3.5 h-3.5" />
              </div>
            </div>

            <button
              onClick={handleClear}
              title="Limpiar conversación y reiniciar métricas"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Estadísticas de Sesión Acumuladas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5">
            <BarChart3 className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total Sesión</div>
              <div className="text-xs font-bold text-slate-100 truncate">{sessionUsage.total_tokens.toLocaleString()} tok</div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5">
            <Activity className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Tokens Prompt</div>
              <div className="text-xs font-bold text-slate-100 truncate">{sessionUsage.prompt_tokens.toLocaleString()} tok</div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Tokens Salida</div>
              <div className="text-xs font-bold text-slate-100 truncate">{sessionUsage.completion_tokens.toLocaleString()} tok</div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5">
            <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Mensajes</div>
              <div className="text-xs font-bold text-slate-100 truncate">{sessionUsage.request_count} respuestas</div>
            </div>
          </div>
        </div>
      </header>

      {/* Alerta de Error si ocurre */}
      {errorMessage && (
        <div className="mt-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong>Error:</strong> {errorMessage}
          </div>
        </div>
      )}

      {/* Historial de Mensajes */}
      <main className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${
                isUser ? "flex-row-reverse" : "flex-row"
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white shadow text-xs ${
                  isUser
                    ? "bg-gradient-to-tr from-blue-600 to-indigo-600"
                    : "bg-gradient-to-tr from-orange-600 to-amber-600"
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              {/* Contenedor del Mensaje */}
              <div className="flex flex-col gap-1.5 max-w-[88%] sm:max-w-[80%]">
                {/* Burbuja */}
                <div
                  className={`relative group rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                      : "bg-slate-900/90 border border-slate-800/80 text-slate-200 shadow-sm"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                  {!isUser && msg.content && (
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      title="Copiar texto"
                      className="absolute -bottom-2 right-2 p-1 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition shadow-sm"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {/* Métricas individuales de cada respuesta del Asistente */}
                {!isUser && msg.metrics && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-400">
                    {/* Modelo */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-medium text-slate-300">
                      <Cpu className="w-3 h-3 text-orange-400" />
                      {msg.metrics.model}
                    </span>

                    {/* Tiempo de respuesta */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      {msg.metrics.total_time}s
                    </span>

                    {/* Tokens por segundo */}
                    {msg.metrics.tokens_per_second > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-medium text-amber-300">
                        <Gauge className="w-3 h-3 text-amber-400" />
                        {msg.metrics.tokens_per_second} tok/s
                      </span>
                    )}

                    {/* Detalle de tokens del mensaje */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-850 border border-slate-800 text-slate-400">
                      Entrada: <strong className="text-slate-300">{msg.metrics.prompt_tokens}</strong> | Salida: <strong className="text-slate-300">{msg.metrics.completion_tokens}</strong> (Total: {msg.metrics.total_tokens})
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Indicador de streaming activo */}
        {isLoading && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-orange-600/20 text-orange-400 flex items-center justify-center border border-orange-500/20">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            </div>
            <div className="px-3.5 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              Calculando inferencia en tiempo real...
            </div>
          </div>
        )}

        {/* Sugerencias si solo hay el mensaje inicial */}
        {messages.length === 1 && (
          <div className="pt-4 pb-2">
            <p className="text-xs font-medium text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              Sugerencias para comenzar:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((sug, sIdx) => (
                <button
                  key={sIdx}
                  onClick={() => handleSubmit(null, sug)}
                  className="text-left p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-orange-500/40 hover:bg-slate-800/60 text-xs text-slate-300 hover:text-slate-100 transition flex items-start gap-2 group"
                >
                  <span className="text-sm mt-0.5 group-hover:scale-110 transition-transform">💡</span>
                  <span className="flex-1">{sug}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input Form */}
      <footer className="pt-2 pb-1">
        <form onSubmit={handleSubmit} className="relative flex items-end gap-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-2 shadow-lg focus-within:border-orange-500/60 focus-within:ring-1 focus-within:ring-orange-500/30 transition">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu mensaje aquí... (Enter para enviar, Shift+Enter para salto de línea)"
            disabled={isLoading}
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm px-2.5 py-1.5 focus:outline-none resize-none min-h-[38px] max-h-[180px]"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="p-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-500 transition shadow-md shadow-rose-600/20"
              title="Detener generación"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2.5 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white hover:from-orange-500 hover:to-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-md shadow-orange-500/20"
              title="Enviar mensaje"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </form>

        <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 pt-1.5">
          <span>Persistencia en LocalStorage: <strong className="text-emerald-400">Activa</strong></span>
          <span>Inferencia acelerada con Groq LPUs</span>
        </div>
      </footer>
    </div>
  );
}
