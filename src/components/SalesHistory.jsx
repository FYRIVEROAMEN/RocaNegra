import { useState, useEffect } from 'react'
import { Download, Trash2, Filter } from 'lucide-react'
import { getVentas} from '../services/api'
import { createClient } from '@supabase/supabase-js'
import Swal from 'sweetalert2'

// Cliente directo para operaciones masivas
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function SalesHistory() {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPeriod, setFilterPeriod] = useState('all')
  const [selectedVenta, setSelectedVenta] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)

  useEffect(() => {
    fetchVentas()
  }, [])

  const fetchVentas = async () => {
    setLoading(true)
    try {
      const response = await getVentas()
      const ventasData = response.data || []
      
      const ventasAdaptadas = ventasData.map(venta => ({
  ...venta,
  detalle: venta.detalle_ventas || [],
  cliente_nombre: venta.clientes?.nombre || null,
  cliente_telefono: venta.clientes?.telefono || null
}))
      
      setVentas(ventasAdaptadas)
    } catch (err) {
      console.error('Error al cargar ventas:', err)
    }
    setLoading(false)
  }

  const filteredVentas = ventas.filter(venta => {
    const ventaDate = new Date(venta.fecha)
    const now = new Date()
    const diffDays = (now - ventaDate) / (1000 * 60 * 60 * 24)

    if (filterPeriod === 'today') return diffDays < 1
    if (filterPeriod === 'week') return diffDays <= 7
    if (filterPeriod === 'month') return diffDays <= 30
    return true
  })

  const exportToCSV = () => {
    const headers = ['ID Venta', 'Fecha', 'Producto', 'Talle', 'Color', 'Cantidad', 'Precio Unitario', 'Subtotal']
    const rows = []

    filteredVentas.forEach(venta => {
      const fechaFormateada = new Date(venta.fecha).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
      
      if (venta.detalle && venta.detalle.length > 0) {
        venta.detalle.forEach(item => {
          const nombreProducto = item.productos?.nombre || 'Producto eliminado'
          const talle = item.productos?.talle || '-'
          const color = item.productos?.color || '-'
          const subtotal = (item.cantidad * item.precio_unitario).toFixed(2)
          
          rows.push([
            venta.id,
            fechaFormateada,
            nombreProducto,
            talle,
            color,
            item.cantidad,
            `$${Number(item.precio_unitario).toFixed(2)}`,
            `$${subtotal}`
          ])
        })
      } else {
        rows.push([
          venta.id,
          fechaFormateada,
          'Sin detalle',
          '-',
          '-',
          0,
          '-',
          `$${Number(venta.total).toFixed(2)}`
        ])
      }
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `ventas_${new Date().toISOString().split('T')[0]}.csv`)
    link.click()
  }

    const deleteOldVentas = async (days) => {
      const result = await Swal.fire({
        title: '¿Estás seguro?',
        html: `Se eliminarán <strong>TODAS</strong> las ventas de hace más de <strong>${days} días</strong>.\n\n⚠️ Los clientes con deuda perderán el historial de compras.\n\nEsta acción no se puede deshacer.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, eliminar todo',
        cancelButtonText: 'Cancelar'
      })

      if (!result.isConfirmed) return

      try {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - days)
        
        const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 1
        
        // 1. Obtener TODAS las ventas del local
        const { data: todasLasVentas, error: errorFetch } = await supabase
          .from('ventas')
          .select('id, fecha, cliente_id')
          .eq('local_id', LOCAL_ID)
        
        if (errorFetch) throw new Error('Error al obtener ventas: ' + errorFetch.message)
        
        // 2. Filtrar las que son más viejas que cutoffDate
        const ventasAEliminar = (todasLasVentas || []).filter(v => {
          const ventaDate = new Date(v.fecha)
          return ventaDate < cutoffDate
        })
        
        if (ventasAEliminar.length === 0) {
          Swal.fire({
            title: 'No hay ventas antiguas',
            text: `No se encontraron ventas de hace más de ${days} días.`,
            icon: 'info',
            confirmButtonColor: '#16a34a',
            timer: 2000
          })
          return
        }
        
        // 3. Obtener los cliente_ids afectados
        const clienteIdsAfectados = [...new Set(ventasAEliminar.map(v => v.cliente_id).filter(Boolean))]
        
        // Mostrar progreso
        Swal.fire({
          title: 'Eliminando...',
          text: `Procesando ${ventasAEliminar.length} ventas`,
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading()
          }
        })
        
        // 4. Eliminar pagos asociados primero
        const ventaIds = ventasAEliminar.map(v => v.id)
        await supabase
          .from('pagos')
          .delete()
          .in('venta_id', ventaIds)
        
        // 5. Eliminar las ventas
        let eliminadas = 0
        let errores = 0
        
        for (const venta of ventasAEliminar) {
          try {
            const { error } = await supabase
              .from('ventas')
              .delete()
              .eq('id', venta.id)
            
            if (error) {
              errores++
              console.error(`Error al eliminar venta ${venta.id}:`, error)
            } else {
              eliminadas++
            }
          } catch (err) {
            errores++
            console.error(`Error en venta ${venta.id}:`, err)
          }
        }
        
        // 6. Recalcular deudas de clientes afectados
        for (const clienteId of clienteIdsAfectados) {
          try {
            // Obtener todas las ventas restantes del cliente
            const { data: ventasRestantes } = await supabase
              .from('ventas')
              .select('id, total, estado_pago')
              .eq('cliente_id', clienteId)
            
            if (ventasRestantes && ventasRestantes.length > 0) {
              // Calcular total de compras y pagos
              let totalCompras = 0
              let totalPagado = 0
              
              for (const venta of ventasRestantes) {
                totalCompras += Number(venta.total)
                
                const { data: pagos } = await supabase
                  .from('pagos')
                  .select('monto')
                  .eq('venta_id', venta.id)
                
                totalPagado += (pagos || []).reduce((sum, p) => sum + Number(p.monto), 0)
              }
              
              // Actualizar cliente
              await supabase
                .from('clientes')
                .update({
                  total_compras: totalCompras,
                  total_pagado: totalPagado,
                  deuda_total: totalCompras - totalPagado
                })
                .eq('id', clienteId)
            } else {
              // Si no quedan ventas, poner todo en 0
              await supabase
                .from('clientes')
                .update({
                  total_compras: 0,
                  total_pagado: 0,
                  deuda_total: 0
                })
                .eq('id', clienteId)
            }
          } catch (err) {
            console.error('Error al recalcular deuda:', err)
          }
        }
    
    // 7. Recargar la lista
    await fetchVentas()
    
    // 8. Mostrar resultado
    if (errores === 0) {
      Swal.fire({
        title: '¡Eliminadas!',
        text: `Se eliminaron ${eliminadas} ventas y se actualizaron las deudas.`,
        icon: 'success',
        confirmButtonColor: '#16a34a',
        timer: 2000
      })
    } else {
      Swal.fire({
        title: 'Proceso completado',
        html: `Se eliminaron ${eliminadas} ventas.<br>Errores: ${errores}`,
        icon: 'warning',
        confirmButtonColor: '#f59e0b'
      })
    }
    
  } catch (err) {
    console.error('Error completo:', err)
    Swal.fire({
      title: 'Error',
      text: 'No se pudieron eliminar las ventas: ' + err.message,
      icon: 'error',
      confirmButtonColor: '#dc2626'
    })
  }
}

  const deleteSingleVenta = async (id) => {
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

    if (!result.isConfirmed) return

    try {
      const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 1
      
      // 1. Eliminar detalles primero
      await supabase
        .from('detalle_ventas')
        .delete()
        .eq('venta_id', id)
        .eq('local_id', LOCAL_ID)
      
      // 2. Eliminar la venta
      const { error } = await supabase
        .from('ventas')
        .delete()
        .eq('id', id)
        .eq('local_id', LOCAL_ID)
      
      if (error) throw error
      
      await fetchVentas()
      
      Swal.fire({
        title: '¡Eliminada!',
        text: 'La venta fue eliminada',
        icon: 'success',
        timer: 2000
      })
    } catch (err) {
      console.error('Error:', err)
      Swal.fire({
        title: 'Error',
        text: 'No se pudo eliminar la venta',
        icon: 'error',
        confirmButtonColor: '#dc2626'
      })
    }
  }

  const totalVentas = filteredVentas.reduce((sum, v) => sum + (v.total || 0), 0)

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Historial de Ventas</h2>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="input-lg">
            <option value="all">Todas las ventas</option>
            <option value="today">Hoy</option>
            <option value="week">Últimos 7 días</option>
            <option value="month">Últimos 30 días</option>
          </select>
        </div>

        <div className="flex gap-3">
          <button onClick={exportToCSV} className="btn btn-success">
            <Download className="w-5 h-5" /> Exportar
          </button>
          
          {/* Menú desplegable para limpiar */}
          <div className="relative">
            <button 
              onClick={() => setShowDeleteMenu(!showDeleteMenu)}
              className="btn btn-danger flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" /> 
              Limpiar
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showDeleteMenu && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            <button 
              onClick={() => { deleteOldVentas(1); setShowDeleteMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-red-50 border-b border-gray-100"
            >
              <span className="font-semibold">Más de 1 día</span>
              <p className="text-xs text-gray-500 mt-1">Elimina ventas de ayer o antes</p>
            </button>
            <button 
              onClick={() => { deleteOldVentas(7); setShowDeleteMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-red-50 border-b border-gray-100"
            >
              <span className="font-semibold">Más de 7 días</span>
              <p className="text-xs text-gray-500 mt-1">Elimina ventas de la semana pasada</p>
            </button>
            <button 
              onClick={() => { deleteOldVentas(30); setShowDeleteMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-red-50 border-b border-gray-100"
            >
              <span className="font-semibold">Más de 30 días</span>
              <p className="text-xs text-gray-500 mt-1">Elimina ventas del mes pasado</p>
            </button>
            <button 
              onClick={() => { deleteOldVentas(90); setShowDeleteMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-red-50 border-b border-gray-200"
            >
              <span className="font-semibold">Más de 90 días</span>
              <p className="text-xs text-gray-500 mt-1">Elimina ventas antiguas</p>
            </button>
            
            {/* Opción especial: Borrar TODO incluyendo hoy */}
            <button 
              onClick={() => { deleteOldVentas(0); setShowDeleteMenu(false); }}
              className="block w-full text-left px-4 py-3 text-sm text-red-700 hover:bg-red-100 bg-red-50"
            >
              <span className="font-bold flex items-center gap-1">
                ️ Borrar TODO
              </span>
              <p className="text-xs text-red-600 mt-1 font-medium">Elimina TODAS las ventas (incluyendo hoy)</p>
            </button>
          </div>
        )}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl mb-6">
        <p className="text-lg text-gray-700">Total de ventas en el período:</p>
        <p className="text-3xl font-bold text-blue-700">${totalVentas.toFixed(2)}</p>
        <p className="text-base text-gray-600 mt-1">{filteredVentas.length} transacciones</p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : filteredVentas.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No hay ventas</div>
      ) : (
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {filteredVentas.map(venta => (
            <div key={venta.id} className="border-2 border-gray-200 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <p className="text-lg font-bold">Venta #{venta.id}</p>
                  <p className="text-gray-600">
                    {new Date(venta.fecha).toLocaleString('es-AR')}
                  </p>
                  <p className="text-sm text-gray-500">{venta.detalle?.length || 0} producto(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-700">${Number(venta.total).toFixed(2)}</p>
                  <div className="flex gap-2 mt-2 justify-end">
                    <button onClick={() => deleteSingleVenta(venta.id)} className="btn btn-danger">
                      Eliminar
                    </button>
                    <button onClick={() => { setSelectedVenta(venta); setShowDetail(true); }} className="btn btn-primary">
                      Detalle
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
          
          {/* Botón WhatsApp */}
          {selectedVenta.cliente_telefono && (
            <button
              onClick={() => {
                // Generar mensaje de WhatsApp con el detalle de la venta
                const fecha = new Date(selectedVenta.fecha).toLocaleString('es-AR')
                let mensaje = `*COMPROBANTE DE VENTA* 🧾\n`
                mensaje += `━━━━━━━━━━━━━━━━━━━━\n`
                mensaje += `📅 ${fecha}\n`
                mensaje += ` Venta #${selectedVenta.id}\n`
                mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`
                mensaje += `*PRODUCTOS:*\n`
                
                if (selectedVenta.detalle && selectedVenta.detalle.length > 0) {
                  selectedVenta.detalle.forEach(item => {
                    const subtotal = (item.cantidad * item.precio_unitario).toFixed(2)
                    mensaje += `${item.cantidad}x ${item.productos?.nombre || 'Producto eliminado'}\n`
                    mensaje += `   $${subtotal}\n`
                  })
                }
                
                mensaje += `\n━━━━━━━━━━━━━━━━━━━━\n`
                mensaje += `*TOTAL: $${Number(selectedVenta.total).toFixed(2)}*\n`
                mensaje += `━━━━━━━━━━━━━━━━━━━━\n\n`
                mensaje += `¡Gracias por tu compra! `
                
                const url = `https://wa.me/549${selectedVenta.cliente_telefono}?text=${encodeURIComponent(mensaje)}`
                window.open(url, '_blank')
              }}
              className="btn btn-success w-full mt-3 flex items-center justify-center gap-2"
            >
              📱 Enviar comprobante por WhatsApp
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