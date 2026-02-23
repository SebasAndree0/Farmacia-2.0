import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController, NavController } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';

import { CarritoPage } from '../carrito/carrito.page';
import { ApiProductoService } from '../servicios/api-producto.service';
import { ApiUsuarioService } from '../servicios/api-usuario.service';

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
})
export class InicioPage implements OnInit {
  // ====== Buscador ======
  public searchText: string = '';
  public catalogo: any[] = [];
  public resultados: any[] = [];
  public mostrandoResultados = false;

  // HOME "no infinito"
  public destacados: any[] = [];
  public vitrina: any[] = [];

  // ====== Categorías ======
  public catMedicamentos = 'medicamento';
  public catCremas = 'cremas';
  public catPerfumes = 'perfumes';

  private cargasPendientes = 0;

  // ⚠️ Si corres en celular/emulador, cambia localhost por tu IP
  private readonly API_URL = 'http://localhost:3001';

  constructor(
    private modalCtrl: ModalController,
    private navCtrl: NavController,
    private alertControler: AlertController,
    private http: HttpClient,
    public servicio: ApiProductoService,
    private apiUsuario: ApiUsuarioService
  ) {}

  ngOnInit() {
    // ✅ defaults seguros (evita '' y evita repetir)
    this.catMedicamentos =
      (this.servicio.retornarcategoria() || 'medicamento').toString().trim() || 'medicamento';

    this.catCremas =
      (this.servicio.retornarcategoriacrema() || 'cremas').toString().trim() || 'cremas';

    this.catPerfumes =
      (this.servicio.retornarcategoriaperfume() || 'perfumes').toString().trim() || 'perfumes';

    this.cargarCatalogo();
  }

  // ✅ anti-duplicados TOTAL por id
  private dedupeById(items: any[]): any[] {
    const map = new Map<number, any>();
    for (const it of items ?? []) {
      const id = Number(it?.id ?? it?.idProducto);
      if (!Number.isFinite(id)) continue;
      map.set(id, it);
    }
    return Array.from(map.values());
  }

  private cargarCatalogo() {
    // reset UI
    this.catalogo = [];
    this.resultados = [];
    this.destacados = [];
    this.vitrina = [];
    this.mostrandoResultados = false;
    this.searchText = '';

    // ✅ categorías únicas + no vacías
    const cats = Array.from(
      new Set(
        [this.catMedicamentos, this.catCremas, this.catPerfumes]
          .map((c) => (c ?? '').toString().trim())
          .filter(Boolean)
      )
    );

    this.cargasPendientes = cats.length;

    // Si algo rarísimo deja esto vacío, usamos defaults
    const finalCats = cats.length ? cats : ['medicamento', 'cremas', 'perfumes'];
    if (!cats.length) this.cargasPendientes = finalCats.length;

    finalCats.forEach((cat) => {
      this.servicio.getProducto(cat).subscribe({
        next: (res: any) => {
          const list = Array.isArray(res) ? res : [];
          // ✅ concateno pero SIEMPRE deduplico
          this.catalogo = this.dedupeById([...this.catalogo, ...list]);
          this.onCategoriaCargada();
        },
        error: () => this.onCategoriaCargada(),
      });
    });
  }

  private onCategoriaCargada() {
    this.cargasPendientes = Math.max(0, this.cargasPendientes - 1);

    if (!this.searchText) this.resultados = [...this.catalogo];

    if (this.cargasPendientes === 0) {
      // ✅ blindaje final
      this.catalogo = this.dedupeById(this.catalogo);

      // ordenar
      this.catalogo = [...this.catalogo].sort((a: any, b: any) =>
        String(a?.nombre ?? '').localeCompare(String(b?.nombre ?? ''), 'es')
      );

      this.resultados = [...this.catalogo];
      this.armarHomeNoInfinito();
    }
  }

  private armarHomeNoInfinito() {
    const meds = this.catalogo.filter((p) => (p?.categoria || '').toLowerCase().includes('med'));
    const cre = this.catalogo.filter((p) => (p?.categoria || '').toLowerCase().includes('crem'));
    const per = this.catalogo.filter((p) => (p?.categoria || '').toLowerCase().includes('perfum'));

    const take = (arr: any[], n: number) => arr.slice(0, n);

    const base = [...take(meds, 2), ...take(cre, 2), ...take(per, 2)];
    const faltan = 6 - base.length;
    const resto = this.catalogo.filter((p) => !base.includes(p));
    this.destacados = faltan > 0 ? [...base, ...take(resto, faltan)] : base;

    const sinDest = this.catalogo.filter((p) => !this.destacados.includes(p));
    this.vitrina = take(sinDest, 8);
  }

  // ✅ buscador global
  handleChange(event: any) {
    const query = (event?.target?.value || '').toLowerCase().trim();
    this.searchText = query;

    if (!query) {
      this.mostrandoResultados = false;
      this.resultados = [...this.catalogo];
      return;
    }

    this.mostrandoResultados = true;

    this.resultados = this.catalogo.filter((p: any) => {
      const nombre = (p?.nombre || '').toLowerCase();
      const categoria = (p?.categoria || '').toLowerCase();
      const marca = (p?.marca || '').toLowerCase();
      return nombre.includes(query) || categoria.includes(query) || marca.includes(query);
    });
  }

  limpiarBusqueda() {
    this.searchText = '';
    this.mostrandoResultados = false;
    this.resultados = [...this.catalogo];
  }

  // ✅ trackBy robusto (para que no "parpadeen" cards)
  trackByProd(index: number, p: any) {
    return p?.id ?? p?.idProducto ?? p?._id ?? p?.codigo ?? index;
  }

  private getUsuarioIdNumber(): number {
    const id = Number(this.apiUsuario.retornarId());
    return Number.isFinite(id) ? id : 0;
  }

  // ✅ VER: funciona para medicamentos + cremas + perfumes
  verProducto(p: any) {
    const categoria = String(p?.categoria ?? '').toLowerCase();
    const idProducto = Number(p?.id ?? p?.idProducto);

    if (!Number.isFinite(idProducto) || idProducto <= 0) {
      alert('Producto sin ID');
      console.warn('Producto inválido para verProducto():', p);
      return;
    }

    if (categoria.includes('med')) {
      this.navCtrl.navigateForward(`/detalle-producto/${idProducto}`);
      return;
    }

    if (categoria.includes('crem')) {
      this.navCtrl.navigateForward(`/detalle-cremas/${idProducto}`);
      return;
    }

    if (categoria.includes('perfum')) {
      this.navCtrl.navigateForward(`/detalle-perfumes/${idProducto}`);
      return;
    }

    alert('Categoría desconocida: ' + (p?.categoria ?? ''));
    console.warn('Categoría desconocida para verProducto():', p);
  }

  // ✅ AGREGAR: POST /carrito y abre el carrito al lado
  async agregarAlCarrito(p: any) {
    const idUsuario = this.getUsuarioIdNumber();
    const idProducto = Number(p?.id ?? p?.idProducto);

    if (!idUsuario) {
      alert('No hay usuario logueado');
      return;
    }
    if (!Number.isFinite(idProducto) || idProducto <= 0) {
      alert('Producto sin ID');
      return;
    }

    // ✅ promo/normal robusto (soporta ambos nombres)
    const promoActiva = !!(p?.promoActiva ?? p?.promo_activa ?? false);
    const precioPromo = Number(p?.precioPromo ?? p?.precio_promo ?? 0);
    const precioNormal = Number(p?.precioNormal ?? p?.precio ?? 0);

    const precioFinal =
      promoActiva && Number.isFinite(precioPromo) && precioPromo > 0
        ? precioPromo
        : (Number.isFinite(precioNormal) ? precioNormal : 0);

    const body: any = {
      id: idProducto, // backend usa "id" como idProducto
      idUsuario,
      nombre: p?.nombre,
      precio: precioFinal, // ✅ cobra promo si corresponde
      stock: Number(p?.stock ?? 0),
      imagen: p?.imagen,
      cantidad: 1,

      // ✅ opcionales para mostrar promo / checkout consistente
      promoActiva,
      precioPromo: Number.isFinite(precioPromo) ? precioPromo : 0,
      precioNormal: Number.isFinite(precioNormal) ? precioNormal : 0,
    };

    this.http.post(`${this.API_URL}/carrito`, body).subscribe({
      next: async () => {
        await this.openCart();
      },
      error: (err) => {
        console.error('POST /carrito ERROR', err);
        alert('No se pudo agregar');
      },
    });
  }

  async openCart() {
    const modal = await this.modalCtrl.create({
      component: CarritoPage,
      cssClass: 'carrito right-sheet',
      breakpoints: [0, 0.6, 0.92],
      initialBreakpoint: 0.92,
    });
    await modal.present();
  }

  async salir() {
    const alert = await this.alertControler.create({
      header: 'Cerrar Sesión',
      message: '¿Realmente quieres cerrar sesión?',
      buttons: [
        { text: 'No', handler: () => {} },
        {
          text: 'Si',
          handler: () => {
            this.navCtrl.navigateRoot('/login');
            localStorage.clear();
          },
        },
      ],
    });
    await alert.present();
  }

  handleRefresh(event: any) {
    setTimeout(() => {
      this.cargarCatalogo();
      event.target.complete();
    }, 600);
  }
}
