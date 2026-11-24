import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FakeServer } from './api/fakeServer';
import { App } from './App';
import { DEFAULT_ME, generateDeals } from './domain/seed';
import { PipelineEngine } from './sync/engine';
import './styles.css';

const server = new FakeServer(generateDeals(50_000));
const engine = new PipelineEngine(server, DEFAULT_ME);
void engine.load().then(() => server.startTeammates());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App engine={engine} />
  </StrictMode>,
);
