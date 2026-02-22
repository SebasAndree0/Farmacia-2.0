// C:\Farmacia2026\Farmacia-2.0\src\app\Paginas\medio-pago\medio-pago.page.ts

import { Component, OnInit } from '@angular/core';
import { NavController, ToastController } from '@ionic/angular';

import { ApiProductoService } from '../servicios/api-producto.service';
import { ApiUsuarioService } from '../servicios/api-usuario.service';

type MetodoPago = 'debito' | 'credito' | 'transferencia' | null;

type CarritoItem = {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  imagen?: string | null;
};

@Component({
  selector: 'app-medio-pago',
  templateUrl: './medio-pago.page.html',
  styleUrls: ['./medio-pago.page.scss'],
})
export class MedioPagoPage implements OnInit {
  public nombreUsuario = '';
  public totalCarrito = '';

  public metodoPago: MetodoPago = null;

  public nombre = '';
  public correo = '';
  public hogar = '';
  public direccion = '';

  // ✅ detalle para el mini carrusel
  public carrito: CarritoItem[] = [];

  constructor(
    private apiUsuario: ApiUsuarioService,
    private apiProducto: ApiProductoService,
    private navCtrl: NavController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.nombreUsuario = this.apiUsuario.retornarUsuario();
    this.totalCarrito = this.apiProducto.retornarTotal() ?? '0';

    // ✅ Cargar detalle real del carrito desde backend (y recalcula total)
    this.cargarDetalleCarritoDesdeBackend();
  }

  private async toast(msg: string) {
    const t = await this.toastCtrl.create({
      message: msg,
      duration: 1800,
      position: 'bottom',
    });
    await t.present();
  }

  private isEmailValido(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  /** ✅ Formato CLP */
  public formatearPrecio(n: number) {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(n || 0);
  }

  /**
   * ✅ Detalle real del carrito
   * Usa ApiProductoService.obtenerCarritoDetalleParaUI(idUsuario)
   * - Trae items desde /carrito?idUsuario=...
   * - Normaliza para UI (id, nombre, precio, cantidad, imagen)
   * - Recalcula total y lo guarda en localStorage (para mantener tu app igual)
   */
  private cargarDetalleCarritoDesdeBackend() {
    const usuarioId = this.apiUsuario.retornarId();
    if (!usuarioId) {
      this.carrito = [];
      return;
    }

    this.apiProducto.obtenerCarritoDetalleParaUI(usuarioId).subscribe({
      next: (items) => {
        this.carrito = (items || []) as CarritoItem[];

        // total actualizado (lo recalcula el service y lo guarda)
        this.totalCarrito = this.apiProducto.retornarTotal() ?? '0';
      },
      error: () => {
        // si falla, no rompas la pantalla
        this.carrito = [];
      },
    });
  }

  /** (Opcional) si quieres abrir detalle sin molestar: por ahora no hace nada */
  public verProducto(_p: CarritoItem) {
    // Puedes poner modal / alert si quieres
  }

  /** Volver = NO borra */
  volver() {
    this.navCtrl.back();
  }

  /** Cancelar = NO borra (solo cierra / vuelve) */
  cancelar() {
    this.navCtrl.back();
  }

  async checkout() {
    // Validación
    if (!this.nombre.trim()) return this.toast('Falta el nombre.');
    if (!this.correo.trim()) return this.toast('Falta el correo.');
    if (!this.isEmailValido(this.correo)) return this.toast('Correo inválido.');
    if (!this.hogar.trim()) return this.toast('Selecciona “Hogar”.');
    if (!this.direccion.trim()) return this.toast('Falta la dirección.');
    if (!this.metodoPago) return this.toast('Selecciona un medio de pago.');

    // Guardar historial (demo)
    const compra = {
      id: (globalThis as any).crypto?.randomUUID?.() ?? String(Date.now()),
      fecha: new Date().toISOString(),
      usuario: this.nombreUsuario,
      total: this.totalCarrito,
      direccion: this.direccion,
      hogar: this.hogar,
      metodoPago: this.metodoPago,
    };

    const key = 'historial_compras';
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    prev.unshift(compra);
    localStorage.setItem(key, JSON.stringify(prev));

    await this.toast('✅ Compra registrada');

    // ✅ SOLO al confirmar compra se borra el carrito (NO devuelve stock)
    const usuarioId = this.apiUsuario.retornarId();
    this.apiProducto.limpiarCarritoPostCompra(usuarioId).subscribe({
      next: () => {},
      error: () => {},
    });

    // refrescar total local
    this.apiProducto.totalCarrito('0');
    this.totalCarrito = '0';

    // limpiar carrusel
    this.carrito = [];

    this.navCtrl.back();
  }
}
