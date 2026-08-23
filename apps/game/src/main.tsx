import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installStatisticsDeveloperApi } from './statistics';
import './styles/tokens.css';
import './styles/global.css';
import './styles/game.css';

installStatisticsDeveloperApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
