import axios from 'axios'

// 👇 Leemos TODO desde el .env.local (más seguro y prolijo)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 1

const api = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
})

// ==========================================
// PRODUCTOS
// ==========================================
export const getProductos = () => api.get(`/productos?local_id=eq.${LOCAL_ID}&order=created_at.desc`)
export const getProductoById = (id) => api.get(`/productos?id=eq.${id}&local_id=eq.${LOCAL_ID}`)
export const createProducto = (data) => api.post('/productos', { ...data, local_id: LOCAL_ID })
export const updateProducto = (id, data) => api.patch(`/productos?id=eq.${id}&local_id=eq.${LOCAL_ID}`, data)
export const deleteProducto = (id) => api.delete(`/productos?id=eq.${id}&local_id=eq.${LOCAL_ID}`)
export const getProductosActivos = () => api.get(`/productos?local_id=eq.${LOCAL_ID}&activo=eq.true&order=created_at.desc`)
export const getProductosInactivos = () => api.get(`/productos?local_id=eq.${LOCAL_ID}&activo=eq.false&order=created_at.desc`)
export const deactivateProducto = (id) => api.patch(`/productos?id=eq.${id}&local_id=eq.${LOCAL_ID}`, { activo: false })
export const reactivateProducto = (id) => api.patch(`/productos?id=eq.${id}&local_id=eq.${LOCAL_ID}`, { activo: true })

// ==========================================
// VENTAS
// ==========================================
export const createVenta = (data) => api.post('/ventas', { ...data, local_id: LOCAL_ID })
export const createDetalleVenta = (data) => api.post('/detalle_ventas', { ...data, local_id: LOCAL_ID })

// Obtener historial con detalles (necesario para tu CSV que ya funciona de 10)
export const getVentas = () => api.get(`/ventas?local_id=eq.${LOCAL_ID}&select=id,fecha,total,detalle_ventas(cantidad,precio_unitario,productos(nombre,talle,color))&order=fecha.desc`)

export const deleteDetalleVenta = (ventaId) => api.delete(`/detalle_ventas?venta_id=eq.${ventaId}&local_id=eq.${LOCAL_ID}`)
export const deleteVenta = (id) => api.delete(`/ventas?id=eq.${id}&local_id=eq.${LOCAL_ID}`)

export default api