export const metadata = {
  title: "52Archive",
  description: "Archive for deck-only card games.",
};

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
