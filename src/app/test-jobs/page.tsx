export default function TestJobsPage() {
  const jobs = [
    {
      title: "Senior TypeScript Engineer",
      company: "Acme Corp",
      url: "/test-jobs/senior-typescript-engineer",
    },
    {
      title: "Full Stack React Developer",
      company: "Beta Labs",
      url: "/test-jobs/full-stack-react-developer",
    },
    {
      title: "Backend Node.js Engineer",
      company: "Gamma Systems",
      url: "/test-jobs/backend-node-engineer",
    },
  ];

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 800 }}>
      <h1>Test Job Board</h1>
      <p>Open roles for integration testing.</p>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 16 }}>
        {jobs.map((job) => (
          <li
            key={job.url}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}
          >
            <a href={job.url} style={{ fontSize: 20, fontWeight: 600 }}>
              {job.title}
            </a>
            <div style={{ color: "#555", marginTop: 8 }}>{job.company}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
