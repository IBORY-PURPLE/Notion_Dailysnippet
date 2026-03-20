export default function HomePage() {
  return (
    <main>
      <section className="card">
        <h1>Notion to Daily Snippet Sync</h1>
        <p>This project exposes two API routes:</p>
        <p>
          <code>POST /api/sync</code> and <code>POST /api/notion/webhook</code>
        </p>
        <p>
          It fetches today's Notion pages with category <code>daily_snippet</code>, converts
          content to markdown, and forwards payloads to your daily snippet server.
        </p>
      </section>
    </main>
  );
}
