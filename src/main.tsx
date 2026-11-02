import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof document !== 'undefined') {
  document.title = 'PaperForge';
}

createRoot(document.getElementById('root')!).render(<App />);
