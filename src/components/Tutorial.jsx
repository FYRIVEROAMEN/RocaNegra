import { useState, useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'

const TUTORIAL_STEPS = [
  {
    title: '¡Bienvenido a Stock Mercadería!',
    text: 'Acá vas a gestionar todo tu inventario, ventas y clientes de forma simple.',
    target: null
  },
  {
    title: 'Gestiona tu Inventario',
    text: 'Usá el buscador para encontrar productos o agregá nuevos con foto, precio y stock.',
    target: 'bottom-nav' // Apunta a la navegación para que se ubique
  },
  {
    title: 'Registrá Ventas',
    text: 'Buscá productos, escaneá códigos de barras y registrá pagos (totales o parciales).',
    target: null
  },
  {
    title: 'Revisá el Historial',
    text: 'Consultá ventas pasadas, filtrá por estado de pago y reenviá comprobantes por WhatsApp.',
    target: null
  },
  {
    title: 'Controlá Clientes y Deudas',
    text: 'Desde el menú "Más" (abajo), gestioná los saldos pendientes y registrá pagos a cuenta.',
    target: null
  },
  {
    title: 'Analizá tus Métricas',
    text: 'Revisá tus ventas del mes, productos más vendidos y el valor total de tu inventario.',
    target: null
  },
  {
    title: '¡Listo para empezar!',
    text: 'Ya conocés las herramientas principales. ¡A vender!',
    target: null
  }
]

function Tutorial({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const step = TUTORIAL_STEPS[currentStep]

  // Detectar si es mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      localStorage.setItem('tutorial_completed', 'true')
      onComplete()
    }
  }

  const handleSkip = () => {
    localStorage.setItem('tutorial_completed', 'true')
    onComplete()
  }

  // En mobile: siempre centrado
  // En desktop: apuntar al elemento si tiene target
  const getBubbleStyle = () => {
    if (isMobile || !step.target) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        maxWidth: '90%',
        width: '320px'
      }
    }
    
    const element = document.getElementById(step.target)
    if (element) {
      const rect = element.getBoundingClientRect()
      return {
        position: 'fixed',
        top: rect.bottom + 10,
        left: Math.min(rect.left, window.innerWidth - 320),
        zIndex: 1000,
        maxWidth: '300px'
      }
    }
    
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 1000,
      maxWidth: '400px',
      width: '90%'
    }
  }

  return (
    <>
      {/* Overlay oscuro */}
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 999
        }}
        onClick={handleSkip}
      />
      
      {/* Burbuja del tutorial */}
      <div 
        style={{
          ...getBubbleStyle(),
          background: 'white',
          padding: isMobile ? '20px' : '24px',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.3s ease'
        }}
      >
        {/* Botón cerrar */}
        <button
          onClick={handleSkip}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6b7280',
            padding: '4px'
          }}
        >
          <X size={20} />
        </button>

        {/* Indicador de progreso */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {TUTORIAL_STEPS.map((_, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                background: idx <= currentStep ? '#2563eb' : '#e5e7eb'
              }}
            />
          ))}
        </div>

        {/* Contenido */}
        <h3 style={{ 
          fontSize: isMobile ? '18px' : '20px', 
          fontWeight: '700', 
          marginBottom: '8px', 
          color: '#111827',
          paddingRight: '24px'
        }}>
          {step.title}
        </h3>
        <p style={{ 
          fontSize: isMobile ? '15px' : '16px', 
          color: '#6b7280', 
          marginBottom: '20px', 
          lineHeight: '1.5' 
        }}>
          {step.text}
        </p>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSkip}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              color: '#6b7280',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Saltar
          </button>
          <button
            onClick={handleNext}
            style={{
              padding: '10px 16px',
              background: '#2563eb',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '14px',
              minHeight: '44px'
            }}
          >
            {currentStep < TUTORIAL_STEPS.length - 1 ? 'Siguiente' : 'Empezar'}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

export default Tutorial