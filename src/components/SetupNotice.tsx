export function SetupNotice({ problems }: { problems: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Noch nicht konfiguriert</h2>
      <p className="mt-2 text-sm text-muted">
        Diesem Build fehlen die Einstellungen, um Supabase zu erreichen:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-danger">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        Lokal: <code className="font-mono text-xs">.env.example</code> nach{" "}
        <code className="font-mono text-xs">.env.local</code> kopieren und ausfüllen. Für die
        veröffentlichte Seite dieselben Werte als Repository-Variablen setzen – siehe{" "}
        <code className="font-mono text-xs">README.md</code>.
      </p>
    </div>
  );
}
