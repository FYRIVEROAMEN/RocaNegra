import { useState, useEffect } from 'react'
import { getVentas, deleteVenta } from '../services/api'
import { Download, Trash2, Filter, User, Package, Eye } from 'lucide-react' // ✅ Agregué Eye
import Swal from 'sweetalert2'

// ====================================================================
// FUNCIÓN UTILITARIA: Formatea teléfonos argentinos para WhatsApp
// ====================================================================
const formatWhatsAppNumber = (phone) => {
  if (!phone) return ''
  let clean = phone.replace(/\D/g, '') 
  
  if (clean.startsWith('549')) return clean 
  if (clean.startsWith('0')) clean = clean.slice(1) 
  if (clean.startsWith('9')) clean = clean.slice(1) 
  
  if (clean.startsWith('15')) {
    clean = '11' + clean 
  }
  
  clean = clean.replace(/^(11|2\d{2}|3\d{2})15/, '$1')
  
  return `549${clean}`
}

function SalesHistory() {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')
  const [showDetail, setShowDetail] = useState(false)
  const [selectedVenta, setSelectedVenta] = useState(null)
  
  const [selectedVentas, setSelectedVentas] = useState([])
  const [selectAll, setSelectAll] = useState(false)

  useEffect(() => {
    fetchVentas()
  }, [])

  const fetchVentas = async () => {
    setLoading(true)
    try {
      const { data: ventasData } = await getVentas()
      const ventasAdaptadas = (ventasData || []).map(venta => {
        const pagos = venta.pagos || []
        const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0)
        const totalVenta = Number(venta.total_neto || venta.total_bruto || 0)
        const totalPendiente = totalVenta - totalPagado
        
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
    const montoTotal = Number(venta.total_neto || venta.total_bruto || 0)
    
    let mensaje = `*COMPROBANTE DE VENTA* \n`
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
    mensaje += `*TOTAL: $${montoTotal.toFixed(2)}*\n`
    
    if (venta.estado_pago === 'parcial') {
      mensaje += `*Pagado: $${Number(venta.total_pagado || 0).toFixed(2)}*\n`
      mensaje += `*Pendiente: $${Number(venta.total_pendiente || 0).toFixed(2)}*\n`
    }
    
    mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`
    mensaje += `¡Gracias por tu compra! `
    
    const url = `https://wa.me/${formatWhatsAppNumber(venta.cliente_telefono)}?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank')
  }

  const exportarVentasCSV = () => {
    const headers = ['ID Venta', 'Fecha', 'Cliente', 'Teléfono', 'Total Neto', 'Estado Pago', 'Pagado', 'Pendiente']
    const rows = ventasFiltradas.map(v => {
      const totalNeto = Number(v.total_neto || v.total_bruto || 0)
      return [
        v.id,
        new Date(v.fecha).toLocaleString('es-AR'),
        v.cliente_nombre || 'Sin nombre',
        v.cliente_telefono || 'Sin teléfono',
        totalNeto.toFixed(2),
        v.estado_pago || 'pagado',
        Number(v.total_pagado || 0).toFixed(2),
        Number(v.total_pendiente || 0).toFixed(2)
      ].map(cell => `"${cell}"`).join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const toggleSelectVenta = (ventaId, estadoPago) => {
    if (estadoPago !== 'pagado') {
      Swal.fire({
        title: 'No se puede seleccionar',
        text: 'Solo se pueden eliminar ventas completamente pagadas',
        icon: 'warning',
        timer: 2000
      })
      return
    }
    
    setSelectedVentas(prev => 
      prev.includes(ventaId) 
        ? prev.filter(id => id !== ventaId)
        : [...prev, ventaId]
    )
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedVentas([])
    } else {
      const ventasPagadas = ventasFiltradas
        .filter(v => v.estado_pago === 'pagado')
        .map(v => v.id)
      setSelectedVentas(ventasPagadas)
    }
    setSelectAll(!selectAll)
  }

  const eliminarSeleccionadas = async () => {
    if (selectedVentas.length === 0) {
      Swal.fire({
        title: 'No hay ventas seleccionadas',
        text: 'Seleccioná al menos una venta para eliminar',
        icon: 'warning'
      })
      return
    }

    const result = await Swal.fire({
      title: `¿Eliminar ${selectedVentas.length} venta(s)?`,
      html: `
        <div style="text-align: left;">
          <p style="margin-bottom: 10px;">Se eliminarán permanentemente:</p>
          <ul style="margin-left: 20px; margin-bottom: 15px;">
            <li>${selectedVentas.length} venta(s) seleccionada(s)</li>
            <li>Sus productos/detalles asociados</li>
          </ul>
          <p style="color: #dc2626; font-weight: bold;">⚠️ Esta acción no se puede deshacer</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar seleccionadas',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626'
    })

    if (result.isConfirmed) {
      try {
        for (const ventaId of selectedVentas) {
          await deleteVenta(ventaId)
        }
        
        Swal.fire({
          title: 'Eliminadas',
          text: `Se eliminaron ${selectedVentas.length} ventas`,
          icon: 'success',
          timer: 2000
        })
        
        setSelectedVentas([])
        setSelectAll(false)
        fetchVentas()
      } catch (err) {
        Swal.fire('Error', err.message, 'error')
      }
    }
  }

  const ventasFiltradas = ventas.filter(v => {
    if (filtro === 'todas') return true
    if (filtro === 'pagadas') return v.estado_pago === 'pagado'
    if (filtro === 'parciales') return v.estado_pago === 'parcial'
    if (filtro === 'pendientes') return v.estado_pago === 'pendiente'
    return true
  })

  const totalVentas = ventasFiltradas.reduce((sum, v) => {
    const monto = Number(v.total_neto || v.total_bruto || 0)
    return sum + monto
  }, 0)

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
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Historial de Ventas</h2>

      {/* Controles */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <select
            value={filtro}
            onChange={(e) => { setFiltro(e.target.value); setSelectedVentas([]); setSelectAll(false); }}
            className="border-2 border-gray-300 rounded-lg px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
          >
            <option value="todas">Todas las ventas</option>
            <option value="pagadas">Pagadas</option>
            <option value="parciales">Pago parcial</option>
            <option value="pendientes">Pendientes</option>
          </select>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={exportarVentasCSV} className="btn btn-success flex-1 sm:flex-none flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar</span><span className="sm:hidden">Excel</span>
          </button>
          
          {selectedVentas.length > 0 && (
            <button 
              onClick={eliminarSeleccionadas} 
              className="btn btn-danger flex-1 sm:flex-none flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Eliminar ({selectedVentas.length})</span><span className="sm:hidden">Borrar ({selectedVentas.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Mostrar contador de seleccionadas */}
      {selectedVentas.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-200 p-3 rounded-lg mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={toggleSelectAll}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <p className="text-blue-700 font-semibold">
              {selectedVentas.length} venta(s) seleccionada(s)
            </p>
          </div>
          <button 
            onClick={() => { setSelectedVentas([]); setSelectAll(false); }}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium underline"
          >
            Deseleccionar todo
          </button>
        </div>
      )}

      {/* Resumen */}
      <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl mb-6">
        <p className="text-lg text-gray-700">Total de ventas en el período:</p>
        <p className="text-lg sm:text-2xl font-bold text-green-700">${Number(totalVentas).toFixed(2)}</p>
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
          {ventasFiltradas.map(venta => {
            const isSelected = selectedVentas.includes(venta.id)
            const canDelete = venta.estado_pago === 'pagado'
            
            return (
              <div key={venta.id} className="border-2 border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition bg-white">
                {/* ✅ REFATORIZADO PARA MOBILE: Flex column en mobile, row en desktop */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
                  
                  {/* Lado Izquierdo: Checkbox + Info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0 w-full">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectVenta(venta.id, venta.estado_pago)}
                      disabled={!canDelete}
                      className="w-5 h-5 mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                      title={!canDelete ? 'Solo ventas pagadas pueden eliminarse' : 'Seleccionar para eliminar'}
                    />
                    
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
                        <p className="text-xs sm:text-sm text-gray-600 truncate font-medium">
                          {venta.cliente_nombre}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Lado Derecho: Precio + Botones (Apilados en mobile, lado a lado en desktop) */}
                  <div className="flex flex-col sm:items-end gap-2 flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0 border-t sm:border-t-0 border-gray-100 pt-3 sm:pt-0">
                    <p className="text-xl sm:text-2xl font-bold text-green-700 text-right">
                      ${Number(venta.total_neto || venta.total_bruto || 0).toFixed(2)}
                    </p>
                    
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleDelete(venta.id)}
                        className="flex-1 sm:flex-none bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-2.5 sm:py-1.5 px-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm border border-red-200"
                      >
                        <Trash2 className="w-4 h-4 sm:hidden" />
                        <span className="hidden sm:inline">Eliminar</span>
                        <span className="sm:hidden">Borrar</span>
                      </button>
                      <button
                        onClick={() => handleShowDetail(venta)}
                        className="flex-1 sm:flex-none bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-2.5 sm:py-1.5 px-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm border border-blue-200"
                      >
                        <Eye className="w-4 h-4 sm:hidden" />
                        <span className="hidden sm:inline">Detalle</span>
                        <span className="sm:hidden">Ver</span>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de Detalle */}
      {showDetail && selectedVenta && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl sm:text-2xl font-bold">Detalle #{selectedVenta.id}</h3>
              <button onClick={() => setShowDetail(false)} className="btn btn-secondary text-sm">Cerrar</button>
            </div>
            
            {selectedVenta.cliente_id && (
              <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl mb-4">
                <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                  <User className="w-5 h-5" /> Información del Cliente
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
                
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm text-gray-600">Estado:</span>
                  {getEstadoBadge(selectedVenta.estado_pago || 'pagado')}
                </div>
                
                {selectedVenta.estado_pago === 'parcial' && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm">
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
            
            <div className="space-y-2">
              <h4 className="font-bold text-gray-700 flex items-center gap-2">
                <Package className="w-5 h-5" /> Productos:
              </h4>
              {selectedVenta.detalle?.map((item, idx) => (
                <div key={idx} className="border p-3 sm:p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex-1">
                    <p className="font-bold">{item.productos?.nombre || 'Eliminado'}</p>
                    <p className="text-sm text-gray-600">
                      {item.cantidad} x ${item.precio_unitario} c/u
                      {item.productos?.talle && ` | Talle: ${item.productos.talle}`}
                      {item.productos?.color && ` | Color: ${item.productos.color}`}
                    </p>
                  </div>
                  <p className="font-bold text-lg text-gray-800 sm:self-end">
                    ${(item.cantidad * item.precio_unitario).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t-2 border-gray-300">
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold text-gray-700">Total:</span>
                <span className="text-2xl sm:text-3xl font-bold text-green-700">
                  ${Number(selectedVenta.total_neto || selectedVenta.total_bruto || 0).toFixed(2)}
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