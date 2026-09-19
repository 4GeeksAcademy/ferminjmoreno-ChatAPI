# Cuaderno de Aprendizaje y Bitácora Técnica: Proyecto Chat React-Next + Groq LPU

Este documento sintetiza todo el conocimiento, desafíos superados, decisiones arquitectónicas y código implementado durante el desarrollo del chat web con **React + Next.js (App Router)** conectado a la API de **Groq**, ubicado en [`c:/4-Programacion/4geekAcademy/AIEngineering/chat-next`](file:///c:/4-Programacion/4geekAcademy/AIEngineering/chat-next).

---

## 1. Superación de Bloqueos de Red y Entorno de Conexión

### El Desafío
Desde Venezuela, el acceso a servicios de inferencia de IA (como Groq) y herramientas de privacidad (como Windscribe) suele estar restringido en dos capas:
1. **Bloqueo DNS local:** Los proveedores de internet nacionales (CANTV, proveedores locales) devuelven direcciones inválidas o rechazan la conexión.
2. **Filtrado por Geo-bloqueo y Cloudflare:** Groq bloquea peticiones originadas en Venezuela devolviendo `HTTP 403 Forbidden`. Asimismo, Cloudflare bloquea IPs de centros de datos de ciertas VPNs conocidas.

### La Solución Implementada
1. **Cambio de DNS a nivel de sistema:** Configuración de los DNS públicos de Google (`8.8.8.8` y `8.8.4.4`). Esto eliminó el error *"Windscribe rechazó la conexión"* y permitió la descarga e instalación.
2. **App de Escritorio vs Extensión de Navegador:**
   - La extensión de Chrome solo tuneliza el navegador.
   - Para desarrollo y peticiones desde la terminal / servidor Node.js, es indispensable la **aplicación de escritorio de Windscribe** (túnel para todo el sistema operativo).
3. **Selección del Nodo de VPN:**
   - Al conectarse a *Miami (Vice)*, Cloudflare devolvió `403 Access Denied` (IP fichada como datacenter).
   - Al cambiar al servidor de **Atlanta (Georgia, US)** con protocolo **WireGuard (puerto 443)**, la conexión fue autorizada de inmediato por Groq (`HTTP 401/200`), permitiendo el flujo continuo de datos.

---

## 2. Gestión Segura de Credenciales

* **Generación:** Se creó la clave de API gratuita en [console.groq.com/keys](https://console.groq.com/keys).
* **Almacenamiento Seguro:** Se configuró en el servidor mediante el archivo `.env.local`:
  ```env
  GROQ_API_KEY=gsk_...
  ```
* **Aislamiento en Producción:** La clave **nunca** se envía al cliente ni al navegador. Se utiliza una ruta interna de Next.js como intermediario (*backend-for-frontend*).
* **Protección Git:** Se configuró `.gitignore` para excluir `.env*` y evitar fugas accidentales de secretos.

---

## 3. Entorno de Ejecución en Windows y Políticas de Scripts

### Error Encontrado
Al ejecutar comandos como `npm` desde PowerShell, surgió el error:
> `npm.ps1 no se puede cargar porque la ejecución de scripts está deshabilitada en este sistema (PSSecurityException)`.

### Solución
En entornos Windows con directivas de PowerShell restrictivas, se invoca directamente el ejecutable por lotes (`.cmd`):
```powershell
npm.cmd install
npm.cmd run build
npm.cmd run dev
```

---

## 4. Arquitectura de la Aplicación Next.js

### Estructura del Proyecto
```text
chat-next/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.js       # Route Handler (servidor con streaming y captura de métricas)
│   ├── globals.css            # Estilos base y scrollbar personalizada
│   ├── layout.jsx             # Shell HTML con tema oscuro persistente
│   └── page.jsx               # Interfaz de usuario React interactiva
├── .env.local                 # Clave secreta en el servidor
├── .gitignore                 # Reglas de exclusión para Git
├── package.json               # Dependencias (Next.js 14, React 18, Tailwind, Lucide)
├── tailwind.config.js         # Configuración de Tailwind CSS
├── postcss.config.mjs
└── next.config.mjs
```

### Patrón Backend-for-Frontend (BFF)
La interfaz web no habla directamente con Groq. En su lugar:
1. `page.jsx` (Cliente React) $\rightarrow$ `POST /api/chat` (Servidor Next.js local).
2. Servidor Next.js inyecta `process.env.GROQ_API_KEY` $\rightarrow$ Groq API (`https://api.groq.com`).
3. Groq responde con un stream SSE $\rightarrow$ Servidor Next.js lo transforma a NDJSON $\rightarrow$ Cliente lo consume en tiempo real.

---

## 5. Streaming de Datos y Protocolo NDJSON

### ¿Por qué no usar JSON estándar?
Un `JSON.stringify` tradicional requiere esperar a que el modelo termine de escribir todo el mensaje antes de enviarlo, perdiendo la velocidad de Groq.

### Implementación del Stream
En `app/api/chat/route.js` se implementó:
1. Activación de streaming en la petición a Groq:
   ```javascript
   body: JSON.stringify({
     model: model,
     messages: messages,
     stream: true,
     stream_options: {
       include_usage: true  // Clave para recibir los tokens consumidos
     }
   })
   ```
2. Transformación a **NDJSON** (*Newline Delimited JSON*) con `ReadableStream`:
   * Cada fragmento de texto emitido:
     ```json
     {"type": "delta", "text": "palabra"}
     ```
   * Al finalizar la respuesta, se emite un objeto especial de métricas:
     ```json
     {
       "type": "metrics",
       "model": "openai/gpt-oss-120b",
       "usage": {
         "prompt_tokens": 75,
         "completion_tokens": 62,
         "total_tokens": 137,
         "total_time": "0.132",
         "tokens_per_second": 470
       }
     }
     ```

---

## 6. Captura de Métricas de Rendimiento y Consumo de Tokens

### 1. Consumo Acumulado por Sesión
En el componente principal se mantiene un estado que acumula cada llamada:
* **Tokens de Prompt:** Tokens procesados al enviar el historial y la consulta del usuario.
* **Tokens de Salida (Completion):** Tokens generados por el modelo de IA.
* **Tokens Totales:** Suma completa de entrada y salida para auditar costos o límites del plan gratuito.
* **Contador de Mensajes:** Cantidad de peticiones completadas con éxito.

### 2. Métricas Individuales por Respuesta
Cada tarjeta de respuesta del Asistente muestra su propia barra de telemetría:
* 🤖 **Modelo ejecutado:** Confirma exactamente qué arquitectura procesó la respuesta (ej. `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`).
* ⏱️ **Tiempo de respuesta:** Medición precisa en segundos (`total_time`).
* 🚀 **Velocidad de generación:** Calculada como:
  $$\text{Tokens por segundo} = \frac{\text{completion\_tokens}}{\text{completion\_time}}$$
  *(Groq alcanza con frecuencia entre 400 y 500+ tokens por segundo en modelos abiertos).*

---

## 7. Persistencia y Resiliencia en el Cliente (`localStorage`)

### El Problema de la Pérdida de Estado
En SPAs convencionales, una recarga accidental con `F5` o el cierre de una pestaña borra todo el historial en memoria `useState`.

### Solución Diseñada
1. **Sincronización Bidireccional:**
   * Al montar el componente (`useEffect`), se leen las claves `groq_chat_messages_v2` y `groq_chat_session_usage_v2`.
   * Tras cada cambio en el chat o en las métricas, un `useEffect` sincroniza el estado con `localStorage`.
2. **Prevención de Errores de Hidratación (SSR vs CSR):**
   * Se utiliza un indicador `isLoadedFromStorage` para garantizar que la rehidratación en el cliente coincida limpiamente con el DOM del servidor antes de renderizar datos locales.
3. **Limpieza Controlada:**
   * El botón de vaciado de conversación solicita confirmación previa y resetea tanto la memoria RAM como el almacenamiento en `localStorage`.

---

## 8. Modelos Evaluados y Disponibles

| Identificador en Groq | Nombre en Interfaz | Características Destacadas |
| :--- | :--- | :--- |
| `openai/gpt-oss-120b` | **GPT OSS 120B** | Gran profundidad de razonamiento, precisión lógica y redacción técnica compleja. |
| `qwen/qwen3.8-27b` | **Qwen 3.8 27B** | Extremadamente veloz (~470 tok/s), excelente soporte multilingüe y eficiencia. |
| `openai/gpt-oss-20b` | **GPT OSS 20B** | Versión compacta y muy ligera para consultas directas y ágiles. |
| `groq/compound-mini` | **Compound Mini** | Modelo optimizado de Groq para equilibrio entre consumo y desempeño. |

---

## 9. Comandos Clave para Operación del Proyecto

* **Iniciar servidor de desarrollo:**
  ```powershell
  cd c:\4-Programacion\4geekAcademy\AIEngineering\chat-next
  npm.cmd run dev
  ```
* **Compilar para producción:**
  ```powershell
  npm.cmd run build
  ```
* **Iniciar en modo producción (después de compilar):**
  ```powershell
  npm.cmd run start
  ```
* **URL de acceso local:**
  [http://localhost:3000](http://localhost:3000)

---

## 10. Uso Indispensable y Exclusivo de `fetch` Nativo

Como requisito técnico indispensable del proyecto, **no se utilizan librerías de terceros (Axios, Superagent) ni SDKs comerciales (`groq-sdk`, `openai`)** para el transporte HTTP. Todo el flujo se implementa mediante el estándar web nativo `fetch`:

1. **Cliente React (`app/page.jsx`):**
   * Emplea `fetch("/api/chat", { method: "POST", ... })` para enviar el historial de mensajes al Route Handler local.
   * Utiliza `AbortController` nativo vinculado al fetch para cancelar streams en pleno vuelo.
   * Lee la respuesta incremental mediante la Web Streams API nativa: `res.body.getReader()`.
2. **Servidor Next.js (`app/api/chat/route.js`):**
   * Emplea `fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", ... })` en el entorno Node.js para transmitir la petición autorizada a Groq.
   * Transforma el flujo SSE entrante en un `ReadableStream` nativo con `TextEncoder`/`TextDecoder`.

---

## 11. Inventario Detallado del Estado de la Interfaz (UI State)

El componente principal en `app/page.jsx` implementa una arquitectura de estado reactivo integral:

| Variable de Estado | Tipo / Estructura | Responsabilidad en la UI |
| :--- | :--- | :--- |
| **`messages`** | `Array<{ role, content, metrics }>` | Almacena el hilo de la conversación. Cada mensaje del asistente incluye su propio objeto de telemetría individual. |
| **`isLoading`** | `boolean` | Alterna la interfaz entre reposo y generación: activa spinners, bloquea el textarea y sustituye el botón de envío por el de parada. |
| **`abortControllerRef`** | `useRef<AbortController>` | Permite abortar instantáneamente la petición HTTP activa ante un clic en "Detener". |
| **`selectedModel`** | `string` | Modelo activo seleccionado en el menú desplegable (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, etc.). |
| **`sessionUsage`** | `{ prompt_tokens, completion_tokens, total_tokens, request_count }` | Mantiene el acumulador global de consumo de tokens y cantidad de respuestas exitosas en la sesión. |
| **`input`** | `string` | Controla el texto que el usuario está escribiendo, gestionando la altura dinámica del textarea hasta 180px. |
| **`copiedIndex`** | `number \| null` | Gestiona el feedback visual (icono de check verde temporal por 2s) al copiar un mensaje. |
| **`errorMessage`** | `string` | Captura y despliega banners de alerta visual en caso de fallas de red o rechazos de API. |
| **`isLoadedFromStorage`** | `boolean` | Bandera de control para evitar sobreescrituras en `localStorage` antes de haber completado la lectura inicial del montaje. |

---

## 12. Arquitectura de Persistencia de la Sesión (`localStorage`)

Para garantizar que el usuario nunca pierda su trabajo por recargas involuntarias (`F5`) o cierres accidentales de la pestaña o navegador, se implementó una estrategia de persistencia en tres niveles:

### Claves y Datos Almacenados
1. **`groq_chat_messages_v2`:** Contiene todo el historial de mensajes, sus contenidos y las métricas individuales de cada respuesta (tiempo, modelo, tokens por segundo).
2. **`groq_chat_session_usage_v2`:** Contiene los contadores acumulados de la sesión (total tokens, tokens de prompt, tokens de salida y número de peticiones).
3. **`groq_chat_selected_model_v2`:** Recuerda la preferencia del modelo de IA seleccionado por el usuario.

### Ciclo de Sincronización y Resiliencia
* **Fase de Montaje (`useEffect []`):** Al cargar la aplicación en el navegador, lee de forma síncrona las tres claves y restaura el estado completo.
* **Fase de Actualización (`useEffect [deps]`):** Cada vez que se agrega un token, cambia un mensaje, se actualizan las métricas o se cambia el modelo, el estado se refleja automáticamente en `localStorage`.
* **Protección contra Hydration Mismatch (SSR):** El componente espera a que el montaje en el cliente confirme `isLoadedFromStorage = true` antes de sincronizar escrituras, garantizando que el DOM generado por Next.js en el servidor coincida exactamente con el cliente.
* **Reinicio Seguro (`handleClear`):** La limpieza del historial mediante el botón de papelera solicita confirmación al usuario antes de purgar la memoria RAM y eliminar las claves del `localStorage`.

