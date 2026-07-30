import { useState, useEffect } from 'react'
import { getVentas, deleteVenta } from '../services/api'
import { Download, Trash2, Filter, Eye, Phone } from 'lucide-react'
import Swal from 'sweetalert2'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function SalesHistory() {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')
  const [showDetail, setShowDetail] = useState(false)
  const [selectedVenta, setSelectedVenta] = useState(null)

  useEffect(() => {
    fetchVentas()
  }, [])

  const fetchVentas = async () => {
  setLoading(true)
  try {
    const { data: ventasData } = await getVentas()
    const ventasAdaptadas = (ventasData || []).map(venta => {
      // Calcular total pagado sumando todos los pagos de esta venta
      const pagos = venta.pagos || []
      const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0)
      const totalPendiente = Number(venta.total || 0) - totalPagado
      
      return {
        ...venta,
        detalle: venta.detalle_ventas || [],
        cliente_nombre: venta.clientes?.nombre || null,
        cliente_telefono: venta.clientes?.telefono || null,
        total_pagado: totalPagado,
        total_pendiente: totalPendiente
      }
    })
    setVentas(ventasAdaptadas)
  } catch (err) {
    console.error('Error al cargar ventas:', err)
  }
  setLoading(false)
}

  const handleDelete = async (ventaId) => {
    const result = await Swal.fire({
      title: '¿Eliminar esta venta?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        await deleteVenta(ventaId)
        Swal.fire({ title: 'Venta eliminada', icon: 'success', timer: 1500 })
        fetchVentas()
      } catch (err) {
        Swal.fire({ title: 'Error', text: err.message, icon: 'error' })
      }
    }
  }

  const handleShowDetail = async (venta) => {
    setSelectedVenta(venta)
    setShowDetail(true)
  }

  const handleWhatsApp = (venta) => {
    if (!venta.cliente_telefono) {
      Swal.fire({ title: 'Sin teléfono', text: 'Este cliente no tiene teléfono registrado', icon: 'warning' })
      return
    }

    const fecha = new Date(venta.fecha).toLocaleString('es-AR')
    let mensaje = `*COMPROBANTE DE VENTA* 🧾\n`
    mensaje += `━━━━━━━━━━━━━━━━━━━━\n`
    mensaje += ` ${fecha}\n`
    mensaje += ` Venta #${venta.id}\n`
    mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`
    mensaje += `*PRODUCTOS:*\n`
    
    if (venta.detalle && venta.detalle.length > 0) {
      venta.detalle.forEach(item => {
        const subtotal = (item.cantidad * item.precio_unitario).toFixed(2)
        mensaje += `${item.cantidad}x ${item.productos?.nombre || 'Producto eliminado'}\n`
        mensaje += `   $${subtotal}\n`
      })
    }
    
    mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`
    mensaje += `*TOTAL: $${Number(venta.total).toFixed(2)}*\n`
    
    if (venta.estado_pago === 'parcial') {
      mensaje += `*Pagado: $${Number(venta.total_pagado || 0).toFixed(2)}*\n`
      mensaje += `*Pendiente: $${Number(venta.total_pendiente || 0).toFixed(2)}*\n`
    }
    
    mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`
    mensaje += `¡Gracias por tu compra! `
    
    const url = `https://wa.me/549${venta.cliente_telefono}?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank')
  }

  const exportarVentasCSV = () => {
    const headers = ['ID Venta', 'Fecha', 'Cliente', 'Teléfono', 'Total', 'Estado Pago', 'Pagado', 'Pendiente']
    const rows = ventasFiltradas.map(v => [
      v.id,
      new Date(v.fecha).toLocaleString('es-AR'),
      v.cliente_nombre || 'Sin nombre',
      v.cliente_telefono || 'Sin teléfono',
      Number(v.total).toFixed(2),
      v.estado_pago || 'pagado',
      Number(v.total_pagado || 0).toFixed(2),
      Number(v.total_pendiente || 0).toFixed(2)
    ].map(cell => `"${cell}"`).join(','))

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const limpiarHistorial = async (dias) => {
    const result = await Swal.fire({
      title: `¿Eliminar ventas de más de ${dias} días?`,
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      try {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - dias)
        
        const ventasAEliminar = ventas.filter(v => new Date(v.fecha) < cutoffDate)
        
        for (const venta of ventasAEliminar) {
          await deleteVenta(venta.id)
        }
        
        Swal.fire({ title: 'Historial limpiado', icon: 'success', timer: 1500 })
        fetchVentas()
      } catch (err) {
        Swal.fire({ title: 'Error', text: err.message, icon: 'error' })
      }
    }
  }

  // Filtrar ventas
  const ventasFiltradas = ventas.filter(v => {
    if (filtro === 'todas') return true
    if (filtro === 'pagadas') return v.estado_pago === 'pagado'
    if (filtro === 'parciales') return v.estado_pago === 'parcial'
    if (filtro === 'pendientes') return v.estado_pago === 'pendiente'
    return true
  })

  const totalVentas = ventasFiltradas.reduce((sum, v) => sum + Number(v.total || 0), 0)

  // Badge de estado de pago
  const getEstadoBadge = (estado) => {
    switch (estado) {
      case 'pagado':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Pagado</span>
      case 'parcial':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Parcial</span>
      case 'pendiente':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Pendiente</span>
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Pagado</span>
    }
  }

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-gray-200 max-w-5xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800"> Historial de Ventas</h2>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="border-2 border-gray-300 rounded-lg px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todas">Todas las ventas</option>
            <option value="pagadas">Pagadas</option>
            <option value="parciales">Pago parcial</option>
            <option value="pendientes">Pendientes</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button onClick={exportarVentasCSV} className="btn btn-success flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <div className="relative">
            <button
              onClick={() => {
                Swal.fire({
                  title: '¿Cuántos días mantener?',
                  input: 'select',
                  inputOptions: {
                    '7': '7 días',
                    '30': '30 días',
                    '90': '90 días',
                    '180': '180 días',
                    '365': '1 año'
                  },
                  showCancelButton: true,
                  confirmButtonText: 'Limpiar',
                  cancelButtonText: 'Cancelar',
                  confirmButtonColor: '#dc2626'
                }).then((result) => {
                  if (result.isConfirmed) {
                    limpiarHistorial(parseInt(result.value))
                  }
                })
              }}
              className="btn btn-danger flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl mb-6">
        <p className="text-lg text-gray-700">Total de ventas en el período:</p>
        <p className="text-3xl font-bold text-blue-700">${totalVentas.toFixed(2)}</p>
        <p className="text-base text-gray-600 mt-1">{ventasFiltradas.length} transacción(es)</p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : ventasFiltradas.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-xl">No hay ventas en este período</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ventasFiltradas.map(venta => (
          <div key={venta.id} className="border-2 border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800">Venta #{venta.id}</h3>
                  {getEstadoBadge(venta.estado_pago || 'pagado')}
                </div>
                <p className="text-xs sm:text-sm text-gray-600">
                  {new Date(venta.fecha).toLocaleString('es-AR')}
                </p>
                <p className="text-xs sm:text-sm text-gray-600">
                  {venta.detalle?.length || 0} producto(s)
                </p>
                {venta.cliente_nombre && (
                  <p className="text-xs sm:text-sm text-gray-600 truncate">
                    {venta.cliente_nombre}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <p className="text-lg sm:text-2xl font-bold text-green-700">${Number(venta.total).toFixed(2)}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(venta.id)}
                    className="btn btn-danger text-xs sm:text-sm px-3 py-1.5"
                  >
                    Eliminar
                  </button>
                  <button
                    onClick={() => handleShowDetail(venta)}
                    className="btn btn-primary text-xs sm:text-sm px-3 py-1.5"
                  >
                    Detalle
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Modal de Detalle */}
      {showDetail && selectedVenta && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold">Detalle #{selectedVenta.id}</h3>
              <button onClick={() => setShowDetail(false)} className="btn btn-secondary">Cerrar</button>
            </div>
            
            {/* Información del cliente */}
            {selectedVenta.cliente_id && (
              <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl mb-4">
                <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                  👤 Información del Cliente
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Nombre:</p>
                    <p className="font-semibold text-gray-800">
                      {selectedVenta.cliente_nombre || 'Sin nombre'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Teléfono:</p>
                    <p className="font-semibold text-gray-800">
                      {selectedVenta.cliente_telefono || 'No registrado'}
                    </p>
                  </div>
                </div>
                
                {/* Estado de pago */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm text-gray-600">Estado:</span>
                  {getEstadoBadge(selectedVenta.estado_pago || 'pagado')}
                </div>
                
                {selectedVenta.estado_pago === 'parcial' && (
                  <div className="mt-3 flex gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Pagado:</p>
                      <p className="font-bold text-green-700">${Number(selectedVenta.total_pagado || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Pendiente:</p>
                      <p className="font-bold text-red-700">${Number(selectedVenta.total_pendiente || 0).toFixed(2)}</p>
                    </div>
                  </div>
                )}
                
                {/* Botón WhatsApp */}
                {selectedVenta.cliente_telefono && (
                  <button
                    onClick={() => handleWhatsApp(selectedVenta)}
                    className="btn btn-success w-full mt-3 flex items-center justify-center gap-2"
                  >
                     Enviar comprobante por WhatsApp
                  </button>
                )}
              </div>
            )}
            
            {/* Productos */}
            <div className="space-y-2">
              <h4 className="font-bold text-gray-700">📦 Productos:</h4>
              {selectedVenta.detalle?.map((item, idx) => (
                <div key={idx} className="border p-4 rounded-lg flex justify-between items-center">
                  <div className="flex-1">
                    <p className="font-bold">{item.productos?.nombre || 'Eliminado'}</p>
                    <p className="text-sm text-gray-600">
                      {item.cantidad} x ${item.precio_unitario} c/u
                      {item.productos?.talle && ` | Talle: ${item.productos.talle}`}
                      {item.productos?.color && ` | Color: ${item.productos.color}`}
                    </p>
                  </div>
                  <p className="font-bold text-lg text-gray-800">
                    ${(item.cantidad * item.precio_unitario).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            
            {/* Total */}
            <div className="mt-4 pt-4 border-t-2 border-gray-300">
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold text-gray-700">Total:</span>
                <span className="text-3xl font-bold text-green-700">
                  ${Number(selectedVenta.total).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesHistory