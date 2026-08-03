import { useState, useEffect, useRef } from 'react'
import { Search, Plus, Trash2, ShoppingCart, Minus, X, Barcode, User, Phone, DollarSign, Info, Percent, Tag, ChevronDown, ChevronUp } from 'lucide-react'
import { 
  updateProducto, 
  createVenta, 
  createDetalleVenta, 
  crearOActualizarCliente, 
  registrarPago, 
  actualizarEstadoPagoVenta,
  updateVentaCliente
} from '../services/api'
import Swal from 'sweetalert2'
import { BrowserMultiFormatReader } from '@zxing/library'

const formatWhatsAppNumber = (phone) => {
  if (!phone) return ''
  let clean = phone.replace(/\D/g, '')
  if (clean.startsWith('549')) return clean
  if (clean.startsWith('0')) clean = clean.slice(1)
  if (clean.startsWith('9')) clean = clean.slice(1)
  if (clean.startsWith('15')) clean = '11' + clean
  clean = clean.replace(/^(11|2\d{2}|3\d{2})15/, '$1')
  return `549${clean}`
}

function SalesForm({ onSaleRecorded, productos, cart, setCart }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredProducts, setFilteredProducts] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [montoPagado, setMontoPagado] = useState(0)
  
  const [aplicarDescuento, setAplicarDescuento] = useState(false)
  const [tipoDescuento, setTipoDescuento] = useState('porcentaje')
  const [valorDescuento, setValorDescuento] = useState(0)
  const [motivoDescuento, setMotivoDescuento] = useState('Promoción')
  
  const [showClientData, setShowClientData] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  
  const codeReaderRef = useRef(null)
  const isCancelledRef = useRef(false)

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
        Swal.fire({ title: 'Stock insuficiente', text: `Solo quedan ${product.stock}.`, icon: 'warning', confirmButtonColor: '#dc2626' })
        return
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
    } else {
      setCart([...cart, { ...product, quantity: 1 }])
      if (cart.length === 0) setMontoPagado(product.precio)
    }
    setSearchTerm('')
    setFilteredProducts([])
  }

  const updateQuantity = (id, newQuantity) => {
    if (newQuantity < 1) return
    const product = productos.find(p => p.id === id)
    if (newQuantity > product.stock) {
      Swal.fire({ title: 'Stock insuficiente', text: `Máximo: ${product.stock}`, icon: 'warning', confirmButtonColor: '#dc2626' })
      return
    }
    setCart(cart.map(item => item.id === id ? { ...item, quantity: newQuantity } : item))
  }

  const removeFromCart = (id) => {
    const newCart = cart.filter(item => item.id !== id)
    setCart(newCart)
    if (newCart.length === 0) setMontoPagado(0)
  }
  
  const totalBruto = cart.reduce((sum, item) => sum + (item.precio * item.quantity), 0)
  const descuentoMonto = aplicarDescuento 
    ? (tipoDescuento === 'porcentaje' ? totalBruto * (valorDescuento / 100) : valorDescuento)
    : 0
  const totalNeto = totalBruto - descuentoMonto
  const resta = totalNeto - (Number(montoPagado) || 0)

  const handleCheckout = async () => {
    if (cart.length === 0) return Swal.fire({ title: 'Carrito vacío', icon: 'warning', confirmButtonColor: '#dc2626' })
    if (!clienteTelefono.trim()) return Swal.fire({ title: 'Teléfono requerido', text: 'Necesario para registrar la venta y el sorteo.', icon: 'warning', confirmButtonColor: '#dc2626' })
    if (Number(montoPagado) < 0 || Number(montoPagado) > totalNeto) return Swal.fire({ title: 'Monto inválido', text: `Debe ser entre $0 y $${totalNeto.toFixed(2)}.`, icon: 'warning', confirmButtonColor: '#dc2626' })

    setIsProcessing(true)
    try {
      const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 1
      const { data: ventaData, error: ventaError } = await createVenta({ 
        total_bruto: totalBruto, descuento_monto: descuentoMonto, descuento_motivo: aplicarDescuento ? motivoDescuento : 'Sin descuento', total_neto: totalNeto, local_id: LOCAL_ID 
      })
      if (ventaError) throw new Error(ventaError.message)
      const ventaId = ventaData[0].id

      for (const item of cart) {
        await createDetalleVenta({ venta_id: ventaId, producto_id: item.id, cantidad: item.quantity, precio_unitario: item.precio, local_id: LOCAL_ID })
        await updateProducto(item.id, { stock: item.stock - item.quantity })
      }

      const clienteId = await crearOActualizarCliente(clienteTelefono.trim(), clienteNombre.trim() || null, LOCAL_ID, totalNeto)
      await updateVentaCliente(ventaId, clienteId)

      if (Number(montoPagado) > 0) await registrarPago(ventaId, clienteId, Number(montoPagado), LOCAL_ID)

      let estadoPago = 'pagado'
      if (Number(montoPagado) === 0) estadoPago = 'pendiente'
      else if (Number(montoPagado) < totalNeto) estadoPago = 'parcial'
      await actualizarEstadoPagoVenta(ventaId, estadoPago)

      const fecha = new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      let mensajeWhatsApp = `*COMPROBANTE DE VENTA*\n━━━━━━━━━━━━━━━━━━━━\n📅 ${fecha}\n Venta #${ventaId}\n━━━━━━━━━━━━━━━━━━━━\n\n*PRODUCTOS:*\n`
      cart.forEach(item => { mensajeWhatsApp += `${item.quantity}x ${item.nombre}\n   $${(item.precio * item.quantity).toFixed(2)}\n` })
      mensajeWhatsApp += `\n━━━━━━━━━━━━━━━━━━━━\n*Subtotal: $${totalBruto.toFixed(2)}*\n`
      if (aplicarDescuento && descuentoMonto > 0) mensajeWhatsApp += `*Descuento (${motivoDescuento}): -$${descuentoMonto.toFixed(2)}*\n`
      mensajeWhatsApp += `*TOTAL: $${totalNeto.toFixed(2)}*\n`
      if (Number(montoPagado) < totalNeto) mensajeWhatsApp += `*Pagado: $${Number(montoPagado).toFixed(2)}*\n*Resta: $${resta.toFixed(2)}*\n`
      mensajeWhatsApp += `━━━━━━━━━━━━━━━━━━━━\n\n *¡SORTEO DE FIN DE MES!* \nAl agendarnos, participás AUTOMÁTICAMENTE.\n📅 Sorteo: Último día del mes\n\n✅ Seguinos en Instagram @Moon.importados\n¡Gracias por tu compra! `

      const result = await Swal.fire({
        title: '¡Venta Registrada! ✅',
        html: `
          <div style="text-align: left;">
            <p><strong>Total:</strong> <span style="color: #16a34a; font-size: 1.5rem; font-weight: bold;">$${totalNeto.toFixed(2)}</span></p>
            ${resta > 0 ? `<p><strong>Resta:</strong> <span style="color: #dc2626; font-weight: bold;">$${resta.toFixed(2)}</span></p>` : ''}
            <hr style="margin: 15px 0;" />
            <label style="display: block; margin-bottom: 8px; font-weight: 600;"> Enviar comprobante:</label>
            <input id="swal-whatsapp-input" type="tel" placeholder="Ej: 11 1234 5678" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; font-size: 16px;" value="${clienteTelefono}" />
          </div>
        `,
        icon: 'success', showCancelButton: true, confirmButtonColor: '#25D366', cancelButtonColor: '#6b7280',
        confirmButtonText: 'Enviar por WhatsApp', cancelButtonText: 'Solo cerrar',
        preConfirm: () => document.getElementById('swal-whatsapp-input').value
      })

      if (result.isConfirmed && result.value) window.open(`https://wa.me/${formatWhatsAppNumber(result.value)}?text=${encodeURIComponent(mensajeWhatsApp)}`, '_blank')
      
      setCart([]); setClienteTelefono(''); setClienteNombre(''); setMontoPagado(0); setAplicarDescuento(false); setValorDescuento(0); setMotivoDescuento('Promoción')
      onSaleRecorded()
    } catch (err) {
      Swal.fire({ title: 'Error', text: err.message, icon: 'error', confirmButtonColor: '#dc2626' })
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
        let timeoutId = setTimeout(() => { if (!isCancelledRef.current) reject(new Error('Tiempo agotado')) }, 30000)
        codeReader.decodeFromVideoDevice(undefined, 'video', (result, err) => {
          if (isCancelledRef.current) { clearTimeout(timeoutId); reject(new Error('Cancelado')); return }
          if (result) { clearTimeout(timeoutId); resolve(result.getText()) }
        })
      })
      if (scannedCode) {
        const product = productos.find(p => p.barcode === scannedCode || p.codigo_barras === scannedCode)
        if (product) { addToCart(product); Swal.fire({ title: '¡Agregado!', text: product.nombre, icon: 'success', timer: 1500, showConfirmButton: false }) }
        else Swal.fire({ title: 'No encontrado', text: `Código: ${scannedCode}`, icon: 'warning', confirmButtonColor: '#dc2626' })
      }
    } catch (err) {
      if (!isCancelledRef.current) Swal.fire({ title: 'Error al escanear', text: err.message || 'Intentá de nuevo', icon: 'error', confirmButtonColor: '#dc2626' })
    } finally {
      setIsScanning(false)
      if (codeReaderRef.current) { codeReaderRef.current.reset(); codeReaderRef.current = null }
    }
  }

  const handleCloseScan = () => {
    isCancelledRef.current = true
    setIsScanning(false)
    if (codeReaderRef.current) { codeReaderRef.current.reset(); codeReaderRef.current = null }
  }

  return (
    <div className="bg-gray-50 min-h-screen pb-40 lg:pb-8">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-green-600" /> Nueva Venta
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          
          {/* COLUMNA IZQUIERDA: BÚSQUEDA Y PRODUCTOS */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3.5 border-2 border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                />
              </div>
              <button
                onClick={handleScan}
                className="bg-green-600 hover:bg-green-700 text-white rounded-xl w-14 flex items-center justify-center transition shadow-md active:scale-95"
                title="Escanear"
              >
                <Barcode className="w-6 h-6" />
              </button>
            </div>

            

            {/* ✅ LISTA DE RESULTADOS: Solo aparece si hay búsqueda */}
            {filteredProducts.length > 0 && (
              <div className="bg-white border-2 border-gray-200 rounded-xl max-h-[40vh] lg:max-h-none overflow-y-auto shadow-sm">
                {filteredProducts.map(product => (
                  <div 
                    key={product.id} 
                    onClick={() => product.stock > 0 && addToCart(product)}
                    className={`flex justify-between items-center p-3 border-b border-gray-100 transition cursor-pointer active:bg-gray-50 ${product.stock <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-50'}`}
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="font-bold text-gray-800 text-sm truncate">{product.nombre}</p>
                      <p className="text-xs text-gray-500">{product.categoria} | T: {product.talle || 'N/A'}</p>
                      <p className="text-green-700 font-bold text-xs mt-1">Stock: {product.stock} | ${Number(product.precio).toFixed(2)}</p>
                    </div>
                    {product.stock > 0 && <div className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0"><Plus className="w-4 h-4" /></div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COLUMNA DERECHA: CARRITO Y CHECKOUT */}
          <div className="lg:col-span-2 space-y-4">
            
            {cart.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border-2 border-dashed border-gray-300 text-center text-gray-400">
                <ShoppingCart className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-semibold text-gray-500">Carrito vacío</p>
                <p className="text-sm mt-1">Buscá productos a la izquierda para comenzar</p>
              </div>
            ) : (
              <>
                <div className="bg-white p-4 rounded-xl border-2 border-gray-200 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" /> Carrito ({cart.length})
                  </h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {cart.map(item => (
                      <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex-1 min-w-0 mr-2">
                          <p className="font-bold text-gray-800 text-sm truncate">{item.nombre}</p>
                          <p className="text-xs text-gray-500">${Number(item.precio).toFixed(2)} c/u</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-8 h-8 flex items-center justify-center bg-white border rounded-full text-gray-600 active:bg-gray-100"><Minus className="w-4 h-4" /></button>
                          <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-8 h-8 flex items-center justify-center bg-white border rounded-full text-gray-600 active:bg-gray-100"><Plus className="w-4 h-4" /></button>
                          <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 flex items-center justify-center bg-red-50 border border-red-100 rounded-full text-red-600 active:bg-red-100 ml-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border-2 border-gray-200 shadow-sm">
                  <button onClick={() => setShowClientData(!showClientData)} className="w-full flex justify-between items-center mb-2">
                    <h4 className="text-lg font-bold text-gray-700 flex items-center gap-2"><User className="w-5 h-5" /> Cliente</h4>
                    {showClientData ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </button>
                  
                  {showClientData && (
                    <div className="space-y-3 mt-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="tel" placeholder="Teléfono (Ej: 11 1234 5678)" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="text" placeholder="Nombre (Opcional)" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                    </div>
                  )}
                  {!showClientData && !clienteTelefono && <p className="text-xs text-gray-500 mt-1">Tocá para agregar datos del cliente</p>}
                </div>

                <div className="bg-white p-4 rounded-xl border-2 border-gray-200 shadow-sm">
                  <button onClick={() => setShowDiscount(!showDiscount)} className="w-full flex justify-between items-center mb-2">
                    <h4 className="text-lg font-bold text-gray-700 flex items-center gap-2"><Tag className="w-5 h-5" /> Descuentos</h4>
                    {showDiscount ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </button>
                  
                  {showDiscount && (
                    <div className="space-y-3 mt-3 animate-in slide-in-from-top-2 duration-200">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={aplicarDescuento} onChange={(e) => setAplicarDescuento(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                        <span className="text-sm font-medium text-gray-700">Aplicar descuento</span>
                      </label>
                      {aplicarDescuento && (
                        <>
                          <div className="flex gap-2">
                            <button onClick={() => setTipoDescuento('porcentaje')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition ${tipoDescuento === 'porcentaje' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>%</button>
                            <button onClick={() => setTipoDescuento('monto')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition ${tipoDescuento === 'monto' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>$ Fijo</button>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">{tipoDescuento === 'porcentaje' ? '%' : '$'}</span>
                            <input type="number" placeholder="0" value={valorDescuento} onChange={(e) => setValorDescuento(Number(e.target.value))} className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500" min="0" />
                          </div>
                          <select value={motivoDescuento} onChange={(e) => setMotivoDescuento(e.target.value)} className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-500">
                            <option value="Promoción">Promoción</option>
                            <option value="Cliente VIP">Cliente VIP</option>
                            <option value="Pequeño defecto">Pequeño defecto</option>
                            <option value="Cierre de caja">Cierre de caja</option>
                            <option value="Otro">Otro</option>
                          </select>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* ✅ BOTÓN DE CONFIRMAR - VISIBLE EN MOBILE */}
                <div className="bg-green-50 border-2 border-green-200 p-4 rounded-xl shadow-sm lg:hidden">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <p className="text-sm text-gray-600">Total a Pagar</p>
                      <p className="text-2xl font-bold text-green-700">${totalNeto.toFixed(2)}</p>
                      {resta > 0 && <p className="text-xs text-red-600 font-semibold mt-1">Resta: ${resta.toFixed(2)}</p>}
                    </div>
                    <div className="w-1/2">
                      <label className="text-xs text-gray-600 block mb-1">Monto pagado</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                        <input
                          type="number"
                          placeholder="0"
                          value={montoPagado}
                          onChange={(e) => setMontoPagado(e.target.value)}
                          className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-lg text-right text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                          min="0"
                          max={totalNeto}
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleCheckout} 
                    disabled={isProcessing}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-4 rounded-xl text-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      'Procesando...'
                    ) : (
                      <>
                        <DollarSign className="w-6 h-6" /> 
                        CONFIRMAR VENTA
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ✅ BARRA DE COBRO SOLO PARA DESKTOP */}
        {cart.length > 0 && (
          <div className="hidden lg:block mt-6 bg-white border-2 border-gray-200 p-6 rounded-xl shadow-sm">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total a Pagar</p>
                <p className="text-3xl font-bold text-green-700">${totalNeto.toFixed(2)}</p>
                {resta > 0 && <p className="text-sm text-red-600 font-semibold mt-1">Resta: ${resta.toFixed(2)}</p>}
              </div>
              <div className="w-64">
                <label className="text-sm text-gray-600 block mb-2">Monto pagado</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={montoPagado}
                    onChange={(e) => setMontoPagado(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 border-2 border-gray-300 rounded-lg text-right text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                    min="0"
                    max={totalNeto}
                    step="0.01"
                  />
                </div>
              </div>
              <button
                onClick={handleCheckout} 
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-4 px-8 rounded-xl text-lg shadow-lg active:scale-[0.98] transition-all flex items-center gap-2"
              >
                {isProcessing ? 'Procesando...' : <><DollarSign className="w-6 h-6" /> CONFIRMAR VENTA</>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Overlay de escaneo */}
      {isScanning && (
        <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-md">
            <div className="relative w-full h-80 bg-black rounded-2xl overflow-hidden border-4 border-green-500 shadow-2xl">
              <video id="video" className="w-full h-full object-cover" autoPlay playsInline />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
              </div>
            </div>
            <div className="mt-6 text-center">
              <h3 className="text-xl font-bold text-white mb-2">Escaneá el código</h3>
              <button onClick={handleCloseScan} className="btn btn-danger w-full py-3 rounded-xl text-lg font-semibold">
                <X className="w-5 h-5 inline mr-2" /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesForm