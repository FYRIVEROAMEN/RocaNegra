import axios from 'axios'

const SUPABASE_URL = 'https://izxtbndkcjxubvnisygh.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6eHRibmRrY2p4dWJ2bmlzeWdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NTA3NDksImV4cCI6MjEwMDIyNjc0OX0.d-lkbzrINaZMFTRd4Yf34VHiNKcJgNUex9amF0gHknc'

const api = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
})

// GET todos los productos
export const getProductos = () => api.get('/productos?order=created_at.desc')

// GET un producto por ID
export const getProductoById = (id) => api.get(`/productos?id=eq.${id}`)

// POST crear producto
export const createProducto = (data) => api.post('/productos', data)

// PATCH actualizar producto
export const updateProducto = (id, data) => api.patch(`/productos?id=eq.${id}`, data)

// DELETE eliminar producto
export const deleteProducto = (id) => api.delete(`/productos?id=eq.${id}`)

// Crear una venta (el ticket principal)
export const createVenta = (data) => api.post('/ventas', data)

// Crear el detalle de la venta (los productos)
export const createDetalleVenta = (data) => api.post('/detalle_ventas', data)

// Obtener historial de ventas (lo usaremos después)
export const getVentas = () => api.get('/ventas?order=fecha.desc')

// Desactivar producto (soft delete)
export const deactivateProducto = (id) => api.patch(`/productos?id=eq.${id}`, { activo: false })

// Reactivar producto
export const reactivateProducto = (id) => api.patch(`/productos?id=eq.${id}`, { activo: true })

// Obtener solo productos activos
export const getProductosActivos = () => api.get('/productos?activo=eq.true&order=created_at.desc')

// Obtener productos inactivos
export const getProductosInactivos = () => api.get('/productos?activo=eq.false&order=created_at.desc')

// Eliminar detalle de venta
export const deleteDetalleVenta = (ventaId) => api.delete(`/detalle_ventas?venta_id=eq.${ventaId}`)

// Eliminar venta
export const deleteVenta = (id) => api.delete(`/ventas?id=eq.${id}`)

export default api