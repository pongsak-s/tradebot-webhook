import React, { useEffect, useState } from 'react';

interface Project {
  projectId: string;
  signals: number;
  executions: number;
  realized: number;
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/v1/projects`)
      .then(res => res.json())
      .then(data => setProjects(data.projects));
  }, []);
  return (
    <div style={{ padding: '1rem', fontFamily: 'Arial' }}>
      <h1>Projects</h1>
      <ul>
        {projects.map(p => (
          <li key={p.projectId}>
            <strong>{p.projectId}</strong> - Signals: {p.signals}, Executions: {p.executions}, Realized: {p.realized}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;