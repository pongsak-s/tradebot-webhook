import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Project {
  projectId: string;
  signalsCount: number;
  executionsCount: number;
  realized: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/v1/projects`)
      .then(res => res.json())
      .then((data) => setProjects(data.projects ?? []))
      .catch(console.error);
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Projects</h1>
      <ul>
        {projects.map(p => (
          <li key={p.projectId}>
            <Link to={`/projects/${p.projectId}`}>
              {p.projectId} — Signals: {p.signalsCount}, Executions: {p.executionsCount}, Realized: {p.realized}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
