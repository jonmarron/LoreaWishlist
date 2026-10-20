export function SetupNotice({ problems }: { problems: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-medium">Not configured yet</h2>
      <p className="mt-2 text-sm text-muted">
        This build is missing the settings it needs to reach the data repo:
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-danger">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        Locally, copy <code className="font-mono text-xs">.env.example</code> to{" "}
        <code className="font-mono text-xs">.env.local</code> and fill it in. For the deployed
        site, set the same values as repository variables and secrets — see{" "}
        <code className="font-mono text-xs">README.md</code>.
      </p>
    </div>
  );
}
