import type { Metadata, Viewport } from "next";
import { Alfa_Slab_One, Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

const display = Alfa_Slab_One({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin", "latin-ext"],
});

const text = Atkinson_Hyperlegible_Next({
  variable: "--font-text",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Pergunte ao Diário Oficial",
  description:
    "Pergunte em português sobre o Diário Oficial de São Luís (jan–set/2026) e receba a resposta com a edição, a página e o trecho original de cada afirmação. Projeto independente de portfólio.",
};

export const viewport: Viewport = {
  themeColor: "#f2c12e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${display.variable} ${text.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
