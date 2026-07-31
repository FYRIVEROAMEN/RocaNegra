import { useState, useEffect } from 'react'
import { Download, TrendingUp, Package, Users, AlertTriangle, ShoppingCart, DollarSign, ArrowRight, Tag } from 'lucide-react'
import { getVentas, getProductosActivos, getClientesConDeuda } from '../services/api'
import Swal from 'sweetalert2'

function MetricsView({ onNavigate }) {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    ventasMes: 0,
    ticketPromedio: 0,
    valorInventario: 0,
    deudaTotal: 0,
    totalVentas: 0,
    totalDescuentos: 0, // ✅ NUEVO: Total de descuentos aplicados
    topProductos: [],
    topClientes: [],
    stockBajo: []
  })

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      // 1. Obtener ventas
      const { data: ventasData } = await getVentas()
      const ventas = ventasData || []
      
      // 2. Obtener productos
      const { data: productosData } = await getProductosActivos()
      const productos = productosData || []
      
      // 3. Obtener deuda total
      const { data: deudaData } = await getClientesConDeuda()
      const deudaTotal = (deudaData || []).reduce((sum, c) => sum + Number(c.deuda_total || 0), 0)
      
      // 4. Calcular métricas del mes actual
      const ahora = new Date()
      const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      
      const ventasDelMes = ventas.filter(v => {
        const fechaVenta = new Date(v.fecha)
        return fechaVenta >= primerDiaMes
      })
      
      // ✅ USAR total_neto en lugar de total
      const totalVentasMes = ventasDelMes.reduce((sum, v) => sum + Number(v.total_neto || v.total_bruto || 0), 0)
      
      // ✅ NUEVO: Calcular total de descuentos
      const totalDescuentos = ventasDelMes.reduce((sum, v) => sum + Number(v.descuento_monto || 0), 0)
      
      const ticketPromedio = ventasDelMes.length > 0 ? totalVentasMes / ventasDelMes.length : 0
      
      // 5. Calcular valor del inventario
      const valorInventario = productos.reduce((sum, p) => 
        sum + (Number(p.precio || 0) * Number(p.stock || 0)), 0
      )
      
      // 6. Top 5 productos más vendidos
      const ventasPorProducto = {}
      ventasDelMes.forEach(venta => {
        if (venta.detalle_ventas) {
          venta.detalle_ventas.forEach(detalle => {
            const nombre = detalle.productos?.nombre || 'Producto eliminado'
            if (!ventasPorProducto[nombre]) {
              ventasPorProducto[nombre] = { cantidad: 0, total: 0 }
            }
            ventasPorProducto[nombre].cantidad += detalle.cantidad
            ventasPorProducto[nombre].total += Number(detalle.precio_unitario * detalle.cantidad)
          })
        }
      })
      
      const topProductos = Object.entries(ventasPorProducto)
        .map(([nombre, datos]) => ({ nombre, ...datos }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5)
      
      // 7. Top 5 clientes
      const ventasPorCliente = {}
      ventasDelMes.forEach(venta => {
        if (venta.cliente_id) {
          const clienteNombre = venta.clientes?.nombre || `Cliente ${venta.clientes?.telefono || 'Anónimo'}`
          if (!ventasPorCliente[clienteNombre]) {
            ventasPorCliente[clienteNombre] = { cantidad: 0, total: 0 }
          }
          // ✅ USAR total_neto
          ventasPorCliente[clienteNombre].cantidad += 1
          ventasPorCliente[clienteNombre].total += Number(venta.total_neto || venta.total_bruto || 0)
        }
      })
      
      const topClientes = Object.entries(ventasPorCliente)
        .map(([nombre, datos]) => ({ nombre, ...datos }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
      
      // 8. Productos con stock bajo (≤5)
      const stockBajo = productos
        .filter(p => p.stock <= 5)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 5)
      
      setMetrics({
        ventasMes: totalVentasMes,
        ticketPromedio,
        valorInventario,
        deudaTotal,
        totalDescuentos, // ✅ NUEVO
        totalVentas: ventasDelMes.length,
        topProductos,
        topClientes,
        stockBajo
      })
      
    } catch (err) {
      console.error('Error al cargar métricas:', err)
    }
    setLoading(false)
  }

  const exportarVentasCSV = () => {
    Swal.fire({
      title: 'Exportar Ventas',
      text: 'Función disponible en la versión Pro',
      icon: 'info',
      confirmButtonColor: '#3b82f6',
      timer: 2000
    })
  }

  const exportarInventarioCSV = () => {
    Swal.fire({
      title: 'Exportar Inventario',
      text: 'Función disponible en la versión Pro',
      icon: 'info',
      confirmButtonColor: '#3b82f6',
      timer: 2000
    })
  }

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center min-h-[50vh] flex items-center justify-center">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto"></div>
          <div className="h-32 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm border border-gray-200 max-w-7xl mx-auto">
      <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 flex items-center gap-3">
        Métricas y Estadísticas
      </h2>

      {/* KPIs Principales - AHORA SON BOTONES CLICKEABLES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        
        {/* Card 1: Ventas del Mes -> Historial */}
        <button
          onClick={() => onNavigate('history')}
          className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border border-blue-200 text-left hover:shadow-md transition-all duration-200 active:scale-95 cursor-pointer group w-full"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-blue-700 font-medium">Ventas del Mes</p>
            <div className="flex items-center gap-1 text-blue-600 group-hover:translate-x-1 transition-transform">
              <DollarSign className="w-5 h-5" />
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-900">${metrics.ventasMes.toFixed(2)}</p>
          <p className="text-xs text-blue-600 mt-1">{metrics.totalVentas} transacciones</p>
        </button>

        {/* Card 2: Ticket Promedio -> Historial */}
        <button
          onClick={() => onNavigate('history')}
          className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200 text-left hover:shadow-md transition-all duration-200 active:scale-95 cursor-pointer group w-full"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-green-700 font-medium">Ticket Promedio</p>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-green-900">${metrics.ticketPromedio.toFixed(2)}</p>
          <p className="text-xs text-green-600 mt-1">por venta</p>
        </button>

        {/* Card 3: Valor Inventario -> Dashboard (Inventario) */}
        <button
          onClick={() => onNavigate('dashboard')}
          className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border border-purple-200 text-left hover:shadow-md transition-all duration-200 active:scale-95 cursor-pointer group w-full"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-purple-700 font-medium">Valor Inventario</p>
            <div className="flex items-center gap-1 text-purple-600 group-hover:translate-x-1 transition-transform">
              <Package className="w-5 h-5" />
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <p className="text-3xl font-bold text-purple-900">${metrics.valorInventario.toFixed(2)}</p>
          <p className="text-xs text-purple-600 mt-1">en stock</p>
        </button>

        {/* Card 4: Deuda Pendiente -> Clientes */}
        <button
          onClick={() => onNavigate('clientes')}
          className="bg-gradient-to-br from-red-50 to-red-100 p-5 rounded-xl border border-red-200 text-left hover:shadow-md transition-all duration-200 active:scale-95 cursor-pointer group w-full"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-red-700 font-medium">Deuda Pendiente</p>
            <div className="flex items-center gap-1 text-red-600 group-hover:translate-x-1 transition-transform">
              <AlertTriangle className="w-5 h-5" />
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-900">${metrics.deudaTotal.toFixed(2)}</p>
          <p className="text-xs text-red-600 mt-1">por cobrar (Ver Clientes)</p>
        </button>

        {/* ✅ NUEVA Card 5: Descuentos Otorgados */}
        <div className="bg-gradient-to-br from-pink-50 to-pink-100 p-5 rounded-xl border border-pink-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-pink-700 font-medium">Descuentos Otorgados</p>
            <Tag className="w-5 h-5 text-pink-600" />
          </div>
          <p className="text-3xl font-bold text-pink-900">${metrics.totalDescuentos.toFixed(2)}</p>
          <p className="text-xs text-pink-600 mt-1">en promociones este mes</p>
        </div>

        {/* Card 6: Resumen del Mes */}
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl border border-orange-200 sm:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-orange-700 font-medium">Resumen del Mes</p>
            <ShoppingCart className="w-5 h-5 text-orange-600" />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-900">{metrics.totalVentas}</p>
              <p className="text-xs text-orange-600">Ventas</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-900">{metrics.topProductos.length}</p>
              <p className="text-xs text-orange-600">Productos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-900">{metrics.topClientes.length}</p>
              <p className="text-xs text-orange-600">Clientes</p>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ SECCIÓN ELIMINADA: Ventas por Día (Gráfico de barras) */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Productos */}
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-4">Top 5 Productos Más Vendidos</h3>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
            {metrics.topProductos.length > 0 ? (
              metrics.topProductos.map((prod, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-gray-300">#{idx + 1}</span>
                    <div>
                      <p className="font-semibold text-gray-800">{prod.nombre}</p>
                      <p className="text-xs text-gray-600">{prod.cantidad} unidades</p>
                    </div>
                  </div>
                  <p className="font-bold text-green-700">${prod.total.toFixed(2)}</p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No hay ventas este mes</p>
            )}
          </div>
        </div>

        {/* Top Clientes */}
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-4">Top 5 Clientes</h3>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
            {metrics.topClientes.length > 0 ? (
              metrics.topClientes.map((cliente, idx) => (
                <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {cliente.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{cliente.nombre}</p>
                      <p className="text-xs text-gray-600">{cliente.cantidad} compras</p>
                    </div>
                  </div>
                  <p className="font-bold text-blue-700">${cliente.total.toFixed(2)}</p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No hay clientes registrados</p>
            )}
          </div>
        </div>
      </div>

      {/* Productos con Stock Bajo */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-800">Productos con Stock Bajo</h3>
          <button 
            onClick={() => onNavigate('dashboard')}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            Ver todo <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-red-50 p-4 rounded-xl border border-red-200">
          {metrics.stockBajo.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {metrics.stockBajo.map((prod, idx) => (
                <div key={idx} className="bg-white p-3 rounded-lg border border-red-200 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{prod.nombre}</p>
                    <p className="text-xs text-gray-600">{prod.categoria || 'Sin categoría'}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    prod.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {prod.stock === 0 ? 'Agotado' : `${prod.stock} uds`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-green-700 py-4 font-medium">Todo el stock está en orden</p>
          )}
        </div>
      </div>

      {/* Botones de Exportación */}
      <div className="mt-8 flex flex-wrap gap-3 pb-8">
        <button onClick={exportarVentasCSV} className="btn btn-success flex items-center gap-2">
          <Download className="w-5 h-5" /> Exportar Ventas
        </button>
        <button onClick={exportarInventarioCSV} className="btn btn-primary flex items-center gap-2">
          <Download className="w-5 h-5" /> Exportar Inventario
        </button>
      </div>
    </div>
  )
}

export default MetricsView