import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { messages, model = "openai/gpt-oss-120b", temperature = 0.7 } = await req.json();

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "No se encontró GROQ_API_KEY configurada en el servidor (.env.local)." },
        { status: 500 }
      );
    }

    const startTime = Date.now();

    // Solicitud a la API de Groq con streaming e inclusión de métricas de usage
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { error: { message: errorText } };
      }
      return NextResponse.json(
        { error: errorJson?.error?.message || "Error al conectar con Groq." },
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

                  // Capturar usage si viene en este chunk
                  if (parsed.usage) {
                    finalUsage = parsed.usage;
                  }

                  const delta = parsed.choices?.[0]?.delta?.content || "";
                  if (delta) {
                    const messagePayload = JSON.stringify({ type: "delta", text: delta }) + "\n";
                    controller.enqueue(encoder.encode(messagePayload));
                  }
                } catch {
                  // Fragmento incompleto, continuar procesando
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

          // Enviar payload final con métricas completas de la respuesta
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
      { error: err.message || "Error interno del servidor." },
      { status: 500 }
    );
  }
}
