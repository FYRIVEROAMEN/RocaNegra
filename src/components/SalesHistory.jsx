import { useState, useEffect } from 'react'
import { Download, Trash2, Filter } from 'lucide-react'
import { getVentas, deleteVenta } from '../services/api'
import Swal from 'sweetalert2'

function SalesHistory() {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterPeriod, setFilterPeriod] = useState('all')
  const [selectedVenta, setSelectedVenta] = useState(null)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    fetchVentas()
  }, [])

  const fetchVentas = async () => {
    setLoading(true)
    try {
      // ✅ Usa getVentas() del api.js que YA filtra por local_id
      const response = await getVentas()
      const ventasData = response.data || []
      
      // Adaptamos la estructura (detalle_ventas → detalle)
      const ventasAdaptadas = ventasData.map(venta => ({
        ...venta,
        detalle: venta.detalle_ventas || []
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
      html: `Se eliminarán todas las ventas de hace más de <strong>${days} días</strong>.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (!result.isConfirmed) return

    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      
      const ventasAEliminar = ventas.filter(v => {
        const ventaDate = new Date(v.fecha)
        return ventaDate < cutoffDate
      })

      for (const venta of ventasAEliminar) {
        await deleteVenta(venta.id)
      }

      await fetchVentas()
      
      Swal.fire({
        title: '¡Éxito!',
        text: `Se eliminaron ${ventasAEliminar.length} ventas`,
        icon: 'success',
        timer: 2000
      })
    } catch (err) {
      console.error('Error:', err)
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
      await deleteVenta(id)
      await fetchVentas()
      
      Swal.fire({
        title: '¡Eliminada!',
        text: 'La venta fue eliminada',
        icon: 'success',
        timer: 2000
      })
    } catch (err) {
      console.error('Error:', err)
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
          <button onClick={() => deleteOldVentas(90)} className="btn btn-danger">
            <Trash2 className="w-5 h-5" /> Limpiar (&gt;90d)
          </button>
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
            
            <div className="space-y-2">
              {selectedVenta.detalle?.map((item, idx) => (
                <div key={idx} className="border p-4 rounded-lg">
                  <p className="font-bold">{item.productos?.nombre || 'Eliminado'}</p>
                  <p className="text-sm">{item.cantidad} x ${item.precio_unitario}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SalesHistory