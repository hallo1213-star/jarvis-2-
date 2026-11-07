import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './navi.css'

createRoot(document.getElementById('root')).render(<App />)
document.getElementById('boot')?.classList.add('done')
