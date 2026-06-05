"use client";

import Link from "next/link";
import { theme } from "@52archive/ui";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        color: theme.colors.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          background: theme.colors.surface,
          border: `1.5px solid ${theme.colors.border}`,
          borderRadius: theme.radii.lg,
          padding: "48px 32px",
          boxShadow: theme.shadow,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: theme.colors.accent,
            lineHeight: 1,
            marginBottom: 16,
            fontFamily: "Georgia, serif",
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            margin: "0 0 12px 0",
            letterSpacing: "-0.02em",
          }}
        >
          Page Not Found
        </h1>
        <p
          style={{
            fontSize: 16,
            color: theme.colors.muted,
            margin: "0 0 32px 0",
            lineHeight: 1.5,
          }}
        >
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            background: theme.colors.text,
            color: "#ffffff",
            padding: "14px 28px",
            borderRadius: theme.radii.sm,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
            transition: "opacity 0.2s ease",
          }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Return to Home
        </Link>
      </div>
    </main>
  );
}
