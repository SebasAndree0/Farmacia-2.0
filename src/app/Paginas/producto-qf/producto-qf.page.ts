// C:\Farmacia2026\Farmacia-2.0\src\app\Paginas\producto-qf\producto-qf.page.ts

import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import {
  IonInfiniteScroll,
  ModalController,
  ToastController,
  AlertController,
} from '@ionic/angular';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

import { ApiProductoService, CategoriaUI } from '../servicios/api-producto.service';
import { ProductoFormModalPage } from '../producto-form-modal/producto-form-modal.page';

type FiltroCat = 'all' | string;

@Component({
  selector: 'app-producto-qf',
  templateUrl: './producto-qf.page.html',
  styleUrls: ['./producto-qf.page.scss'],
})
export class ProductoQfPage implements OnInit, OnDestroy {
  @ViewChild(IonInfiniteScroll) public scroll?: IonInfiniteScroll;

  public data: any[] = [];
  public results: any[] = [];

  public filtroCat: FiltroCat = 'all';
  public searchText: string = '';
  private queryTxt = '';

  // ✅ UI categories vienen desde el SERVICE (categorias$)
  public categoriasUI: CategoriaUI[] = [];

  private subLista?: Subscription;
  private subStock?: Subscription;
  private subCats?: Subscription;

  constructor(
    public servicio: ApiProductoService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private router: Router
  ) {}

  ngOnInit() {
    // ✅ 1) escuchar categorías globales
    this.subCats = (this.servicio as any).categorias$?.subscribe((cats: CategoriaUI[]) => {
      this.categoriasUI = Array.isArray(cats) ? cats : [];

      // si el filtro actual ya no existe, vuelve a all
      if (this.filtroCat !== 'all') {
        const exists = this.categoriasUI.some((c) => c.slug === this.filtroCat);
        if (!exists) this.filtroCat = 'all';
      }

      this.aplicarFiltros();
    });

    // ✅ 2) pedir categorías al backend una vez (si falla, quedan defaults)
    this.servicio.getCategorias().subscribe({ next: () => {}, error: () => {} });

    // ✅ productos
    this.cargar();

    // lista productos
    this.subLista = this.servicio.listaProducto$.subscribe((resp: any[]) => {
      this.data = Array.isArray(resp) ? resp : [];
      this.aplicarFiltros();
      if (this.scroll) this.scroll.complete();
    });

    // refresh por cambios
    this.subStock = this.servicio.stockChanged$.subscribe(() => {
      this.cargar();
    });
  }

  ngOnDestroy() {
    this.subLista?.unsubscribe();
    this.subStock?.unsubscribe();
    this.subCats?.unsubscribe();
  }

  private cargar() {
    this.servicio.obtenerPrimerosProductos();
  }

  /* =========================
     SALIR
  ========================= */
  salir() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }

  /* =========================
     REFRESH
  ========================= */
  handleRefresh(event: any) {
    this.cargar();
    setTimeout(() => event?.target?.complete?.(), 350);
  }

  async handleRefreshManual() {
    this.cargar();
    this.toast('Actualizado');
  }

  /* =========================
     BUSCADOR + FILTROS
  ========================= */
  aplicarFiltros() {
    let filtered = [...this.data];

    // ✅ filtro categoría robusto (canónico)
    if (this.filtroCat !== 'all') {
      const fRaw = this.slugify(this.filtroCat);
      const f = fRaw === 'medicamentos' ? 'medicamento' : fRaw;
      filtered = filtered.filter((p: any) => this.normalizeCat(p) === f);
    }

    // ✅ texto (sinónimo medicamentos -> medicamento)
    const qRaw = (this.queryTxt ?? '').trim().toLowerCase();
    const q = qRaw === 'medicamentos' ? 'medicamento' : qRaw;

    if (q) {
      filtered = filtered.filter((p: any) => {
        const nombre = (p?.nombre ?? '').toString().toLowerCase();
        const marca = (p?.marca ?? '').toString().toLowerCase();
        const categoriaRaw = (p?.categoria ?? p?.categoria_slug ?? '').toString().toLowerCase();
        const catCanon = this.normalizeCat(p); // canónico
        return (
          nombre.includes(q) ||
          marca.includes(q) ||
          categoriaRaw.includes(q) ||
          catCanon.includes(q)
        );
      });
    }

    this.results = filtered;
  }

  handleChange(event: any) {
    const raw = (event?.detail?.value ?? event?.target?.value ?? '').toString();
    this.searchText = raw;
    this.queryTxt = raw;
    this.aplicarFiltros();
  }

  onSegmentChange() {
    this.aplicarFiltros();
  }

  limpiarBusqueda() {
    this.searchText = '';
    this.queryTxt = '';
    this.aplicarFiltros();
  }

  trackByProd(index: number, p: any) {
    return p?.id ?? index;
  }

  trackByCat(index: number, c: any) {
    return c?.slug ?? index;
  }

  /* =========================
     NORMALIZACIÓN CATEGORÍA
     ✅ canónico: medicamento
  ========================= */
  public normalizeCat(p: any): string {
    const raw = (p?.categoria ?? p?.categoria_slug ?? '').toString();
    const s = this.slugify(raw);

    // compat: medicamento(s)
    if (s === 'medicamentos') return 'medicamento';
    if (s === 'medicamento') return 'medicamento';

    // heurísticas
    if (s.includes('med')) return 'medicamento';
    if (s.includes('crem')) return 'cremas';
    if (s.includes('per')) return 'perfumes';

    return s || 'medicamento';
  }

  // ✅ label bonito para mostrar en UI
  public labelCat(p: any): string {
    const c = this.normalizeCat(p);
    if (c === 'medicamento') return 'Medicamentos';
    if (c === 'cremas') return 'Cremas';
    if (c === 'perfumes') return 'Perfumes';

    // fallback: si venía algo raro, muestra el original
    return (p?.categoria ?? 'Producto').toString();
  }

  private slugify(input: string): string {
    return (input ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /* =========================
     MODAL (crear/editar)
  ========================= */
  async openProductoForm(mode: 'new' | 'edit', producto?: any) {
    const modal = await this.modalCtrl.create({
      component: ProductoFormModalPage,
      cssClass: 'producto-form-modal',
      componentProps: {
        mode,
        producto: producto ?? null,
        categorias: this.categoriasUI,
      },
    });

    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (!data?.action) return;

    this.cargar();
    if (data?.message) this.toast(data.message);
  }

  /* =========================
     ELIMINAR
  ========================= */
  async eliminarProducto(p: any) {
    const nombre = p?.nombre ?? 'Producto';
    const id = Number(p?.id);

    if (!Number.isFinite(id)) {
      this.toast('Producto sin id válido');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar',
      message: `¿Eliminar <b>${nombre}</b>?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            (this.servicio as any).deleteProducto(id).subscribe({
              next: () => {
                this.toast('Eliminado');
                this.cargar();
              },
              error: () => this.toast('No se pudo eliminar'),
            });
          },
        },
      ],
    });

    await alert.present();
  }

  /* =========================
     TOAST
  ========================= */
  private async toast(message: string) {
    const t = await this.toastCtrl.create({
      message,
      duration: 1200,
      position: 'bottom',
    });
    await t.present();
  }
}
