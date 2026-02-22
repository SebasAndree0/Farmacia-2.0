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
  public catMedicamentos = '';
  public catCremas = '';
  public catPerfumes = '';

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
    this.catMedicamentos = this.servicio.retornarcategoria();
    this.catCremas = this.servicio.retornarcategoriacrema();
    this.catPerfumes = this.servicio.retornarcategoriaperfume();
    this.cargarCatalogo();
  }

  private cargarCatalogo() {
    this.catalogo = [];
    this.resultados = [];
    this.destacados = [];
    this.vitrina = [];
    this.mostrandoResultados = false;
    this.searchText = '';

    this.cargasPendientes = 3;

    // 1) Medicamentos
    this.servicio.getProducto(this.catMedicamentos).subscribe((res: any) => {
      const meds = Array.isArray(res) ? res : [];
      this.catalogo = [...this.catalogo, ...meds];
      this.onCategoriaCargada();
    });

    // 2) Cremas
    this.servicio.getProducto(this.catCremas).subscribe((res: any) => {
      const cremas = Array.isArray(res) ? res : [];
      this.catalogo = [...this.catalogo, ...cremas];
      this.onCategoriaCargada();
    });

    // 3) Perfumes
    this.servicio.getProducto(this.catPerfumes).subscribe((res: any) => {
      const perfs = Array.isArray(res) ? res : [];
      this.catalogo = [...this.catalogo, ...perfs];
      this.onCategoriaCargada();
    });
  }

  private onCategoriaCargada() {
    this.cargasPendientes = Math.max(0, this.cargasPendientes - 1);

    if (!this.searchText) this.resultados = [...this.catalogo];

    if (this.cargasPendientes === 0) {
      this.catalogo = [...this.catalogo].sort((a: any, b: any) =>
        String(a?.nombre ?? '').localeCompare(String(b?.nombre ?? ''), 'es')
      );

      this.resultados = [...this.catalogo];
      this.armarHomeNoInfinito();
    }
  }

  private armarHomeNoInfinito() {
    const meds = this.catalogo.filter(p => (p?.categoria || '').toLowerCase().includes('med'));
    const cre = this.catalogo.filter(p => (p?.categoria || '').toLowerCase().includes('crem'));
    const per = this.catalogo.filter(p => (p?.categoria || '').toLowerCase().includes('perfum'));

    const take = (arr: any[], n: number) => arr.slice(0, n);

    const base = [...take(meds, 2), ...take(cre, 2), ...take(per, 2)];
    const faltan = 6 - base.length;
    const resto = this.catalogo.filter(p => !base.includes(p));
    this.destacados = faltan > 0 ? [...base, ...take(resto, faltan)] : base;

    const sinDest = this.catalogo.filter(p => !this.destacados.includes(p));
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

  // ✅ trackBy
  trackByProd(index: number, p: any) {
    return p?.id ?? p?._id ?? p?.codigo ?? index;
  }

  private getUsuarioIdNumber(): number {
    const id = Number(this.apiUsuario.retornarId());
    return Number.isFinite(id) ? id : 0;
  }

  // ✅ VER: ahora navega al detalle real SOLO para medicamentos
  verProducto(p: any) {
    const categoria = String(p?.categoria ?? '').toLowerCase();

    // ✅ SOLO medicamentos
    if (!categoria.includes('med')) {
      return; // o: alert('Solo medicamentos');
    }

    const idProducto = Number(p?.id);
    if (!Number.isFinite(idProducto) || idProducto <= 0) {
      alert('Producto sin ID');
      return;
    }

    // ✅ tu routing ya tiene: detalle-producto/:idProducto
    this.navCtrl.navigateForward(`/detalle-producto/${idProducto}`);
  }

  // ✅ AGREGAR: POST /carrito y abre el carrito al lado
  async agregarAlCarrito(p: any) {
    const idUsuario = this.getUsuarioIdNumber();
    const idProducto = Number(p?.id);

    if (!idUsuario) {
      alert('No hay usuario logueado');
      return;
    }
    if (!Number.isFinite(idProducto) || idProducto <= 0) {
      alert('Producto sin ID');
      return;
    }

    const body = {
      id: idProducto,
      idUsuario,
      nombre: p?.nombre,
      precio: Number(p?.precio ?? 0),
      stock: Number(p?.stock ?? 0),
      imagen: p?.imagen,
      cantidad: 1,
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
