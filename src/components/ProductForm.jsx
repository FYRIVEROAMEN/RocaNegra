import { useState, useEffect, useRef } from 'react'
import { getProductoById, createProducto, updateProducto } from '../services/api'
import Swal from 'sweetalert2'
import { Barcode, X } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/library'

function ProductForm({ onClose, editId, onSave }) {
  const [form, setForm] = useState({
    nombre: '',
    categoria: '',
    talle: '',
    color: '',
    precio: '',
    stock: '',
    barcode: ''
  })
  const [saving, setSaving] = useState(false)
  const [imagenFile, setImagenFile] = useState(null)
  const [imagenPreview, setImagenPreview] = useState(null)
  const [imagenURL, setImagenURL] = useState('')

  const [isScanning, setIsScanning] = useState(false)
  const codeReaderRef = useRef(null)
  const isCancelledRef = useRef(false)

  useEffect(() => {
    if (editId) {
      getProductoById(editId).then(({ data }) => {
        if (data && data[0]) {
          const p = data[0]
          setForm({
            nombre: p.nombre || '',
            categoria: p.categoria || '',
            talle: p.talle || '',
            color: p.color || '',
            precio: String(p.precio || ''),
            stock: String(p.stock || ''),
            barcode: p.barcode || ''
          })
          if (p.imagen_url) {
            setImagenURL(p.imagen_url)
            setImagenPreview(p.imagen_url)
          }
        }
      })
    }
  }, [editId])


 

  const subirImagenCloudinary = async (file) => {
    let fileToUpload = file
    
    if (file.type === 'image/webp') {
      try {
        const img = new Image()
        img.src = URL.createObjectURL(file)
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
        })
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', 0.9)
        })
        fileToUpload = new File([blob], file.name.replace('.webp', '.jpg'), { type: 'image/jpeg' })
        URL.revokeObjectURL(img.src)
      } catch (err) {
        console.error('Error convirtiendo WebP:', err)
      }
    }
    
    const formData = new FormData()
    formData.append('file', fileToUpload)
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET)
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      return data.secure_url
    } catch (error) {
      console.error('Error subiendo imagen:', error)
      return null
    }
  }

  // ✅ MÉTODO OFICIAL Y ESTABLE DE ZXING
  const handleScanBarcode = async () => {
    setIsScanning(true)
    isCancelledRef.current = false

    try {
      const codeReader = new BrowserMultiFormatReader()
      codeReaderRef.current = codeReader

      const scannedCode = await new Promise((resolve, reject) => {
        let timeoutId = null
        let found = false
        
        timeoutId = setTimeout(() => {
          if (!found && !isCancelledRef.current) {
            reject(new Error('Tiempo de escaneo agotado'))
          }
        }, 30000)

        codeReader.decodeFromVideoDevice(
          undefined, 
          'video-producto', 
          (result, err) => {
            if (isCancelledRef.current) {
              clearTimeout(timeoutId)
              reject(new Error('Escaneo cancelado'))
              return
            }

            if (result) {
              found = true
              clearTimeout(timeoutId)
              resolve(result.getText())
            }
            
            if (err && err.name !== 'NotFoundException') {
              console.warn('Error escaneando:', err)
            }
          }
        )
      })

      if (scannedCode) {
        setForm({ ...form, barcode: scannedCode })
        Swal.fire({
          title: '¡Código detectado!',
          text: scannedCode,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        })
      }
      
    } catch (err) {
      console.error('Error en escáner:', err)
      
      if (!isCancelledRef.current) {
        let mensaje = 'Error al escanear. Intentá de nuevo.'
        if (err.name === 'NotAllowedError') mensaje = 'Permiso de cámara denegado.'
        else if (err.name === 'NotFoundError') mensaje = 'No se encontró una cámara.'
        else if (err.name === 'NotReadableError') mensaje = 'La cámara está en uso.'
        else if (err.message === 'Tiempo de escaneo agotado') mensaje = 'No se detectó ningún código en 30 segundos.'
        
        Swal.fire({ title: 'Error al escanear', text: mensaje, icon: 'error', confirmButtonColor: '#dc2626' })
      }
    } finally {
      setIsScanning(false)
      if (codeReaderRef.current) {
        codeReaderRef.current.reset()
        codeReaderRef.current = null
      }
    }
  }

  const handleCloseScan = () => {
    isCancelledRef.current = true
    setIsScanning(false)
    if (codeReaderRef.current) {
      codeReaderRef.current.reset()
      codeReaderRef.current = null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    let imagenFinal = imagenURL
    if (imagenFile) {
      const urlSubida = await subirImagenCloudinary(imagenFile)
      if (urlSubida) imagenFinal = urlSubida
    }

    const payload = {
      nombre: form.nombre,
      categoria: form.categoria,
      talle: form.talle,
      color: form.color,
      barcode: form.barcode,
      precio: parseFloat(form.precio) || 0,
      stock: parseInt(form.stock) || 0,
      imagen_url: imagenFinal
    }

    try {
      if (editId) await updateProducto(editId, payload)
      else await createProducto(payload)

      Swal.fire({
        title: editId ? '¡Actualizado!' : '¡Agregado!',
        text: `El producto fue ${editId ? 'actualizado' : 'agregado'} correctamente.`,
        icon: 'success', confirmButtonColor: '#2563eb', confirmButtonText: 'Aceptar',
        timer: 2000, timerProgressBar: true,
        willClose: () => { onSave(); onClose(); }
      })
    } catch (err) {
      Swal.fire({ title: 'Error', text: 'Error: ' + (err.response?.data?.message || err.message), icon: 'error', confirmButtonColor: '#dc2626' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">{editId ? 'Editar' : 'Agregar'} Producto</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-base font-bold text-gray-700 mb-2">Nombre *</label>
            <input required value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} className="input-lg" placeholder="Ej: Remera básica" />
          </div>
          <div>
            <label className="block text-base font-bold text-gray-700 mb-2">Categoría</label>
            <input value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} className="input-lg" placeholder="Ej: Remeras, Pantalones" />
          </div>

          <div>
            <label className="block text-base font-bold text-gray-700 mb-2">Código de Barras</label>
            <div className="relative">
              <input
                value={form.barcode}
                onChange={e => setForm({...form, barcode: e.target.value})}
                className="input-lg pr-14"
                placeholder="Ej: 7791234567890"
              />
              <button
                type="button"
                onClick={handleScanBarcode}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-green-600 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-green-700 transition shadow-md"
                title="Escanear código de barras"
              >
                <Barcode className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-bold text-gray-700 mb-2">Talle</label>
              <input value={form.talle} onChange={e => setForm({...form, talle: e.target.value})} className="input-lg" placeholder="S, M, L" />
            </div>
            <div>
              <label className="block text-base font-bold text-gray-700 mb-2">Color</label>
              <input value={form.color} onChange={e => setForm({...form, color: e.target.value})} className="input-lg" placeholder="Negro, Blanco" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-bold text-gray-700 mb-2">Precio *</label>
              <input required type="number" step="0.01" value={form.precio} onChange={e => setForm({...form, precio: e.target.value})} className="input-lg" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-base font-bold text-gray-700 mb-2">Stock *</label>
              <input required type="number" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} className="input-lg" placeholder="0" />
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-base font-bold text-gray-700 mb-2">Imagen del Producto</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              onChange={(e) => {
                const file = e.target.files[0]
                if (file) {
                  setImagenFile(file)
                  setImagenPreview(URL.createObjectURL(file))
                }
              }}
              className="input-lg"
              style={{ padding: '10px', height: 'auto' }}
            />
            {imagenPreview && (
              <img src={imagenPreview} alt="Vista previa" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', marginTop: '10px', border: '1px solid #ddd' }} />
            )}
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>

      {isScanning && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4">
          <div className="relative w-full max-w-md">
            <div className="relative w-full h-80 bg-black rounded-2xl overflow-hidden border-4 border-green-500 shadow-2xl">
              <video id="video-producto" className="w-full h-full object-cover" autoPlay playsInline />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
              </div>
            </div>
            <div className="mt-6 text-center">
              <h3 className="text-xl font-bold text-white mb-2">Escaneá el código de barras</h3>
              <p className="text-gray-300 mb-6 text-sm">Apunta la cámara al código del producto.</p>
              <button onClick={handleCloseScan} className="btn btn-danger w-full">
                <X className="w-5 h-5" /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductForm