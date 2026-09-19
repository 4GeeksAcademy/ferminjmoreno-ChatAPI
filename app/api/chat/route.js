import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { messages, model = "openai/gpt-oss-120b", temperature = 0.7 } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { 
          error: "No se encontró la clave GROQ_API_KEY en el servidor.",
          detail: "Configura tu clave en el archivo .env.local de la raíz del proyecto." 
        },
        { status: 500 }
      );
    }

    const startTime = Date.now();

    // Solicitud a la API de Groq con streaming e inclusión de métricas de usage
    let groqResponse;
    try {
      groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "Groq-NextJS-Client"
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: temperature,
          stream: true,
          stream_options: {
            include_usage: true
          }
        })
      });
    } catch (networkErr) {
      return NextResponse.json(
        {
          error: "Fallo de conectividad de red con Groq.",
          detail: `No se pudo alcanzar el servidor: ${networkErr.message}. Verifica tu conexión a internet o VPN.`
        },
        { status: 503 }
      );
    }

    // Captura controlada de errores devueltos por Groq (401, 403, 404, 429, 500)
    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { error: { message: errorText } };
      }

      const rawMessage = errorJson?.error?.message || errorText;
      let friendlyMessage = rawMessage;

      if (groqResponse.status === 401) {
        friendlyMessage = "Clave de API inválida o expirada. Verifica que GROQ_API_KEY en .env.local sea correcta.";
      } else if (groqResponse.status === 429) {
        friendlyMessage = "Has superado el límite de consultas permitidas de Groq (Rate Limit). Espera unos segundos e intenta nuevamente.";
      } else if (groqResponse.status === 403) {
        friendlyMessage = "Acceso denegado por Cloudflare o región. Asegúrate de que tu VPN esté conectada a un servidor habilitado (ej. Atlanta).";
      } else if (groqResponse.status === 404) {
        friendlyMessage = `El modelo '${model}' no existe o tu cuenta no tiene acceso a él. Prueba seleccionando otro modelo en la cabecera.`;
      } else if (groqResponse.status >= 500) {
        friendlyMessage = "Los servidores de Groq están temporalmente sobrecargados. Por favor espera unos instantes.";
      }

      return NextResponse.json(
        { 
          error: friendlyMessage,
          detail: rawMessage,
          statusCode: groqResponse.status
        },
        { status: groqResponse.status }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const customStream = new ReadableStream({
      async start(controller) {
        const reader = groqResponse.body.getReader();
        let buffer = "";
        let finalUsage = null;
        let responseModel = model;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(":")) continue;

              if (trimmed === "data: [DONE]") {
                continue;
              }

              if (trimmed.startsWith("data: ")) {
                try {
                  const jsonStr = trimmed.slice(6);
                  const parsed = JSON.parse(jsonStr);

                  if (parsed.model) {
                    responseModel = parsed.model;
                  }

                  if (parsed.usage) {
                    finalUsage = parsed.usage;
                  }

                  const delta = parsed.choices?.[0]?.delta?.content || "";
                  if (delta) {
                    const messagePayload = JSON.stringify({ type: "delta", text: delta }) + "\n";
                    controller.enqueue(encoder.encode(messagePayload));
                  }
                } catch {
                  // Fragmento parcial de stream, continuar
                }
              }
            }
          }

          const elapsedTimeSec = (Date.now() - startTime) / 1000;
          const promptTokens = finalUsage?.prompt_tokens || 0;
          const completionTokens = finalUsage?.completion_tokens || 0;
          const totalTokens = finalUsage?.total_tokens || (promptTokens + completionTokens);
          const totalTime = finalUsage?.total_time || elapsedTimeSec;
          const tokensPerSecond = (finalUsage?.completion_time && finalUsage.completion_time > 0)
            ? Math.round(completionTokens / finalUsage.completion_time)
            : (elapsedTimeSec > 0 ? Math.round(completionTokens / elapsedTimeSec) : 0);

          const metricsPayload = JSON.stringify({
            type: "metrics",
            model: responseModel,
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
              total_time: Number(totalTime).toFixed(3),
              tokens_per_second: tokensPerSecond,
              queue_time: finalUsage?.queue_time ? Number(finalUsage.queue_time).toFixed(3) : "0.000"
            }
          }) + "\n";

          controller.enqueue(encoder.encode(metricsPayload));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform"
      }
    });

  } catch (err) {
    console.error("API Chat Error:", err);
    return NextResponse.json(
      { 
        error: "Error interno en el servidor de chat.", 
        detail: err.message || "Excepción no controlada." 
      },
      { status: 500 }
    );
  }
}
