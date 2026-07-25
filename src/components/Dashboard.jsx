import { useState, useEffect, useCallback } from 'react'
import { Package, Plus, Edit2, Trash2, LogOut, Search, AlertTriangle, ShoppingCart, BarChart3, RotateCcw } from 'lucide-react'
import { getProductosActivos, deactivateProducto, reactivateProducto, getProductosInactivos } from '../services/api'
import ProductForm from './ProductForm'
import SalesForm from './SalesForm'
import SalesHistory from './SalesHistory'
import Tutorial from './Tutorial'
import Swal from 'sweetalert2'

function Dashboard({ onLogout }) {
  const [productos, setProductos] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState('dashboard')
  const [showInactive, setShowInactive] = useState(false)
  const [productosInactivos, setProductosInactivos] = useState([])
  const [showTutorial, setShowTutorial] = useState(false)
  const [addedToCart, setAddedToCart] = useState(null) // ID del producto recién agregado
  
  // 👇 CARRITO PERSISTENTE (vive en el Dashboard)
  const [cart, setCart] = useState([])

  const fetchProductos = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getProductosActivos()
      if (data) setProductos(data)
    } catch (err) {
      console.error('Error al cargar productos:', err)
    }
    setLoading(false)
  }, [])

  const fetchProductosInactivos = useCallback(async () => {
    try {
      const { data } = await getProductosInactivos()
      if (data) setProductosInactivos(data)
    } catch (err) {
      console.error('Error al cargar inactivos:', err)
    }
  }, [])

  useEffect(() => { 
    fetchProductos()
    const tutorialSeen = localStorage.getItem('tutorial_completed')
    if (!tutorialSeen) {
      setTimeout(() => setShowTutorial(true), 500)
    }
  }, [fetchProductos])

  const handleDelete = async (id) => {
    if (window.confirm('¿Desactivar este producto?\n\nNo se borrará de la base de datos para no romper el historial de ventas, pero dejará de aparecer en el inventario.')) {
      try {
        await deactivateProducto(id)
        fetchProductos()
      } catch (err) {
        alert('Error al desactivar: ' + (err.response?.data?.message || err.message))
      }
    }
  }

  const handleReactivar = async (id) => {
    try {
      await reactivateProducto(id)
      fetchProductosInactivos()
      fetchProductos()
    } catch (err) {
      alert('Error al reactivar: ' + (err.response?.data?.message || err.message))
    }
  }

  
  // 👇 FUNCIÓN PARA AGREGAR AL CARRITO (desde cualquier parte)
