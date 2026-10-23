import './globals.css';

export const metadata = { title: 'Permit Renewal' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="banner">
          <a href="/" className="brand">Permit Renewal Service</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
