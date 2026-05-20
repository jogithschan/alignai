const JOB_DETAILS: Record<string, { title: string; company: string; description: string }> = {
  "senior-typescript-engineer": {
    title: "Senior TypeScript Engineer",
    company: "Acme Corp",
    description:
      "We are hiring a Senior TypeScript Engineer to build React and Node.js products. Requirements: 5+ years TypeScript, React, Node.js, AWS, REST APIs, and remote collaboration.",
  },
  "full-stack-react-developer": {
    title: "Full Stack React Developer",
    company: "Beta Labs",
    description:
      "Full stack role focused on React, Next.js, and PostgreSQL. Ideal candidate knows TypeScript, component design, and backend APIs.",
  },
  "backend-node-engineer": {
    title: "Backend Node.js Engineer",
    company: "Gamma Systems",
    description:
      "Backend engineer building scalable Node.js services. Experience with TypeScript, cloud infrastructure, and distributed systems preferred.",
  },
};

export default async function TestJobDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const job = JOB_DETAILS[slug];

  if (!job) {
    return <main style={{ padding: 32 }}>Job not found.</main>;
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 800 }}>
      <h1>{job.title}</h1>
      <p style={{ color: "#555" }}>{job.company}</p>
      <article style={{ marginTop: 24, lineHeight: 1.6 }}>{job.description}</article>
    </main>
  );
}
