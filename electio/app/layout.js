import "./globals.css";

export const metadata = {
  title: "Electio | Your High-Tech Decision Roulette",
  description: "The premium web application to help you make decisions, fast.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
