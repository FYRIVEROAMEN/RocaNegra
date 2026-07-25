import { useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'




function App() {
  // Inicializamos el estado leyendo desde sessionStorage
  const [isLogged, setIsLogged] = useState(() => {
    return sessionStorage.getItem('isLogged') === 'true'
  })

  // Función para hacer login (guarda en sessionStorage)
  const handleLogin = () => {
    setIsLogged(true)
    sessionStorage.setItem('isLogged', 'true')
  }

  // Función para hacer logout (limpia sessionStorage)
  const handleLogout = () => {
    setIsLogged(false)
    sessionStorage.removeItem('isLogged')
  }

  if (!isLogged) {
    return <Login onLogin={handleLogin} />
  }

  return <Dashboard onLogout={handleLogout} />
}

export default App