import { Toaster } from "sonner";
import { theme } from "@52archive/ui";

export const metadata = {
  title: "52Archive",
  description: "Archive for deck-only card games.",
};

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #fbf7ef 0%, #f2eadf 100%)",
        }}
      >
        <div style={{ flex: 1 }}>
          {children}
        </div>
        <footer
          style={{
            borderTop: `1.5px solid ${theme.colors.border}`,
            paddingTop: 24,
            paddingBottom: 24,
            textAlign: "center",
            fontSize: 12,
            color: theme.colors.muted,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontFamily: "Inter, sans-serif",
            opacity: 0.8,
          }}
        >
          © {new Date().getFullYear()} 52Archive • Remember the House
        </footer>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
