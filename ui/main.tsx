import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { boot } from './store';
void boot();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
