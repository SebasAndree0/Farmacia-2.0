import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { IonInfiniteScroll, ModalController } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { CarritoPage } from '../carrito/carrito.page';
import { ApiProductoService } from '../servicios/api-producto.service';

@Component({
  selector: 'app-medicamentos',
  templateUrl: './medicamentos.page.html',
  styleUrls: ['./medicamentos.page.scss'],
})
export class MedicamentosPage implements OnInit, OnDestroy {
  @ViewChild(IonInfiniteScroll) public scroll!: IonInfiniteScroll;

  public categoria = 'medicamento'; // ✅ default seguro
  public cart: any[] = [];
  public resultados: any[] = [];

  private sub?: Subscription;

  constructor(public servicio: ApiProductoService, private modalCtrl: ModalController) {}

  ngOnInit() {
    // ✅ si tienes localStorage, úsalo, si no, queda "medicamento"
    const catLS = (this.servicio.retornarcategoria() || '').toString().trim();
    this.categoria = catLS.length ? catLS : 'medicamento';

    // ✅ SOLO trae medicamentos (no mezclar con listaProducto$)
    this.sub = this.servicio.getProducto(this.categoria).subscribe((res: any) => {
      this.cart = Array.isArray(res) ? res : [];
      this.resultados = [...this.cart];

      if (this.scroll) this.scroll.complete();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  handleRefresh(event: any) {
    // ✅ refresca volviendo a pedir SOLO medicamentos
    this.sub?.unsubscribe();
    this.sub = this.servicio.getProducto(this.categoria).subscribe((res: any) => {
      this.cart = Array.isArray(res) ? res : [];
      this.resultados = [...this.cart];
      event?.target?.complete?.();
      if (this.scroll) this.scroll.complete();
    });
  }

  handleChange(event: any) {
    const query = (event?.target?.value ?? '').toString().toLowerCase().trim();

    this.resultados = [...this.cart];

    if (query) {
      this.resultados = this.resultados.filter((p: any) => {
        const nombre = (p?.nombre ?? '').toString().toLowerCase();
        const marca = (p?.marca ?? '').toString().toLowerCase();
        return nombre.includes(query) || marca.includes(query);
      });
    }
  }

  // =========================
  // ✅ PROMO (mínimo y seguro)
  // =========================
  getPromoPrice(p: any): number {
    const promo = Number(p?.precioPromo ?? p?.precio_promo ?? 0);
    const base = Number(p?.precio ?? 0);
    return promo > 0 ? promo : base;
  }

  isPromo(p: any): boolean {
    const base = Number(p?.precio ?? 0);
    const promo = Number(p?.precioPromo ?? p?.precio_promo ?? 0);
    return promo > 0 && promo < base;
  }

  async openCart() {
    const modal = await this.modalCtrl.create({
      component: CarritoPage,
      cssClass: 'carrito',
    });
    await modal.present();
  }
}
