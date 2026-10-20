import type { Metadata } from "next";
import { Caveat, Nunito } from "next/font/google";
import "./globals.css";

// Caveat echoes the brush lettering on the invitation; it is used only for the
// page title, where it reads as a flourish rather than as body copy.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "latin-ext"],
});

// Nunito is rounded and warm enough to sit under it, but is a real text face.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Wunschliste",
  description: "Eine gemeinsame Wunschliste – such dir etwas aus und reservier es.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${caveat.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
