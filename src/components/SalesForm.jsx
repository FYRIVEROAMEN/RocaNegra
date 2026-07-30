import { useState, useEffect, useRef } from 'react'
import { Search, Plus, Trash2, ShoppingCart, Minus, X, Barcode, User, Phone, DollarSign } from 'lucide-react'
import { updateProducto, createVenta, createDetalleVenta, crearOActualizarCliente, registrarPago, actualizarEstadoPagoVenta } from '../services/api'
import { createClient } from '@supabase/supabase-js'
import Swal from 'sweetalert2'
import { BrowserMultiFormatReader } from '@zxing/library'

// Cliente Supabase para actualizar la venta con el cliente_id
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function SalesForm({ onSaleRecorded, productos, cart, setCart }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredProducts, setFilteredProducts] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  
  // 👇 NUEVOS ESTADOS PARA CLIENTE Y PAGO
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [montoPagado, setMontoPagado] = useState(0)
  
  const codeReaderRef = useRef(null)
  const isCancelledRef = useRef(false)

  // Sincronizar monto pagado con el total del carrito
  useEffect(() => {
    const total = cart.reduce((sum, item) => sum + (item.precio * item.quantity), 0)
    setMontoPagado(total)
  }, [cart])

  useEffect(() => {
    if (searchTerm.trim() === '') { setFilteredProducts([]); return }
    const term = searchTerm.toLowerCase()
    const results = productos.filter(p => 
      p.nombre?.toLowerCase().includes(term) || p.categoria?.toLowerCase().includes(term) ||
      p.color?.toLowerCase().includes(term) || p.talle?.toLowerCase().includes(term)
    ).slice(0, 10)
    setFilteredProducts(results)
  }, [searchTerm, productos])

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id)
    
    if (existingItem) {
      if (existingItem.quantity + 1 > product.stock) {
        Swal.fire({
          title: 'Stock insuficiente',
          text: `No hay suficiente stock de ${product.nombre}. Solo quedan ${product.stock}.`,
          icon: 'warning',
          confirmButtonColor: '#dc2626',
          confirmButtonText: 'Aceptar'
        })
        return
      }
      setCart(cart.map(item => 
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ))
    } else {
      setCart([...cart, { ...product, quantity: 1 }])
    }
    setSearchTerm('')
    setFilteredProducts([])
  }

  const updateQuantity = (id, newQuantity) => {
    if (newQuantity < 1) return
    const product = productos.find(p => p.id === id)
    if (newQuantity > product.stock) {
      Swal.fire({ title: 'Stock insuficiente', text: `Máximo disponible: ${product.stock}`, icon: 'warning', confirmButtonColor: '#dc2626' })
      return
    }
    setCart(cart.map(item => item.id === id ? { ...item, quantity: newQuantity } : item))
  }

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id))
  
  const total = cart.reduce((sum, item) => sum + (item.precio * item.quantity), 0)
  const resta = total - (Number(montoPagado) || 0)

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Swal.fire({ title: 'Carrito vacío', text: 'Agregá al menos un producto.', icon: 'warning', confirmButtonColor: '#dc2626' })
      return
    }

    // 1. Validar teléfono (obligatorio para registrar cliente)
    if (!clienteTelefono.trim()) {
      Swal.fire({
        title: 'Teléfono requerido',
        text: 'Ingresá el teléfono del cliente para completar la venta y registrar el sorteo.',
        icon: 'warning',
        confirmButtonColor: '#dc2626'
      })
      return
    }

    // 2. Validar monto pagado
    if (Number(montoPagado) < 0 || Number(montoPagado) > total) {
      Swal.fire({
        title: 'Monto inválido',
        text: 'El monto pagado debe ser entre $0 y el total de la venta.',
        icon: 'warning',
        confirmButtonColor: '#dc2626'
      })
      return
    }

    setIsProcessing(true)
    try {
      const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 1

      // 3. Crear la venta
      const { data: ventaData, error: ventaError } = await createVenta({ total, local_id: LOCAL_ID })
      if (ventaError) throw new Error(ventaError.message)
      const ventaId = ventaData[0].id

      // 4. Crear los detalles y actualizar stock
      for (const item of cart) {
        await createDetalleVenta({ venta_id: ventaId, producto_id: item.id, cantidad: item.quantity, precio_unitario: item.precio, local_id: LOCAL_ID })
        await updateProducto(item.id, { stock: item.stock - item.quantity })
      }

      // 5. Crear o actualizar cliente (devuelve el cliente_id)
      const clienteId = await crearOActualizarCliente(
        clienteTelefono.trim(),
        clienteNombre.trim() || null,
        LOCAL_ID,
        total
      )

      // 6. Vincular el cliente a la venta
      const { error: errorUpdateVenta } = await supabase
        .from('ventas')
        .update({ cliente_id: clienteId })
        .eq('id', ventaId)
      
      if (errorUpdateVenta) throw errorUpdateVenta

      // 7. Registrar el pago
      if (Number(montoPagado) > 0) {
        await registrarPago(ventaId, clienteId, Number(montoPagado), LOCAL_ID)
      }

      // 8. Actualizar estado de pago de la venta
      let estadoPago = 'pagado'
      if (Number(montoPagado) === 0) estadoPago = 'pendiente'
      else if (Number(montoPagado) < total) estadoPago = 'parcial'
      
      await actualizarEstadoPagoVenta(ventaId, estadoPago)

      // 9. Generar mensaje de WhatsApp
      const fecha = new Date().toLocaleString('es-AR', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      })

      let mensajeWhatsApp = `*COMPROBANTE DE VENTA* 🧾\n`
      mensajeWhatsApp += `━━━━━━━━━━━━━━━━━━━━\n`
      mensajeWhatsApp += `📅 ${fecha}\n`
      mensajeWhatsApp += ` Venta #${ventaId}\n`
      mensajeWhatsApp += `━━━━━━━━━━━━━━━━━━━━\n\n`
      mensajeWhatsApp += `*PRODUCTOS:*\n`
      cart.forEach(item => {
        const subtotal = (item.precio * item.quantity).toFixed(2)
        mensajeWhatsApp += `${item.quantity}x ${item.nombre}\n`
        mensajeWhatsApp += `   $${subtotal}\n`
      })
      mensajeWhatsApp += `\n━━━━━━━━━━━━━━━━━━━━\n`
      mensajeWhatsApp += `*TOTAL: $${total.toFixed(2)}*\n`
      
      if (Number(montoPagado) < total) {
        mensajeWhatsApp += `*Pagado: $${Number(montoPagado).toFixed(2)}*\n`
        mensajeWhatsApp += `*Resta: $${resta.toFixed(2)}*\n`
      }
      
      mensajeWhatsApp += `━━━━━━━━━━━━━━━━━━━━\n\n`
      mensajeWhatsApp += `🎁 *¡SORTEO DE FIN DE MES!* 🎁\n\n`
      mensajeWhatsApp += `Al agendarnos, participás AUTOMÁTICAMENTE\n`
      mensajeWhatsApp += `por una REMERA / ZAPATILLAS / $5000\n`
      mensajeWhatsApp += `📅 Sorteo: Último día del mes\n\n`
      mensajeWhatsApp += `*¿QUERÉS DOBLE CHANCE?*\n`
      mensajeWhatsApp += `✅ Seguinos en Instagram\n`
      mensajeWhatsApp += `✅ Compartí este mensaje con un amigo\n\n`
      mensajeWhatsApp += `¡Gracias por tu compra! 🙌`

      const mensajeCodificado = encodeURIComponent(mensajeWhatsApp)

      // 10. Mostrar resultado y enviar WhatsApp
      const result = await Swal.fire({
        title: '¡Venta Registrada! ✅',
        html: `
          <div style="text-align: left; font-size: 1rem;">
            <p style="margin: 10px 0;"><strong>Total:</strong> <span style="color: #16a34a; font-size: 1.5rem; font-weight: bold;">$${total.toFixed(2)}</span></p>
            <p style="margin: 10px 0;"><strong>Pagado:</strong> <span style="color: #2563eb; font-size: 1.2rem;">$${Number(montoPagado).toFixed(2)}</span></p>
            ${resta > 0 ? `<p style="margin: 10px 0;"><strong>Resta:</strong> <span style="color: #dc2626; font-size: 1.2rem; font-weight: bold;">$${resta.toFixed(2)}</span></p>` : ''}
            <p style="margin: 10px 0;"><strong>Productos:</strong> ${cart.length}</p>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;" />
            <p style="margin: 10px 0; color: #16a34a; font-weight: 600;">🎁 ¡Cliente registrado para el sorteo!</p>
            <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;" />
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">📱 Enviar comprobante por WhatsApp:</label>
            <input 
              id="swal-whatsapp-input" 
              type="text" 
              placeholder="Ej: 5491123456789" 
              style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;"
              value="${clienteTelefono}"
            />
          </div>
        `,
        icon: 'success',
        showCancelButton: true,
        confirmButtonColor: '#25D366',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Enviar por WhatsApp',
        cancelButtonText: 'Solo cerrar',
        focusConfirm: false,
        didOpen: () => {
          const input = document.getElementById('swal-whatsapp-input')
          if (input) input.focus()
        },
        preConfirm: () => {
          const numero = document.getElementById('swal-whatsapp-input').value
          return numero
        }
      })

      if (result.isConfirmed && result.value) {
        const url = `https://wa.me/${result.value}?text=${mensajeCodificado}`
        window.open(url, '_blank')
      }
      
      // 11. Limpiar formulario
      setCart([])
      setClienteTelefono('')
      setClienteNombre('')
      setMontoPagado(0)
      onSaleRecorded()

    } catch (err) {
      console.error(err)
      Swal.fire({ title: 'Error', text: 'Error al procesar la venta: ' + err.message, icon: 'error', confirmButtonColor: '#dc2626' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleScan = async () => {
    setIsScanning(true)
    isCancelledRef.current = false

    try {
      const codeReader = new BrowserMultiFormatReader()
      codeReaderRef.current = codeReader

      const scannedCode = await new Promise((resolve, reject) => {
        let timeoutId = null
        let found = false
        
        timeoutId = setTimeout(() => {
          if (!found && !isCancelledRef.current) {
            reject(new Error('Tiempo de escaneo agotado'))
          }
        }, 30000)

        codeReader.decodeFromVideoDevice(
          undefined,
          'video',
          (result, err) => {
            if (isCancelledRef.current) {
              clearTimeout(timeoutId)
              reject(new Error('Escaneo cancelado'))
              return
            }

            if (result) {
              found = true
              clearTimeout(timeoutId)
              resolve(result.getText())
            }
            
            if (err && err.name !== 'NotFoundException') {
              console.warn('Error escaneando:', err)
            }
          }
        )
      })

      if (scannedCode) {
        const product = productos.find(p => p.barcode === scannedCode || p.codigo_barras === scannedCode)
        
        if (product) {
          addToCart(product)
          Swal.fire({
            title: '¡Producto agregado!',
            text: product.nombre,
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
          })
        } else {
          Swal.fire({
            title: 'Código no encontrado',
            text: `No se encontró un producto con el código: ${scannedCode}`,
            icon: 'warning',
            confirmButtonColor: '#dc2626'
          })
        }
      }
      
    } catch (err) {
      console.error('Error en escáner:', err)
      
      if (!isCancelledRef.current) {
        let mensaje = 'Error al escanear. Intentá de nuevo.'
        
        if (err.name === 'NotAllowedError') mensaje = 'Permiso de cámara denegado.'
        else if (err.name === 'NotFoundError') mensaje = 'No se encontró una cámara.'
        else if (err.name === 'NotReadableError') mensaje = 'La cámara está en uso.'
        else if (err.message === 'Tiempo de escaneo agotado') mensaje = 'No se detectó ningún código en 30 segundos.'
        
        Swal.fire({ title: 'Error al escanear', text: mensaje, icon: 'error', confirmButtonColor: '#dc2626' })
      }
    } finally {
      setIsScanning(false)
      if (codeReaderRef.current) {
        codeReaderRef.current.reset()
        codeReaderRef.current = null
      }
    }
  }

  const handleCloseScan = () => {
    isCancelledRef.current = true
    setIsScanning(false)
    if (codeReaderRef.current) {
      codeReaderRef.current.reset()
      codeReaderRef.current = null
    }
  }

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-gray-200 max-w-5xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 flex items-center gap-3">
        <ShoppingCart className="w-8 h-8 text-green-600" /> Registrar Nueva Venta
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* COLUMNA IZQUIERDA: BÚSQUEDA */}
        <div>
          <h3 className="text-xl font-bold text-gray-700 mb-3">1. Buscar Producto</h3>
          
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
            <input
              type="text"
              placeholder="Escribí nombre, color, talle o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-14 py-4 border-2 border-gray-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <button
              onClick={handleScan}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-green-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-green-700 transition shadow-md"
              title="Escanear código de barras"
            >
              <Barcode className="w-5 h-5" />
            </button>
          </div>

          {filteredProducts.length > 0 && (
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl max-h-96 overflow-y-auto">
              {filteredProducts.map(product => (
                <div 
                  key={product.id} 
                  onClick={() => product.stock > 0 && addToCart(product)}
                  className={`flex justify-between items-center p-4 border-b border-gray-200 transition cursor-pointer ${
                    product.stock <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 active:bg-blue-100'
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-bold text-lg text-gray-800">{product.nombre}</p>
                    <p className="text-gray-600 text-base">
                      {product.categoria} | Talle: {product.talle || 'N/A'} | Color: {product.color || 'N/A'}
                    </p>
                    <p className="text-green-700 font-bold text-base">
                      Stock: {product.stock} | Precio: ${Number(product.precio).toFixed(2)}
                    </p>
                  </div>
                  {product.stock > 0 && (
                    <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center ml-3">
                      <Plus className="w-6 h-6" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: CARRITO + CLIENTE + PAGO */}
        <div className="bg-gray-50 p-4 sm:p-6 rounded-xl border-2 border-gray-200 flex flex-col">
          <h3 className="text-xl font-bold text-gray-700 mb-3">2. Carrito de Venta</h3>
          
          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-8">
              <ShoppingCart className="w-16 h-16 mb-2 opacity-50" />
              <p className="text-lg">El carrito está vacío</p>
              <p className="text-sm mt-2">Tocá "Vender" en un producto para agregarlo</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto max-h-60 space-y-3 mb-4">
                {cart.map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-lg">{item.nombre}</p>
                      <p className="text-gray-600">${Number(item.precio).toFixed(2)} c/u</p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="btn btn-secondary touch-target">
                        <Minus className="w-5 h-5" />
                      </button>
                      <span className="text-xl font-bold w-10 text-center">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="btn btn-secondary touch-target">
                        <Plus className="w-5 h-5" />
                      </button>
                      <button onClick={() => removeFromCart(item.id)} className="btn btn-danger touch-target" style={{ marginLeft: '8px' }}>
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 👇 SECCIÓN CLIENTE */}
              <div className="border-t-2 border-gray-300 pt-4 mt-4">
                <h4 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <User className="w-5 h-5" /> Datos del Cliente
                </h4>
                
                <div className="space-y-3">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      placeholder="Teléfono (ej: 1512345678)"
                      value={clienteTelefono}
                      onChange={(e) => setClienteTelefono(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 ml-1">ℹ️ Formato: 15XXXXXXXX (sin 0 ni 11)</p>
                  
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Nombre y Apellido (opcional)"
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>
              </div>

              {/* 👇 SECCIÓN PAGO */}
              <div className="border-t-2 border-gray-300 pt-4 mt-4">
                <h4 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <DollarSign className="w-5 h-5" /> Pago
                </h4>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total:</span>
                    <span className="font-bold text-lg text-green-700">${total.toFixed(2)}</span>
                  </div>
                  
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      placeholder="Monto pagado"
                      value={montoPagado}
                      onChange={(e) => setMontoPagado(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      min="0"
                      max={total}
                      step="0.01"
                    />
                  </div>
                  
                  {resta > 0 && (
                    <div className="flex justify-between text-sm bg-red-50 p-2 rounded-lg border border-red-200">
                      <span className="text-red-700 font-semibold">Resta (Deuda):</span>
                      <span className="font-bold text-red-700">${resta.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t-2 border-gray-300 pt-4 mt-4">
                <button
                  onClick={handleCheckout} disabled={isProcessing}
                  className="btn btn-success w-full" style={{ minHeight: '64px', fontSize: '20px' }}
                >
                  {isProcessing ? 'Procesando...' : 'Confirmar Venta'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Overlay de escaneo */}
      {isScanning && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-md">
            <div className="relative w-full h-80 bg-black rounded-2xl overflow-hidden border-4 border-green-500 shadow-2xl">
              <video id="video" className="w-full h-full object-cover" autoPlay playsInline />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <h3 className="text-xl font-bold text-white mb-2">Escaneá el código de barras</h3>
              <p className="text-gray-300 mb-6 text-sm">Apunta la cámara al código. Asegurate de tener buena luz.</p>
              <button onClick={handleCloseScan} className="btn btn-danger w-full">
                <X className="w-5 h-5" /> Cancelar escaneo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesForm