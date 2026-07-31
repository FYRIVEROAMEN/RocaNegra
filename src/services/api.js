import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// 👇 Leemos TODO desde el .env.local (más seguro y prolijo)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const LOCAL_ID = import.meta.env.VITE_LOCAL_ID || 1

// Cliente axios para REST API
const api = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
})

// Cliente Supabase para RPC y operaciones directas
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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
// VENTAS (ACTUALIZADO CON DESCUENTOS)
// ==========================================
export const createVenta = (data) => api.post('/ventas', { 
  ...data, 
  local_id: LOCAL_ID,
  // Aseguramos que total_neto se calcule correctamente si viene desde el frontend
  total_neto: data.total_neto !== undefined ? data.total_neto : (data.total_bruto || 0) - (data.descuento_monto || 0)
})

export const createDetalleVenta = (data) => api.post('/detalle_ventas', { ...data, local_id: LOCAL_ID })

// ✅ ACTUALIZADO: Selecciona los nuevos campos de descuento y total_neto
export const getVentas = () => api.get(`/ventas?local_id=eq.${LOCAL_ID}&select=id,fecha,total_bruto,descuento_monto,descuento_motivo,total_neto,estado_pago,cliente_id,clientes(id,nombre,telefono),detalle_ventas(cantidad,precio_unitario,productos(nombre,talle,color)),pagos(monto)&order=fecha.desc`)
export const deleteDetalleVenta = (ventaId) => api.delete(`/detalle_ventas?venta_id=eq.${ventaId}&local_id=eq.${LOCAL_ID}`)
export const deleteVenta = (id) => api.delete(`/ventas?id=eq.${id}&local_id=eq.${LOCAL_ID}`)

// ==========================================
// FUNCIONES PARA CLIENTES Y PAGOS
// ==========================================

// Crear o actualizar cliente
export const crearOActualizarCliente = async (telefono, nombre, localId, montoVenta) => {
  const { data, error } = await supabase
    .rpc('crear_o_actualizar_cliente', {
      p_telefono: telefono,
      p_nombre: nombre || null,
      p_local_id: localId,
      p_monto_venta: montoVenta // Este ahora recibe el total_neto
    })
  
  if (error) throw error
  return data // Retorna el cliente_id
}

// Registrar un pago
export const registrarPago = async (ventaId, clienteId, monto, localId, nota = null) => {
  const { data, error } = await supabase
    .from('pagos')
    .insert([{
      venta_id: ventaId,
      cliente_id: clienteId,
      monto: monto,
      local_id: localId,
      nota: nota
    }])
    .select()
  
  if (error) throw error
  return data
}

// Actualizar estado de pago de una venta
export const actualizarEstadoPagoVenta = async (ventaId, estadoPago) => {
  const { error } = await supabase
    .from('ventas')
    .update({ estado_pago: estadoPago })
    .eq('id', ventaId)
    .eq('local_id', LOCAL_ID)
  
  if (error) throw error
}

// Obtener clientes con deuda
export const getClientesConDeuda = async () => {
  const { data, error } = await supabase
    .from('clientes_con_deuda')
    .select('*')
    .eq('local_id', LOCAL_ID)
    .order('deuda_total', { ascending: false })
  
  if (error) throw error
  return { data }
}

// Obtener historial de pagos de un cliente
export const getPagosPorCliente = async (clienteId) => {
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
  
  if (error) throw error
  return { data }
}