const addToCartFromDashboard = (product) => {
  setCart(prevCart => {
    const existingItem = prevCart.find(item => item.id === product.id)
    let newCart
    
    if (existingItem) {
      if (existingItem.quantity + 1 > product.stock) {
        Swal.fire({
          title: 'Stock insuficiente',
          text: `Solo quedan ${product.stock} unidades de ${product.nombre}.`,
          icon: 'warning',
          confirmButtonColor: '#dc2626',
          timer: 2000,
          showConfirmButton: false
        })
        return prevCart
      }
      newCart = prevCart.map(item => 
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      )
    } else {
      newCart = [...prevCart, { ...product, quantity: 1 }]
    }
    
    // 👇 Feedback visual: mostrar notificación
    Swal.fire({
      title: '¡Agregado al carrito!',
      text: `${product.nombre} (${newCart.reduce((sum, item) => item.id === product.id ? item.quantity : sum, 0)} en total)`,
      icon: 'success',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true
    })
    
    return newCart
  })
  
  // 👇 ELIMINAMOS: setCurrentView('sales')
  // El usuario se queda en Inventario para seguir seleccionando
}

  const filteredProductos = productos.filter(p =>
    p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(search.toLowerCase()) ||
    p.color?.toLowerCase().includes(search.toLowerCase())
  )

  const stockBajo = productos.filter(p => p.stock <= 5).length
  const totalProductos = productos.length
  const totalStock = productos.reduce((acc, p) => acc + (p.stock || 0), 0)

  return (
    <div className="min-h-screen pb-32 md:pb-8">
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="w-7 h-7 md:w-8 md:h-8 text-blue-600" /> Stock Mercadería
          </h1>
          <button onClick={onLogout} className="btn btn-secondary touch-target">
            <LogOut className="w-5 h-5" /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Navegación Desktop */}
        <div className="top-tabs">
          <button onClick={() => setCurrentView('dashboard')} className={`tab-btn ${currentView === 'dashboard' ? 'active' : ''}`}>
            <Package className="w-6 h-6" /> Inventario
          </button>
          <button onClick={() => setCurrentView('sales')} className={`tab-btn ${currentView === 'sales' ? 'active' : ''}`}>
            <ShoppingCart className="w-6 h-6" /> Registrar Venta
            {cart.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">{cart.length}</span>
            )}
          </button>
          <button onClick={() => setCurrentView('history')} className={`tab-btn ${currentView === 'history' ? 'active' : ''}`}>
            <BarChart3 className="w-6 h-6" /> Historial
          </button>
        </div>

        {currentView === 'dashboard' ? (
          <>
            {/* Stats: carrusel horizontal en mobile, grid en desktop */}
            <div className="mb-6">
              <div className="sm:hidden flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
                <div className="snap-center shrink-0 w-[70%] bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-2xl border border-indigo-200">
                  <p className="text-sm text-indigo-700 font-medium">Total Items</p>
                  <p className="text-3xl font-bold text-indigo-900 mt-1">{totalProductos}</p>
                </div>
                <div className="snap-center shrink-0 w-[70%] bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-2xl border border-blue-200">
                  <p className="text-sm text-blue-700 font-medium">Stock Total</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">{totalStock}</p>
                </div>
                <div className={`snap-center shrink-0 w-[70%] p-4 rounded-2xl border ${
                  stockBajo > 0 
                    ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200' 
                    : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
                }`}>
                  <p className={`text-sm font-medium flex items-center gap-1 ${
                    stockBajo > 0 ? 'text-red-700' : 'text-green-700'
                  }`}>
                    <AlertTriangle className="w-4 h-4" /> Stock Bajo
                  </p>
                  <p className={`text-3xl font-bold mt-1 ${
                    stockBajo > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>{stockBajo}</p>
                  
                  {stockBajo > 0 && (
                    <div className="mt-2 pt-2 border-t border-red-200">
                      {productos
                        .filter(p => p.stock <= 5 && p.stock > 0)
                        .slice(0, 3)
                        .map(p => (
                          <div key={p.id} className="text-xs text-red-700 truncate">
                            • {p.nombre}: <strong>{p.stock}</strong>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden sm:grid sm:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-lg text-gray-600 font-medium">Total Productos</p>
                  <p className="text-4xl font-bold text-gray-800 mt-2">{totalProductos}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-lg text-gray-600 font-medium">Stock Total</p>
                  <p className="text-4xl font-bold text-blue-600 mt-2">{totalStock}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <p className="text-lg text-gray-600 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-red-500" /> Stock Bajo (≤5)
                  </p>
                  <p className={`text-4xl font-bold mt-2 ${stockBajo > 0 ? 'text-red-600' : 'text-green-600'}`}>{stockBajo}</p>
                  
                  {stockBajo > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Productos en riesgo:</p>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {productos
                          .filter(p => p.stock <= 5 && p.stock > 0)
                          .map(p => (
                            <div key={p.id} className="flex justify-between items-center text-sm">
                              <span className="text-gray-600 truncate">{p.nombre}</span>
                              <span className={`font-bold ${p.stock <= 2 ? 'text-red-600' : 'text-orange-600'}`}>
                                {p.stock} {p.stock === 1 ? 'unidad' : 'unidades'}
                              </span>
                            </div>
                          ))}
                        {productos.filter(p => p.stock === 0).length > 0 && (
                          <div className="text-sm text-red-600 font-bold mt-2">
                            ⚠️ {productos.filter(p => p.stock === 0).length} producto(s) agotado(s)
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" id="search-input" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, categoría o color..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => { setShowForm(true); setEditId(null); }}
                className="btn btn-primary w-full sm:w-auto"
                id="add-product-btn"
              >
                <Plus className="w-6 h-6" /> Agregar Producto
              </button>
            </div>

            {/* VISTA MOBILE: Cards con IMAGEN y botón VENDER */}
            <div className="product-cards-mobile">
              {loading ? <div className="loading-state">Cargando productos...</div> : 
                filteredProductos.length === 0 ? (
                  <div className="empty-state">{search ? 'No se encontraron productos.' : 'No hay productos. ¡Agrega el primero!'}</div>
                ) : (
                  filteredProductos.map((p) => (
                    <div key={p.id} className="product-card">
                      {p.imagen_url ? (
                        <div style={{ marginBottom: '12px', borderRadius: '12px', overflow: 'hidden', background: '#f3f4f6' }}>
                          <img 
                            src={p.imagen_url} 
                            alt={p.nombre}
                            style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                      ) : (
                        <div style={{ marginBottom: '12px', borderRadius: '12px', overflow: 'hidden', background: '#f3f4f6', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                          <Package className="w-12 h-12" />
                        </div>
                      )}

                      <div className="product-card-header">
                        <div>
                          <h3 className="product-card-title">{p.nombre}</h3>
                          <p className="product-card-meta">{p.categoria || 'Sin categoría'}</p>
                        </div>
                        <span className={`stock-badge ${p.stock <= 5 ? 'stock-low' : 'stock-ok'}`}>
                          Stock: {p.stock}
                        </span>
                      </div>
                      <div className="product-card-details">
                        <div className="detail-item">Talle: <span>{p.talle || '-'}</span></div>
                        <div className="detail-item">Color: <span>{p.color || '-'}</span></div>
                      </div>
                      <div className="product-card-footer">
                        <div className="product-price">${Number(p.precio).toFixed(2)}</div>
                        <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
                          {/* 👇 Botón Vender Rápido - Ahora agrega al carrito persistente */}
                          <button 
                            onClick={() => {
                              addToCartFromDashboard(p)
                              setAddedToCart(p.id)
                              setTimeout(() => setAddedToCart(null), 2000) // Mostrar por 2 segundos
                            }} 
                            className="btn btn-success touch-target" 
                            style={{ 
                              flex: 1,
                              position: 'relative',
                              background: addedToCart === p.id ? '#16a34a' : '#22c55e'
                            }}
                            disabled={p.stock <= 0}
                          >
                            <ShoppingCart size={18} /> 
                            {addedToCart === p.id ? '✓ Agregado' : 'Vender'}
                          </button>
                          <button onClick={() => { setShowForm(true); setEditId(p.id); }} className="btn btn-secondary touch-target" style={{ flex: 1 }}>
                            <Edit2 size={18} /> Editar
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="btn btn-danger touch-target" style={{ flex: 1 }}>
                            <Trash2 size={18} /> Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )
              }
            </div>

            {/* VISTA DESKTOP: Tabla con IMAGEN */}
            <div className="product-table-desktop bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
              {loading ? <div className="loading-state">Cargando productos...</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max">
                    <thead className="bg-gray-100 border-b-2 border-gray-200">
                      <tr>
                        <th className="px-6 py-4 text-left text-base font-bold text-gray-700 uppercase">Imagen</th>
                        {['Nombre', 'Categoría', 'Talle', 'Color', 'Precio', 'Stock', 'Acciones'].map(h => (
                          <th key={h} className="px-6 py-4 text-left text-base font-bold text-gray-700 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredProductos.map((p) => (
                        <tr key={p.id} className="hover:bg-blue-50 transition">
                          <td className="px-6 py-4">
                            {p.imagen_url ? (
                              <img 
                                src={p.imagen_url} 
                                alt={p.nombre}
                                style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px' }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div style={{ width: '50px', height: '50px', background: '#f3f4f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Package className="w-6 h-6 text-gray-400" />
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-900 text-lg">{p.nombre}</td>
                          <td className="px-6 py-4 text-gray-700 text-lg">{p.categoria || '-'}</td>
                          <td className="px-6 py-4 text-gray-700 text-lg">{p.talle || '-'}</td>
                          <td className="px-6 py-4 text-gray-700 text-lg">{p.color || '-'}</td>
                          <td className="px-6 py-4 text-gray-900 font-bold text-lg">${Number(p.precio).toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <span className={`stock-badge ${p.stock <= 5 ? 'stock-low' : 'stock-ok'}`}>{p.stock}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 justify-end">
                              {/* 👇 Botón Vender (solo desktop) */}
                              <button 
                                onClick={() => {
                                  addToCartFromDashboard(p)
                                  setAddedToCart(p.id)
                                  setTimeout(() => setAddedToCart(null), 2000)
                                }} 
                                className="btn btn-success touch-target"
                                disabled={p.stock <= 0}
                                title="Agregar al carrito"
                              >
                                <ShoppingCart className="w-4 h-4" />
                              </button>
                              
                              <button 
                                onClick={() => { setShowForm(true); setEditId(p.id); }} 
                                className="btn btn-secondary touch-target"
                                title="Editar producto"
                              >
                                <Edit2 className="w-5 h-5" />
                              </button>
                              
                              <button 
                                onClick={() => handleDelete(p.id)} 
                                className="btn btn-danger touch-target"
                                title="Eliminar producto"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredProductos.length === 0 && (
                        <tr><td colSpan="8" className="px-6 py-12 text-center text-gray-500 text-xl">No se encontraron productos.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="text-center mt-8">
              <button onClick={() => { setShowInactive(!showInactive); if (!showInactive) fetchProductosInactivos(); }} className="btn btn-secondary">
                {showInactive ? 'Ocultar productos desactivados' : 'Ver productos desactivados'}
              </button>
            </div>

            {showInactive && (
              <div className="bg-gray-100 rounded-xl shadow-sm border border-gray-300 overflow-hidden mt-6">
                <div className="p-4 bg-gray-200 border-b border-gray-300">
                  <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2"><RotateCcw className="w-5 h-5" /> Productos Desactivados</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-bold text-gray-600 uppercase">Nombre</th>
                        <th className="px-6 py-3 text-left text-sm font-bold text-gray-600 uppercase">Categoría</th>
                        <th className="px-6 py-3 text-right text-sm font-bold text-gray-600 uppercase">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-300">
                      {productosInactivos.map((p) => (
                        <tr key={p.id} className="bg-gray-50">
                          <td className="px-6 py-3 text-gray-500 text-base">{p.nombre}</td>
                          <td className="px-6 py-3 text-gray-500 text-base">{p.categoria || '-'}</td>
                          <td className="px-6 py-3 text-right">
                            <button onClick={() => handleReactivar(p.id)} className="btn btn-success touch-target" style={{ minWidth: 'auto', padding: '0 12px' }}>
                              <RotateCcw className="w-4 h-4" /> Reactivar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : currentView === 'sales' ? (
          // 👇 Pasamos el carrito y la función para limpiarlo
          <SalesForm 
            onSaleRecorded={fetchProductos} 
            productos={productos}
            cart={cart}
            setCart={setCart}
          />
        ) : (
          <SalesHistory />
        )}
      </main>

      <nav id="bottom-nav" className="bottom-nav">
        <button onClick={() => setCurrentView('dashboard')} className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}>
          <Package className="w-6 h-6" /> <span>Inventario</span>
        </button>
        <button onClick={() => setCurrentView('sales')} className={`nav-item ${currentView === 'sales' ? 'active' : ''}`}>
          <ShoppingCart className="w-6 h-6" /> <span>Ventas</span>
          {cart.length > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs px-2 py-1 rounded-full">{cart.length}</span>
          )}
        </button>
        <button onClick={() => setCurrentView('history')} className={`nav-item ${currentView === 'history' ? 'active' : ''}`}>
          <BarChart3 className="w-6 h-6" /> <span>Historial</span>
        </button>
      </nav>

      {showForm && <ProductForm onClose={() => setShowForm(false)} editId={editId} onSave={fetchProductos} />}
      {showTutorial && <Tutorial onComplete={() => setShowTutorial(false)} />}
    </div>
  )
}

export default Dashboard