import "./globals.css";

export const metadata = {
  title: "Groq AI Chat | React + Next.js",
  description: "Interfaz moderna de Chat IA conectada a la API de Groq con inferencia ultrarrápida",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-orange-500/30 selection:text-orange-200">
        {children}
      </body>
    </html>
  );
}