// Registrar nuevo pago a un cliente (para saldar deuda)
export const registrarPagoDeuda = async (clienteId, monto, localId, nota = null) => {
  // ✅ ACTUALIZADO: Usamos total_neto en lugar de total
  const { data: ventasPendientes, error: errorVentas } = await supabase
    .from('ventas')
    .select('id, total_neto, estado_pago')
    .eq('cliente_id', clienteId)
    .in('estado_pago', ['parcial', 'pendiente'])
    .order('fecha', { ascending: true })
  
  if (errorVentas) throw errorVentas
  
  let montoRestante = monto
  let pagosCreados = []
  
  // 2. Distribuir el pago entre las ventas pendientes (FIFO)
  for (const venta of ventasPendientes) {
    if (montoRestante <= 0) break
    
    // Calcular cuánto debe esta venta
    const { data: pagosExistentes } = await supabase
      .from('pagos')
      .select('monto')
      .eq('venta_id', venta.id)
    
    const totalPagado = pagosExistentes.reduce((sum, p) => sum + Number(p.monto), 0)
    // ✅ ACTUALIZADO: La deuda se calcula sobre el total_neto
    const deudaVenta = Number(venta.total_neto) - totalPagado
    
    const montoAPagar = Math.min(montoRestante, deudaVenta)
    
    // Crear el pago
    const { data: pagoData, error: errorPago } = await supabase
      .from('pagos')
      .insert([{
        venta_id: venta.id,
        cliente_id: clienteId,
        monto: montoAPagar,
        local_id: localId,
        nota: nota
      }])
      .select()
    
    if (errorPago) throw errorPago
    pagosCreados.push(pagoData[0])
    
    montoRestante -= montoAPagar
    
    // Actualizar estado de la venta
    const nuevoTotalPagado = totalPagado + montoAPagar
    if (nuevoTotalPagado >= Number(venta.total_neto)) {
      await supabase
        .from('ventas')
        .update({ estado_pago: 'pagado' })
        .eq('id', venta.id)
    } else {
      await supabase
        .from('ventas')
        .update({ estado_pago: 'parcial' })
        .eq('id', venta.id)
    }
  }
  
  // ✅ FIX: Actualizar los totales del cliente en la tabla `clientes`
  const { data: todosLosPagos } = await supabase
    .from('pagos')
    .select('monto')
    .eq('cliente_id', clienteId)
  
  const totalPagadoActualizado = (todosLosPagos || []).reduce((sum, p) => sum + Number(p.monto), 0)
  
  const { data: clienteData } = await supabase
    .from('clientes')
    .select('total_compras')
    .eq('id', clienteId)
    .single()
  
  const totalCompras = Number(clienteData?.total_compras || 0)
  const deudaActualizada = totalCompras - totalPagadoActualizado
  
  const { error: errorUpdateCliente } = await supabase
    .from('clientes')
    .update({
      total_pagado: totalPagadoActualizado,
      deuda_total: deudaActualizada
    })
    .eq('id', clienteId)
  
  if (errorUpdateCliente) throw errorUpdateCliente
  
  return pagosCreados
}

// Obtener todos los clientes del local
export const getClientes = async () => {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('local_id', LOCAL_ID)
    .order('ultima_compra', { ascending: false })
  
  if (error) throw error
  return { data }
}

// Obtener ventas pendientes de un cliente con detalle de pagos y productos
export const getVentasPendientesCliente = async (clienteId) => {
  // ✅ ACTUALIZADO: Usamos total_neto
  const { data: ventas, error: errorVentas } = await supabase
    .from('ventas')
    .select('id, fecha, total_neto, estado_pago')
    .eq('cliente_id', clienteId)
    .in('estado_pago', ['parcial', 'pendiente'])
    .order('fecha', { ascending: false })
  
  if (errorVentas) throw errorVentas
  
  // 2. Para cada venta, obtener los pagos y productos
  const ventasConDetalles = await Promise.all(
    (ventas || []).map(async (venta) => {
      // Obtener pagos
      const { data: pagos } = await supabase
        .from('pagos')
        .select('monto, fecha, nota')
        .eq('venta_id', venta.id)
        .order('fecha', { ascending: true })
      
      // Obtener productos de la venta
      const { data: detalleVentas } = await supabase
        .from('detalle_ventas')
        .select('cantidad, precio_unitario, productos(nombre, talle, color)')
        .eq('venta_id', venta.id)
      
      const totalPagado = (pagos || []).reduce((sum, p) => sum + Number(p.monto), 0)
      // ✅ ACTUALIZADO: Pendiente se calcula sobre total_neto
      const pendiente = Number(venta.total_neto) - totalPagado
      
      return {
        ...venta,
        pagos: pagos || [],
        productos: detalleVentas || [],
        total_pagado: totalPagado,
        pendiente: pendiente
      }
    })
  )
  
  return { data: ventasConDetalles }
}

// Eliminar/resetear deuda de un cliente (para deudas huérfanas)
export const eliminarDeudaCliente = async (clienteId) => {
  const { error } = await supabase
    .from('clientes')
    .update({
      total_compras: 0,
      total_pagado: 0,
      deuda_total: 0
    })
    .eq('id', clienteId)
  
  if (error) throw error
}

// Eliminar cliente completamente de la base de datos
export const eliminarCliente = async (clienteId) => {
  try {
    // 1. Primero eliminar todos los pagos asociados
    await supabase
      .from('pagos')
      .delete()
      .eq('cliente_id', clienteId)
    
    // 2. Luego, desvincular las ventas (setear cliente_id a NULL)
    await supabase
      .from('ventas')
      .update({ cliente_id: null })
      .eq('cliente_id', clienteId)
    
    // 3. Finalmente eliminar el cliente
    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id', clienteId)
    
    if (error) throw error
  } catch (err) {
    console.error('Error al eliminar cliente:', err)
    throw err
  }
}

// Actualizar el cliente_id de una venta ya creada
export const updateVentaCliente = async (ventaId, clienteId) => {
  const { error } = await supabase
    .from('ventas')
    .update({ cliente_id: clienteId })
    .eq('id', ventaId)
  
  if (error) throw error
}

// Actualizar datos de un cliente (nombre y/o teléfono)
export const updateCliente = async (clienteId, data) => {
  const { error } = await supabase
    .from('clientes')
    .update(data)
    .eq('id', clienteId)
  
  if (error) throw error
}

export default api