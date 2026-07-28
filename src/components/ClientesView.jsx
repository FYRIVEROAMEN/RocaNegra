import { useState, useEffect } from 'react'
import { getClientesConDeuda, getClientes, registrarPagoDeuda, getVentasPendientesCliente, eliminarDeudaCliente } from '../services/api'
import { Search, ChevronDown, ChevronUp, Trash2, Download } from 'lucide-react'
import Swal from 'sweetalert2'

function ClientesView() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedClient, setExpandedClient] = useState(null)
  const [ventasPorCliente, setVentasPorCliente] = useState({})
  
  // 👇 NUEVO: Estado para el filtro (deudores o todos)
  const [filtro, setFiltro] = useState('deudores')

  // 👇 Se ejecuta cuando cambia el filtro o al montar
  useEffect(() => {
    fetchClientes()
  }, [filtro])

  const fetchClientes = async () => {
    setLoading(true)
    try {
      if (filtro === 'deudores') {
        const { data } = await getClientesConDeuda()
        setClientes(data || [])
      } else {
        // Trae TODOS los clientes del local
        const { data } = await getClientes()
        setClientes(data || [])
      }
    } catch (err) {
      console.error('Error:', err)
    }
    setLoading(false)
  }

  const fetchVentasDetalle = async (clienteId) => {
    try {
      const { data } = await getVentasPendientesCliente(clienteId)
      setVentasPorCliente(prev => ({ ...prev, [clienteId]: data || [] }))
    } catch (err) {
      console.error('Error al cargar ventas:', err)
    }
  }

  const toggleExpand = async (clienteId) => {
    if (expandedClient === clienteId) {
      setExpandedClient(null)
    } else {
      setExpandedClient(clienteId)
      await fetchVentasDetalle(clienteId)
    }
  }

  // 👇 Filtrado combinado: por texto Y por tipo de filtro
  const filteredClientes = clientes.filter(c => {
    const matchesSearch = c.nombre?.toLowerCase().includes(search.toLowerCase()) || c.telefono?.includes(search)
    if (filtro === 'deudores') {
      return matchesSearch && Number(c.deuda_total || 0) > 0
    }
    return matchesSearch // Si es 'todos', solo filtra por búsqueda
  })

  const totalDeuda = filteredClientes.reduce((sum, c) => sum + Number(c.deuda_total || 0), 0)

  // 👇 NUEVO: Función para exportar a Excel (CSV)
  const exportarClientesCSV = () => {
    const headers = ['Nombre', 'Teléfono', 'Total Comprado', 'Total Pagado', 'Deuda Actual', 'Estado', 'Última Compra']
    
    const rows = filteredClientes.map(c => {
      const estado = Number(c.deuda_total || 0) > 0 ? 'Con Deuda' : 'Al Día'
      const fecha = c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString('es-AR') : 'Nunca'
      
      return [
        c.nombre || 'Sin nombre',
        c.telefono,
        Number(c.total_compras || 0).toFixed(2),
        Number(c.total_pagado || 0).toFixed(2),
        Number(c.deuda_total || 0).toFixed(2),
        estado,
        fecha
      ].map(cell => `"${cell}"`).join(',') // Envuelve cada celda en comillas para evitar errores con comas en nombres
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }) // \uFEFF es para que Excel lea bien los acentos
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `clientes_${filtro}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const handleRegistrarPago = (cliente) => {
    Swal.fire({
      title: `Registrar Pago - ${cliente.nombre || cliente.telefono}`,
      html: `
        <p style="margin-bottom: 10px;">Deuda actual: <strong style="color: #dc2626; font-size: 1.2rem;">$${Number(cliente.deuda_total).toFixed(2)}</strong></p>
        <input id="monto-pago" type="number" placeholder="Monto a pagar" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px; margin-bottom: 10px;" />
        <input id="nota-pago" type="text" placeholder="Nota (opcional)" style="width: 100%; padding: 12px; border: 2px solid #d1d5db; border-radius: 8px;" />
      `,
      showCancelButton: true,
      confirmButtonText: '💵 Registrar Pago',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280',
      preConfirm: () => {
        const monto = document.getElementById('monto-pago').value
        const nota = document.getElementById('nota-pago').value
        if (!monto || monto <= 0) {
          Swal.showValidationMessage('Ingresá un monto válido')
          return false
        }
        if (monto > cliente.deuda_total) {
          Swal.showValidationMessage('El monto no puede superar la deuda')
          return false
        }
        return { monto: Number(monto), nota }
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 1
          await registrarPagoDeuda(cliente.id, result.value.monto, LOCAL_ID, result.value.nota)
          Swal.fire({ title: '¡Pago registrado!', text: `Se registró un pago de $${result.value.monto.toFixed(2)}`, icon: 'success', timer: 2000 })
          fetchClientes()
          if (expandedClient === cliente.id) fetchVentasDetalle(cliente.id)
        } catch (err) {
          Swal.fire('Error', err.message, 'error')
        }
      }
    })
  }

  const handleWhatsApp = (cliente) => {
    const mensaje = `Hola ${cliente.nombre || ''}, te recordamos que tenés una deuda pendiente de $${Number(cliente.deuda_total).toFixed(2)}. ¿Podrías acercarte a saldarla? ¡Gracias!`
    const url = `https://wa.me/549${cliente.telefono}?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank')
  }

  const handleEliminarDeuda = (cliente) => {
    Swal.fire({
      title: '⚠️ ¿Eliminar deuda?',
      html: `
        <p style="margin-bottom: 10px;">Se eliminará <strong>TODA</strong> la deuda de <strong>${cliente.nombre || cliente.telefono}</strong></p>
        <p style="color: #dc2626; font-size: 1.1rem; font-weight: bold;">$${Number(cliente.deuda_total).toFixed(2)}</p>
        <p style="color: #6b7280; font-size: 0.9rem; margin-top: 15px;">Esta acción no se puede deshacer. Usá esto solo para deudas huérfanas o condonadas.</p>
      `,
      showCancelButton: true,
      confirmButtonText: '⚠️ Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      icon: 'warning'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await eliminarDeudaCliente(cliente.id)
          Swal.fire({ title: '✅ Deuda eliminada', text: `Se eliminó la deuda de $${Number(cliente.deuda_total).toFixed(2)}`, icon: 'success', timer: 2000 })
          fetchClientes()
          setExpandedClient(null)
        } catch (err) {
          Swal.fire('Error', err.message, 'error')
        }
      }
    })
  }

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-gray-200 max-w-5xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">👥 Gestión de Clientes</h2>

      {/* 👇 NUEVO: Controles de Filtro y Exportación */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setFiltro('deudores')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-semibold transition ${
              filtro === 'deudores' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ⚠️ Solo Deudores
          </button>
          <button
            onClick={() => setFiltro('todos')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-semibold transition ${
              filtro === 'todos' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            👥 Todos los Clientes
          </button>
        </div>
        
        <button onClick={exportarClientesCSV} className="btn btn-success flex items-center justify-center gap-2 w-full sm:w-auto">
          <Download className="w-4 h-4" /> Exportar Excel
        </button>
      </div>

      {/* Buscador */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Resumen dinámico */}
      <div className={`p-4 rounded-xl mb-6 border-2 ${filtro === 'deudores' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
        <p className="text-lg text-gray-700">
          {filtro === 'deudores' ? 'Deuda total pendiente:' : 'Total de clientes registrados:'}
        </p>
        <p className={`text-3xl font-bold ${filtro === 'deudores' ? 'text-red-700' : 'text-blue-700'}`}>
          {filtro === 'deudores' ? `$${totalDeuda.toFixed(2)}` : filteredClientes.length}
        </p>
        <p className="text-base text-gray-600 mt-1">
          {filteredClientes.length} cliente(s) en esta vista
        </p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando...</div>
      ) : filteredClientes.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-xl">✅ {filtro === 'deudores' ? 'No hay clientes con deuda' : 'No hay clientes registrados'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClientes.map(cliente => (
            <div key={cliente.id} className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <div className="p-4 bg-gray-50">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <p className="text-lg font-bold text-gray-800">{cliente.nombre || 'Sin nombre'}</p>
                    <p className="text-sm text-gray-600">📱 {cliente.telefono}</p>
                    <p className="text-xs text-gray-500">
                      Última compra: {cliente.ultima_compra ? new Date(cliente.ultima_compra).toLocaleDateString('es-AR') : 'Nunca'}
                    </p>
                  </div>
                  <div className="text-right">
                    {Number(cliente.deuda_total || 0) > 0 ? (
                      <>
                        <p className="text-2xl font-bold text-red-700">${Number(cliente.deuda_total).toFixed(2)}</p>
                        <p className="text-xs text-red-600">pendiente</p>
                      </>
                    ) : (
                      <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">
                        ✅ Al día
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {Number(cliente.deuda_total || 0) > 0 && (
                    <>
                      <button onClick={() => handleRegistrarPago(cliente)} className="btn btn-success flex-1">💵 Pagar</button>
                      <button onClick={() => handleWhatsApp(cliente)} className="btn btn-primary flex-1">📱 WhatsApp</button>
                      <button onClick={() => handleEliminarDeuda(cliente)} className="btn btn-danger" title="Condonar deuda">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => toggleExpand(cliente.id)}
                    className="btn btn-secondary flex-1"
                    title={expandedClient === cliente.id ? 'Contraer' : 'Expandir'}
                  >
                    {expandedClient === cliente.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    <span className="ml-1 hidden sm:inline">{expandedClient === cliente.id ? 'Ocultar' : 'Detalle'}</span>
                  </button>
                </div>
              </div>

              {/* Detalle de ventas pendientes (expandible) */}
              {expandedClient === cliente.id && (
                <div className="p-4 border-t border-gray-200 bg-white">
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">📋 Historial de compras pendientes:</h4>
                  
                  {ventasPorCliente[cliente.id]?.length > 0 ? (
                    <div className="space-y-3">
                      {ventasPorCliente[cliente.id].map((venta) => (
                        <div key={venta.id} className="border-2 border-gray-200 rounded-lg overflow-hidden">
                          <div className="p-3 bg-gray-50 flex justify-between items-center">
                            <div>
                              <p className="font-bold text-gray-800">Venta #{venta.id}</p>
                              <p className="text-xs text-gray-500">{new Date(venta.fecha).toLocaleString('es-AR')}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-600">Total:</p>
                              <p className="text-lg font-bold text-gray-800">${Number(venta.total).toFixed(2)}</p>
                            </div>
                          </div>
                          
                          {venta.productos.length > 0 && (
                            <div className="p-3 bg-gray-100 border-t border-gray-200">
                              <p className="text-xs font-semibold text-gray-600 mb-2">📦 Productos:</p>
                              <div className="space-y-1">
                                {venta.productos.map((prod, idx) => (
                                  <p key={idx} className="text-xs text-gray-700 flex justify-between items-center">
                                    <span className="flex-1">
                                      {prod.cantidad}x {prod.productos?.nombre || 'Producto eliminado'}
                                      {prod.productos?.talle && ` - Talle ${prod.productos.talle}`}
                                      {prod.productos?.color && ` - ${prod.productos.color}`}
                                    </span>
                                    <span className="text-gray-600 font-medium">${Number(prod.precio_unitario * prod.cantidad).toFixed(2)}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {venta.pagos.length > 0 && (
                            <div className="p-3 bg-green-50 border-t border-green-200">
                              {venta.pagos.length === 1 ? (
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="text-xs font-semibold text-green-700">✅ Pagado:</p>
                                    <p className="text-xs text-green-700">
                                      {new Date(venta.pagos[0].fecha).toLocaleDateString('es-AR')}
                                      {venta.pagos[0].nota && ` - ${venta.pagos[0].nota}`}
                                    </p>
                                  </div>
                                  <p className="font-bold text-green-700">${Number(venta.pagos[0].monto).toFixed(2)}</p>
                                </div>
                              ) : (
                                <div>
                                  <p className="text-xs font-semibold text-green-700 mb-2">✅ Pagos realizados:</p>
                                  {venta.pagos.map((pago, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm mb-1">
                                      <span className="text-green-700">
                                        {new Date(pago.fecha).toLocaleDateString('es-AR')}
                                        {pago.nota && ` - ${pago.nota}`}
                                      </span>
                                      <span className="font-bold text-green-700">${Number(pago.monto).toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="mt-2 pt-2 border-t border-green-300 flex justify-between">
                                    <span className="font-semibold text-green-800">Total pagado:</span>
                                    <span className="font-bold text-green-700">${venta.total_pagado.toFixed(2)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="p-3 bg-red-50 border-t border-red-200 flex justify-between items-center">
                            <div>
                              <span className="font-semibold text-red-800">⚠️ Pendiente:</span>
                              <p className="text-xs text-red-600 mt-1">Resta pagar de ${Number(venta.total).toFixed(2)}</p>
                            </div>
                            <span className="text-xl font-bold text-red-700">${venta.pendiente.toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-green-700">✅ Este cliente no tiene compras pendientes</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ClientesView