# Plan Inicial y Requerimientos del Proyecto: Chat React-Next (Groq API)

Este documento recopila el conjunto de especificaciones, requisitos funcionales y el plan de arquitectura inicial definidos para la construcción del chat interactivo con **React + Next.js** conectado a la API de **Groq**.

---

## 1. Requerimientos y Directrices del Usuario

### Requisito 1: Separación de Proyectos
* **Instrucción:** Construir una interfaz de chat con **React + Next.js**, ubicándola en una carpeta independiente y dejando completamente intacto el desarrollo previo en Python.
* **Ubicaciones:**
  - Proyecto Python (Consola): [`c:/4-Programacion/4geekAcademy/AIEngineering/chatAPI`](file:///c:/4-Programacion/4geekAcademy/AIEngineering/chatAPI)
  - Proyecto React-Next (Web): [`c:/4-Programacion/4geekAcademy/AIEngineering/chat-next`](file:///c:/4-Programacion/4geekAcademy/AIEngineering/chat-next)

### Requisito 2: Uso Indispensable de `fetch` Nativo
* **Instrucción:** Las llamadas a la API deben realizarse obligatoriamente utilizando la Fetch API estándar de JavaScript.
* **Restricción:** Queda terminantemente descartado el uso de librerías HTTP externas (como Axios, Superagent) o SDKs intermediarios (como `groq-sdk` o `openai`). El transporte debe ser nativo tanto en el cliente como en el servidor.

### Requisito 3: Registro y Acumulación de Tokens (`usage`)
* **Instrucción:** Cada respuesta de Groq incluye un objeto `usage`. La aplicación debe capturar, registrar y mostrar:
  1. Tokens de prompt (entrada).
  2. Tokens de completado (salida).
  3. Tokens totales acumulados para toda la sesión de uso.

### Requisito 4: Métricas de Telemetría por Respuesta
* **Instrucción:** La interfaz debe presentar al menos una métrica adicional de rendimiento por cada respuesta generada. Opciones válidas:
  - Nombre del modelo de IA ejecutado.
  - Tiempo de respuesta / latencia total (en segundos o ms).
  - Velocidad de inferencia en **tokens por segundo (tok/s)**.

### Requisito 5: Resiliencia y Persistencia de la Sesión
* **Instrucción:** El historial de la conversación debe sobrevivir a una recarga accidental de página (`F5`) o al cierre de la pestaña. El usuario no debe perder su trabajo ni sus contadores acumulados por acciones involuntarias en el navegador.

### Requisito 6: Gestión Integral del Estado de la Interfaz
* **Instrucción:** Disponer de control reactivo del estado de la aplicación:
  - Estado de generación (`isLoading`) con indicadores visuales.
  - Posibilidad de cancelar/detener la generación en curso (`AbortController`).
  - Selector dinámico de modelos de IA.
  - Copiado rápido de respuestas con confirmación visual.
  - Vaciado y reinicio limpio de la conversación y métricas.

---

## 2. Plan de Arquitectura e Implementación Inicial

### Capa de Infraestructura y Red
1. Superar los bloqueos regionales de internet en Venezuela mediante túnel VPN a nivel de sistema operativo (Windscribe de escritorio con protocolo WireGuard en puerto 443 hacia nodo Atlanta).
2. Proteger la clave de API (`GROQ_API_KEY`) almacenándola exclusivamente en variables de entorno del servidor (`.env.local`) y aislándola mediante `.gitignore`.

### Capa de Servidor (Next.js Route Handler)
* **Archivo:** `app/api/chat/route.js`
* **Método:** `POST`
* **Responsabilidades:**
  - Recibir el historial de mensajes y modelo seleccionado desde el cliente.
  - Invocar a `https://api.groq.com/openai/v1/chat/completions` con `fetch` nativo habilitando streaming:
    ```javascript
    stream: true,
    stream_options: { include_usage: true }
    ```
  - Transformar el flujo Server-Sent Events (SSE) en un flujo NDJSON estructurado con chunks delta y payload final de métricas.

### Capa de Cliente (React SPA)
* **Archivo:** `app/page.jsx`
* **Framework y Estilos:** Next.js 14 App Router, React 18, Tailwind CSS, Lucide React Icons.
* **Componentes clave:**
  - **Cabecera & Dashboard:** Panel de 4 tarjetas para visualizar tokens acumulados de la sesión y selector de modelo.
  - **Historial de Chat:** Burbujas diferenciadas para usuario y asistente, con barra de telemetría (modelo, latencia, tok/s, desglose de tokens) bajo cada respuesta.
  - **Persistencia en LocalStorage:** Sincronización automática de `messages`, `sessionUsage` y `selectedModel` bajo control de montaje para evitar discrepancias de hidratación SSR.
  - **Caja de Entrada:** Textarea elástico con envío mediante `Enter`, multilínea con `Shift + Enter` y botón de abortar respuesta.

---

## 3. Criterios de Aceptación y Validación

| Criterio | Estado | Verificación |
| :--- | :---: | :--- |
| Carpeta aislada `chat-next` | ✅ Cumplido | Proyecto independiente creado; `chatAPI` preservado. |
| Uso exclusivo de `fetch` | ✅ Cumplido | Implementado en `page.jsx` y `route.js` sin SDKs ni Axios. |
| Tokens de sesión acumulados | ✅ Cumplido | Panel superior muestra prompt, completion y total acumulado. |
| Métricas por respuesta | ✅ Cumplido | Cada respuesta muestra modelo, tiempo (s) y tokens/segundo. |
| Persistencia tras `F5` | ✅ Cumplido | Almacenamiento en `localStorage` verificado tras recargas. |
| Inferencia ultra-rápida | ✅ Cumplido | Streaming en tiempo real validado a ~470 tokens/segundo. |
